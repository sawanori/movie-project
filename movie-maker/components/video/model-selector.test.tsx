import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModelSelector } from './model-selector'
import type { ProviderMetadata, RoutingPriority } from '@/lib/types/provider-metadata'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

const mockProviders: ProviderMetadata[] = [
  {
    name: 'runway-gen3',
    provider: 'runway',
    capabilities: ['text-to-video'],
    quality_score: 90,
    speed_score: 60,
    cost_per_second: 70,
    max_duration: 10,
    supported_aspect_ratios: ['16:9', '9:16'],
  },
  {
    name: 'kling-ai',
    provider: 'piapi_kling',
    capabilities: ['text-to-video', 'image-to-video'],
    quality_score: 75,
    speed_score: 80,
    cost_per_second: 40,
    max_duration: 10,
    supported_aspect_ratios: ['16:9', '9:16'],
  },
]

describe('ModelSelector', () => {
  const defaultProps = {
    providers: mockProviders,
    selectedProvider: undefined,
    priority: 'quality' as RoutingPriority,
    onProviderSelect: vi.fn(),
    onPriorityChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render priority options', () => {
    render(<ModelSelector {...defaultProps} />)

    expect(screen.getByRole('button', { name: '高品質' })).toBeDefined()
    expect(screen.getByRole('button', { name: '高速' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'コスト優先' })).toBeDefined()
  })

  it('should render provider list with provider names', () => {
    render(<ModelSelector {...defaultProps} />)

    expect(screen.getByText('runway-gen3')).toBeDefined()
    expect(screen.getByText('kling-ai')).toBeDefined()
  })

  it('should highlight selected provider', () => {
    render(<ModelSelector {...defaultProps} selectedProvider="runway-gen3" />)

    const selectedElement = screen.getByTestId('provider-item-runway-gen3')
    expect(selectedElement.getAttribute('data-selected')).toBe('true')
  })

  it('should call onProviderSelect when clicking a provider', () => {
    const onProviderSelect = vi.fn()
    render(<ModelSelector {...defaultProps} onProviderSelect={onProviderSelect} />)

    fireEvent.click(screen.getByTestId('provider-item-kling-ai'))

    expect(onProviderSelect).toHaveBeenCalledWith('kling-ai')
  })

  it('should call onPriorityChange when clicking a priority button', () => {
    const onPriorityChange = vi.fn()
    render(<ModelSelector {...defaultProps} onPriorityChange={onPriorityChange} />)

    fireEvent.click(screen.getByRole('button', { name: '高速' }))

    expect(onPriorityChange).toHaveBeenCalledWith('speed')
  })

  it('should show loading state when loading prop is true', () => {
    render(<ModelSelector {...defaultProps} loading={true} />)

    expect(screen.getByTestId('model-selector-loading')).toBeDefined()
  })
})
