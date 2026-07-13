import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BGMWaveform } from './bgm-waveform'

describe('BGMWaveform', () => {
  it('renders waveform container', () => {
    const { container } = render(
      <BGMWaveform duration={30} />
    )

    const waveformEl = container.querySelector('[data-testid="bgm-waveform"]')
    expect(waveformEl).toBeDefined()
  })

  it('shows "BGMなし" when no audioUrl', () => {
    render(
      <BGMWaveform duration={30} />
    )

    expect(screen.getByText('BGMなし')).toBeDefined()
  })

  it('shows play button', () => {
    render(
      <BGMWaveform
        audioUrl="https://example.com/audio.mp3"
        duration={30}
        onPlayPause={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /再生|停止|play|pause/i })).toBeDefined()
  })

  it('clicking play calls onPlayPause', () => {
    const onPlayPause = vi.fn()
    render(
      <BGMWaveform
        audioUrl="https://example.com/audio.mp3"
        duration={30}
        onPlayPause={onPlayPause}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /再生|停止|play|pause/i }))
    expect(onPlayPause).toHaveBeenCalledOnce()
  })

  it('renders with correct width based on duration', () => {
    const pixelsPerSecond = 50
    const duration = 30
    const { container } = render(
      <BGMWaveform
        audioUrl="https://example.com/audio.mp3"
        duration={duration}
        pixelsPerSecond={pixelsPerSecond}
      />
    )

    const waveformEl = container.querySelector('[data-testid="bgm-waveform"]') as HTMLElement
    expect(waveformEl.style.width).toBe(`${duration * pixelsPerSecond}px`)
  })
})
