import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useReactFlow, useViewport, type Edge, type Node } from '@xyflow/react';
import {
  HANDLE_IDS,
  type ImageInputNodeData,
  type OmniReferenceNodeData,
  type ProviderNodeData,
  type WorkflowNodeData,
} from '@/lib/types/node-editor';
import { compactOmniReferences } from '../utils/omni-reference-compact';

// ========== Public Types ==========

export type ReferenceKind = 'image' | 'video' | 'audio';

export interface ReferenceCandidate {
  id: string;
  kind: ReferenceKind;
  index: number;
  filename: string;
  durationSeconds?: number;
}

export type EmptyReason =
  | 'no-generate-node'
  | 'not-seedance'
  | 'no-base-image'
  | 'no-omni-ref'
  | 'all-slots-empty';

export interface UseReferenceAutocompleteOptions {
  promptNodeId: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}

export interface UseReferenceAutocompleteResult {
  isOpen: boolean;
  query: string;
  candidates: ReferenceCandidate[];
  emptyReason: EmptyReason | null;
  highlightedIndex: number;
  listboxId: string;
  handlers: {
    onTextareaChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onTextareaKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
    onTextareaBlur: () => void;
    onPopupSelect: (candidate: ReferenceCandidate) => void;
    onPopupClose: () => void;
  };
  textareaAriaProps: {
    'aria-expanded': boolean;
    'aria-controls': string;
    'aria-activedescendant': string | undefined;
    'aria-autocomplete': 'list';
    role: 'combobox';
  };
}

// ========== Internal Types ==========

interface MentionState {
  startIndex: number;
  query: string;
}

type DeriveResult =
  | { candidates: ReferenceCandidate[]; emptyReason: null }
  | { candidates: ReferenceCandidate[]; emptyReason: EmptyReason };

type WorkflowNode = Node<WorkflowNodeData>;

// ========== Pure Helpers (exported for testing) ==========

/**
 * カーソル位置から逆順に走査して直近の `@` を検出する。
 * スペース or 開始位置で打ち切り。
 */
