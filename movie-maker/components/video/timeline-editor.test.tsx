import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineEditor } from './timeline-editor'

const mockScenes = [
  {
    id: 'scene-1',
    videoUrl: 'https://example.com/video1.mp4',
    thumbnailUrl: 'https://example.com/thumb1.jpg',
    duration: 5,
    label: 'Scene 1',
  },
  {
    id: 'scene-2',
    videoUrl: 'https://example.com/video2.mp4',
    thumbnailUrl: 'https://example.com/thumb2.jpg',
    duration: 3,
    label: 'Scene 2',
  },
]

describe('TimelineEditor', () => {
  it('renders timeline track with scenes', () => {
    render(
      <TimelineEditor scenes={mockScenes} />
    )

    expect(screen.getByText('Scene 1')).toBeDefined()
    expect(screen.getByText('Scene 2')).toBeDefined()
  })

  it('renders BGM waveform', () => {
    const { container } = render(
      <TimelineEditor scenes={mockScenes} />
    )

    const waveform = container.querySelector('[data-testid="bgm-waveform"]')
    expect(waveform).toBeDefined()
  })

  it('renders export button', () => {
    render(
      <TimelineEditor scenes={mockScenes} />
    )

    expect(screen.getByRole('button', { name: /エクスポート|export/i })).toBeDefined()
  })

  it('renders zoom controls', () => {
    render(
      <TimelineEditor scenes={mockScenes} />
    )

    const zoomSlider = screen.getByRole('slider', { name: /ズーム|zoom/i })
    expect(zoomSlider).toBeDefined()
  })

  it('clicking export calls onExport', () => {
    const onExport = vi.fn()
    render(
      <TimelineEditor scenes={mockScenes} onExport={onExport} />
    )

    fireEvent.click(screen.getByRole('button', { name: /エクスポート|export/i }))
    expect(onExport).toHaveBeenCalledOnce()
  })
})
