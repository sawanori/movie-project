import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VideoUploader } from './video-uploader'

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
    uploadVideo: vi.fn(),
  },
}))

import { lipSyncApi } from '@/lib/api/client'

describe('VideoUploader', () => {
  const mockOnVideoUploaded = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload area', () => {
    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} />)
    expect(screen.getByText(/動画ファイルをドラッグ&ドロップ \/ クリックして選択/i)).toBeDefined()
  })

  it('rejects files over max size', async () => {
    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} maxSizeMB={1} />)

    const input = screen.getByTestId('video-file-input')
    const largeFile = new File(['x'], 'large.mp4', { type: 'video/mp4' })
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 })

    fireEvent.change(input, { target: { files: [largeFile] } })

    await waitFor(() => {
      expect(screen.getByText(/ファイルサイズが大きすぎます/i)).toBeDefined()
    })
    expect(mockOnVideoUploaded).not.toHaveBeenCalled()
  })

  it('shows upload progress during upload', async () => {
    let resolveUpload!: (value: { video_url: string; duration: number }) => void
    vi.mocked(lipSyncApi.uploadVideo).mockImplementation(
      () => new Promise<{ video_url: string; duration: number }>((resolve) => { resolveUpload = resolve })
    )

    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} />)

    const input = screen.getByTestId('video-file-input')
    const file = new File(['video data'], 'test.mp4', { type: 'video/mp4' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/アップロード中/i)).toBeDefined()
    })

    resolveUpload({ video_url: 'https://example.com/video.mp4', duration: 5.0 })
  })

  it('calls onVideoUploaded with video url and duration after successful upload', async () => {
    vi.mocked(lipSyncApi.uploadVideo).mockResolvedValue({
      video_url: 'https://example.com/video.mp4',
      duration: 5.0,
    })

    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} />)

    const input = screen.getByTestId('video-file-input')
    const file = new File(['video data'], 'test.mp4', { type: 'video/mp4' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockOnVideoUploaded).toHaveBeenCalledWith(
        'https://example.com/video.mp4',
        5.0
      )
    })
  })

  it('shows error message on upload failure', async () => {
    vi.mocked(lipSyncApi.uploadVideo).mockRejectedValue(new Error('アップロードに失敗しました'))

    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} />)

    const input = screen.getByTestId('video-file-input')
    const file = new File(['video data'], 'test.mp4', { type: 'video/mp4' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/アップロードに失敗しました/i)).toBeDefined()
    })
    expect(mockOnVideoUploaded).not.toHaveBeenCalled()
  })

  it('rejects files with a non-video type and does not upload', async () => {
    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} />)

    const input = screen.getByTestId('video-file-input')
    const imageFile = new File(['image data'], 'wrong.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [imageFile] } })

    await waitFor(() => {
      expect(screen.getByText(/動画ファイル（MP4 \/ WebM \/ MOV）を選択してください/i)).toBeDefined()
    })
    expect(lipSyncApi.uploadVideo).not.toHaveBeenCalled()
    expect(mockOnVideoUploaded).not.toHaveBeenCalled()
  })

  it('uploads a dropped file and calls onVideoUploaded', async () => {
    vi.mocked(lipSyncApi.uploadVideo).mockResolvedValue({
      video_url: 'https://example.com/dropped.mp4',
      duration: 7.0,
    })

    render(<VideoUploader onVideoUploaded={mockOnVideoUploaded} />)

    const dropZone = screen.getByRole('button')
    const file = new File(['video data'], 'dropped.mp4', { type: 'video/mp4' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(mockOnVideoUploaded).toHaveBeenCalledWith(
        'https://example.com/dropped.mp4',
        7.0
      )
    })
  })
})