export function detectMentionTrigger(
  value: string,
  cursor: number
): MentionState | null {
  if (cursor <= 0 || cursor > value.length) return null;
  // 逆順走査
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === '@') {
      // `@` 直後にスペースは認めない (query 領域なし扱い)
      const query = value.slice(i + 1, cursor);
      if (/\s/.test(query)) return null;
      return { startIndex: i, query };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/**
 * prefix match で候補を絞り込む。
 * query が空のときは全件返す。
 */
export function filterCandidates(
  candidates: ReferenceCandidate[],
  query: string
): ReferenceCandidate[] {
  if (!query) return candidates;
  const lower = query.toLowerCase();
  // id は `@image1` のような形式なので、`@` を除いた部分と比較する
  return candidates.filter((c) => {
    const idBody = c.id.startsWith('@') ? c.id.slice(1) : c.id;
    return idBody.toLowerCase().startsWith(lower);
  });
}

/**
 * 既存テキストの `@<query>` を `<candidate.id> ` (末尾スペース) で置換する。
 * 戻り値は { nextValue, nextCursor }。
 */
export function insertMention(
  value: string,
  mention: MentionState,
  candidate: ReferenceCandidate
): { nextValue: string; nextCursor: number } {
  const before = value.slice(0, mention.startIndex);
  const after = value.slice(mention.startIndex + 1 + mention.query.length);
  const inserted = `${candidate.id} `;
  return {
    nextValue: `${before}${inserted}${after}`,
    nextCursor: before.length + inserted.length,
  };
}

// ========== Strict edge helpers (H-1) ==========

function findGenerateNodeStrict(
  promptNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[]
): WorkflowNode | null {
  const matched = edges.filter(
    (e) =>
      e.source === promptNodeId &&
      e.sourceHandle === HANDLE_IDS.STORY_TEXT_OUTPUT &&
      e.targetHandle === HANDLE_IDS.STORY_TEXT_INPUT
  );
  if (matched.length === 0) return null;
  if (matched.length > 1) {
    console.warn(
      '[useReferenceAutocomplete] multiple GenerateNode candidates, skip'
    );
    return null;
  }
  const node = nodes.find(
    (n) => n.id === matched[0].target && n.type === 'generate'
  );
  return node ?? null;
}

function findProviderNodeStrict(
  generateNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[]
): WorkflowNode | null {
  const matched = edges.filter(
    (e) =>
      e.target === generateNodeId &&
      e.targetHandle === HANDLE_IDS.CONFIG_INPUT &&
      e.sourceHandle === HANDLE_IDS.CONFIG_OUTPUT
  );
  if (matched.length === 0) return null;
  if (matched.length > 1) {
    console.warn(
      '[useReferenceAutocomplete] multiple Provider candidates for generate, skip'
    );
    return null;
  }
  const node = nodes.find(
    (n) => n.id === matched[0].source && n.type === 'provider'
  );
  return node ?? null;
}

function findBaseImageNodeStrict(
  generateNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[]
): WorkflowNode | null {
  const matched = edges.filter(
    (e) =>
      e.target === generateNodeId &&
      e.targetHandle === HANDLE_IDS.IMAGE_INPUT &&
      e.sourceHandle === HANDLE_IDS.IMAGE_OUTPUT
  );
  if (matched.length === 0) return null;
  if (matched.length > 1) {
    console.warn(
      '[useReferenceAutocomplete] multiple ImageInput candidates, skip'
    );
    return null;
  }
  const node = nodes.find(
    (n) => n.id === matched[0].source && n.type === 'imageInput'
  );
  return node ?? null;
}

function findOmniReferenceNodeStrict(
  providerNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[]
): WorkflowNode | null {
  const matched = edges.filter(
    (e) =>
      e.target === providerNodeId &&
      e.targetHandle === HANDLE_IDS.OMNI_REFERENCE_INPUT &&
      e.sourceHandle === HANDLE_IDS.OMNI_REFERENCE_OUTPUT
  );
  if (matched.length === 0) return null;
  if (matched.length > 1) {
    console.warn(
      '[useReferenceAutocomplete] multiple OmniReference candidates, skip'
    );
    return null;
  }
  const node = nodes.find(
    (n) => n.id === matched[0].source && n.type === 'omniReference'
  );
  return node ?? null;
}

function extractFilename(url: string | null | undefined): string {
  if (!url) return 'untitled';
  try {
    const parsed = new URL(url, 'http://_local_');
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return last && last.length > 0 ? decodeURIComponent(last) : 'untitled';
  } catch {
    const parts = url.split('/').filter(Boolean);
    const last = parts.pop();
    return last && last.length > 0 ? last : 'untitled';
  }
}

// ========== Core derivation (exported for testing) ==========

export function deriveAvailableReferences(
  promptNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[]
): DeriveResult {
  const generateNode = findGenerateNodeStrict(promptNodeId, nodes, edges);
  if (!generateNode) return { candidates: [], emptyReason: 'no-generate-node' };

  const providerNode = findProviderNodeStrict(generateNode.id, nodes, edges);
  const providerData = providerNode?.data as ProviderNodeData | undefined;
  if (!providerData || providerData.provider !== 'seedance') {
    return { candidates: [], emptyReason: 'not-seedance' };
  }

  const baseImageNode = findBaseImageNodeStrict(generateNode.id, nodes, edges);
  const baseImageData = baseImageNode?.data as ImageInputNodeData | undefined;
  if (!baseImageData?.imageUrl) {
    return { candidates: [], emptyReason: 'no-base-image' };
  }

  if (!providerNode) {
    // Defensive: provider 必須だが型上で保護
    return { candidates: [], emptyReason: 'not-seedance' };
  }

  const omniRefNode = findOmniReferenceNodeStrict(
    providerNode.id,
    nodes,
    edges
  );
  if (!omniRefNode) {
    return { candidates: [], emptyReason: 'no-omni-ref' };
  }

  const omniRefData = omniRefNode.data as OmniReferenceNodeData;
  const compact = compactOmniReferences(omniRefData);

  const candidates: ReferenceCandidate[] = [];

  // @image1 = base
  candidates.push({
    id: '@image1',
    kind: 'image',
    index: 1,
    filename: extractFilename(baseImageData.imageUrl),
  });

  compact.imageUrls.forEach((slot, i) => {
    candidates.push({
      id: `@image${i + 2}`,
      kind: 'image',
      index: i + 2,
      filename: slot.filename,
    });
  });

  compact.videoUrls.forEach((slot, i) => {
    candidates.push({
      id: `@video${i + 1}`,
      kind: 'video',
      index: i + 1,
      filename: slot.filename,
      durationSeconds: slot.durationSeconds,
    });
  });

  compact.audioUrls.forEach((slot, i) => {
    candidates.push({
      id: `@audio${i + 1}`,
      kind: 'audio',
      index: i + 1,
      filename: slot.filename,
      durationSeconds: slot.durationSeconds,
    });
  });

  const onlyBaseImage =
    candidates.length === 1 &&
    compact.imageUrls.length === 0 &&
    compact.videoUrls.length === 0 &&
    compact.audioUrls.length === 0;
  if (onlyBaseImage) {
    return { candidates, emptyReason: 'all-slots-empty' };
  }

  return { candidates, emptyReason: null };
}

// ========== Hook ==========

export function useReferenceAutocomplete(
  options: UseReferenceAutocompleteOptions
): UseReferenceAutocompleteResult {
  const { promptNodeId, textareaRef, value, onChange } = options;

  const reactFlow = useReactFlow<WorkflowNode>();
  const viewport = useViewport();

  const [isOpen, setIsOpen] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [allCandidates, setAllCandidates] = useState<ReferenceCandidate[]>([]);
  const [emptyReason, setEmptyReason] = useState<EmptyReason | null>(null);
  const isComposingRef = useRef(false);
  const prevViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(
    null
  );

  const internalId = useId();
  const listboxId = `reference-autocomplete-listbox-${internalId.replace(/[:]/g, '')}`;

  const query = mention?.query ?? '';

  const candidates = useMemo(
    () => filterCandidates(allCandidates, query),
    [allCandidates, query]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setMention(null);
    setHighlightedIndex(0);
  }, []);

  // 候補再計算は入力イベント時のみ実行 (§12.1)
  const recomputeCandidates = useCallback((): {
    candidates: ReferenceCandidate[];
    emptyReason: EmptyReason | null;
  } => {
    const nodes = reactFlow.getNodes();
    const edges = reactFlow.getEdges();
    const result = deriveAvailableReferences(promptNodeId, nodes, edges);
    return { candidates: result.candidates, emptyReason: result.emptyReason };
  }, [reactFlow, promptNodeId]);

  const evaluateTrigger = useCallback(
    (nextValue: string, cursor: number) => {
      if (isComposingRef.current) return;
      const trigger = detectMentionTrigger(nextValue, cursor);
      if (!trigger) {
        close();
        return;
      }
      const result = recomputeCandidates();
      setAllCandidates(result.candidates);
      setEmptyReason(result.emptyReason);
      setMention(trigger);
      setHighlightedIndex(0);
      setIsOpen(true);
    },
    [close, recomputeCandidates]
  );

  // ========== Handlers ==========

  const onTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      onChange(nextValue);
      const cursor = e.target.selectionStart ?? nextValue.length;
      evaluateTrigger(nextValue, cursor);
    },
    [onChange, evaluateTrigger]
  );

  const onTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposingRef.current) return;

      // popup 非表示中は通常通り
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      const len = candidates.length;
      if (len === 0) {
        // 0 件時: ↑↓ は no-op (preventDefault せず textarea デフォルト)
        // Enter/Tab は preventDefault せず textarea のデフォルト動作を許可
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((idx) => (idx + 1) % len);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((idx) => (idx - 1 + len) % len);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const target = candidates[highlightedIndex];
        if (!target || !mention) return;
        const { nextValue, nextCursor } = insertMention(value, mention, target);
        onChange(nextValue);
        close();
        // カーソル位置を補正 (next tick)
        const ta = textareaRef.current;
        if (ta) {
          requestAnimationFrame(() => {
            ta.setSelectionRange(nextCursor, nextCursor);
          });
        }
      }
    },
    [
      isOpen,
      candidates,
      highlightedIndex,
      mention,
      value,
      onChange,
      close,
      textareaRef,
    ]
  );

  const onCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);
  const onCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const onTextareaBlur = useCallback(() => {
    // popup click は capture mousedown で先取りされる前提
    close();
  }, [close]);

  const onPopupSelect = useCallback(
    (candidate: ReferenceCandidate) => {
      if (!mention) return;
      const { nextValue, nextCursor } = insertMention(value, mention, candidate);
      onChange(nextValue);
      close();
      const ta = textareaRef.current;
      if (ta) {
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(nextCursor, nextCursor);
        });
      }
    },
    [mention, value, onChange, close, textareaRef]
  );

  const onPopupClose = useCallback(() => {
    close();
  }, [close]);

  // ========== outside click ==========

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // popup 内 click は data-* 属性で判定
      if (target.closest('[data-reference-autocomplete-popup="true"]')) return;
      if (target === textareaRef.current) return;
      if (textareaRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, close, textareaRef]);

  // ========== viewport (zoom/pan) 検知 ==========

  useEffect(() => {
    if (!isOpen) {
      prevViewportRef.current = viewport;
      return;
    }
    const prev = prevViewportRef.current;
    prevViewportRef.current = viewport;
    if (!prev) return;
    const zoomChanged = prev.zoom !== viewport.zoom;
    const panMoved =
      Math.abs(prev.x - viewport.x) > 8 || Math.abs(prev.y - viewport.y) > 8;
    if (zoomChanged || panMoved) {
      // 外部システム (React Flow viewport) の変化を受けて popup を閉じる
      // ためのサブスクリプション的 effect。setState 直接呼出しが必要。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      close();
    }
    // 注: deps から `viewport` object 自体を除外。useViewport() は毎レンダ
    //     新オブジェクト参照を返す可能性があり、含めると分解値が同じでも
    //     effect が再実行されて prevViewportRef の差分検知が無効化されるため。
  }, [viewport.x, viewport.y, viewport.zoom, isOpen, close]);

  // ========== ARIA props ==========

  const activeDescendant =
    isOpen && candidates.length > 0 && candidates[highlightedIndex]
      ? `${listboxId}-option-${highlightedIndex}`
      : undefined;

  const textareaAriaProps: UseReferenceAutocompleteResult['textareaAriaProps'] =
    {
      'aria-expanded': isOpen,
      'aria-controls': listboxId,
      'aria-activedescendant': activeDescendant,
      'aria-autocomplete': 'list',
      role: 'combobox',
    };

  return {
    isOpen,
    query,
    candidates,
    emptyReason,
    highlightedIndex,
    listboxId,
    handlers: {
      onTextareaChange,
      onTextareaKeyDown,
      onCompositionStart,
      onCompositionEnd,
      onTextareaBlur,
      onPopupSelect,
      onPopupClose,
    },
    textareaAriaProps,
  };
}
