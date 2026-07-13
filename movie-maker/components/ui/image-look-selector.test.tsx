import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageLookSelector } from './image-look-selector'
import { IMAGE_LOOKS } from '@/lib/constants/image-generation'

describe('ImageLookSelector', () => {
  it('should render all image look options', () => {
    const onChange = vi.fn()
    render(<ImageLookSelector value="cinematic" onChange={onChange} />)

    IMAGE_LOOKS.forEach((look) => {
      expect(screen.getByText(look.label)).toBeDefined()
      expect(screen.getByText(look.description)).toBeDefined()
    })
  })

  it('should highlight the selected look', () => {
    const onChange = vi.fn()
    render(<ImageLookSelector value="anime" onChange={onChange} />)

    const animeOption = screen.getByText('アニメ').closest('label')
    expect(animeOption?.className).toContain('border-[#fce300]')
    expect(animeOption?.className).toContain('bg-[#fce300]/10')
  })

  it('should call onChange when a look is selected', () => {
    const onChange = vi.fn()
    render(<ImageLookSelector value="cinematic" onChange={onChange} />)

    const realisticLabel = screen.getByText('実写・フォトリアル').closest('label')
    if (realisticLabel) {
      fireEvent.click(realisticLabel)
    }

    expect(onChange).toHaveBeenCalledWith('realistic')
  })

  it('should be disabled when disabled prop is true', () => {
    const onChange = vi.fn()
    render(<ImageLookSelector value="cinematic" onChange={onChange} disabled />)

    const inputs = screen.getAllByRole('radio')
    inputs.forEach((input) => {
      expect((input as HTMLInputElement).disabled).toBe(true)
    })
  })

  it('should display icons for each look', () => {
    const onChange = vi.fn()
    const { container } = render(<ImageLookSelector value="cinematic" onChange={onChange} />)

    IMAGE_LOOKS.forEach((look) => {
      expect(container.textContent).toContain(look.icon)
    })
  })

  it('should apply custom className', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ImageLookSelector value="cinematic" onChange={onChange} className="custom-class" />
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('custom-class')
  })

  it('should be scrollable when options exceed max height', () => {
    const onChange = vi.fn()
    const { container } = render(<ImageLookSelector value="cinematic" onChange={onChange} />)

    const optionsContainer = container.querySelector('.overflow-y-auto')
    expect(optionsContainer?.className).toContain('max-h-[280px]')
  })
})
