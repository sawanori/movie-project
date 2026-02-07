import { describe, it, expect } from 'vitest'
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
} from '@/lib/types/node-editor'

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
        '画像入力または動画入力ノードが必要です'
      )
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
