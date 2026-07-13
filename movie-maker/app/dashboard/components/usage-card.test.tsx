import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Usage } from '@/lib/hooks/use-dashboard-data'
import { UsageCard } from './usage-card'

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    plan_type: 'free',
    videos_used: 3,
    videos_limit: 10,
    videos_remaining: 7,
    ...overrides,
  }
}

describe('UsageCard', () => {
  it('renders used / limit, remaining count, and plan label', () => {
    render(<UsageCard usage={makeUsage()} />)

    expect(screen.getByText('今月の使用状況')).toBeDefined()
    expect(screen.getByText('3 / 10')).toBeDefined()
    expect(screen.getByText('残り 7 本')).toBeDefined()
    expect(screen.getByText('無料トライアル')).toBeDefined()
  })

  it('shows the upgrade link only for the free plan', () => {
    const { rerender } = render(<UsageCard usage={makeUsage({ plan_type: 'free' })} />)
    expect(screen.getByRole('link', { name: /プランをアップグレード/ })).toBeDefined()

    rerender(<UsageCard usage={makeUsage({ plan_type: 'pro' })} />)
    expect(screen.queryByRole('link', { name: /プランをアップグレード/ })).toBeNull()
  })

  it('maps known plan types to their labels and falls back to the raw value', () => {
    const { rerender } = render(<UsageCard usage={makeUsage({ plan_type: 'pro' })} />)
    expect(screen.getByText('Pro')).toBeDefined()

    rerender(<UsageCard usage={makeUsage({ plan_type: 'business' })} />)
    expect(screen.getByText('Business')).toBeDefined()

    rerender(<UsageCard usage={makeUsage({ plan_type: 'starter' })} />)
    expect(screen.getByText('Starter')).toBeDefined()

    rerender(<UsageCard usage={makeUsage({ plan_type: 'enterprise' })} />)
    expect(screen.getByText('enterprise')).toBeDefined()
  })

  it('sets the progress bar width to the used/limit percentage', () => {
    render(<UsageCard usage={makeUsage({ videos_used: 3, videos_limit: 10 })} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('30')
    expect(bar.style.width).toBe('30%')
  })

  it('caps the progress bar at 100% when usage exceeds the limit', () => {
    render(<UsageCard usage={makeUsage({ videos_used: 15, videos_limit: 10, videos_remaining: 0 })} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(bar.style.width).toBe('100%')
  })

  it('renders a 0% bar without NaN when the limit is 0', () => {
    render(<UsageCard usage={makeUsage({ videos_used: 0, videos_limit: 0, videos_remaining: 0 })} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(bar.style.width).toBe('0%')
  })

  it('renders a 0% bar when the limit is undefined', () => {
    const usage = { plan_type: 'free', videos_used: 5, videos_remaining: 0 } as unknown as Usage
    render(<UsageCard usage={usage} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(bar.style.width).toBe('0%')
  })

  it('shows the monthly reset text since the API provides no reset date', () => {
    render(<UsageCard usage={makeUsage()} />)
    expect(screen.getByText('毎月自動リセット')).toBeDefined()
  })
})
