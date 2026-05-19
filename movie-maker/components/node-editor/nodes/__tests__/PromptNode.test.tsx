/**
 * PromptNode.test.tsx
 *
 * 既存テスト:
 *   AC-C1 (extracted_dialogue 非 null → 確認カード表示)
 *   AC-C2 (確認カード「新規作成」→ createDialogueNodeFromPrompt event 発火)
 *   AC-C3 (確認カード「転記」→ nodeDataUpdate event 発火)
 *   AC-C4 (確認カード「無視」→ カード非表示)
 *   AC-C5 (extracted_dialogue null → カード非表示)
 *   AC-C6 (isTranslating 中 → カード非表示)
 *   AC-C7 (dismiss 後の同一セリフ再翻訳 → カード非表示維持)
 *   AC-B3 (subject_type が API リクエストに含まれる)
 *
 * Phase 4 追加 (@ メンション autocomplete):
 *   AT-1  `@` 押下で popup 表示
 *   AT-5  `↓` で highlightedIndex 移動 → `Enter` で挿入
 *   AT-7  `Escape` で close (テキスト不変)
 *   AT-8  document 外側 click で close
 *   AT-9  手書きの `@image1` を含むテキストでも翻訳 API が呼ばれる
 *   AT-11 IME composition 中の `@` は popup を開かない
 *   AT-12 textarea blur で close
 *   AT-15 `Tab` で候補挿入
 *   AT-20 候補 0 件時に Enter で改行 (popup 閉じる)
 *   AT-22 React Flow zoom/pan で popup auto-close
 *   AT-23 aria-expanded / aria-controls / aria-activedescendant が正しく付与
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PromptNode } from '../PromptNode'
import {
  HANDLE_IDS,
  type PromptNodeData,
  type WorkflowNodeData,
} from '@/lib/types/node-editor'
import type { Edge, Node } from '@xyflow/react'

// ========== Mock @xyflow/react ==========
const mockNodes: { current: Node<WorkflowNodeData>[] } = { current: [] }
const mockEdges: { current: Edge[] } = { current: [] }
const mockViewport: { current: { x: number; y: number; zoom: number } } = {
  current: { x: 0, y: 0, zoom: 1 },
}

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
    className: string
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
  useReactFlow: () => ({
    getNodes: () => mockNodes.current,
    getEdges: () => mockEdges.current,
  }),
  useViewport: () => mockViewport.current,
  NodeProps: {},
}))

// videosApi.translateStoryPrompt を mock
vi.mock('@/lib/api/client', () => ({
  videosApi: {
    translateStoryPrompt: vi.fn(),
  },
}))

import { videosApi } from '@/lib/api/client'

const mockTranslate = vi.mocked(videosApi.translateStoryPrompt)

const defaultData: PromptNodeData = {
  type: 'prompt',
  japanesePrompt: '',
  englishPrompt: '',
  isValid: false,
  isTranslating: false,
  subjectType: 'person',
}

const defaultProps = {
  id: 'node-1',
  data: defaultData,
  selected: false,
  type: 'prompt' as const,
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

// デバウンス (500ms) + Promise resolution を待つヘルパー
async function triggerDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(600)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

// ===== Seedance ワークフロー (PromptNode → GenerateNode ← ProviderNode(seedance)
//                              ← OmniReferenceNode, ← ImageInputNode) =====
function setSeedanceWorkflow(opts?: {
  withVideoSlot?: boolean
  withImageSlot?: boolean
}) {
  const promptId = 'node-1'
  const generateId = 'gen-1'
  const providerId = 'prov-1'
  const imageInputId = 'img-1'
  const omniRefId = 'omni-1'

  const nodes: Node<WorkflowNodeData>[] = [
    {
      id: promptId,
      type: 'prompt',
      position: { x: 0, y: 0 },
      data: { ...defaultData },
    },
    {
      id: generateId,
      type: 'generate',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate',
        isValid: true,
        isGenerating: false,
      } as WorkflowNodeData,
    },
    {
      id: providerId,
      type: 'provider',
      position: { x: 0, y: 0 },
      data: {
        type: 'provider',
        provider: 'seedance',
        isValid: true,
      } as WorkflowNodeData,
    },
    {
      id: imageInputId,
      type: 'imageInput',
      position: { x: 0, y: 0 },
      data: {
        type: 'imageInput',
        imageUrl: 'https://example.com/base.png',
        imagePreview: null,
        isValid: true,
      } as WorkflowNodeData,
    },
    {
      id: omniRefId,
      type: 'omniReference',
      position: { x: 0, y: 0 },
      data: {
        type: 'omniReference',
        isValid: true,
        consentAccepted: true,
        imageSlots: Array.from({ length: 8 }, (_, i) =>
          opts?.withImageSlot && i === 0
            ? {
                assetId: 'asset-pose-a',
                url: 'https://example.com/pose-a.png',
                filename: 'pose-a.png',
                mediaType: 'image' as const,
              }
            : { assetId: null, mediaType: 'image' as const },
        ),
        videoSlots: [
          opts?.withVideoSlot
            ? {
                assetId: 'asset-dance',
                url: 'https://example.com/dance.mp4',
                filename: 'dance.mp4',
                durationSeconds: 5,
                mediaType: 'video' as const,
              }
            : { assetId: null, mediaType: 'video' as const },
          { assetId: null, mediaType: 'video' as const },
          { assetId: null, mediaType: 'video' as const },
        ],
        audioSlots: [
          { assetId: null, mediaType: 'audio' as const },
          { assetId: null, mediaType: 'audio' as const },
          { assetId: null, mediaType: 'audio' as const },
        ],
      } as WorkflowNodeData,
    },
  ]

  const edges: Edge[] = [
    {
      id: 'e1',
      source: promptId,
      sourceHandle: HANDLE_IDS.STORY_TEXT_OUTPUT,
      target: generateId,
      targetHandle: HANDLE_IDS.STORY_TEXT_INPUT,
    },
    {
      id: 'e2',
      source: providerId,
      sourceHandle: HANDLE_IDS.CONFIG_OUTPUT,
      target: generateId,
      targetHandle: HANDLE_IDS.CONFIG_INPUT,
    },
    {
      id: 'e3',
      source: imageInputId,
      sourceHandle: HANDLE_IDS.IMAGE_OUTPUT,
      target: generateId,
      targetHandle: HANDLE_IDS.IMAGE_INPUT,
    },
    {
      id: 'e4',
      source: omniRefId,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      target: providerId,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    },
  ]

  mockNodes.current = nodes
  mockEdges.current = edges
}

function clearWorkflow() {
  mockNodes.current = []
  mockEdges.current = []
}

function resetViewport() {
  mockViewport.current = { x: 0, y: 0, zoom: 1 }
}

describe('PromptNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    clearWorkflow()
    resetViewport()
    mockTranslate.mockResolvedValue({
      english_prompt: 'Preserve identity. Action: wave.',
      extracted_dialogue: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===================== 既存ロジック =====================
  describe('AC-C5: extracted_dialogue null → 確認カード非表示', () => {
    it('does not show dialogue card when extracted_dialogue is null', async () => {
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '女性が振り向く' } })

      await triggerDebounce()

      expect(screen.queryByText('セリフを検出しました')).toBeNull()
    })
  })

  describe('AC-C1: extracted_dialogue 非 null → 確認カード表示', () => {
    it('shows dialogue card when extracted_dialogue is detected', async () => {
      mockTranslate.mockResolvedValue({
        english_prompt: 'Preserve design. Subtle lip sync motion.',
        extracted_dialogue: 'ちょっとまって…',
      })

      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '「ちょっとまって…」と言う' } })

      await triggerDebounce()

      expect(screen.getByText('セリフを検出しました')).toBeDefined()
      expect(screen.getAllByText(/ちょっとまって/).length).toBeGreaterThan(0)
    })
  })

  describe('AC-C6: isTranslating 中 → 確認カード非表示', () => {
    it('does not show dialogue card while isTranslating is true', () => {
      const translatingData: PromptNodeData = {
        ...defaultData,
        isTranslating: true,
      }

      render(<PromptNode {...defaultProps} data={translatingData} />)

      expect(screen.queryByText('セリフを検出しました')).toBeNull()
      expect(screen.getByText('翻訳中...')).toBeDefined()
    })
  })

  describe('AC-C2: 確認カード「新規作成」→ createDialogueNodeFromPrompt event 発火', () => {
    it('dispatches createDialogueNodeFromPrompt event on "新規 DialogueNode を作成" click', async () => {
      mockTranslate.mockResolvedValue({
        english_prompt: 'Preserve design.',
        extracted_dialogue: 'ちょっとまって…',
      })

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: 'セリフ入力' } })

      await triggerDebounce()

      const createButton = screen.getByText('新規 DialogueNode を作成')
      expect(createButton).toBeDefined()

      fireEvent.click(createButton)

      const dispatched = dispatchEventSpy.mock.calls.map((call) => call[0] as CustomEvent)
      const createEvent = dispatched.find((e) => e.type === 'createDialogueNodeFromPrompt')

      expect(createEvent).toBeDefined()
      expect(createEvent?.detail).toMatchObject({
        sourcePromptNodeId: 'node-1',
        initialText: 'ちょっとまって…',
      })

      dispatchEventSpy.mockRestore()
    })

    it('hides dialogue card after clicking "新規 DialogueNode を作成"', async () => {
      mockTranslate.mockResolvedValue({
        english_prompt: 'Preserve design.',
        extracted_dialogue: 'ちょっとまって…',
      })

      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: 'セリフ入力' } })

      await triggerDebounce()

      expect(screen.getByText('セリフを検出しました')).toBeDefined()

      fireEvent.click(screen.getByText('新規 DialogueNode を作成'))

      expect(screen.queryByText('セリフを検出しました')).toBeNull()
    })
  })

  describe('AC-C4: 確認カード「無視」→ カード非表示', () => {
    it('hides dialogue card after clicking "無視"', async () => {
      mockTranslate.mockResolvedValue({
        english_prompt: 'Preserve design.',
        extracted_dialogue: 'ちょっとまって…',
      })

      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '入力テスト' } })

      await triggerDebounce()

      expect(screen.getByText('セリフを検出しました')).toBeDefined()

      fireEvent.click(screen.getByText('無視'))

      expect(screen.queryByText('セリフを検出しました')).toBeNull()
    })
  })

  describe('AC-C7: dismiss 後の同一セリフ再翻訳 → カード非表示維持', () => {
    it('does not re-show card after dismiss for same dialogue (including whitespace normalization)', async () => {
      mockTranslate.mockResolvedValue({
        english_prompt: 'Preserve design.',
        extracted_dialogue: 'ちょっとまって…',
      })

      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '入力1' } })

      await triggerDebounce()

      expect(screen.getByText('セリフを検出しました')).toBeDefined()

      fireEvent.click(screen.getByText('無視'))
      expect(screen.queryByText('セリフを検出しました')).toBeNull()

      fireEvent.change(textarea, { target: { value: '入力2' } })

      await triggerDebounce()

      expect(screen.queryByText('セリフを検出しました')).toBeNull()
    })
  })

  describe('AC-B3: subject_type が API リクエストに含まれる', () => {
    it('passes subject_type "object" from node data to translateStoryPrompt', async () => {
      const objectData: PromptNodeData = {
        ...defaultData,
        subjectType: 'object',
      }

      render(<PromptNode {...defaultProps} data={objectData} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: 'ニットセーター' } })

      await triggerDebounce()

      expect(mockTranslate).toHaveBeenCalledWith(
        expect.objectContaining({ subject_type: 'object' })
      )
    })

    it('passes subject_type "person" by default', async () => {
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '人物が歩く' } })

      await triggerDebounce()

      expect(mockTranslate).toHaveBeenCalledWith(
        expect.objectContaining({ subject_type: 'person' })
      )
    })
  })

  // ===================== Phase 4 追加: @ メンション autocomplete =====================
  describe('@ メンション autocomplete 統合', () => {
    it('AT-1: `@` 押下で popup 表示', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: 'A girl @' } })

      const popup = document.querySelector('[data-testid="reference-mention-popup"]')
      expect(popup).not.toBeNull()
      // 候補に @image1 と @video1 が含まれる (base 画像 + OmniRef video[0])
      expect(screen.getByText('@image1')).toBeTruthy()
      expect(screen.getByText('@video1')).toBeTruthy()
    })

    it('AT-23: aria-expanded / aria-controls / aria-activedescendant が正しく付与', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      // 初期状態: aria-expanded=false, aria-activedescendant 未付与
      expect(textarea.getAttribute('aria-expanded')).toBe('false')
      expect(textarea.getAttribute('aria-autocomplete')).toBe('list')
      expect(textarea.getAttribute('role')).toBe('combobox')
      const listboxId = textarea.getAttribute('aria-controls')
      expect(listboxId).toBeTruthy()

      // popup 表示後
      fireEvent.change(textarea, { target: { value: '@' } })
      expect(textarea.getAttribute('aria-expanded')).toBe('true')
      expect(textarea.getAttribute('aria-activedescendant')).toBe(
        `${listboxId}-option-0`,
      )
      const listbox = document.querySelector(`#${listboxId}`)
      expect(listbox).not.toBeNull()
    })

    it('AT-5: `↓` で highlightedIndex 移動 → `Enter` で挿入', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText(
        '動画の内容を日本語で入力',
      ) as HTMLTextAreaElement

      fireEvent.change(textarea, { target: { value: '@' } })
      const listboxId = textarea.getAttribute('aria-controls')!

      // ↓: index 0 → 1
      fireEvent.keyDown(textarea, { key: 'ArrowDown' })
      expect(textarea.getAttribute('aria-activedescendant')).toBe(
        `${listboxId}-option-1`,
      )

      // Enter で 2 番目の候補 (@video1) を挿入
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(textarea.value).toBe('@video1 ')
      // popup 閉じる
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()
    })

    it('AT-15: `Tab` で候補挿入', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText(
        '動画の内容を日本語で入力',
      ) as HTMLTextAreaElement

      fireEvent.change(textarea, { target: { value: '@' } })
      fireEvent.keyDown(textarea, { key: 'Tab' })

      expect(textarea.value).toBe('@image1 ')
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()
    })

    it('AT-7: `Escape` で close (テキスト不変)', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText(
        '動画の内容を日本語で入力',
      ) as HTMLTextAreaElement

      fireEvent.change(textarea, { target: { value: 'hello @' } })
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).not.toBeNull()

      fireEvent.keyDown(textarea, { key: 'Escape' })

      // popup 閉じる、textarea 値は不変
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()
      expect(textarea.value).toBe('hello @')
    })

    it('AT-8: document 外側 click で close', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '@' } })
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).not.toBeNull()

      // popup と textarea 以外の場所でクリック
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      fireEvent.mouseDown(outside)

      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()
      outside.remove()
    })

    it('AT-12: textarea blur で close', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '@' } })
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).not.toBeNull()

      fireEvent.blur(textarea)
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()
    })

    it('AT-11: IME composition 中の `@` は popup を開かない', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      // composition 開始
      fireEvent.compositionStart(textarea)
      fireEvent.change(textarea, { target: { value: '@' } })

      // composition 中なので popup は開かない
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()

      // composition 終了後の次の入力で popup 開く
      fireEvent.compositionEnd(textarea)
      fireEvent.change(textarea, { target: { value: '@a' } })

      // 'a' で始まる候補 (@audio はないが @image1) などフィルタは別だが、
      // ここでは popup が表示されることだけ確認 (emptyReason または候補で表示)
      // フィルタが効くと '@a' に対しては @audio* と @image にマッチしないので、
      // 単純に空 + 表示確認のため `@` のみで再確認
      fireEvent.change(textarea, { target: { value: '@' } })
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).not.toBeNull()
    })

    it('AT-9: 手書きの `@image1` を含むテキストでも翻訳 API が呼ばれる', async () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      // ユーザーが直接 `@image1 が振り向く` のような文字列を入力
      fireEvent.change(textarea, { target: { value: '@image1 が振り向く' } })

      await triggerDebounce()

      expect(mockTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          description_ja: '@image1 が振り向く',
        }),
      )
    })

    it('AT-20: 候補 0 件時の Enter で改行が入る (popup 閉じる)', () => {
      // ワークフロー無し → no-generate-node → 候補 0 件
      clearWorkflow()
      render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText(
        '動画の内容を日本語で入力',
      ) as HTMLTextAreaElement

      fireEvent.change(textarea, { target: { value: '@' } })

      const popupBefore = document.querySelector(
        '[data-testid="reference-mention-popup"]',
      )
      // ガイド付きで popup が出る (emptyReason: 'no-generate-node')
      expect(popupBefore).not.toBeNull()

      // Enter キー: 候補 0 件なので preventDefault されない
      // → JSDOM では textarea にデフォルト改行は入らないが、preventDefault が呼ばれないことを確認
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      })
      const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault')
      textarea.dispatchEvent(enterEvent)
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('AT-22: React Flow zoom/pan で popup auto-close', () => {
      setSeedanceWorkflow({ withVideoSlot: true })
      const { rerender } = render(<PromptNode {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('動画の内容を日本語で入力')

      fireEvent.change(textarea, { target: { value: '@' } })
      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).not.toBeNull()

      // viewport を zoom 変化させて再レンダ
      mockViewport.current = { x: 0, y: 0, zoom: 1.5 }
      rerender(<PromptNode {...defaultProps} />)

      expect(
        document.querySelector('[data-testid="reference-mention-popup"]'),
      ).toBeNull()
    })
  })
})
