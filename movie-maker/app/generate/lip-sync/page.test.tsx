import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LipSyncStudioPage from './page'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

vi.mock('@/lib/api/client', () => ({
  lipSyncApi: {
    create: vi.fn(),
    getStatus: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    uploadAudio: vi.fn(),
  },
  ttsApi: {
    generate: vi.fn(),
    getStatus: vi.fn(),
    listVoices: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/components/video/audio-uploader', () => ({
  AudioUploader: ({ onAudioUploaded }: { onAudioUploaded: (url: string) => void }) => (
    <div data-testid="audio-uploader">
      <button type="button" onClick={() => onAudioUploaded('https://example.com/audio.mp3')}>
        Upload Audio
      </button>
    </div>
  ),
}))

vi.mock('@/components/video/tts-panel', () => ({
  TTSPanel: ({ onAudioGenerated }: { onAudioGenerated?: (url: string, duration: number) => void }) => (
    <div data-testid="tts-panel">
      <button type="button" onClick={() => onAudioGenerated?.('https://example.com/tts.mp3', 3.0)}>
        Generate TTS
      </button>
    </div>
  ),
}))

import { lipSyncApi } from '@/lib/api/client'

describe('LipSyncStudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lipSyncApi.list).mockResolvedValue([])
  })

  it('renders page title "リップシンクスタジオ"', async () => {
    render(<LipSyncStudioPage />)
    await waitFor(() => {
      expect(screen.getByText('リップシンクスタジオ')).toBeDefined()
    })
  })

  it('renders source type selector with image and video options', async () => {
    render(<LipSyncStudioPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '画像' })).toBeDefined()
      expect(screen.getByRole('button', { name: '動画' })).toBeDefined()
    })
  })

  it('renders audio upload tab', async () => {
    render(<LipSyncStudioPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '音声をアップロード' })).toBeDefined()
    })
  })

  it('renders TTS tab', async () => {
    render(<LipSyncStudioPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'テキストから音声生成' })).toBeDefined()
    })
  })

  it('generate button is disabled when source and audio are missing', async () => {
    render(<LipSyncStudioPage />)
    await waitFor(() => {
      const generateButton = screen.getByRole('button', { name: /リップシンク生成/ })
      expect((generateButton as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('generate button is enabled when source URL and audio URL are provided', async () => {
    render(<LipSyncStudioPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'URLを入力' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'URLを入力' }))

    const sourceInput = screen.getByPlaceholderText(/動画URL/i)
    fireEvent.change(sourceInput, { target: { value: 'https://example.com/image.jpg' } })

    const uploadAudioButton = screen.getByText('Upload Audio')
    fireEvent.click(uploadAudioButton)

    await waitFor(() => {
      const generateButton = screen.getByRole('button', { name: /リップシンク生成/ })
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('shows progress bar during generation', async () => {
    vi.mocked(lipSyncApi.create).mockResolvedValue({
      id: 'lipsync-123',
      status: 'processing',
      progress: 0,
      created_at: '2026-03-15T00:00:00Z',
    })
    vi.mocked(lipSyncApi.getStatus).mockResolvedValue({
      id: 'lipsync-123',
      status: 'processing',
      progress: 50,
    })

    render(<LipSyncStudioPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'URLを入力' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'URLを入力' }))

    const sourceInput = screen.getByPlaceholderText(/動画URL/i)
    fireEvent.change(sourceInput, { target: { value: 'https://example.com/image.jpg' } })

    const uploadAudioButton = screen.getByText('Upload Audio')
    fireEvent.click(uploadAudioButton)

    await waitFor(() => {
      const generateButton = screen.getByRole('button', { name: /リップシンク生成/ })
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
    })

    const generateButton = screen.getByRole('button', { name: /リップシンク生成/ })
    fireEvent.click(generateButton)

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeDefined()
    })
  })

  it('shows result video when generation is completed', async () => {
    vi.mocked(lipSyncApi.create).mockResolvedValue({
      id: 'lipsync-123',
      status: 'completed',
      progress: 100,
      output_video_url: 'https://example.com/output.mp4',
      created_at: '2026-03-15T00:00:00Z',
    })
    vi.mocked(lipSyncApi.getStatus).mockResolvedValue({
      id: 'lipsync-123',
      status: 'completed',
      progress: 100,
      output_video_url: 'https://example.com/output.mp4',
    })

    render(<LipSyncStudioPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'URLを入力' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'URLを入力' }))

    const sourceInput = screen.getByPlaceholderText(/動画URL/i)
    fireEvent.change(sourceInput, { target: { value: 'https://example.com/image.jpg' } })

    const uploadAudioButton = screen.getByText('Upload Audio')
    fireEvent.click(uploadAudioButton)

    await waitFor(() => {
      const generateButton = screen.getByRole('button', { name: /リップシンク生成/ })
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
    })

    const generateButton = screen.getByRole('button', { name: /リップシンク生成/ })
    fireEvent.click(generateButton)

    await waitFor(() => {
      const video = screen.getByTestId('result-video')
      expect(video).toBeDefined()
      expect((video as HTMLVideoElement).src).toContain('output.mp4')
    })
  })
})
