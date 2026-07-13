import { describe, it, expect, vi } from 'vitest'
import type { Edge } from '@xyflow/react'
import {
  graphToStoryVideoCreate,
  validateGraphForGeneration,
} from './graph-to-api'
import type {
  WorkflowNode,
  ImageInputNodeData,
  VideoInputNodeData,
  PromptNodeData,
  ProviderNodeData,
  GenerateNodeData,
  KlingElementsNodeData,
  OmniReferenceNodeData,
  OmniReferenceSlot,
} from '@/lib/types/node-editor'
import { HANDLE_IDS } from '@/lib/types/node-editor'

// ========== Test Helpers ==========

function createImageInputNode(
  imageUrl: string | null = 'https://example.com/image.jpg'
): WorkflowNode {
  return {
    id: 'imageInput-1',
    type: 'imageInput',
    position: { x: 0, y: 0 },
    data: {
      type: 'imageInput',
      isValid: !!imageUrl,
      imageUrl,
      imagePreview: imageUrl,
    } satisfies ImageInputNodeData,
  }
}

// ========== 新規 edge-scoping テスト用ヘルパー ==========
// ID を指定可能なバリアント (既存ヘルパーを壊さず追加)

function createImageInputNodeWithId(opts: {
  id?: string;
  imageUrl?: string | null;
}): WorkflowNode {
  const imageUrl = opts.imageUrl ?? 'https://example.com/image.jpg';
  return {
    id: opts.id ?? 'imageInput-1',
    type: 'imageInput',
    position: { x: 0, y: 0 },
    data: {
      type: 'imageInput',
      isValid: !!imageUrl,
      imageUrl,
      imagePreview: imageUrl,
    } satisfies ImageInputNodeData,
  };
}

function createPromptNodeWithId(opts: {
  id?: string;
  englishPrompt?: string;
}): WorkflowNode {
  const englishPrompt = opts.englishPrompt ?? 'A person walking';
  return {
    id: opts.id ?? 'prompt-1',
    type: 'prompt',
    position: { x: 100, y: 0 },
    data: {
      type: 'prompt',
      isValid: !!englishPrompt,
      japanesePrompt: '',
      englishPrompt,
      isTranslating: false,
      subjectType: 'person',
    } satisfies PromptNodeData,
  };
}

function createProviderNodeWithId(opts: {
  id?: string;
  provider?: ProviderNodeData['provider'];
  aspectRatio?: '9:16' | '16:9';
}): WorkflowNode {
  return {
    id: opts.id ?? 'provider-1',
    type: 'provider',
    position: { x: 200, y: 0 },
    data: {
      type: 'provider',
      isValid: true,
      provider: opts.provider ?? 'runway',
      aspectRatio: opts.aspectRatio ?? '9:16',
      duration: null,
    } satisfies ProviderNodeData,
  };
}

function createKlingElementsNode(opts: {
  id?: string;
  elementImages?: string[];
}): WorkflowNode {
  return {
    id: opts.id ?? 'klingElements-1',
    type: 'klingElements',
    position: { x: 0, y: 100 },
    data: {
      type: 'klingElements',
      isValid: true,
      elementImages: opts.elementImages ?? [],
    } satisfies KlingElementsNodeData,
  };
}

function createGenerateNodeWithId(opts: {
  id?: string;
  videoUrl?: string | null;
}): WorkflowNode {
  return {
    id: opts.id ?? 'generate-1',
    type: 'generate',
    position: { x: 300, y: 0 },
    data: {
      type: 'generate',
      isValid: true,
      isGenerating: false,
      progress: 0,
      videoUrl: opts.videoUrl ?? null,
      error: null,
    } satisfies GenerateNodeData,
  };
}

function createEdgeWithHandles(opts: {
  source: string;
  target: string;
  targetHandle?: string;
  sourceHandle?: string;
}): Edge {
  return {
    id: `edge-${opts.source}-${opts.target}-${opts.targetHandle ?? 'default'}`,
    source: opts.source,
    target: opts.target,
    targetHandle: opts.targetHandle,
    sourceHandle: opts.sourceHandle,
  };
}

function createVideoInputNode(
  videoUrl: string | null = 'https://example.com/video.mp4',
  options: Partial<VideoInputNodeData> = {}
): WorkflowNode {
  return {
    id: 'videoInput-1',
    type: 'videoInput',
    position: { x: 0, y: 0 },
    data: {
      type: 'videoInput',
      isValid: !!videoUrl,
      videoUrl,
      // Use 'videoThumbnail' in options if explicitly set (including null), otherwise default
      videoThumbnail: 'videoThumbnail' in options ? options.videoThumbnail ?? null : 'https://example.com/thumb.jpg',
      videoDuration: options.videoDuration ?? 5,
      sourceType: options.sourceType ?? 'upload',
    } satisfies VideoInputNodeData,
  }
}

function createPromptNode(
  englishPrompt: string = 'A person walking',
  options: Partial<PromptNodeData> = {}
): WorkflowNode {
  return {
    id: 'prompt-1',
    type: 'prompt',
    position: { x: 100, y: 0 },
    data: {
      type: 'prompt',
      isValid: !!englishPrompt,
      japanesePrompt: options.japanesePrompt ?? '',
      englishPrompt,
      isTranslating: false,
      subjectType: options.subjectType ?? 'person',
    } satisfies PromptNodeData,
  }
}

function createProviderNode(
  provider: ProviderNodeData['provider'] = 'runway',
  aspectRatio: '9:16' | '16:9' = '9:16'
): WorkflowNode {
  return {
    id: 'provider-1',
    type: 'provider',
    position: { x: 200, y: 0 },
    data: {
      type: 'provider',
      isValid: true,
      provider,
      aspectRatio,
      duration: null,
    } satisfies ProviderNodeData,
  }
}

