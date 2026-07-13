import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

// ===== t2vApi Tests =====

describe('t2vApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)
  })

  describe('create', () => {
    it('should call POST /api/v1/videos/text-to-video with correct data', async () => {
      const { t2vApi } = await import('@/lib/api/client')

      const mockResponse = {
        id: 'test-id-123',
        status: 'pending',
        progress: 0,
        created_at: '2026-03-15T00:00:00Z',
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response)

      const requestData = {
        prompt: 'A beautiful sunset over the ocean',
        duration: 5,
        aspect_ratio: '9:16',
        video_provider: 'runway',
      }

      const result = await t2vApi.create(requestData)

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/videos/text-to-video',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getStatus', () => {
    it('should call GET /api/v1/videos/text-to-video/:id/status', async () => {
      const { t2vApi } = await import('@/lib/api/client')

      const mockStatusResponse = {
        id: 'test-id-123',
        status: 'completed',
        progress: 100,
        video_url: 'https://example.com/video.mp4',
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(mockStatusResponse),
      } as unknown as Response)

      const result = await t2vApi.getStatus('test-id-123')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/videos/text-to-video/test-id-123/status',
        expect.objectContaining({})
      )
      expect(result).toEqual(mockStatusResponse)
    })
  })
})

// ===== lipSyncApi Tests =====

describe('lipSyncApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)
  })

  it('calls POST /api/v1/lip-sync when creating a lip sync job', async () => {
    const { lipSyncApi } = await import('@/lib/api/client')

    const mockResponse = {
      id: 'lipsync-123',
      status: 'pending',
      progress: 0,
      created_at: '2026-03-15T00:00:00Z',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response)

    const requestData = {
      source_type: 'image' as const,
      source_url: 'https://example.com/image.jpg',
      audio_url: 'https://example.com/audio.mp3',
    }

    const result = await lipSyncApi.create(requestData)

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/lip-sync',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(requestData) })
    )
    expect(result.id).toBe('lipsync-123')
  })

  it('calls GET /api/v1/lip-sync/:id/status when getting status', async () => {
    const { lipSyncApi } = await import('@/lib/api/client')

    const mockStatusResponse = {
      id: 'lipsync-123',
      status: 'completed',
      progress: 100,
      output_video_url: 'https://example.com/output.mp4',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockStatusResponse),
    } as unknown as Response)

    const result = await lipSyncApi.getStatus('lipsync-123')

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/lip-sync/lipsync-123/status',
      expect.objectContaining({})
    )
    expect(result.status).toBe('completed')
  })

  it('calls GET /api/v1/lip-sync when listing history', async () => {
    const { lipSyncApi } = await import('@/lib/api/client')

    const mockList = [
      { id: 'lipsync-1', status: 'completed', progress: 100, created_at: '2026-03-15T00:00:00Z' },
      { id: 'lipsync-2', status: 'pending', progress: 0, created_at: '2026-03-15T01:00:00Z' },
    ]

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockList),
    } as unknown as Response)

    const result = await lipSyncApi.list()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/lip-sync',
      expect.objectContaining({})
    )
    expect(result).toHaveLength(2)
  })

  it('calls POST /api/v1/lip-sync/upload-audio with FormData', async () => {
    const { lipSyncApi } = await import('@/lib/api/client')

    const mockUploadResponse = {
      audio_url: 'https://example.com/audio.mp3',
      duration_seconds: 5.0,
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockUploadResponse),
    } as unknown as Response)

    const formData = new FormData()
    formData.append('file', new Blob(['audio data'], { type: 'audio/mp3' }), 'test.mp3')

    const result = await lipSyncApi.uploadAudio(formData)

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/lip-sync/upload-audio',
      expect.objectContaining({ method: 'POST', body: formData })
    )
    expect(result.audio_url).toBe('https://example.com/audio.mp3')
  })

  it('does not set Content-Type header when uploading audio with FormData', async () => {
    const { lipSyncApi } = await import('@/lib/api/client')

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({ audio_url: 'https://example.com/audio.mp3' }),
    } as unknown as Response)

    const formData = new FormData()
    await lipSyncApi.uploadAudio(formData)

    const callArgs = vi.mocked(global.fetch).mock.calls[0]
    const requestInit = callArgs[1] as RequestInit
    const headers = requestInit.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })
})

// ===== ttsApi Tests =====

describe('ttsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)
  })

  it('calls POST /api/v1/tts when generating TTS', async () => {
    const { ttsApi } = await import('@/lib/api/client')

    const mockResponse = {
      id: 'tts-123',
      status: 'pending',
      created_at: '2026-03-15T00:00:00Z',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response)

    const result = await ttsApi.generate({ text: 'Hello world', voice_id: 'voice-1' })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tts',
      expect.objectContaining({ method: 'POST' })
    )
    expect(result.id).toBe('tts-123')
  })

  it('calls GET /api/v1/tts/:id/status when getting status', async () => {
    const { ttsApi } = await import('@/lib/api/client')

    const mockStatusResponse = {
      id: 'tts-123',
      status: 'completed',
      audio_url: 'https://example.com/audio.mp3',
      duration_seconds: 3.5,
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockStatusResponse),
    } as unknown as Response)

    const result = await ttsApi.getStatus('tts-123')

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tts/tts-123/status',
      expect.objectContaining({})
    )
    expect(result.status).toBe('completed')
  })

  it('calls GET /api/v1/tts/voices without lang param when no language filter', async () => {
    const { ttsApi } = await import('@/lib/api/client')

    const mockVoices = [
      { voice_id: 'v1', name: 'Voice 1', language: 'ja' },
      { voice_id: 'v2', name: 'Voice 2', language: 'en' },
    ]

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockVoices),
    } as unknown as Response)

    const result = await ttsApi.listVoices()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tts/voices',
      expect.objectContaining({})
    )
    expect(result).toHaveLength(2)
  })

  it('calls GET /api/v1/tts/voices?lang=ja when language filter is provided', async () => {
    const { ttsApi } = await import('@/lib/api/client')

    const mockVoices = [
      { voice_id: 'v1', name: 'Voice 1', language: 'ja' },
    ]

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockVoices),
    } as unknown as Response)

    const result = await ttsApi.listVoices('ja')

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tts/voices?lang=ja',
      expect.objectContaining({})
    )
    expect(result).toHaveLength(1)
  })
})

