import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import BackgroundRemovalPage from './page'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}))

vi.mock('@/components/layout/header', () => ({
  Header: () => <header data-testid="header" />,
}))

vi.mock('@/lib/api/client', () => ({
  backgroundRemovalApi: {
    create: vi.fn(),
    getStatus: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 20 }),
  },
  lipSyncApi: {
    uploadVideo: vi.fn(),
  },
  videosApi: {
    uploadImage: vi.fn(),
  },
}))

// jsdom は <video> の loadedmetadata を発火しないため、尺取得ヘルパーをモックする
vi.mock('./get-video-duration', () => ({
  getVideoDuration: vi.fn(),
}))

import { backgroundRemovalApi, lipSyncApi, videosApi } from '@/lib/api/client'
import { getVideoDuration } from './get-video-duration'

function dropFile(file: File) {
  const input = screen.getByTestId('bg-removal-file-input')
  fireEvent.change(input, { target: { files: [file] } })
}

describe('BackgroundRemovalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload UI', () => {
    render(<BackgroundRemovalPage />)

    expect(screen.getByRole('heading', { name: /背景削除/ })).toBeDefined()
    expect(screen.getByText('動画または画像をドラッグ&ドロップ')).toBeDefined()
    expect(
      screen.getByText(/動画: MP4 \/ MOV \/ WebM（ProRes・10bit素材対応）最大500MB・60秒以内/)
    ).toBeDefined()
    expect(screen.getByText(/画像: PNG \/ JPEG \/ WebP（最大20MB）/)).toBeDefined()
    expect(
      (screen.getByRole('button', { name: '背景を削除' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('shows Japanese error for unsupported file type', async () => {
    render(<BackgroundRemovalPage />)

    dropFile(new File(['x'], 'document.pdf', { type: 'application/pdf' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          '対応していないファイル形式です。動画（MP4/MOV/WebM）または画像（PNG/JPEG/WebP）をアップロードしてください。'
        )
      ).toBeDefined()
    })
    expect(videosApi.uploadImage).not.toHaveBeenCalled()
    expect(lipSyncApi.uploadVideo).not.toHaveBeenCalled()
  })

  it('shows Japanese error for oversized image (>20MB)', async () => {
    render(<BackgroundRemovalPage />)

    const bigImage = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(bigImage, 'size', { value: 21 * 1024 * 1024 })
    dropFile(bigImage)

    await waitFor(() => {
      expect(
        screen.getByText('画像ファイルが大きすぎます。最大20MBまでアップロード可能です。')
      ).toBeDefined()
    })
  })

  it('shows Japanese error for oversized video (>500MB)', async () => {
    render(<BackgroundRemovalPage />)

    const bigVideo = new File(['x'], 'big.mp4', { type: 'video/mp4' })
    Object.defineProperty(bigVideo, 'size', { value: 501 * 1024 * 1024 })
    dropFile(bigVideo)

    await waitFor(() => {
      expect(
        screen.getByText('動画ファイルが大きすぎます。最大500MBまでアップロード可能です。')
      ).toBeDefined()
    })
  })

  it('create → polling → completed renders preview and download button', async () => {
    vi.mocked(videosApi.uploadImage).mockResolvedValue({
      image_url: 'https://example.com/source.png',
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-123',
      status: 'processing',
      progress: 0,
      source_type: 'image',
      output_format: 'png',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-123',
      status: 'completed',
      progress: 100,
      output_url: 'https://example.com/output.png',
    })

    render(<BackgroundRemovalPage />)

    dropFile(new File(['image data'], 'photo.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(screen.getByText('photo.png')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ダウンロード/ })).toBeDefined()
    })

    // 画像は output_format を指定しない（バックエンドが常に透過PNGを返す）
    expect(backgroundRemovalApi.create).toHaveBeenCalledWith({
      source_type: 'image',
      source_url: 'https://example.com/source.png',
    })

    const image = screen.getByTestId('result-image')
    expect((image as HTMLImageElement).src).toContain('output.png')
  })

  it('shows progress bar while polling is in progress', async () => {
    vi.mocked(videosApi.uploadImage).mockResolvedValue({
      image_url: 'https://example.com/source.png',
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-123',
      status: 'processing',
      progress: 0,
      source_type: 'image',
      output_format: 'png',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-123',
      status: 'processing',
      progress: 50,
    })

    render(<BackgroundRemovalPage />)

    dropFile(new File(['image data'], 'photo.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(screen.getByText('photo.png')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeDefined()
      expect(screen.getByText('50%')).toBeDefined()
    })
  })

  it('shows long-processing note after 3 minutes of polling', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(videosApi.uploadImage).mockResolvedValue({
        image_url: 'https://example.com/source.png',
      })
      vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
        id: 'bg-slow',
        status: 'processing',
        progress: 10,
        source_type: 'image',
        output_format: 'png',
        created_at: '2026-06-12T00:00:00Z',
      })
      vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
        id: 'bg-slow',
        status: 'processing',
        progress: 50,
      })

      render(<BackgroundRemovalPage />)

      dropFile(new File(['image data'], 'photo.png', { type: 'image/png' }))
      // fake timers のため waitFor は使わず、microtask を明示的に flush する
      await act(async () => {})
      expect(screen.getByText('photo.png')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))
      await act(async () => {})

      expect(screen.getByRole('progressbar')).toBeDefined()
      // 3分経過前は案内を表示しない
      expect(
        screen.queryByText(/大きな動画やProRes出力は数分〜10分以上かかることがあります/)
      ).toBeNull()

      // 3分 + ポーリング1回分を経過させると案内が表示される
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 3000)
      })

      expect(
        screen.getByText(
          '大きな動画やProRes出力は数分〜10分以上かかることがあります。このままお待ちください。'
        )
      ).toBeDefined()
      // 進捗バーは表示されたまま（タイムアウトしていない）
      expect(screen.getByRole('progressbar')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('failed job shows error message and retry button, retry re-creates the job', async () => {
    vi.mocked(videosApi.uploadImage).mockResolvedValue({
      image_url: 'https://example.com/source.png',
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-456',
      status: 'processing',
      progress: 0,
      source_type: 'image',
      output_format: 'png',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-456',
      status: 'failed',
      progress: 0,
      error_message: 'fal.ai側のエラーが発生しました',
    })

    render(<BackgroundRemovalPage />)

    dropFile(new File(['image data'], 'photo.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(screen.getByText('photo.png')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(screen.getByText('背景削除に失敗しました')).toBeDefined()
      expect(screen.getByText('fal.ai側のエラーが発生しました')).toBeDefined()
    })

    const retryButton = screen.getByRole('button', { name: 'リトライ' })
    expect(retryButton).toBeDefined()

    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(backgroundRemovalApi.create).toHaveBeenCalledTimes(2)
    })
    // アップロード済みURLを再利用するため、再アップロードは発生しない
    expect(videosApi.uploadImage).toHaveBeenCalledTimes(1)
  })

  it('video file shows output format radios, image file does not', async () => {
    const { unmount } = render(<BackgroundRemovalPage />)

    dropFile(new File(['image data'], 'photo.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(screen.getByText('photo.png')).toBeDefined()
    })
    expect(screen.queryByText('出力形式')).toBeNull()

    unmount()
    vi.mocked(getVideoDuration).mockResolvedValue(10)
    render(<BackgroundRemovalPage />)

    dropFile(new File(['video data'], 'clip.mp4', { type: 'video/mp4' }))

    await waitFor(() => {
      expect(screen.getByText('出力形式')).toBeDefined()
    })
    expect(screen.getByRole('radio', { name: /WebM/ })).toBeDefined()
    expect(screen.getByRole('radio', { name: /ProRes/ })).toBeDefined()
  })

  it('shows Japanese error for video longer than 60 seconds', async () => {
    vi.mocked(getVideoDuration).mockResolvedValue(61)

    render(<BackgroundRemovalPage />)

    dropFile(new File(['video data'], 'long.mp4', { type: 'video/mp4' }))

    await waitFor(() => {
      expect(
        screen.getByText('動画は60秒以内にしてください（現在: 61.0秒）')
      ).toBeDefined()
    })
    expect(lipSyncApi.uploadVideo).not.toHaveBeenCalled()
  })

  it('prores selection sends output_format prores and result shows no-preview notice', async () => {
    vi.mocked(getVideoDuration).mockResolvedValue(10)
    vi.mocked(lipSyncApi.uploadVideo).mockResolvedValue({
      video_url: 'https://example.com/source.mp4',
      duration: 10,
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-prores',
      status: 'processing',
      progress: 0,
      source_type: 'video',
      output_format: 'prores',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-prores',
      status: 'completed',
      progress: 100,
      output_url: 'https://example.com/output.mov',
    })

    render(<BackgroundRemovalPage />)

    dropFile(new File(['video data'], 'clip.mp4', { type: 'video/mp4' }))

    await waitFor(() => {
      expect(screen.getByText('clip.mp4')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('radio', { name: /ProRes/ }))
    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(
        screen.getByText(/ProResはブラウザでプレビューできません/)
      ).toBeDefined()
    })

    expect(backgroundRemovalApi.create).toHaveBeenCalledWith({
      source_type: 'video',
      source_url: 'https://example.com/source.mp4',
      output_format: 'prores',
    })
    expect(screen.queryByTestId('result-video')).toBeNull()
  })

  it('accepts a .mov file with empty MIME type as video and uploads it as video/quicktime', async () => {
    vi.mocked(getVideoDuration).mockResolvedValue(10)
    vi.mocked(lipSyncApi.uploadVideo).mockResolvedValue({
      video_url: 'https://example.com/source.mov',
      duration: 10,
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-mov',
      status: 'processing',
      progress: 0,
      source_type: 'video',
      output_format: 'webm',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-mov',
      status: 'completed',
      progress: 100,
      output_url: 'https://example.com/output.webm',
    })

    render(<BackgroundRemovalPage />)

    // ブラウザによっては file.type が空になるケースがある
    dropFile(new File(['video data'], 'clip.mov', { type: '' }))

    // 拡張子フォールバックで動画と判別され、出力形式ラジオが表示される
    await waitFor(() => {
      expect(screen.getByText('clip.mov')).toBeDefined()
      expect(screen.getByText('出力形式')).toBeDefined()
    })
    expect(screen.getByRole('radio', { name: /WebM/ })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(lipSyncApi.uploadVideo).toHaveBeenCalledTimes(1)
    })

    // アップロード前にMIMEが video/quicktime に正規化されている
    const formData = vi.mocked(lipSyncApi.uploadVideo).mock.calls[0][0]
    const uploaded = formData.get('file') as File
    expect(uploaded.name).toBe('clip.mov')
    expect(uploaded.type).toBe('video/quicktime')
  })

  it('accepts a .webm video file as video input', async () => {
    vi.mocked(getVideoDuration).mockResolvedValue(10)

    render(<BackgroundRemovalPage />)

    dropFile(new File(['video data'], 'clip.webm', { type: 'video/webm' }))

    await waitFor(() => {
      expect(screen.getByText('clip.webm')).toBeDefined()
      expect(screen.getByText('出力形式')).toBeDefined()
    })
    expect(screen.getByRole('radio', { name: /WebM/ })).toBeDefined()
    expect(screen.getByRole('radio', { name: /ProRes/ })).toBeDefined()
  })

  it('accepts a .png file with empty MIME type as image and uploads it as image/png', async () => {
    vi.mocked(videosApi.uploadImage).mockResolvedValue({
      image_url: 'https://example.com/source.png',
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-png',
      status: 'processing',
      progress: 0,
      source_type: 'image',
      output_format: 'png',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-png',
      status: 'completed',
      progress: 100,
      output_url: 'https://example.com/output.png',
    })

    render(<BackgroundRemovalPage />)

    dropFile(new File(['image data'], 'photo.png', { type: '' }))

    await waitFor(() => {
      expect(screen.getByText('photo.png')).toBeDefined()
    })
    // 画像として判別される（出力形式ラジオは表示されない）
    expect(screen.queryByText('出力形式')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(videosApi.uploadImage).toHaveBeenCalledTimes(1)
    })

    // アップロード前にMIMEが image/png に正規化されている
    const uploaded = vi.mocked(videosApi.uploadImage).mock.calls[0][0]
    expect(uploaded.name).toBe('photo.png')
    expect(uploaded.type).toBe('image/png')
  })

  it('completed webm result renders video preview and Safari note', async () => {
    vi.mocked(getVideoDuration).mockResolvedValue(10)
    vi.mocked(lipSyncApi.uploadVideo).mockResolvedValue({
      video_url: 'https://example.com/source.mp4',
      duration: 10,
    })
    vi.mocked(backgroundRemovalApi.create).mockResolvedValue({
      id: 'bg-webm',
      status: 'processing',
      progress: 0,
      source_type: 'video',
      output_format: 'webm',
      created_at: '2026-06-12T00:00:00Z',
    })
    vi.mocked(backgroundRemovalApi.getStatus).mockResolvedValue({
      id: 'bg-webm',
      status: 'completed',
      progress: 100,
      output_url: 'https://example.com/output.webm',
    })

    render(<BackgroundRemovalPage />)

    dropFile(new File(['video data'], 'clip.mp4', { type: 'video/mp4' }))

    await waitFor(() => {
      expect(screen.getByText('clip.mp4')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: '背景を削除' }))

    await waitFor(() => {
      expect(screen.getByTestId('result-video')).toBeDefined()
    })

    expect(backgroundRemovalApi.create).toHaveBeenCalledWith({
      source_type: 'video',
      source_url: 'https://example.com/source.mp4',
      output_format: 'webm',
    })
    const video = screen.getByTestId('result-video') as HTMLVideoElement
    expect(video.src).toContain('output.webm')
    expect(
      screen.getByText('透過プレビューはChrome/Firefox推奨（SafariはWebM透過非対応）')
    ).toBeDefined()
  })
})
