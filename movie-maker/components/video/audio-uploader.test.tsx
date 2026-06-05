import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AudioUploader } from './audio-uploader'

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
    uploadAudio: vi.fn(),
  },
}))

import { lipSyncApi } from '@/lib/api/client'

describe('AudioUploader', () => {
  const mockOnAudioUploaded = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload area', () => {
    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} />)
    expect(screen.getByText(/音声ファイルをドラッグ&ドロップ \/ クリックして選択/i)).toBeDefined()
  })

  it('shows accepted file types', () => {
    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} accept="audio/*" />)
    expect(screen.getByText(/audio/i)).toBeDefined()
  })

  it('rejects files over max size', async () => {
    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} maxSizeMB={1} />)

    const input = screen.getByTestId('audio-file-input')
    const largeFile = new File(['x'.repeat(2 * 1024 * 1024)], 'large.mp3', { type: 'audio/mp3' })
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 })

    fireEvent.change(input, { target: { files: [largeFile] } })

    await waitFor(() => {
      expect(screen.getByText(/ファイルサイズが大きすぎます/i)).toBeDefined()
    })
    expect(mockOnAudioUploaded).not.toHaveBeenCalled()
  })

  it('shows upload progress during upload', async () => {
    let resolveUpload!: (value: { audio_url: string }) => void
    vi.mocked(lipSyncApi.uploadAudio).mockImplementation(
      () => new Promise<{ audio_url: string }>((resolve) => { resolveUpload = resolve })
    )

    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} />)

    const input = screen.getByTestId('audio-file-input')
    const file = new File(['audio data'], 'test.mp3', { type: 'audio/mp3' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/アップロード中/i)).toBeDefined()
    })

    resolveUpload({ audio_url: 'https://example.com/audio.mp3' })
  })

  it('calls onAudioUploaded with audio url after successful upload', async () => {
    vi.mocked(lipSyncApi.uploadAudio).mockResolvedValue({
      audio_url: 'https://example.com/audio.mp3',
      duration_seconds: 5.0,
    })

    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} />)

    const input = screen.getByTestId('audio-file-input')
    const file = new File(['audio data'], 'test.mp3', { type: 'audio/mp3' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockOnAudioUploaded).toHaveBeenCalledWith(
        'https://example.com/audio.mp3',
        5.0
      )
    })
  })

  it('shows error message on upload failure', async () => {
    vi.mocked(lipSyncApi.uploadAudio).mockRejectedValue(new Error('アップロードに失敗しました'))

    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} />)

    const input = screen.getByTestId('audio-file-input')
    const file = new File(['audio data'], 'test.mp3', { type: 'audio/mp3' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/アップロードに失敗しました/i)).toBeDefined()
    })
    expect(mockOnAudioUploaded).not.toHaveBeenCalled()
  })

  it('rejects files with a non-audio type and does not upload', async () => {
    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} />)

    const input = screen.getByTestId('audio-file-input')
    const imageFile = new File(['image data'], 'wrong.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [imageFile] } })

    await waitFor(() => {
      expect(screen.getByText(/音声ファイルを選択してください/i)).toBeDefined()
    })
    expect(lipSyncApi.uploadAudio).not.toHaveBeenCalled()
    expect(mockOnAudioUploaded).not.toHaveBeenCalled()
  })

  it('uploads a dropped file and calls onAudioUploaded', async () => {
    vi.mocked(lipSyncApi.uploadAudio).mockResolvedValue({
      audio_url: 'https://example.com/dropped.mp3',
      duration_seconds: 8.0,
    })

    render(<AudioUploader onAudioUploaded={mockOnAudioUploaded} />)

    const dropZone = screen.getByRole('button')
    const file = new File(['audio data'], 'dropped.mp3', { type: 'audio/mp3' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(mockOnAudioUploaded).toHaveBeenCalledWith(
        'https://example.com/dropped.mp3',
        8.0
      )
    })
  })
})
