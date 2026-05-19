'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import { Type, Loader2, Languages, MessageSquare } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
  nodeInputClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import type { PromptNodeData, SubjectType, DialogueNodeData } from '@/lib/types/node-editor';
import { videosApi } from '@/lib/api/client';
import { emitNodeDataUpdate } from '../utils/emit-node-data';
import { useReferenceAutocomplete } from '../hooks/useReferenceAutocomplete';
import { ReferenceMentionPopup } from '../components/ReferenceMentionPopup';

interface PromptNodeProps extends NodeProps {
  data: PromptNodeData;
  selected: boolean;
}

const SUBJECT_TYPES: { value: SubjectType; label: string }[] = [
  { value: 'person', label: '人物' },
  { value: 'object', label: 'オブジェクト' },
  { value: 'animation', label: 'アニメーション' },
];

export function PromptNode({ data, selected, id }: PromptNodeProps) {
  const [localPrompt, setLocalPrompt] = useState(data.japanesePrompt ?? '');
  // セリフ検出状態 (確認カード表示用)
  const [pendingDialogue, setPendingDialogue] = useState<string | null>(null);
  // N1 対応: dismissed ハッシュは useRef 管理 (依存配列に含めず useEffect 再走を防ぐ)
  const dismissedDialogueHashRef = useRef<string | null>(null);
  // textarea ref (autocomplete 用の anchor)
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { getNodes } = useReactFlow();

  // @ メンション autocomplete (Seedance @image/@video/@audio 参照入力支援)
  const autocomplete = useReferenceAutocomplete({
    promptNodeId: id,
    textareaRef,
    value: localPrompt,
    onChange: setLocalPrompt,
  });

  // N3 対応: セリフ正規化 (空白/改行を統一して同一性判定)
  const normalizeDialogue = useCallback(
    (raw: string): string => raw.trim().replace(/\s+/g, ' '),
    []
  );

  const updateNodeData = useCallback(
    (updates: Partial<PromptNodeData>) => {
      emitNodeDataUpdate<PromptNodeData>(id, updates);
    },
    [id]
  );

  // デバウンス翻訳 (B2 対応: 全翻訳パラメータを渡す)
  useEffect(() => {
    if (!localPrompt.trim()) {
      updateNodeData({
        japanesePrompt: '',
        englishPrompt: '',
        isValid: false,
      });
      return;
    }

    const timer = setTimeout(async () => {
      updateNodeData({ isTranslating: true, japanesePrompt: localPrompt });

      try {
        // B2 対応: subject_type を含む全オプションを翻訳 API に渡す
        const result = await videosApi.translateStoryPrompt({
          description_ja: localPrompt,
          subject_type: (data.subjectType ?? 'person') as 'person' | 'object' | 'animation',
        });

        updateNodeData({
          englishPrompt: result.english_prompt,
          isTranslating: false,
          isValid: true,
          errorMessage: undefined,
        });

        // セリフ検出時の表示制御
        if (result.extracted_dialogue) {
          const normalizedHash = normalizeDialogue(result.extracted_dialogue);
          // N3 対応: dismiss 済みの正規化ハッシュと同一なら再表示しない
          if (normalizedHash !== dismissedDialogueHashRef.current) {
            setPendingDialogue(result.extracted_dialogue);
          }
        } else {
          setPendingDialogue(null);
        }
      } catch (error) {
        updateNodeData({
          isTranslating: false,
          isValid: false,
          errorMessage:
            error instanceof Error ? error.message : '翻訳に失敗しました',
        });
      }
    }, 500);

    return () => clearTimeout(timer);
    // B2 対応: 翻訳パラメータ変更時も再翻訳トリガ
  }, [localPrompt, updateNodeData, data.subjectType, normalizeDialogue]);

  // N2 / N4 対応: createDialogueNodeFromPrompt CustomEvent を NodeEditor に伝達
  const handleCreateDialogueNode = useCallback((dialogueText: string) => {
    const event = new CustomEvent('createDialogueNodeFromPrompt', {
      detail: {
        sourcePromptNodeId: id,
        initialText: dialogueText,
      },
    });
    window.dispatchEvent(event);

    dismissedDialogueHashRef.current = normalizeDialogue(dialogueText);
    setPendingDialogue(null);
  }, [id, normalizeDialogue]);

  // 既存 nodeDataUpdate CustomEvent パターンを再利用して最初の DialogueNode に転記
  const handleSendToExistingDialogue = useCallback((dialogueText: string) => {
    const dialogueNodes = getNodes().filter((n) => n.type === 'dialogue');
    if (dialogueNodes.length === 0) return;

    if (dialogueNodes.length > 1) {
      console.warn('複数の DialogueNode が見つかりました。最初の 1 個に転記します。');
    }

    emitNodeDataUpdate<DialogueNodeData>(dialogueNodes[0].id, { text: dialogueText });

    dismissedDialogueHashRef.current = normalizeDialogue(dialogueText);
    setPendingDialogue(null);
  }, [getNodes, normalizeDialogue]);

  // 既存 DialogueNode の存在チェック (render 時評価)
  const hasExistingDialogueNode = getNodes().some((n) => n.type === 'dialogue');

  const handleSubjectTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSubjectType = e.target.value as SubjectType;
      updateNodeData({ subjectType: newSubjectType });

      // 【Phase 2追加】Act-Twoノードに通知するためのCustomEvent
      const event = new CustomEvent('subjectTypeChange', {
        detail: { subjectType: newSubjectType },
      });
      window.dispatchEvent(event);
    },
    [updateNodeData]
  );

  return (
    <BaseNode
      title="プロンプト"
      icon={<Type className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {/* 被写体タイプ */}
      <div className="mb-3">
        <label className={nodeLabelClassName}>被写体タイプ</label>
        <select
          value={data.subjectType ?? 'person'}
          onChange={handleSubjectTypeChange}
          className={nodeSelectClassName}
        >
          {SUBJECT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* 日本語プロンプト入力 */}
      <div className="mb-3">
        <label className={nodeLabelClassName}>プロンプト（日本語）</label>
        <textarea
          ref={textareaRef}
          placeholder="動画の内容を日本語で入力"
          value={localPrompt ?? ''}
          onChange={autocomplete.handlers.onTextareaChange}
          onKeyDown={autocomplete.handlers.onTextareaKeyDown}
          onCompositionStart={autocomplete.handlers.onCompositionStart}
          onCompositionEnd={autocomplete.handlers.onCompositionEnd}
          onBlur={autocomplete.handlers.onTextareaBlur}
          {...autocomplete.textareaAriaProps}
          className={`${nodeInputClassName} min-h-[80px] resize-none`}
        />
        {autocomplete.isOpen && (
          <ReferenceMentionPopup
            candidates={autocomplete.candidates}
            emptyReason={autocomplete.emptyReason}
            highlightedIndex={autocomplete.highlightedIndex}
            listboxId={autocomplete.listboxId}
            onSelect={autocomplete.handlers.onPopupSelect}
            onClose={autocomplete.handlers.onPopupClose}
            anchorRef={textareaRef}
          />
        )}
      </div>

      {/* 翻訳結果表示 */}
      {data.isTranslating ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>翻訳中...</span>
        </div>
      ) : data.englishPrompt ? (
        <div className="p-2 bg-[#1a1a1a] rounded-lg">
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            <Languages className="w-3 h-3" />
            <span>英語翻訳</span>
          </div>
          <p className="text-xs text-gray-300 line-clamp-3">
            {data.englishPrompt}
          </p>
        </div>
      ) : null}

      {/* セリフ検出確認カード */}
      {pendingDialogue && !data.isTranslating && (
        <div className="mt-2 p-2 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <div className="flex items-center gap-1 text-xs text-amber-300 mb-1">
            <MessageSquare className="w-3 h-3" />
            <span>セリフを検出しました</span>
          </div>
          <p className="text-xs text-gray-200 mb-2 italic">「{pendingDialogue}」</p>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => handleCreateDialogueNode(pendingDialogue)}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
            >
              新規 DialogueNode を作成
            </button>
            <button
              onClick={() => handleSendToExistingDialogue(pendingDialogue)}
              disabled={!hasExistingDialogueNode}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded"
            >
              既存ノードに転記
            </button>
            <button
              onClick={() => {
                // N3 対応: 正規化ハッシュで dismiss 記録
                dismissedDialogueHashRef.current = normalizeDialogue(pendingDialogue);
                setPendingDialogue(null);
              }}
              className="px-2 py-1 text-xs bg-transparent hover:bg-gray-700 text-gray-400 rounded"
            >
              無視
            </button>
          </div>
        </div>
      )}

      {/* 出力ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        id="story_text"
        className={outputHandleClassName}
        style={{ top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="subject_type"
        className={outputHandleClassName}
        style={{ top: '70%' }}
      />
    </BaseNode>
  );
}
