import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TTSPanel } from './tts-panel'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

vi.mock('@/lib/api/client', () => ({
  ttsApi: {
    generate: vi.fn(),
    listVoices: vi.fn(),
    getStatus: vi.fn(),
  },
}))

// Import after mocks are set up
import { ttsApi } from '@/lib/api/client'

describe('TTSPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ttsApi.listVoices).mockResolvedValue([
      { voice_id: 'v1', name: 'Hikari', language: 'ja' },
      { voice_id: 'v2', name: 'Emma', language: 'en' },
    ])
  })

  it('renders a text input area for narration text', async () => {
    render(<TTSPanel />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })
  })

  it('renders a generate button', async () => {
    render(<TTSPanel />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /生成/i })).toBeDefined()
    })
  })

  it('disables the generate button when text is empty', async () => {
    render(<TTSPanel />)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /生成/i })
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('renders a speed control', async () => {
    render(<TTSPanel />)

    await waitFor(() => {
      expect(screen.getByRole('slider')).toBeDefined()
    })
  })

  it('renders a language selector', async () => {
    render(<TTSPanel />)

    await waitFor(() => {
      const jaOption = screen.getByRole('button', { name: /日本語/i })
      const enOption = screen.getByRole('button', { name: /英語/i })
      expect(jaOption).toBeDefined()
      expect(enOption).toBeDefined()
    })
  })

  it('calls onAudioGenerated when generation completes successfully', async () => {
    const onAudioGenerated = vi.fn()

    vi.mocked(ttsApi.generate).mockResolvedValueOnce({
      id: 'tts-123',
      status: 'completed',
      audio_url: 'https://example.com/audio.mp3',
      duration_seconds: 3.5,
      created_at: '2026-03-15T00:00:00Z',
    })

    render(<TTSPanel onAudioGenerated={onAudioGenerated} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello world' } })

    const generateButton = screen.getByRole('button', { name: /生成/i })
    fireEvent.click(generateButton)

    await waitFor(() => {
      expect(onAudioGenerated).toHaveBeenCalledWith(
        'https://example.com/audio.mp3',
        3.5
      )
    })
  })

  it('shows loading state during generation', async () => {
    let resolveGenerate!: (value: unknown) => void
    const generatePromise = new Promise((resolve) => {
      resolveGenerate = resolve
    })
    vi.mocked(ttsApi.generate).mockReturnValueOnce(generatePromise as ReturnType<typeof ttsApi.generate>)

    render(<TTSPanel />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: /生成/i }))

    await waitFor(() => {
      expect(screen.getByText(/生成中/i)).toBeDefined()
    })

    resolveGenerate({
      id: 'tts-123',
      status: 'completed',
      audio_url: 'https://example.com/audio.mp3',
      duration_seconds: 3.5,
      created_at: '2026-03-15T00:00:00Z',
    })
  })

  it('shows error message on generation failure', async () => {
    vi.mocked(ttsApi.generate).mockRejectedValueOnce(new Error('TTS generation failed'))

    render(<TTSPanel />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: /生成/i }))

    await waitFor(() => {
      expect(screen.getByText(/TTS generation failed/i)).toBeDefined()
    })
  })
})
