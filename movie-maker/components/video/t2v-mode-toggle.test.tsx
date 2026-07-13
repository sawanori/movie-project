import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { T2VModeToggle } from './t2v-mode-toggle'

describe('T2VModeToggle', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render both mode options', () => {
    render(<T2VModeToggle mode="i2v" onChange={mockOnChange} />)

    expect(screen.getByText('画像から生成')).toBeDefined()
    expect(screen.getByText('テキストから生成')).toBeDefined()
  })

  it('should highlight I2V mode when mode is i2v', () => {
    render(<T2VModeToggle mode="i2v" onChange={mockOnChange} />)

    const i2vButton = screen.getByRole('button', { name: '画像から生成' })
    const t2vButton = screen.getByRole('button', { name: 'テキストから生成' })

    expect(i2vButton.getAttribute('data-active')).toBe('true')
    expect(t2vButton.getAttribute('data-active')).toBe('false')
  })

  it('should highlight T2V mode when mode is t2v', () => {
    render(<T2VModeToggle mode="t2v" onChange={mockOnChange} />)

    const i2vButton = screen.getByRole('button', { name: '画像から生成' })
    const t2vButton = screen.getByRole('button', { name: 'テキストから生成' })

    expect(i2vButton.getAttribute('data-active')).toBe('false')
    expect(t2vButton.getAttribute('data-active')).toBe('true')
  })

  it('should call onChange with t2v when T2V button is clicked', () => {
    render(<T2VModeToggle mode="i2v" onChange={mockOnChange} />)

    const t2vButton = screen.getByRole('button', { name: 'テキストから生成' })
    fireEvent.click(t2vButton)

    expect(mockOnChange).toHaveBeenCalledWith('t2v')
    expect(mockOnChange).toHaveBeenCalledOnce()
  })

  it('should call onChange with i2v when I2V button is clicked', () => {
    render(<T2VModeToggle mode="t2v" onChange={mockOnChange} />)

    const i2vButton = screen.getByRole('button', { name: '画像から生成' })
    fireEvent.click(i2vButton)

    expect(mockOnChange).toHaveBeenCalledWith('i2v')
    expect(mockOnChange).toHaveBeenCalledOnce()
  })

  it('should not call onChange when disabled and button is clicked', () => {
    render(<T2VModeToggle mode="i2v" onChange={mockOnChange} disabled />)

    const t2vButton = screen.getByRole('button', { name: 'テキストから生成' })
    fireEvent.click(t2vButton)

    expect(mockOnChange).not.toHaveBeenCalled()
  })
})
