import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StickyNoteNode } from '../StickyNoteNode'
import type { StickyNoteNodeData } from '@/lib/types/node-editor'

vi.mock('@xyflow/react', () => ({
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
}))

const defaultData: StickyNoteNodeData = {
  type: 'stickyNote',
  isValid: true,
  text: '',
  color: 'yellow',
}

const defaultProps = {
  id: 'test-sticky-note',
  data: defaultData,
  selected: false,
  type: 'stickyNote' as const,
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

describe('StickyNoteNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render with default yellow color and empty text', () => {
      const { container } = render(<StickyNoteNode {...defaultProps} />)

      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeDefined()
      expect((textarea as HTMLTextAreaElement).value).toBe('')

      // yellow background class present
      expect(container.firstElementChild?.className).toContain('bg-yellow-900/30')

      // no react-flow handles in DOM
      expect(container.querySelector('.react-flow__handle')).toBeNull()
    })
  })

  describe('text input', () => {
    it('should dispatch nodeDataUpdate CustomEvent with text when textarea changes', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      render(<StickyNoteNode {...defaultProps} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Hello, sticky note!' } })

      const calls = dispatchSpy.mock.calls.map((call) => call[0] as CustomEvent)
      const nodeDataUpdateEvent = calls.find((e) => e.type === 'nodeDataUpdate')

      expect(nodeDataUpdateEvent).toBeDefined()
      expect(nodeDataUpdateEvent?.detail).toEqual({
        nodeId: 'test-sticky-note',
        updates: { text: 'Hello, sticky note!' },
      })

      dispatchSpy.mockRestore()
    })
  })

  describe('color change', () => {
    it('should dispatch nodeDataUpdate CustomEvent with color: pink when pink button is clicked', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      render(<StickyNoteNode {...defaultProps} />)

      const pinkButton = screen.getByRole('button', { name: '色をpinkに変更' })
      fireEvent.click(pinkButton)

      const calls = dispatchSpy.mock.calls.map((call) => call[0] as CustomEvent)
      const nodeDataUpdateEvent = calls.find((e) => e.type === 'nodeDataUpdate')

      expect(nodeDataUpdateEvent).toBeDefined()
      expect(nodeDataUpdateEvent?.detail).toEqual({
        nodeId: 'test-sticky-note',
        updates: { color: 'pink' },
      })

      dispatchSpy.mockRestore()
    })
  })

  describe('maxLength', () => {
    it('should have maxLength attribute of 500 on the textarea', () => {
      render(<StickyNoteNode {...defaultProps} />)

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.maxLength).toBe(500)
    })
  })
})
