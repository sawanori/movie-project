import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImageUploader } from './image-uploader'

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
  videosApi: {
    uploadImage: vi.fn(),
  },
}))

import { videosApi } from '@/lib/api/client'

describe('ImageUploader', () => {
  const mockOnImageUploaded = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload area', () => {
    render(<ImageUploader onImageUploaded={mockOnImageUploaded} />)
    expect(screen.getByText(/画像ファイルをドラッグ&ドロップ \/ クリックして選択/i)).toBeDefined()
  })

  it('rejects files over max size', async () => {
    render(<ImageUploader onImageUploaded={mockOnImageUploaded} maxSizeMB={1} />)

    const input = screen.getByTestId('image-file-input')
    const largeFile = new File(['x'], 'large.png', { type: 'image/png' })
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 })

    fireEvent.change(input, { target: { files: [largeFile] } })

    await waitFor(() => {
      expect(screen.getByText(/ファイルサイズが大きすぎます/i)).toBeDefined()
    })
    expect(mockOnImageUploaded).not.toHaveBeenCalled()
  })

  it('shows upload progress during upload', async () => {
    let resolveUpload!: (value: { image_url: string }) => void
    vi.mocked(videosApi.uploadImage).mockImplementation(
      () => new Promise<{ image_url: string }>((resolve) => { resolveUpload = resolve })
    )

    render(<ImageUploader onImageUploaded={mockOnImageUploaded} />)

    const input = screen.getByTestId('image-file-input')
    const file = new File(['image data'], 'test.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/アップロード中/i)).toBeDefined()
    })

    resolveUpload({ image_url: 'https://example.com/image.png' })
  })

  it('calls onImageUploaded with image url after successful upload', async () => {
    vi.mocked(videosApi.uploadImage).mockResolvedValue({
      image_url: 'https://example.com/image.png',
    })

    render(<ImageUploader onImageUploaded={mockOnImageUploaded} />)

    const input = screen.getByTestId('image-file-input')
    const file = new File(['image data'], 'test.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockOnImageUploaded).toHaveBeenCalledWith('https://example.com/image.png')
    })
  })

  it('shows error message on upload failure', async () => {
    vi.mocked(videosApi.uploadImage).mockRejectedValue(new Error('アップロードに失敗しました'))

    render(<ImageUploader onImageUploaded={mockOnImageUploaded} />)

    const input = screen.getByTestId('image-file-input')
    const file = new File(['image data'], 'test.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/アップロードに失敗しました/i)).toBeDefined()
    })
    expect(mockOnImageUploaded).not.toHaveBeenCalled()
  })

  it('uploads a dropped file and calls onImageUploaded', async () => {
    vi.mocked(videosApi.uploadImage).mockResolvedValue({
      image_url: 'https://example.com/dropped.png',
    })

    render(<ImageUploader onImageUploaded={mockOnImageUploaded} />)

    const dropZone = screen.getByRole('button')
    const file = new File(['image data'], 'dropped.png', { type: 'image/png' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(mockOnImageUploaded).toHaveBeenCalledWith('https://example.com/dropped.png')
    })
  })
})
