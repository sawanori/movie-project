import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowToolbar } from './WorkflowToolbar'

const baseProps = {
  workflowName: 'Test Workflow',
  isUnsaved: false,
  isCloudSynced: false,
  saveError: null,
  selectedNodeCount: 0,
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onOpen: vi.fn(),
  onNew: vi.fn(),
  onClearError: vi.fn(),
  onDuplicate: vi.fn(),
}

describe('WorkflowToolbar - duplicate button', () => {
  it('is disabled when selectedNodeCount is 0', () => {
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={0} />)
    const btn = screen.getByTitle('複製 (Cmd+D / Ctrl+D)') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('is enabled when selectedNodeCount is 1', () => {
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={1} />)
    const btn = screen.getByTitle('複製 (Cmd+D / Ctrl+D)') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('calls onDuplicate when clicked with selectedNodeCount > 0', () => {
    const onDuplicate = vi.fn()
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={3} onDuplicate={onDuplicate} />)
    fireEvent.click(screen.getByTitle('複製 (Cmd+D / Ctrl+D)'))
    expect(onDuplicate).toHaveBeenCalledOnce()
  })

  it('does not call onDuplicate when button is disabled', () => {
    const onDuplicate = vi.fn()
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={0} onDuplicate={onDuplicate} />)
    fireEvent.click(screen.getByTitle('複製 (Cmd+D / Ctrl+D)'))
    expect(onDuplicate).not.toHaveBeenCalled()
  })
})

describe('WorkflowToolbar - selection badge', () => {
  it('hides badge when selectedNodeCount is 0', () => {
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={0} />)
    expect(screen.queryByText(/個選択中/)).toBeNull()
  })

  it('shows "1個選択中" when selectedNodeCount is 1', () => {
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={1} />)
    expect(screen.getByText('1個選択中')).toBeDefined()
  })

  it('shows "5個選択中" when selectedNodeCount is 5', () => {
    render(<WorkflowToolbar {...baseProps} selectedNodeCount={5} />)
    expect(screen.getByText('5個選択中')).toBeDefined()
  })
})