function createGenerateNode(
  id: string = 'generate-1',
  videoUrl: string | null = null
): WorkflowNode {
  return {
    id,
    type: 'generate',
    position: { x: 300, y: 0 },
    data: {
      type: 'generate',
      isValid: true,
      isGenerating: false,
      progress: 0,
      videoUrl,
      error: null,
    } satisfies GenerateNodeData,
  }
}

function createBasicEdges(): Edge[] {
  return [
    { id: 'e1', source: 'imageInput-1', target: 'generate-1' },
    { id: 'e2', source: 'prompt-1', target: 'generate-1' },
    { id: 'e3', source: 'provider-1', target: 'generate-1' },
  ]
}

// ========== Tests ==========

describe('graphToStoryVideoCreate', () => {
  describe('I2V mode (existing behavior)', () => {
    it('should create request from basic I2V nodes', () => {
      const nodes: WorkflowNode[] = [
        createImageInputNode(),
        createPromptNode(),
        createProviderNode(),
        createGenerateNode(),
      ]

      const result = graphToStoryVideoCreate(nodes, createBasicEdges())

      expect(result.image_url).toBe('https://example.com/image.jpg')
      expect(result.story_text).toBe('A person walking')
      expect(result.video_provider).toBe('runway')
      expect(result.aspect_ratio).toBe('9:16')
      expect(result.video_mode).toBeUndefined()
      expect(result.source_video_url).toBeUndefined()
    })

    it('should throw error when image is not selected', () => {
      const nodes: WorkflowNode[] = [
        createImageInputNode(null),
        createPromptNode(),
        createProviderNode(),
        createGenerateNode(),
      ]

      expect(() => graphToStoryVideoCreate(nodes, createBasicEdges())).toThrow(
        '画像が選択されていません'
      )
    })
  })

  describe('V2V mode', () => {
    it('should create V2V request when videoInput node is present with Runway provider', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode('https://example.com/source.mp4'),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      const result = graphToStoryVideoCreate(nodes, [])

      expect(result.video_mode).toBe('v2v')
      expect(result.source_video_url).toBe('https://example.com/source.mp4')
      expect(result.video_provider).toBe('runway')
      expect(result.image_url).toBe('https://example.com/thumb.jpg')
      expect(result.story_text).toBe('A person walking')
    })

    it('should use videoThumbnail as image_url in V2V mode', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode('https://example.com/source.mp4', {
          videoThumbnail: 'https://example.com/custom-thumb.jpg',
        }),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      const result = graphToStoryVideoCreate(nodes, [])

      expect(result.image_url).toBe('https://example.com/custom-thumb.jpg')
    })

    it('should fallback to videoUrl as image_url when no thumbnail', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode('https://example.com/source.mp4', {
          videoThumbnail: null,
        }),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      const result = graphToStoryVideoCreate(nodes, [])

      expect(result.image_url).toBe('https://example.com/source.mp4')
    })

    it('should throw error when V2V is used with non-Runway provider', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('piapi_kling'),
        createGenerateNode(),
      ]

      expect(() => graphToStoryVideoCreate(nodes, [])).toThrow(
        'V2V（動画入力）はRunwayプロバイダーのみ対応しています'
      )
    })

    it('should throw error when both image and video inputs are provided', () => {
      const nodes: WorkflowNode[] = [
        createImageInputNode(),
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      expect(() => graphToStoryVideoCreate(nodes, [])).toThrow(
        'V2Vモードでは画像入力と動画入力を同時に使用できません'
      )
    })

    it('should throw error when V2V has no prompt', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode(''),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      expect(() => graphToStoryVideoCreate(nodes, [])).toThrow(
        'プロンプトが入力されていません'
      )
    })

    it('should accept Japanese prompt in V2V mode when English is empty', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode('', { japanesePrompt: '歩いている人' }),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      const result = graphToStoryVideoCreate(nodes, [])

      expect(result.story_text).toBe('歩いている人')
      expect(result.video_mode).toBe('v2v')
    })

    it('should include subject_type in V2V request', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode('A dog running', { subjectType: 'object' }),
        createProviderNode('runway'),
        createGenerateNode(),
      ]

      const result = graphToStoryVideoCreate(nodes, [])

      expect(result.subject_type).toBe('object')
    })

    it('should preserve post-processing parameters in V2V mode', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
        {
          id: 'filmGrain-1',
          type: 'filmGrain',
          position: { x: 0, y: 100 },
          data: {
            type: 'filmGrain',
            isValid: true,
            grain: 'heavy',
          },
        } as WorkflowNode,
        {
          id: 'lut-1',
          type: 'lut',
          position: { x: 0, y: 200 },
          data: {
            type: 'lut',
            isValid: true,
            useLut: false,
          },
        } as WorkflowNode,
      ]

      const result = graphToStoryVideoCreate(nodes, [])

      expect(result.video_mode).toBe('v2v')
      expect(result.film_grain).toBe('heavy')
      expect(result.use_lut).toBe(false)
    })
  })
})

