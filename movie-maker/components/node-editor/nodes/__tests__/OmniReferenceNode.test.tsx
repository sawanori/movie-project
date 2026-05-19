/**
 * OmniReferenceNode.test.tsx
 * v3 §15.2 F-1〜F-6 + F-14/F-15/F-17 (合計 9 ケース)
 *
 * メイン実装: components/node-editor/nodes/OmniReferenceNode.tsx
 * 統合テスト (NodePalette / ProviderNode / useWorkflowValidation / NodeEditor.connect /
 * graph-to-api) で部分カバーされているが、コンポーネント単体の振る舞いをこのファイルで担保する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OmniReferenceNode } from '../OmniReferenceNode'
import {
  createOmniReferenceNodeData,
  type OmniReferenceNodeData,
} from '@/lib/types/node-editor'

// ========== @xyflow/react モック ==========
vi.mock('@xyflow/react', () => ({
  Handle: ({
    id,
    position,
    type,
    className,
  }: {
    id: string
    position: string
    type: string
    className?: string
  }) => (
    <div
      data-testid={`handle-${type}-${id}`}
      data-position={position}
      className={className}
    />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
}))

// ========== react-dropzone モック ==========
// useDropzone の onDrop を input[type=file] の onChange 経由で呼び出せるようにする。
vi.mock('react-dropzone', () => ({
  useDropzone: ({
    onDrop,
    disabled,
  }: {
    onDrop: (files: File[]) => void
    disabled?: boolean
  }) => ({
    getRootProps: () => ({
      'data-disabled': disabled ? 'true' : 'false',
      'aria-disabled': disabled ? 'true' : undefined,
    }),
    getInputProps: () => ({
      type: 'file',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
          ? Array.from(e.target.files)
          : []
        onDrop(files)
      },
      disabled,
    }),
    isDragActive: false,
  }),
}))

// ========== upload API モック ==========
vi.mock('@/lib/api/client', () => ({
  uploadOmniVideoReference: vi.fn(),
  uploadOmniAudioReference: vi.fn(),
  uploadOmniImageReference: vi.fn(),
}))

import {
  uploadOmniVideoReference,
  uploadOmniAudioReference,
} from '@/lib/api/client'

const mockUploadVideo = vi.mocked(uploadOmniVideoReference)
const mockUploadAudio = vi.mocked(uploadOmniAudioReference)

// ========== テストヘルパー ==========
const defaultProps = {
  id: 'omni-node-1',
  selected: false,
  type: 'omniReference' as const,
  dragging: false,
  draggable: true,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  deletable: true,
  selectable: true,
  parentId: undefined,
}

function renderNode(overrides: Partial<OmniReferenceNodeData> = {}) {
  const data: OmniReferenceNodeData = {
    ...createOmniReferenceNodeData(),
    ...overrides,
  }
  return render(<OmniReferenceNode {...defaultProps} data={data} />)
}

function makeFile(name: string, type: string): File {
  return new File(['test-content'], name, { type })
}

describe('OmniReferenceNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========== F-1 ==========
  describe('F-1: 初期表示', () => {
    it('video 3 / audio 3 / image 8 slot がレンダリングされる', () => {
      renderNode()

      for (let i = 0; i < 3; i++) {
        expect(screen.getByTestId(`omni-slot-video-${i}`)).toBeDefined()
        expect(screen.getByTestId(`omni-slot-audio-${i}`)).toBeDefined()
      }
      for (let i = 0; i < 8; i++) {
        expect(screen.getByTestId(`omni-slot-image-${i}`)).toBeDefined()
      }
    })
  })

  // ========== F-2 ==========
  describe('F-2: video drop -> uploadOmniVideoReference 呼び出し', () => {
    it('video1 slot に MP4 を drop すると uploadOmniVideoReference が呼ばれる', async () => {
      mockUploadVideo.mockResolvedValueOnce({
        id: 'asset-v1',
        url: 'https://r2.example.com/v1.mp4',
        media_type: 'video',
        duration_seconds: 5.0,
        content_type: 'video/mp4',
        file_size_bytes: 1024,
        expires_at: '2026-01-01T00:00:00Z',
      })

      renderNode({ consentAccepted: true })

      // video slot 0 の input
      const fileInput = screen.getByLabelText(
        'video スロット 1 ファイル選択',
      ) as HTMLInputElement
      const file = makeFile('test.mp4', 'video/mp4')

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(mockUploadVideo).toHaveBeenCalledTimes(1)
      })
      expect(mockUploadVideo).toHaveBeenCalledWith(file, true)
    })
  })

  // ========== F-3 ==========
  describe('F-3: upload 成功時の filename + duration 表示', () => {
    it('成功すると slot に filename と "5.0s" が表示される', async () => {
      mockUploadVideo.mockResolvedValueOnce({
        id: 'asset-v1',
        url: 'https://r2.example.com/clip.mp4',
        media_type: 'video',
        duration_seconds: 5.0,
        content_type: 'video/mp4',
        file_size_bytes: 2048,
        expires_at: '2026-01-01T00:00:00Z',
      })

      // emitNodeDataUpdate -> CustomEvent を捕捉して再 render する
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      const { rerender } = renderNode({ consentAccepted: true })

      const fileInput = screen.getByLabelText(
        'video スロット 1 ファイル選択',
      ) as HTMLInputElement
      const file = makeFile('clip.mp4', 'video/mp4')

      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(mockUploadVideo).toHaveBeenCalled()
      })

      // 発火された nodeDataUpdate event から videoSlots を取り出して再 render
      const events = dispatchSpy.mock.calls.map((c) => c[0] as CustomEvent)
      const updateEvt = events.find((e) => e.type === 'nodeDataUpdate')
      expect(updateEvt).toBeDefined()
      const updates = updateEvt!.detail.updates as Partial<OmniReferenceNodeData>
      expect(updates.videoSlots).toBeDefined()

      const newData: OmniReferenceNodeData = {
        ...createOmniReferenceNodeData(),
        consentAccepted: true,
        ...updates,
      } as OmniReferenceNodeData

      rerender(<OmniReferenceNode {...defaultProps} data={newData} />)

      expect(
        screen.getByTestId('omni-slot-video-0-filename').textContent,
      ).toBe('clip.mp4')
      expect(
        screen.getByTestId('omni-slot-video-0-duration').textContent,
      ).toBe('5.0s')

      dispatchSpy.mockRestore()
    })
  })

  // ========== F-4 ==========
  describe('F-4: video 合計 > 15.4s で赤色警告', () => {
    it('video 合計 16s の状態で警告 (上限 15.4s 超過) を表示する', () => {
      renderNode({
        videoSlots: [
          {
            assetId: 'a',
            mediaType: 'video',
            durationSeconds: 6.0,
            filename: 'a.mp4',
          },
          {
            assetId: 'b',
            mediaType: 'video',
            durationSeconds: 6.0,
            filename: 'b.mp4',
          },
          {
            assetId: 'c',
            mediaType: 'video',
            durationSeconds: 4.0,
            filename: 'c.mp4',
          },
        ],
      })

      const progress = screen.getByTestId('omni-video-progress')
      expect(progress.getAttribute('data-over')).toBe('true')

      const warning = screen.getByTestId('omni-video-progress-warning')
      expect(warning.textContent).toMatch(/15\.4s/)
      // 赤色クラス検証
      expect(warning.className).toContain('text-red-400')
    })
  })

  // ========== F-5 ==========
  describe('F-5: audio 合計 > 15.0s で赤色警告 (NEW-C-3)', () => {
    it('audio 合計 15.5s で警告 (上限 15.0s 超過) を表示する', () => {
      renderNode({
        audioSlots: [
          {
            assetId: 'a',
            mediaType: 'audio',
            durationSeconds: 5.5,
            filename: 'a.mp3',
          },
          {
            assetId: 'b',
            mediaType: 'audio',
            durationSeconds: 5.0,
            filename: 'b.mp3',
          },
          {
            assetId: 'c',
            mediaType: 'audio',
            durationSeconds: 5.0,
            filename: 'c.mp3',
          },
        ],
      })

      const progress = screen.getByTestId('omni-audio-progress')
      expect(progress.getAttribute('data-over')).toBe('true')

      const warning = screen.getByTestId('omni-audio-progress-warning')
      expect(warning.textContent).toMatch(/15\.0s/)
      expect(warning.className).toContain('text-red-400')
    })
  })

  // ========== F-6 ==========
  describe('F-6: クリアボタン -> slot リセット', () => {
    it('クリアボタン押下で nodeDataUpdate event が発火し slot[0] がリセットされる', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      renderNode({
        consentAccepted: true,
        videoSlots: [
          {
            assetId: 'asset-v1',
            mediaType: 'video',
            url: 'https://r2.example.com/v1.mp4',
            filename: 'v1.mp4',
            durationSeconds: 3.0,
          },
          { assetId: null, mediaType: 'video' },
          { assetId: null, mediaType: 'video' },
        ],
      })

      const clearBtn = screen.getByRole('button', {
        name: 'video スロット 1 をクリア',
      })
      fireEvent.click(clearBtn)

      const events = dispatchSpy.mock.calls.map((c) => c[0] as CustomEvent)
      const updateEvt = events.find((e) => e.type === 'nodeDataUpdate')
      expect(updateEvt).toBeDefined()

      const updates = updateEvt!.detail.updates as Partial<OmniReferenceNodeData>
      expect(updates.videoSlots).toBeDefined()
      expect(updates.videoSlots![0]).toEqual({
        assetId: null,
        mediaType: 'video',
      })

      dispatchSpy.mockRestore()
    })
  })

  // ========== F-14 ==========
  describe('F-14: 著作権同意 未チェック時 Dropzone disabled', () => {
    it('consentAccepted: false の場合、dropzone は aria-disabled="true"', () => {
      renderNode({ consentAccepted: false })

      const dropzone = screen.getByTestId('omni-dropzone-video-0')
      expect(dropzone.getAttribute('aria-disabled')).toBe('true')
      expect(dropzone.className).toContain('pointer-events-none')
    })
  })

  // ========== F-15 ==========
  describe('F-15: 著作権同意 チェック後 Dropzone enabled', () => {
    it('consentAccepted: true の場合、dropzone は disabled でない', () => {
      renderNode({ consentAccepted: true })

      const dropzone = screen.getByTestId('omni-dropzone-video-0')
      expect(dropzone.getAttribute('aria-disabled')).not.toBe('true')
      expect(dropzone.className).not.toContain('pointer-events-none')
    })
  })

  // ========== F-17 ==========
  describe('F-17: upload API エラー (422) 時の表示', () => {
    it('upload が reject された場合、エラーメッセージが表示され slot は失敗状態 (assetId=null) のまま', async () => {
      mockUploadAudio.mockRejectedValueOnce(
        new Error('音声ファイルが上限 15s を超えています'),
      )

      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      renderNode({ consentAccepted: true })

      const fileInput = screen.getByLabelText(
        'audio スロット 1 ファイル選択',
      ) as HTMLInputElement
      const file = makeFile('long.mp3', 'audio/mpeg')

      fireEvent.change(fileInput, { target: { files: [file] } })

      // エラーメッセージが描画されるまで待つ
      await waitFor(() => {
        expect(
          screen.getByTestId('omni-slot-audio-0-error'),
        ).toBeDefined()
      })

      const errEl = screen.getByTestId('omni-slot-audio-0-error')
      expect(errEl.textContent).toBe('音声ファイルが上限 15s を超えています')

      // 失敗時は slot 更新イベントは発火しない (assetId は null のまま)
      const events = dispatchSpy.mock.calls.map((c) => c[0] as CustomEvent)
      const slotUpdate = events.find(
        (e) =>
          e.type === 'nodeDataUpdate' &&
          (e.detail.updates as Partial<OmniReferenceNodeData>).audioSlots !==
            undefined,
      )
      expect(slotUpdate).toBeUndefined()

      dispatchSpy.mockRestore()
    })
  })

})
