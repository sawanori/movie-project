import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  HANDLE_IDS,
  type GenerateNodeData,
  type ImageInputNodeData,
  type OmniReferenceNodeData,
  type OmniReferenceSlot,
  type ProviderNodeData,
  type PromptNodeData,
  type WorkflowNodeData,
} from '@/lib/types/node-editor';

// ========== Mock @xyflow/react ==========

const mockNodes: { current: Node<WorkflowNodeData>[] } = { current: [] };
const mockEdges: { current: Edge[] } = { current: [] };
const mockViewport: { current: { x: number; y: number; zoom: number } } = {
  current: { x: 0, y: 0, zoom: 1 },
};

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getNodes: () => mockNodes.current,
    getEdges: () => mockEdges.current,
  }),
  useViewport: () => mockViewport.current,
}));

// Imports must come AFTER vi.mock for the mocks to apply.
import {
  useReferenceAutocomplete,
  deriveAvailableReferences,
  detectMentionTrigger,
  filterCandidates,
  insertMention,
} from './useReferenceAutocomplete';

// ========== Helpers ==========

function emptySlot(mediaType: 'image' | 'video' | 'audio'): OmniReferenceSlot {
  return { assetId: null, mediaType };
}
function filledSlot(
  mediaType: 'image' | 'video' | 'audio',
  filename: string,
  durationSeconds?: number
): OmniReferenceSlot {
  return {
    assetId: `asset-${filename}`,
    url: `https://example.com/${filename}`,
    filename,
    durationSeconds,
    mediaType,
  };
}

function buildBaseImageNode(
  id = 'image-input-1',
  imageUrl: string | null = 'https://example.com/character.png'
): Node<ImageInputNodeData> {
  return {
    id,
    type: 'imageInput',
    position: { x: 0, y: 0 },
    data: {
      type: 'imageInput',
      imageUrl,
      imagePreview: null,
      isValid: true,
    },
  };
}

function buildPromptNode(id = 'prompt-1'): Node<PromptNodeData> {
  return {
    id,
    type: 'prompt',
    position: { x: 0, y: 0 },
    data: {
      type: 'prompt',
      japanesePrompt: '',
      englishPrompt: '',
      isTranslating: false,
      subjectType: 'person',
      isValid: true,
    },
  };
}

function buildGenerateNode(id = 'generate-1'): Node<GenerateNodeData> {
  return {
    id,
    type: 'generate',
    position: { x: 0, y: 0 },
    data: {
      type: 'generate',
      isGenerating: false,
      progress: 0,
      videoUrl: null,
      error: null,
      isValid: true,
    },
  };
}

function buildProviderNode(
  id = 'provider-1',
  provider: ProviderNodeData['provider'] = 'seedance'
): Node<ProviderNodeData> {
  return {
    id,
    type: 'provider',
    position: { x: 0, y: 0 },
    data: {
      type: 'provider',
      provider,
      aspectRatio: '9:16',
      duration: null,
      isValid: true,
    },
  };
}

function buildOmniRefNode(
  id = 'omni-1',
  imageSlots: OmniReferenceSlot[] = [],
  videoSlots: OmniReferenceNodeData['videoSlots'] = [
    emptySlot('video'),
    emptySlot('video'),
    emptySlot('video'),
  ],
  audioSlots: OmniReferenceNodeData['audioSlots'] = [
    emptySlot('audio'),
    emptySlot('audio'),
    emptySlot('audio'),
  ]
): Node<OmniReferenceNodeData> {
  return {
    id,
    type: 'omniReference',
    position: { x: 0, y: 0 },
    data: {
      type: 'omniReference',
      imageSlots,
      videoSlots,
      audioSlots,
      consentAccepted: true,
      isValid: true,
    },
  };
}

function buildEdges(opts: {
  promptId?: string;
  generateId?: string;
  providerId?: string;
  imageInputId?: string;
  omniRefId?: string;
}): Edge[] {
  const edges: Edge[] = [];
  if (opts.promptId && opts.generateId) {
    edges.push({
      id: `${opts.promptId}->${opts.generateId}`,
      source: opts.promptId,
      target: opts.generateId,
      sourceHandle: HANDLE_IDS.STORY_TEXT_OUTPUT,
      targetHandle: HANDLE_IDS.STORY_TEXT_INPUT,
    });
  }
  if (opts.providerId && opts.generateId) {
    edges.push({
      id: `${opts.providerId}->${opts.generateId}`,
      source: opts.providerId,
      target: opts.generateId,
      sourceHandle: HANDLE_IDS.CONFIG_OUTPUT,
      targetHandle: HANDLE_IDS.CONFIG_INPUT,
    });
  }
  if (opts.imageInputId && opts.generateId) {
    edges.push({
      id: `${opts.imageInputId}->${opts.generateId}`,
      source: opts.imageInputId,
      target: opts.generateId,
      sourceHandle: HANDLE_IDS.IMAGE_OUTPUT,
      targetHandle: HANDLE_IDS.IMAGE_INPUT,
    });
  }
  if (opts.omniRefId && opts.providerId) {
    edges.push({
      id: `${opts.omniRefId}->${opts.providerId}`,
      source: opts.omniRefId,
      target: opts.providerId,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    });
  }
  return edges;
}