describe('validateGraphForGeneration', () => {
  describe('V2V validation', () => {
    it('should pass validation for valid V2V graph with Runway', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'videoInput-1', target: 'generate-1' },
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail when V2V is used with non-Runway provider', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('piapi_kling'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'videoInput-1', target: 'generate-1' },
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain(
        'V2V（動画入力）はRunwayプロバイダーのみ対応しています'
      )
    })

    it('should fail when both image and video inputs exist with URLs', () => {
      const nodes: WorkflowNode[] = [
        createImageInputNode(),
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'imageInput-1', target: 'generate-1' },
        { id: 'e2', source: 'videoInput-1', target: 'generate-1' },
        { id: 'e3', source: 'prompt-1', target: 'generate-1' },
        { id: 'e4', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain(
        '画像入力と動画入力は同時に使用できません'
      )
    })

    it('should fail when video input has no videoUrl', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode(null),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'videoInput-1', target: 'generate-1' },
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('動画が選択されていません')
    })

    it('should fail when video duration exceeds 10 seconds', () => {
      const nodes: WorkflowNode[] = [
        createVideoInputNode('https://example.com/video.mp4', {
          videoDuration: 15,
        }),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'videoInput-1', target: 'generate-1' },
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('入力動画は10秒以下にしてください')
    })

    it('should allow video or image input (not require both)', () => {
      // V2V mode - only video input, no image input
      const nodes: WorkflowNode[] = [
        createVideoInputNode(),
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'videoInput-1', target: 'generate-1' },
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(true)
      expect(result.errors).not.toContain('画像入力ノードが必要です')
    })

    it('should require either image or video input when neither exists', () => {
      const nodes: WorkflowNode[] = [
        createPromptNode(),
        createProviderNode('runway'),
        createGenerateNode(),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'prompt-1', target: 'generate-1' },
        { id: 'e2', source: 'provider-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain(
        '画像入力、動画入力、または Kling 要素画像が必要です'
      )
    })

    it('KlingElementsNode (画像 1 枚以上) のみで ImageInput/VideoInput なし → エラーなし (バリデーション緩和)', () => {
      const nodes: WorkflowNode[] = [
        createPromptNode(),
        createProviderNode('piapi_kling'),
        createGenerateNode(),
        createKlingElementsNode({ elementImages: ['https://example.com/e1.jpg'] }),
      ]
      const edges: Edge[] = [
        { id: 'e1', source: 'prompt-1', target: 'generate-1' },
        { id: 'e2', source: 'provider-1', target: 'generate-1' },
        { id: 'e3', source: 'klingElements-1', target: 'generate-1' },
      ]

      const result = validateGraphForGeneration(nodes, edges)

      expect(result.errors).not.toContain('画像入力、動画入力、または Kling 要素画像が必要です')
      expect(result.errors).not.toContain('画像入力または動画入力ノードが必要です')
    })
  })

  describe('GenerateNode to GenerateNode v2v connection', () => {
    it('should create V2V request when GenerateNode A output is connected to GenerateNode B source_video_url input', () => {
      const generateNodeA = createGenerateNode('generate-a', 'https://example.com/generated-video-a.mp4')
      const generateNodeB = createGenerateNode('generate-b', null)

      const nodes: WorkflowNode[] = [
        generateNodeA,
        createPromptNode(),
        createProviderNode('runway'),
        generateNodeB,
      ]

      const edges: Edge[] = [
        // GenerateNode A の video_url 出力 → GenerateNode B の source_video_url 入力
        {
          id: 'v2v-edge',
          source: 'generate-a',
          sourceHandle: 'video_url',
          target: 'generate-b',
          targetHandle: 'source_video_url'
        },
        { id: 'e2', source: 'prompt-1', target: 'generate-b' },
        { id: 'e3', source: 'provider-1', target: 'generate-b' },
      ]

      // GenerateNode B を指定して変換
      const result = graphToStoryVideoCreate(nodes, edges, 'generate-b')

      expect(result.video_mode).toBe('v2v')
      expect(result.source_video_url).toBe('https://example.com/generated-video-a.mp4')
      expect(result.video_provider).toBe('runway')
      expect(result.story_text).toBe('A person walking')
      // GenerateNode からの v2v の場合、image_url は source_video_url と同じになる（サムネイルがないため）
      expect(result.image_url).toBe('https://example.com/generated-video-a.mp4')
    })

    it('should prioritize GenerateNode v2v connection over VideoInputNode', () => {
      // GenerateNode と VideoInputNode の両方がある場合、GenerateNode の接続を優先
      const generateNodeA = createGenerateNode('generate-a', 'https://example.com/generated.mp4')
      const generateNodeB = createGenerateNode('generate-b', null)
      const videoInput = createVideoInputNode('https://example.com/uploaded.mp4')

      const nodes: WorkflowNode[] = [
        generateNodeA,
        videoInput,
        createPromptNode(),
        createProviderNode('runway'),
        generateNodeB,
      ]

      const edges: Edge[] = [
        // GenerateNode A → GenerateNode B (v2v接続)
        {
          id: 'v2v-edge',
          source: 'generate-a',
          sourceHandle: 'video_url',
          target: 'generate-b',
          targetHandle: 'source_video_url'
        },
        { id: 'e2', source: 'prompt-1', target: 'generate-b' },
        { id: 'e3', source: 'provider-1', target: 'generate-b' },
      ]

      const result = graphToStoryVideoCreate(nodes, edges, 'generate-b')

      // GenerateNode の接続が優先される
      expect(result.source_video_url).toBe('https://example.com/generated.mp4')
    })

    it('should fallback to VideoInputNode when no GenerateNode v2v connection exists', () => {
      const videoInput = createVideoInputNode('https://example.com/uploaded.mp4')
      const generateNode = createGenerateNode('generate-1', null)

      const nodes: WorkflowNode[] = [
        videoInput,
        createPromptNode(),
        createProviderNode('runway'),
        generateNode,
      ]

      const edges: Edge[] = [
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      // VideoInputNode が存在する場合は従来通りの動作
      const result = graphToStoryVideoCreate(nodes, edges, 'generate-1')

      expect(result.video_mode).toBe('v2v')
      expect(result.source_video_url).toBe('https://example.com/uploaded.mp4')
      expect(result.image_url).toBe('https://example.com/thumb.jpg')
    })

    it('should support VideoInputNode to GenerateNode v2v connection', () => {
      const videoInput = createVideoInputNode('https://example.com/uploaded.mp4')
      const generateNode = createGenerateNode('generate-1', null)

      const nodes: WorkflowNode[] = [
        videoInput,
        createPromptNode(),
        createProviderNode('runway'),
        generateNode,
      ]

      const edges: Edge[] = [
        // VideoInputNode → GenerateNode (v2v接続)
        {
          id: 'v2v-edge',
          source: 'videoInput-1',
          sourceHandle: 'source_video_url',
          target: 'generate-1',
          targetHandle: 'source_video_url'
        },
        { id: 'e2', source: 'prompt-1', target: 'generate-1' },
        { id: 'e3', source: 'provider-1', target: 'generate-1' },
      ]

      const result = graphToStoryVideoCreate(nodes, edges, 'generate-1')

      expect(result.video_mode).toBe('v2v')
      expect(result.source_video_url).toBe('https://example.com/uploaded.mp4')
      expect(result.image_url).toBe('https://example.com/thumb.jpg')
    })

    it('should throw error when GenerateNode has no videoUrl for v2v connection', () => {
      const generateNodeA = createGenerateNode('generate-a', null) // videoUrl が null
      const generateNodeB = createGenerateNode('generate-b', null)

      const nodes: WorkflowNode[] = [
        generateNodeA,
        createPromptNode(),
        createProviderNode('runway'),
        generateNodeB,
      ]

      const edges: Edge[] = [
        {
          id: 'v2v-edge',
          source: 'generate-a',
          sourceHandle: 'video_url',
          target: 'generate-b',
          targetHandle: 'source_video_url'
        },
        { id: 'e2', source: 'prompt-1', target: 'generate-b' },
        { id: 'e3', source: 'provider-1', target: 'generate-b' },
      ]

      // GenerateNode A が生成完了していない場合はエラー
      expect(() => graphToStoryVideoCreate(nodes, edges, 'generate-b')).toThrow()
    })
  })
})

