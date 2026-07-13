import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransitionSelector } from './transition-selector'

type TransitionType = 'none' | 'crossfade' | 'fade_black' | 'fade_white' | 'wipe_left'

describe('TransitionSelector', () => {
  it('renders all transition types', () => {
    render(
      <TransitionSelector
        selectedType="none"
        duration={0.5}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('カット')).toBeDefined()
    expect(screen.getByText('クロスフェード')).toBeDefined()
    expect(screen.getByText('フェードブラック')).toBeDefined()
    expect(screen.getByText('フェードホワイト')).toBeDefined()
    expect(screen.getByText('ワイプ左')).toBeDefined()
  })

  it('highlights selected type', () => {
    render(
      <TransitionSelector
        selectedType="crossfade"
        duration={0.5}
        onChange={vi.fn()}
      />
    )

    const crossfadeBtn = screen.getByText('クロスフェード').closest('button') as HTMLElement
    expect(crossfadeBtn.getAttribute('data-selected')).toBe('true')

    const cutBtn = screen.getByText('カット').closest('button') as HTMLElement
    expect(cutBtn.getAttribute('data-selected')).toBe('false')
  })

  it('clicking type calls onChange with type and current duration', () => {
    const onChange = vi.fn()
    render(
      <TransitionSelector
        selectedType="none"
        duration={0.5}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByText('クロスフェード').closest('button') as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('crossfade', 0.5)
  })

  it('duration slider calls onChange with updated duration', () => {
    const onChange = vi.fn()
    render(
      <TransitionSelector
        selectedType="crossfade"
        duration={0.5}
        onChange={onChange}
      />
    )

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect(onChange).toHaveBeenCalledWith('crossfade', 1.5)
  })

  it('shows Japanese labels for each type', () => {
    render(
      <TransitionSelector
        selectedType="none"
        duration={0.5}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('カット')).toBeDefined()
    expect(screen.getByText('クロスフェード')).toBeDefined()
    expect(screen.getByText('フェードブラック')).toBeDefined()
    expect(screen.getByText('フェードホワイト')).toBeDefined()
    expect(screen.getByText('ワイプ左')).toBeDefined()
  })

  it('none (カット) is an option', () => {
    const onChange = vi.fn()
    render(
      <TransitionSelector
        selectedType="crossfade"
        duration={0.5}
        onChange={onChange}
      />
    )

    const cutBtn = screen.getByText('カット').closest('button') as HTMLElement
    expect(cutBtn).toBeDefined()
    fireEvent.click(cutBtn)
    expect(onChange).toHaveBeenCalledWith('none', 0.5)
  })
})
