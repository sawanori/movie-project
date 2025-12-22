import { describe, it, expect } from 'vitest'
import { cn, formatRelativeTime } from './utils'

describe('cn (クラス名ユーティリティ)', () => {
  it('複数のクラス名を結合する', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('条件付きクラス名をフィルタリングする', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('Tailwindのクラスをマージする', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})

describe('formatRelativeTime (相対時間フォーマット)', () => {
  it('たった今を表示する', () => {
    const now = new Date()
    const fiveSecondsAgo = new Date(now.getTime() - 5000)
    expect(formatRelativeTime(fiveSecondsAgo.toISOString())).toBe('たった今')
  })

  it('分前を表示する', () => {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe('5分前')
  })

  it('時間前を表示する', () => {
    const now = new Date()
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    expect(formatRelativeTime(threeHoursAgo.toISOString())).toBe('3時間前')
  })

  it('日前を表示する', () => {
    const now = new Date()
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(twoDaysAgo.toISOString())).toBe('2日前')
  })
})