// ========== Edge-Scoping: エッジトレース + フォールバック ==========

describe('graphToStoryVideoCreate - edge scoping (新規)', () => {
  it('エッジ接続済: KlingElementsNode が ProviderNode に接続されている場合、element_images が正しく設定される', () => {
    const klingElementsNodeId = crypto.randomUUID();
    const providerNodeId = crypto.randomUUID();
    const generateNodeId = crypto.randomUUID();

    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNodeWithId({ englishPrompt: 'test prompt' }),
      createProviderNodeWithId({ id: providerNodeId, provider: 'piapi_kling' }),
      createKlingElementsNode({ id: klingElementsNodeId, elementImages: ['https://example.com/e1.jpg'] }),
      createGenerateNodeWithId({ id: generateNodeId }),
    ];
    const edges: Edge[] = [
      createEdgeWithHandles({ source: providerNodeId, target: generateNodeId, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      createEdgeWithHandles({ source: klingElementsNodeId, target: providerNodeId, targetHandle: HANDLE_IDS.KLING_ELEMENTS_INPUT }),
    ];

    const request = graphToStoryVideoCreate(nodes, edges, generateNodeId);
    expect(request.element_images).toEqual([{ image_url: 'https://example.com/e1.jpg' }]);
  });

  it('複数 GenerateNode で generateNodeId ごとに独立した element_images が解決される', () => {
    const provA = crypto.randomUUID();
    const provB = crypto.randomUUID();
    const elemA = crypto.randomUUID();
    const elemB = crypto.randomUUID();
    const genA = crypto.randomUUID();
    const genB = crypto.randomUUID();

    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNodeWithId({ englishPrompt: 'test' }),
      createProviderNodeWithId({ id: provA, provider: 'piapi_kling' }),
      createProviderNodeWithId({ id: provB, provider: 'piapi_kling' }),
      createKlingElementsNode({ id: elemA, elementImages: ['https://example.com/a1.jpg'] }),
      createKlingElementsNode({ id: elemB, elementImages: ['https://example.com/b1.jpg'] }),
      createGenerateNodeWithId({ id: genA }),
      createGenerateNodeWithId({ id: genB }),
    ];
    const edges: Edge[] = [
      createEdgeWithHandles({ source: provA, target: genA, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      createEdgeWithHandles({ source: elemA, target: provA, targetHandle: HANDLE_IDS.KLING_ELEMENTS_INPUT }),
      createEdgeWithHandles({ source: provB, target: genB, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      createEdgeWithHandles({ source: elemB, target: provB, targetHandle: HANDLE_IDS.KLING_ELEMENTS_INPUT }),
    ];

    const requestA = graphToStoryVideoCreate(nodes, edges, genA);
    const requestB = graphToStoryVideoCreate(nodes, edges, genB);

    expect(requestA.element_images).toEqual([{ image_url: 'https://example.com/a1.jpg' }]);
    expect(requestB.element_images).toEqual([{ image_url: 'https://example.com/b1.jpg' }]);
  });

  it('KlingElementsNode が未接続の場合、フォールバック発火 + console.warn + window.va が呼ばれる', () => {
    const providerNodeId = crypto.randomUUID();
    const generateNodeId = crypto.randomUUID();
    const elemId = crypto.randomUUID();

    // NODE_ENV を development に設定して console.warn が発火するようにする
    vi.stubEnv('NODE_ENV', 'development');

    // window.va をモック
    const vaSpy = vi.fn();
    Object.defineProperty(window, 'va', { value: vaSpy, writable: true, configurable: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const nodes: WorkflowNode[] = [
        createImageInputNodeWithId({ imageUrl: 'https://example.com/img.jpg' }),
        createPromptNodeWithId({ englishPrompt: 'test' }),
        createProviderNodeWithId({ id: providerNodeId, provider: 'piapi_kling' }),
        createKlingElementsNode({ id: elemId, elementImages: ['https://example.com/e1.jpg'] }),
        createGenerateNodeWithId({ id: generateNodeId }),
      ];
      // ProviderNode は GenerateNode に接続されているが、KlingElementsNode は ProviderNode に未接続
      const edges: Edge[] = [
        createEdgeWithHandles({ source: providerNodeId, target: generateNodeId, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      ];

      const request = graphToStoryVideoCreate(nodes, edges, generateNodeId);
      // フォールバックで element_images は設定される
      expect(request.element_images).toEqual([{ image_url: 'https://example.com/e1.jpg' }]);
      // 警告ログが出る (development 環境での providerNode 存在時)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('klingElements'));
      // Telemetry event が送信される (generate 経路なので is_storyboard_path: false)
      expect(vaSpy).toHaveBeenCalledWith('event', expect.objectContaining({
        name: 'kling_edge_scoping_fallback',
        data: expect.objectContaining({ is_storyboard_path: false }),
      }));
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('generateNodeId が undefined の場合、findNode フォールバックのみ実行 (警告なし)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNodeWithId({ englishPrompt: 'test' }),
      createProviderNodeWithId({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: ['https://example.com/e1.jpg'] }),
      createGenerateNodeWithId({}),
    ];

    // generateNodeId なしで呼び出し (storyboard / library 経路)
    const request = graphToStoryVideoCreate(nodes, [], undefined);
    expect(request.element_images).toEqual([{ image_url: 'https://example.com/e1.jpg' }]);
    // providerNode が undefined なので console.warn は呼ばれない
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('storyboard 経路フォールバック時、window.va に is_storyboard_path: true が送信される', () => {
    // window.va をモック
    const vaSpy = vi.fn();
    Object.defineProperty(window, 'va', { value: vaSpy, writable: true, configurable: true });

    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNodeWithId({ englishPrompt: 'test' }),
      createProviderNodeWithId({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: ['https://example.com/e1.jpg'] }),
      createGenerateNodeWithId({}),
    ];

    // generateNodeId なしで呼び出し (storyboard / library 経路: providerNode === undefined)
    graphToStoryVideoCreate(nodes, [], undefined);

    // is_storyboard_path: true で Telemetry が送信される
    expect(vaSpy).toHaveBeenCalledWith('event', expect.objectContaining({
      name: 'kling_edge_scoping_fallback',
      data: expect.objectContaining({ is_storyboard_path: true }),
    }));
  });
});

// ========== Duration mapping テスト (2026-05-18) ==========

describe('graphToStoryVideoCreate - duration mapping', () => {
  function createProviderNodeWithDuration(
    provider: ProviderNodeData['provider'],
    duration: number | null
  ): WorkflowNode {
    return {
      id: 'provider-1',
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        provider,
        aspectRatio: '9:16',
        duration,
      } satisfies ProviderNodeData,
    }
  }

  it('Seedance + duration=7 → seedance_duration=7', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('seedance', 7),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_duration).toBe(7)
  })

  it('Seedance + duration=4 (min) → seedance_duration=4', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('seedance', 4),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_duration).toBe(4)
  })

  it('Seedance + duration=15 (max) → seedance_duration=15', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('seedance', 15),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_duration).toBe(15)
  })

  it('Veo + duration=6 → veo_duration=6', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('veo', 6),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.veo_duration).toBe(6)
  })

  it('Veo + duration=4 (min preset) → veo_duration=4', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('veo', 4),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.veo_duration).toBe(4)
  })

  it('Veo + duration=8 (max preset) → veo_duration=8', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('veo', 8),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.veo_duration).toBe(8)
  })

  it('Kling + duration=10 → kling_duration=10 (変更なし確認)', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('piapi_kling', 10),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.kling_duration).toBe(10)
    expect(result.seedance_duration).toBeUndefined()
    expect(result.veo_duration).toBeUndefined()
  })

  it('Seedance + duration=20 (超過) → clamp して seedance_duration=15', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('seedance', 20),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_duration).toBe(15)
  })

  it('Veo + duration=7 (無効値) → 8 にフォールバック', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithDuration('veo', 7),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.veo_duration).toBe(8)
  })
})