function makeFullSetup(opts?: {
  provider?: ProviderNodeData['provider'];
  baseImageUrl?: string | null;
  withOmniRef?: boolean;
  imageSlots?: OmniReferenceSlot[];
  videoSlots?: OmniReferenceNodeData['videoSlots'];
  audioSlots?: OmniReferenceNodeData['audioSlots'];
}) {
  const prompt = buildPromptNode();
  const generate = buildGenerateNode();
  const provider = buildProviderNode('provider-1', opts?.provider ?? 'seedance');
  const baseUrl =
    opts && 'baseImageUrl' in opts
      ? opts.baseImageUrl
      : 'https://example.com/character.png';
  const image = buildBaseImageNode('image-1', baseUrl);
  const nodes: Node<WorkflowNodeData>[] = [prompt, generate, provider, image];
  let omniId: string | undefined;
  if (opts?.withOmniRef ?? true) {
    const omni = buildOmniRefNode(
      'omni-1',
      opts?.imageSlots ?? [],
      opts?.videoSlots,
      opts?.audioSlots
    );
    nodes.push(omni);
    omniId = omni.id;
  }
  const edges = buildEdges({
    promptId: prompt.id,
    generateId: generate.id,
    providerId: provider.id,
    imageInputId: image.id,
    omniRefId: omniId,
  });
  return { promptId: prompt.id, nodes, edges };
}

beforeEach(() => {
  mockNodes.current = [];
  mockEdges.current = [];
  mockViewport.current = { x: 0, y: 0, zoom: 1 };
  vi.restoreAllMocks();
});

// ========== Pure helper tests ==========

describe('detectMentionTrigger', () => {
  it('detects trailing @ as mention with empty query', () => {
    expect(detectMentionTrigger('hello @', 7)).toEqual({
      startIndex: 6,
      query: '',
    });
  });

  it('detects @ with partial query before cursor', () => {
    expect(detectMentionTrigger('hi @vid', 7)).toEqual({
      startIndex: 3,
      query: 'vid',
    });
  });

  it('returns null when no @ before cursor', () => {
    expect(detectMentionTrigger('plain text', 10)).toBeNull();
  });

  it('returns null when space exists between @ and cursor', () => {
    expect(detectMentionTrigger('hi @ vid', 8)).toBeNull();
  });
});

describe('filterCandidates', () => {
  const all = [
    { id: '@image1', kind: 'image' as const, index: 1, filename: 'a.png' },
    { id: '@video1', kind: 'video' as const, index: 1, filename: 'b.mp4' },
    { id: '@audio1', kind: 'audio' as const, index: 1, filename: 'c.mp3' },
  ];
  it('returns all when query is empty', () => {
    expect(filterCandidates(all, '')).toHaveLength(3);
  });
  it('prefix matches "v" → video only', () => {
    expect(filterCandidates(all, 'v').map((c) => c.id)).toEqual(['@video1']);
  });
});

describe('insertMention', () => {
  it('replaces @query with candidate id and trailing space', () => {
    const result = insertMention(
      'hello @vid world',
      { startIndex: 6, query: 'vid' },
      { id: '@video1', kind: 'video', index: 1, filename: 'b.mp4' }
    );
    expect(result.nextValue).toBe('hello @video1  world');
    expect(result.nextCursor).toBe('hello @video1 '.length);
  });
});

// ========== deriveAvailableReferences ==========

