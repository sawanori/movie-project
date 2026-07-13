import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineTrack } from './timeline-track'
import type { TimelineClip, TimelineTransition } from '@/lib/hooks/use-timeline'

const mockClips: TimelineClip[] = [
  { id: 'clip-1', sceneIndex: 0, startTime: 0, duration: 5, label: 'Scene 1' },
  { id: 'clip-2', sceneIndex: 1, startTime: 5, duration: 3, label: 'Scene 2' },
  { id: 'clip-3', sceneIndex: 2, startTime: 8, duration: 4, label: 'Scene 3' },
]

const mockTransitions: TimelineTransition[] = [
  { id: 'tr-1', type: 'none', duration: 0.5 },
  { id: 'tr-2', type: 'crossfade', duration: 1.0 },
]

describe('TimelineTrack', () => {
  it('renders all clips', () => {
    render(
      <TimelineTrack
        clips={mockClips}
        transitions={mockTransitions}
        onClipSelect={vi.fn()}
        onTransitionClick={vi.fn()}
      />
    )

    expect(screen.getByText('Scene 1')).toBeDefined()
    expect(screen.getByText('Scene 2')).toBeDefined()
    expect(screen.getByText('Scene 3')).toBeDefined()
  })

  it('renders transitions between clips', () => {
    render(
      <TimelineTrack
        clips={mockClips}
        transitions={mockTransitions}
        onClipSelect={vi.fn()}
        onTransitionClick={vi.fn()}
      />
    )

    const transitionButtons = screen
      .getAllByRole('button')
      .filter((el) => el.getAttribute('data-transition') !== null)

    expect(transitionButtons).toHaveLength(2)
  })

  it('clicking clip calls onClipSelect', () => {
    const onClipSelect = vi.fn()
    render(
      <TimelineTrack
        clips={mockClips}
        transitions={mockTransitions}
        onClipSelect={onClipSelect}
        onTransitionClick={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Scene 2'))
    expect(onClipSelect).toHaveBeenCalledWith('clip-2')
  })

  it('clicking transition calls onTransitionClick', () => {
    const onTransitionClick = vi.fn()
    render(
      <TimelineTrack
        clips={mockClips}
        transitions={mockTransitions}
        onClipSelect={vi.fn()}
        onTransitionClick={onTransitionClick}
      />
    )

    const transitionButtons = screen
      .getAllByRole('button')
      .filter((el) => el.getAttribute('data-transition') !== null)

    fireEvent.click(transitionButtons[0])
    expect(onTransitionClick).toHaveBeenCalledWith(0)
  })

  it('applies correct pixel widths to clips', () => {
    const pixelsPerSecond = 50
    const { container } = render(
      <TimelineTrack
        clips={mockClips}
        transitions={mockTransitions}
        onClipSelect={vi.fn()}
        onTransitionClick={vi.fn()}
        pixelsPerSecond={pixelsPerSecond}
      />
    )

    // clip-1 is 5s * 50px = 250px wide
    const clip1El = container.querySelector('[data-clip-id="clip-1"]') as HTMLElement
    expect(clip1El.style.width).toBe('250px')

    // clip-2 is 3s * 50px = 150px wide
    const clip2El = container.querySelector('[data-clip-id="clip-2"]') as HTMLElement
    expect(clip2El.style.width).toBe('150px')
  })
})