// ========== Seedance モードマッピングテスト ==========

describe('graphToStoryVideoCreate - seedance_mode mapping', () => {
  function createProviderNodeWithSeedanceMode(
    seedanceMode: 'pro' | 'fast' | undefined
  ): WorkflowNode {
    return {
      id: 'provider-1',
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        provider: 'seedance',
        aspectRatio: '9:16',
        duration: 5,
        seedanceMode,
      } satisfies ProviderNodeData,
    }
  }

  // AC-4: fast 指定時に seedance_mode が含まれる
  it('AC-4: seedanceMode=fast の場合 request.seedance_mode が "fast" になる', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithSeedanceMode('fast'),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_mode).toBe('fast')
  })

  // pro 指定時
  it('seedanceMode=pro の場合 request.seedance_mode が "pro" になる', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithSeedanceMode('pro'),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_mode).toBe('pro')
  })

  // seedanceMode が undefined の場合は seedance_mode が含まれない
  it('seedanceMode が undefined の場合 request.seedance_mode が含まれない', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNodeWithSeedanceMode(undefined),
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_mode).toBeUndefined()
  })

  // AC-5: provider 切替時 seedanceMode は provider ノードに維持される (他 provider では無視)
  it('AC-5: provider=runway の場合 seedance_mode は request に含まれない', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      {
        id: 'provider-1',
        type: 'provider',
        position: { x: 200, y: 0 },
        data: {
          type: 'provider',
          isValid: true,
          provider: 'runway',
          aspectRatio: '9:16',
          duration: null,
          seedanceMode: 'fast',  // seedanceMode があっても runway では無視
        } satisfies ProviderNodeData,
      },
      createGenerateNode(),
    ]
    const result = graphToStoryVideoCreate(nodes, createBasicEdges())
    expect(result.seedance_mode).toBeUndefined()
  })
})

// ========== KlingElements image_url フォールバック ==========