describe('deriveAvailableReferences', () => {
  it('AT-2: full setup returns base + compact OmniRef in correct order', () => {
    const { promptId, nodes, edges } = makeFullSetup({
      imageSlots: [filledSlot('image', 'pose-a.png')],
      videoSlots: [
        filledSlot('video', 'dance.mp4', 5),
        emptySlot('video'),
        emptySlot('video'),
      ],
      audioSlots: [
        filledSlot('audio', 'bgm.mp3', 3.2),
        emptySlot('audio'),
        emptySlot('audio'),
      ],
    });
    const result = deriveAvailableReferences(promptId, nodes, edges);
    expect(result.emptyReason).toBeNull();
    expect(result.candidates.map((c) => c.id)).toEqual([
      '@image1',
      '@image2',
      '@video1',
      '@audio1',
    ]);
    // index = ordinal
    expect(result.candidates.find((c) => c.id === '@image2')?.index).toBe(2);
    expect(result.candidates.find((c) => c.id === '@video1')?.index).toBe(1);
    expect(result.candidates.find((c) => c.id === '@audio1')?.durationSeconds).toBe(3.2);
  });

  it('AT-14: base image + multi OmniRef images → correct offset (+1)', () => {
    const { promptId, nodes, edges } = makeFullSetup({
      imageSlots: [
        filledSlot('image', 'pose-a.png'),
        filledSlot('image', 'pose-b.png'),
      ],
    });
    const result = deriveAvailableReferences(promptId, nodes, edges);
    const imageCandidates = result.candidates.filter((c) => c.kind === 'image');
    expect(imageCandidates.map((c) => c.id)).toEqual([
      '@image1',
      '@image2',
      '@image3',
    ]);
    expect(imageCandidates[0].filename).toBe('character.png');
    expect(imageCandidates[1].filename).toBe('pose-a.png');
    expect(imageCandidates[2].filename).toBe('pose-b.png');
  });

  it('AT-16: sparse video slots → @video1 maps to compact ordinal', () => {
    const { promptId, nodes, edges } = makeFullSetup({
      videoSlots: [
        emptySlot('video'),
        filledSlot('video', 'dance.mp4', 5),
        emptySlot('video'),
      ],
    });
    const result = deriveAvailableReferences(promptId, nodes, edges);
    const videoCandidates = result.candidates.filter((c) => c.kind === 'video');
    expect(videoCandidates).toHaveLength(1);
    expect(videoCandidates[0].id).toBe('@video1');
    expect(videoCandidates[0].filename).toBe('dance.mp4');
  });

  it('AT-17: Provider=Runway → emptyReason=not-seedance, zero candidates', () => {
    const { promptId, nodes, edges } = makeFullSetup({ provider: 'runway' });
    const result = deriveAvailableReferences(promptId, nodes, edges);
    expect(result.emptyReason).toBe('not-seedance');
    expect(result.candidates).toHaveLength(0);
  });

  it('AT-18: Provider=veo/piapi_kling/hailuo → emptyReason=not-seedance', () => {
    for (const provider of ['veo', 'piapi_kling', 'hailuo'] as const) {
      const { promptId, nodes, edges } = makeFullSetup({ provider });
      const result = deriveAvailableReferences(promptId, nodes, edges);
      expect(result.emptyReason).toBe('not-seedance');
      expect(result.candidates).toHaveLength(0);
    }
  });

  it('no base image → emptyReason=no-base-image, zero candidates', () => {
    const { promptId, nodes, edges } = makeFullSetup({ baseImageUrl: null });
    const result = deriveAvailableReferences(promptId, nodes, edges);
    expect(result.emptyReason).toBe('no-base-image');
    expect(result.candidates).toHaveLength(0);
  });

  it('OmniRef not connected → emptyReason=no-omni-ref (base image alone is not enough)', () => {
    const { promptId, nodes, edges } = makeFullSetup({ withOmniRef: false });
    const result = deriveAvailableReferences(promptId, nodes, edges);
    expect(result.emptyReason).toBe('no-omni-ref');
    expect(result.candidates).toHaveLength(0);
  });

  it('OmniRef connected but all slots empty → emptyReason=all-slots-empty, @image1 only', () => {
    const { promptId, nodes, edges } = makeFullSetup({});
    const result = deriveAvailableReferences(promptId, nodes, edges);
    expect(result.emptyReason).toBe('all-slots-empty');
    expect(result.candidates.map((c) => c.id)).toEqual(['@image1']);
  });

  it('AT-25: multiple GenerateNode edges from one PromptNode → zero candidates + warn', () => {
    const prompt = buildPromptNode();
    const gen1 = buildGenerateNode('generate-1');
    const gen2 = buildGenerateNode('generate-2');
    const provider = buildProviderNode('provider-1', 'seedance');
    const image = buildBaseImageNode('image-1');
    const nodes = [prompt, gen1, gen2, provider, image];
    const edges: Edge[] = [
      {
        id: 'e1',
        source: prompt.id,
        target: gen1.id,
        sourceHandle: HANDLE_IDS.STORY_TEXT_OUTPUT,
        targetHandle: HANDLE_IDS.STORY_TEXT_INPUT,
      },
      {
        id: 'e2',
        source: prompt.id,
        target: gen2.id,
        sourceHandle: HANDLE_IDS.STORY_TEXT_OUTPUT,
        targetHandle: HANDLE_IDS.STORY_TEXT_INPUT,
      },
    ];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = deriveAvailableReferences(prompt.id, nodes, edges);
    expect(result.emptyReason).toBe('no-generate-node');
    expect(result.candidates).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ========== Hook integration tests ==========

describe('useReferenceAutocomplete (hook)', () => {
  it('AT-4: typing "@v" filters to video candidates only', () => {
    const setup = makeFullSetup({
      imageSlots: [filledSlot('image', 'pose-a.png')],
      videoSlots: [
        filledSlot('video', 'dance.mp4', 5),
        emptySlot('video'),
        emptySlot('video'),
      ],
    });
    mockNodes.current = setup.nodes;
    mockEdges.current = setup.edges;

    const textareaRef = createRef<HTMLTextAreaElement>();
    let value = '';
    const onChange = vi.fn((next: string) => {
      value = next;
    });

    const { result, rerender } = renderHook(
      ({ v }: { v: string }) =>
        useReferenceAutocomplete({
          promptNodeId: setup.promptId,
          textareaRef,
          value: v,
          onChange,
        }),
      { initialProps: { v: '' } }
    );

    act(() => {
      // simulate typing "@v"
      const nextValue = '@v';
      value = nextValue;
      const event = {
        target: {
          value: nextValue,
          selectionStart: nextValue.length,
        },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      result.current.handlers.onTextareaChange(event);
    });
    rerender({ v: value });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.query).toBe('v');
    expect(result.current.candidates.map((c) => c.id)).toEqual(['@video1']);
  });

  it('AT-13: multiple @ → only most recent is the trigger', () => {
    const setup = makeFullSetup({
      videoSlots: [
        filledSlot('video', 'dance.mp4', 5),
        emptySlot('video'),
        emptySlot('video'),
      ],
    });
    mockNodes.current = setup.nodes;
    mockEdges.current = setup.edges;

    const textareaRef = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useReferenceAutocomplete({
        promptNodeId: setup.promptId,
        textareaRef,
        value: '@image1 and @v',
        onChange,
      })
    );

    act(() => {
      const text = '@image1 and @v';
      const event = {
        target: { value: text, selectionStart: text.length },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      result.current.handlers.onTextareaChange(event);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.query).toBe('v');
    // only the trailing @v is considered
    expect(result.current.candidates.map((c) => c.id)).toEqual(['@video1']);
  });

  it('AT-2 (hook variant): isOpen=true with all candidates after typing "@"', () => {
    const setup = makeFullSetup({
      imageSlots: [filledSlot('image', 'pose-a.png')],
      videoSlots: [
        filledSlot('video', 'dance.mp4', 5),
        emptySlot('video'),
        emptySlot('video'),
      ],
      audioSlots: [
        filledSlot('audio', 'bgm.mp3', 3.2),
        emptySlot('audio'),
        emptySlot('audio'),
      ],
    });
    mockNodes.current = setup.nodes;
    mockEdges.current = setup.edges;

    const textareaRef = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useReferenceAutocomplete({
        promptNodeId: setup.promptId,
        textareaRef,
        value: '@',
        onChange,
      })
    );
    act(() => {
      const text = '@';
      const event = {
        target: { value: text, selectionStart: 1 },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      result.current.handlers.onTextareaChange(event);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.emptyReason).toBeNull();
    expect(result.current.candidates.length).toBe(4);
    expect(result.current.candidates[0].id).toBe('@image1');
  });

  it('emptyReason propagates to result when conditions not met', () => {
    const setup = makeFullSetup({ provider: 'runway' });
    mockNodes.current = setup.nodes;
    mockEdges.current = setup.edges;

    const textareaRef = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useReferenceAutocomplete({
        promptNodeId: setup.promptId,
        textareaRef,
        value: '@',
        onChange,
      })
    );
    act(() => {
      const event = {
        target: { value: '@', selectionStart: 1 },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      result.current.handlers.onTextareaChange(event);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.emptyReason).toBe('not-seedance');
    expect(result.current.candidates).toHaveLength(0);
  });
});
