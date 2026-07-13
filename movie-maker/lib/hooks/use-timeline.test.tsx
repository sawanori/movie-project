import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimeline } from './use-timeline'

describe('useTimeline', () => {
  it('initializes with empty clips', () => {
    const { result } = renderHook(() => useTimeline())

    expect(result.current.clips).toEqual([])
    expect(result.current.transitions).toEqual([])
    expect(result.current.totalDuration).toBe(0)
  })

  it('addClip adds clip with calculated startTime', () => {
    const { result } = renderHook(() => useTimeline())

    act(() => {
      result.current.addClip({
        sceneIndex: 0,
        duration: 5,
        label: 'Scene 1',
      })
    })

    expect(result.current.clips).toHaveLength(1)
    expect(result.current.clips[0].startTime).toBe(0)
    expect(result.current.clips[0].duration).toBe(5)
    expect(result.current.clips[0].label).toBe('Scene 1')

    act(() => {
      result.current.addClip({
        sceneIndex: 1,
        duration: 3,
        label: 'Scene 2',
      })
    })

    expect(result.current.clips).toHaveLength(2)
    expect(result.current.clips[1].startTime).toBe(5)
  })

  it('removeClip removes clip and recalculates times', () => {
    const { result } = renderHook(() => useTimeline())

    act(() => {
      result.current.addClip({ sceneIndex: 0, duration: 5, label: 'Scene 1' })
      result.current.addClip({ sceneIndex: 1, duration: 3, label: 'Scene 2' })
      result.current.addClip({ sceneIndex: 2, duration: 4, label: 'Scene 3' })
    })

    const idToRemove = result.current.clips[0].id

    act(() => {
      result.current.removeClip(idToRemove)
    })

    expect(result.current.clips).toHaveLength(2)
    expect(result.current.clips[0].label).toBe('Scene 2')
    expect(result.current.clips[0].startTime).toBe(0)
    expect(result.current.clips[1].startTime).toBe(3)
  })

  it('updateTransition updates transition at index', () => {
    const { result } = renderHook(() => useTimeline())

    act(() => {
      result.current.addClip({ sceneIndex: 0, duration: 5, label: 'Scene 1' })
      result.current.addClip({ sceneIndex: 1, duration: 3, label: 'Scene 2' })
    })

    act(() => {
      result.current.updateTransition(0, { type: 'crossfade', duration: 1.0 })
    })

    expect(result.current.transitions[0].type).toBe('crossfade')
    expect(result.current.transitions[0].duration).toBe(1.0)
  })

  it('totalDuration sums all clip durations', () => {
    const { result } = renderHook(() => useTimeline())

    act(() => {
      result.current.addClip({ sceneIndex: 0, duration: 5, label: 'Scene 1' })
      result.current.addClip({ sceneIndex: 1, duration: 3, label: 'Scene 2' })
      result.current.addClip({ sceneIndex: 2, duration: 7, label: 'Scene 3' })
    })

    expect(result.current.totalDuration).toBe(15)
  })
})