describe('graphToStoryVideoCreate - KlingElements image_url fallback', () => {
  // X1: ImageInput なし + KlingElements (画像 2 枚) + Prompt + Generate + Provider(piapi_kling)
  it('X1: ImageInput なしで KlingElements に画像があれば throw せず、image_url に先頭画像が入る', () => {
    const providerNodeId = 'provider-x1';
    const generateNodeId = 'generate-x1';
    const klingElementsNodeId = 'klingElements-x1';

    const nodes: WorkflowNode[] = [
      createPromptNodeWithId({ englishPrompt: 'A cinematic shot' }),
      createProviderNodeWithId({ id: providerNodeId, provider: 'piapi_kling' }),
      createKlingElementsNode({
        id: klingElementsNodeId,
        elementImages: [
          'https://example.com/elem1.jpg',
          'https://example.com/elem2.jpg',
        ],
      }),
      createGenerateNodeWithId({ id: generateNodeId }),
    ];
    const edges: Edge[] = [
      createEdgeWithHandles({ source: providerNodeId, target: generateNodeId, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      createEdgeWithHandles({ source: klingElementsNodeId, target: providerNodeId, targetHandle: HANDLE_IDS.KLING_ELEMENTS_INPUT }),
    ];

    // throw しないこと
    const request = graphToStoryVideoCreate(nodes, edges, generateNodeId);

    // image_url に KlingElements の先頭画像が設定されること
    expect(request.image_url).toBe('https://example.com/elem1.jpg');
    // element_images に KlingElements の画像配列が設定されること
    expect(request.element_images).toEqual([
      { image_url: 'https://example.com/elem1.jpg' },
      { image_url: 'https://example.com/elem2.jpg' },
    ]);
  });

  // X2: ImageInput (imageUrl 空) + KlingElements (画像あり) → バリデーション errors なし
  it('X2: ImageInput が存在しても imageUrl が空で KlingElements に画像があれば validateGraph でエラーなし', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({ imageUrl: null }),
      createPromptNodeWithId({ englishPrompt: 'test prompt' }),
      createProviderNodeWithId({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: ['https://example.com/elem.jpg'] }),
      createGenerateNodeWithId({}),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'imageInput-1', target: 'generate-1' },
      { id: 'e2', source: 'prompt-1', target: 'generate-1' },
      { id: 'e3', source: 'provider-1', target: 'generate-1' },
      { id: 'e4', source: 'klingElements-1', target: 'generate-1' },
    ];

    const result = validateGraphForGeneration(nodes, edges);

    expect(result.errors).not.toContain('画像が選択されていません');
  });

  // X3: ImageInput なし + KlingElements (画像 0 枚) → throw '画像が選択されていません'
  it('X3: ImageInput なし + KlingElements 画像 0 枚 → throw 画像が選択されていません', () => {
    const nodes: WorkflowNode[] = [
      createPromptNodeWithId({ englishPrompt: 'test prompt' }),
      createProviderNodeWithId({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: [] }),
      createGenerateNodeWithId({}),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'prompt-1', target: 'generate-1' },
      { id: 'e2', source: 'provider-1', target: 'generate-1' },
      { id: 'e3', source: 'klingElements-1', target: 'generate-1' },
    ];

    expect(() => graphToStoryVideoCreate(nodes, edges)).toThrow('画像が選択されていません');
  });
});

// ========== Seedance 詳細パラメータ graph-to-api テスト (Design Doc §13.1 F-9~F-14) ==========

describe('graphToStoryVideoCreate - Seedance 詳細パラメータ', () => {
  function createSeedanceNodes(seedanceData?: Partial<ProviderNodeData>): WorkflowNode[] {
    return [
      createImageInputNode(),
      createPromptNode(),
      {
        id: 'provider-1',
        type: 'provider',
        position: { x: 200, y: 0 },
        data: {
          type: 'provider',
          isValid: true,
          provider: 'seedance',
          aspectRatio: '9:16',
          duration: 5,
          seedanceMode: 'pro',
          seedanceGenerateAudio: false,
          seedanceSeed: null,
          seedanceResolution: '720p',
          seedanceCameraFixed: false,
          ...seedanceData,
        } satisfies ProviderNodeData,
      },
      createGenerateNode(),
    ];
  }

  // F-9: seedanceGenerateAudio=true → request.seedance_generate_audio === true
  it('F-9: seedanceGenerateAudio=true → request.seedance_generate_audio === true', () => {
    const nodes = createSeedanceNodes({ seedanceGenerateAudio: true });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_generate_audio).toBe(true);
  });

  // F-10: seedanceGenerateAudio 未指定 (undefined) → request.seedance_generate_audio === false (常に送信)
  it('F-10: seedanceGenerateAudio 未指定 → request.seedance_generate_audio === false (常に送信)', () => {
    const nodes = createSeedanceNodes({ seedanceGenerateAudio: undefined });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_generate_audio).toBe(false);
  });

  // F-11: seedanceSeed=42 → request.seedance_seed === 42
  it('F-11: seedanceSeed=42 → request.seedance_seed === 42', () => {
    const nodes = createSeedanceNodes({ seedanceSeed: 42 });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_seed).toBe(42);
  });

  // seedanceSeed=null → request.seedance_seed は undefined (送信しない)
  it('seedanceSeed=null → request.seedance_seed は undefined (送信しない)', () => {
    const nodes = createSeedanceNodes({ seedanceSeed: null });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_seed).toBeUndefined();
  });

  // F-12: seedanceResolution='1080p' → request.seedance_resolution === '1080p'
  it('F-12: seedanceResolution=1080p → request.seedance_resolution === 1080p', () => {
    const nodes = createSeedanceNodes({ seedanceResolution: '1080p' });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_resolution).toBe('1080p');
  });

  // F-13: seedanceCameraFixed=true → request.seedance_camera_fixed === true
  it('F-13: seedanceCameraFixed=true → request.seedance_camera_fixed === true', () => {
    const nodes = createSeedanceNodes({ seedanceCameraFixed: true });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_camera_fixed).toBe(true);
  });

  // F-14: provider != seedance → seedance_* fields 含まれない
  it('F-14: provider=runway の場合 seedance_* fields は含まれない', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNode('runway'),
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_generate_audio).toBeUndefined();
    expect(result.seedance_seed).toBeUndefined();
    expect(result.seedance_resolution).toBeUndefined();
    expect(result.seedance_camera_fixed).toBeUndefined();
  });

  // seedanceCameraFixed=undefined の場合、フィールドを payload に含めない (m-4 対応)
  it('seedanceCameraFixed 未指定 → request.seedance_camera_fixed は undefined (payload に含まれない)', () => {
    const nodes = createSeedanceNodes({ seedanceCameraFixed: undefined });
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());
    expect(result.seedance_camera_fixed).toBeUndefined();
  });
});