// ===== gatewayApi Tests =====

describe('gatewayApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)
  })

  it('should call GET /api/v1/config/models when listing models without capability', async () => {
    const { gatewayApi } = await import('@/lib/api/client')

    const mockModels = [
      {
        name: 'runway-gen3',
        provider: 'runway',
        capabilities: ['text-to-video'],
        quality_score: 90,
        speed_score: 60,
        cost_per_second: 70,
        max_duration: 10,
        supported_aspect_ratios: ['16:9', '9:16'],
      },
    ]

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockModels),
    } as unknown as Response)

    const result = await gatewayApi.listModels()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/config/models',
      expect.objectContaining({})
    )
    expect(result).toEqual(mockModels)
  })

  it('should call GET /api/v1/config/capabilities when getting capabilities', async () => {
    const { gatewayApi } = await import('@/lib/api/client')

    const mockCapabilities = {
      'text-to-video': [
        { name: 'runway-gen3', provider: 'runway' },
        { name: 'kling-ai', provider: 'piapi_kling' },
      ],
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockCapabilities),
    } as unknown as Response)

    const result = await gatewayApi.getCapabilities()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/config/capabilities',
      expect.objectContaining({})
    )
    expect(result).toEqual(mockCapabilities)
  })

  it('should call GET /api/v1/config/recommended with priority and capability query params', async () => {
    const { gatewayApi } = await import('@/lib/api/client')

    const mockRecommended = { name: 'runway-gen3', provider: 'runway' }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockRecommended),
    } as unknown as Response)

    const result = await gatewayApi.getRecommended('quality', 'text-to-video')

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/config/recommended?priority=quality&capability=text-to-video',
      expect.objectContaining({})
    )
    expect(result).toEqual(mockRecommended)
  })
})

// ===== workflowRunsApi Tests =====

describe('workflowRunsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)
  })

  it('should call POST /api/v1/workflows/{id}/execute with the request body', async () => {
    const { workflowRunsApi } = await import('@/lib/api/client')

    const mockResponse = {
      batch_id: 'batch-123',
      run_ids: ['run-1', 'run-2'],
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 202,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response)

    const requestBody = {
      input_image_urls: ['https://example.com/a.png', 'https://example.com/b.png'],
      video_provider: 'runway',
      selection_priority: 'quality' as const,
    }

    const result = await workflowRunsApi.execute('wf-abc', requestBody)

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/workflows/wf-abc/execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(requestBody),
      })
    )
    expect(result).toEqual(mockResponse)
  })

  it('should call GET /api/v1/workflows/runs with workflow_id, page and per_page query params', async () => {
    const { workflowRunsApi } = await import('@/lib/api/client')

    const mockResponse = {
      runs: [
        {
          id: 'run-1',
          workflow_id: 'wf-abc',
          batch_id: 'batch-123',
          status: 'processing',
          progress: 50,
          final_output_url: null,
          error_message: null,
          created_at: '2026-03-15T00:00:00Z',
        },
      ],
      total: 1,
      page: 2,
      per_page: 10,
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response)

    const result = await workflowRunsApi.listRuns({
      workflow_id: 'wf-abc',
      page: 2,
      per_page: 10,
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/workflows/runs?workflow_id=wf-abc&page=2&per_page=10',
      expect.objectContaining({})
    )
    expect(result).toEqual(mockResponse)
  })

  it('should call GET /api/v1/workflows/runs without query string when no params given', async () => {
    const { workflowRunsApi } = await import('@/lib/api/client')

    await workflowRunsApi.listRuns()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/workflows/runs',
      expect.objectContaining({})
    )
  })

  it('should call GET /api/v1/workflows/runs/{id} when getting a run detail', async () => {
    const { workflowRunsApi } = await import('@/lib/api/client')

    const mockResponse = {
      id: 'run-1',
      workflow_id: 'wf-abc',
      batch_id: 'batch-123',
      status: 'completed',
      progress: 100,
      final_output_url: 'https://example.com/out.mp4',
      error_message: null,
      created_at: '2026-03-15T00:00:00Z',
      steps: [
        {
          node_id: 'node-1',
          node_type: 'ProviderNode',
          status: 'completed',
          output_url: 'https://example.com/out.mp4',
          error_message: null,
          provider_used: 'runway',
        },
      ],
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response)

    const result = await workflowRunsApi.getRun('run-1')

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/workflows/runs/run-1',
      expect.objectContaining({})
    )
    expect(result).toEqual(mockResponse)
  })

  it('should call POST /api/v1/workflows/runs/{id}/cancel when canceling a run', async () => {
    const { workflowRunsApi } = await import('@/lib/api/client')

    const mockResponse = {
      id: 'run-1',
      workflow_id: 'wf-abc',
      batch_id: 'batch-123',
      status: 'canceled',
      progress: 40,
      final_output_url: null,
      error_message: null,
      created_at: '2026-03-15T00:00:00Z',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response)

    const result = await workflowRunsApi.cancelRun('run-1')

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/workflows/runs/run-1/cancel',
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual(mockResponse)
  })
})
