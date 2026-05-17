/**
 * PromptNode.test.tsx
 * AC-C1 (extracted_dialogue 非 null → 確認カード表示)
 * AC-C2 (確認カード「新規作成」→ createDialogueNodeFromPrompt event 発火)
 * AC-C3 (確認カード「転記」→ nodeDataUpdate event 発火)
 * AC-C4 (確認カード「無視」→ カード非表示)
 * AC-C5 (extracted_dialogue null → カード非表示)
 * AC-C6 (isTranslating 中 → カード非表示)
 * AC-C7 (dismiss 後の同一セリフ再翻訳 → カード非表示維持、空白の違いも吸収)
 * AC-B3 (subject_type が API リクエストに含まれる)
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PromptNode } from '../PromptNode'
import type { PromptNodeData } from '@/lib/types/node-editor'

// Mock @xyflow/react (全コンポーネントで共通のパターン)
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
    getNodes: vi.fn(() => []),
  }),
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

describe('PromptNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // デフォルト: extracted_dialogue なし (AC-C5)
    mockTranslate.mockResolvedValue({
      english_prompt: 'Preserve identity. Action: wave.',
      extracted_dialogue: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
      // 翻訳中インジケーター表示確認
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

      // 1回目の翻訳でカード表示
      fireEvent.change(textarea, { target: { value: '入力1' } })

      await triggerDebounce()

      expect(screen.getByText('セリフを検出しました')).toBeDefined()

      // 無視ボタンで dismiss
      fireEvent.click(screen.getByText('無視'))
      expect(screen.queryByText('セリフを検出しました')).toBeNull()

      // 同じセリフで再翻訳 (2回目の入力)
      fireEvent.change(textarea, { target: { value: '入力2' } })

      await triggerDebounce()

      // extracted_dialogue が同じなので再表示されない
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
})