// ========== Seedance Omni Reference graph-to-api テスト (v3 §15.2 F-7~F-11, F-16) ==========

describe('graphToStoryVideoCreate - Seedance Omni Reference', () => {
  const PROVIDER_ID = 'provider-seedance-omni';
  const GENERATE_ID = 'generate-omni';
  const OMNI_ID = 'omni-1';

  function createSeedanceProviderNode(): WorkflowNode {
    return {
      id: PROVIDER_ID,
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        provider: 'seedance',
        aspectRatio: '9:16',
        duration: 5,
      } satisfies ProviderNodeData,
    };
  }

  function createOmniReferenceNode(opts: {
    imageAssetIds?: (string | null)[];
    videoAssetIds?: (string | null)[];
    audioAssetIds?: (string | null)[];
    consentAccepted?: boolean;
  }): WorkflowNode {
    const toImageSlots = (ids: (string | null)[]): OmniReferenceSlot[] =>
      ids.map((assetId) => ({ assetId, mediaType: 'image' }));
    const padTo3 = (ids: (string | null)[]): (string | null)[] => {
      const padded: (string | null)[] = [...ids];
      while (padded.length < 3) padded.push(null);
      return padded.slice(0, 3);
    };
    const toVideoSlots = (ids: (string | null)[]) => {
      const p = padTo3(ids);
      return [
        { assetId: p[0], mediaType: 'video' as const },
        { assetId: p[1], mediaType: 'video' as const },
        { assetId: p[2], mediaType: 'video' as const },
      ] as [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
    };
    const toAudioSlots = (ids: (string | null)[]) => {
      const p = padTo3(ids);
      return [
        { assetId: p[0], mediaType: 'audio' as const },
        { assetId: p[1], mediaType: 'audio' as const },
        { assetId: p[2], mediaType: 'audio' as const },
      ] as [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
    };

    const imageIds = opts.imageAssetIds ?? Array<string | null>(8).fill(null);
    const videoIds = opts.videoAssetIds ?? [null, null, null];
    const audioIds = opts.audioAssetIds ?? [null, null, null];

    return {
      id: OMNI_ID,
      type: 'omniReference',
      position: { x: 0, y: 300 },
      data: {
        type: 'omniReference',
        isValid: true,
        imageSlots: toImageSlots(imageIds),
        videoSlots: toVideoSlots(videoIds),
        audioSlots: toAudioSlots(audioIds),
        consentAccepted: opts.consentAccepted ?? true,
      } satisfies OmniReferenceNodeData,
    };
  }

  function createCoreEdges(): Edge[] {
    return [
      createEdgeWithHandles({
        source: PROVIDER_ID,
        target: GENERATE_ID,
        targetHandle: HANDLE_IDS.CONFIG_INPUT,
      }),
    ];
  }

  function createOmniEdge(): Edge {
    return createEdgeWithHandles({
      source: OMNI_ID,
      target: PROVIDER_ID,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
    });
  }

  it('F-7: OmniReferenceNode 接続 + video slot 2 個 → request.video_reference_asset_ids に 2 件設定', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      createSeedanceProviderNode(),
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({
        videoAssetIds: ['uuid-video-1', 'uuid-video-2', null],
      }),
    ];
    const edges: Edge[] = [...createCoreEdges(), createOmniEdge()];

    const result = graphToStoryVideoCreate(nodes, edges, GENERATE_ID);

    expect(result.video_reference_asset_ids).toEqual(['uuid-video-1', 'uuid-video-2']);
    expect(result.image_reference_asset_ids).toBeUndefined();
    expect(result.audio_reference_asset_ids).toBeUndefined();
  });

  it('F-8: 全 slot 空 → request に *_reference_asset_ids 含まれない', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      createSeedanceProviderNode(),
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({}),
    ];
    const edges: Edge[] = [...createCoreEdges(), createOmniEdge()];

    const result = graphToStoryVideoCreate(nodes, edges, GENERATE_ID);

    expect(result.image_reference_asset_ids).toBeUndefined();
    expect(result.video_reference_asset_ids).toBeUndefined();
    expect(result.audio_reference_asset_ids).toBeUndefined();
  });

  it('F-9: OmniReferenceNode が ProviderNode に未接続 → request に含まれない', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      createSeedanceProviderNode(),
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({
        imageAssetIds: ['uuid-img-1', null, null, null, null, null, null, null],
        videoAssetIds: ['uuid-video-1', null, null],
        audioAssetIds: ['uuid-audio-1', null, null],
      }),
    ];
    const edges: Edge[] = createCoreEdges();

    const result = graphToStoryVideoCreate(nodes, edges, GENERATE_ID);

    expect(result.image_reference_asset_ids).toBeUndefined();
    expect(result.video_reference_asset_ids).toBeUndefined();
    expect(result.audio_reference_asset_ids).toBeUndefined();
  });

  it('F-10: provider=runway + OmniReferenceNode 接続あり → request に含まれない', () => {
    const runwayProvider: WorkflowNode = {
      id: PROVIDER_ID,
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        provider: 'runway',
        aspectRatio: '9:16',
        duration: null,
      } satisfies ProviderNodeData,
    };
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      runwayProvider,
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({
        videoAssetIds: ['uuid-video-1', null, null],
      }),
    ];
    const edges: Edge[] = [...createCoreEdges(), createOmniEdge()];

    const result = graphToStoryVideoCreate(nodes, edges, GENERATE_ID);

    expect(result.video_provider).toBe('runway');
    expect(result.image_reference_asset_ids).toBeUndefined();
    expect(result.video_reference_asset_ids).toBeUndefined();
    expect(result.audio_reference_asset_ids).toBeUndefined();
  });

  it('F-11: audio slot のみ埋まる → request.audio_reference_asset_ids 含まれる', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      createSeedanceProviderNode(),
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({
        audioAssetIds: ['uuid-audio-1', 'uuid-audio-2', null],
      }),
    ];
    const edges: Edge[] = [...createCoreEdges(), createOmniEdge()];

    const result = graphToStoryVideoCreate(nodes, edges, GENERATE_ID);

    expect(result.audio_reference_asset_ids).toEqual(['uuid-audio-1', 'uuid-audio-2']);
    expect(result.image_reference_asset_ids).toBeUndefined();
    expect(result.video_reference_asset_ids).toBeUndefined();
    expect(result.image_url).toBe('https://example.com/image.jpg');
  });

  it('F-16: consentAccepted=false で OmniReferenceNode 接続済 → throw 著作権同意が必要です', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      createSeedanceProviderNode(),
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({
        imageAssetIds: ['uuid-img-1', null, null, null, null, null, null, null],
        consentAccepted: false,
      }),
    ];
    const edges: Edge[] = [...createCoreEdges(), createOmniEdge()];

    expect(() => graphToStoryVideoCreate(nodes, edges, GENERATE_ID)).toThrow(
      '著作権同意が必要です'
    );
  });

  it('image/video/audio 全 slot 埋まる → 3 種すべて request に設定される', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNodeWithId({}),
      createPromptNodeWithId({}),
      createSeedanceProviderNode(),
      createGenerateNodeWithId({ id: GENERATE_ID }),
      createOmniReferenceNode({
        imageAssetIds: ['img-1', 'img-2', null, null, null, null, null, null],
        videoAssetIds: ['vid-1', null, null],
        audioAssetIds: ['aud-1', 'aud-2', 'aud-3'],
      }),
    ];
    const edges: Edge[] = [...createCoreEdges(), createOmniEdge()];

    const result = graphToStoryVideoCreate(nodes, edges, GENERATE_ID);

    expect(result.image_reference_asset_ids).toEqual(['img-1', 'img-2']);
    expect(result.video_reference_asset_ids).toEqual(['vid-1']);
    expect(result.audio_reference_asset_ids).toEqual(['aud-1', 'aud-2', 'aud-3']);
  });
});

