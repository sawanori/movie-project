import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineClipComponent } from './timeline-clip'
import type { TimelineClip } from '@/lib/hooks/use-timeline'

const mockClip: TimelineClip = {
  id: 'clip-1',
  sceneIndex: 0,
  startTime: 0,
  duration: 5,
  label: 'Scene 1',
  thumbnailUrl: 'https://example.com/thumb.jpg',
}

describe('TimelineClipComponent', () => {
  it('renders clip label', () => {
    render(
      <TimelineClipComponent
        clip={mockClip}
        isSelected={false}
        onSelect={vi.fn()}
        width={250}
      />
    )

    expect(screen.getByText('Scene 1')).toBeDefined()
  })

  it('renders clip duration', () => {
    render(
      <TimelineClipComponent
        clip={mockClip}
        isSelected={false}
        onSelect={vi.fn()}
        width={250}
      />
    )

    expect(screen.getByText('5.0s')).toBeDefined()
  })

  it('highlights when selected', () => {
    const { container } = render(
      <TimelineClipComponent
        clip={mockClip}
        isSelected={true}
        onSelect={vi.fn()}
        width={250}
      />
    )

    const clipEl = container.firstChild as HTMLElement
    expect(clipEl.getAttribute('data-selected')).toBe('true')
  })

  it('clicking calls onSelect with clip id', () => {
    const onSelect = vi.fn()
    render(
      <TimelineClipComponent
        clip={mockClip}
        isSelected={false}
        onSelect={onSelect}
        width={250}
      />
    )

    fireEvent.click(screen.getByText('Scene 1'))
    expect(onSelect).toHaveBeenCalledWith('clip-1')
  })

  it('renders with correct width', () => {
    const { container } = render(
      <TimelineClipComponent
        clip={mockClip}
        isSelected={false}
        onSelect={vi.fn()}
        width={300}
      />
    )

    const clipEl = container.firstChild as HTMLElement
    expect(clipEl.style.width).toBe('300px')
  })
})