// ========== おまかせ (providerMode='auto') 透過テスト ==========
// task_009: auto のとき video_provider を送らず selection_priority を送る。
// explicit (未指定含む) のときは従来通り video_provider を送り selection_priority は送らない。

describe('graphToStoryVideoCreate - おまかせ (auto) 透過', () => {
  function createAutoProviderNode(
    selectionPriority: 'quality' | 'speed' | 'cost' = 'quality'
  ): WorkflowNode {
    return {
      id: 'provider-1',
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        providerMode: 'auto',
        selectionPriority,
        // auto でも UI 上は具体プロバイダー値を保持しているが、透過時は無視される
        provider: 'runway',
        aspectRatio: '9:16',
        duration: null,
      } satisfies ProviderNodeData,
    };
  }

  it('providerMode=auto のとき video_provider を送らず selection_priority=quality を送る', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createAutoProviderNode('quality'),
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());

    expect('video_provider' in result).toBe(false);
    expect(result.selection_priority).toBe('quality');
  });

  it('providerMode=auto + selectionPriority=speed を送る', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createAutoProviderNode('speed'),
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());

    expect('video_provider' in result).toBe(false);
    expect(result.selection_priority).toBe('speed');
  });

  it('providerMode=auto + selectionPriority=cost を送る', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createAutoProviderNode('cost'),
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());

    expect('video_provider' in result).toBe(false);
    expect(result.selection_priority).toBe('cost');
  });

  it('providerMode=auto で selectionPriority 未指定なら quality をデフォルトで送る', () => {
    const providerNode: WorkflowNode = {
      id: 'provider-1',
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        providerMode: 'auto',
        provider: 'runway',
        aspectRatio: '9:16',
        duration: null,
      } satisfies ProviderNodeData,
    };
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      providerNode,
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());

    expect('video_provider' in result).toBe(false);
    expect(result.selection_priority).toBe('quality');
  });

  it('providerMode=explicit のとき従来通り video_provider を送り selection_priority は送らない', () => {
    const providerNode: WorkflowNode = {
      id: 'provider-1',
      type: 'provider',
      position: { x: 200, y: 0 },
      data: {
        type: 'provider',
        isValid: true,
        providerMode: 'explicit',
        provider: 'piapi_kling',
        aspectRatio: '9:16',
        duration: null,
      } satisfies ProviderNodeData,
    };
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      providerNode,
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());

    expect(result.video_provider).toBe('piapi_kling');
    expect('selection_priority' in result).toBe(false);
  });

  it('providerMode 未指定 (旧グラフ) は explicit 扱いで video_provider を送る', () => {
    const nodes: WorkflowNode[] = [
      createImageInputNode(),
      createPromptNode(),
      createProviderNode('runway'),
      createGenerateNode(),
    ];
    const result = graphToStoryVideoCreate(nodes, createBasicEdges());

    expect(result.video_provider).toBe('runway');
    expect('selection_priority' in result).toBe(false);
  });
})
