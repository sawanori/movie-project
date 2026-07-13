'use client'

import { useState, useCallback } from 'react'

export interface TimelineClip {
  id: string
  sceneIndex: number
  startTime: number
  duration: number
  videoUrl?: string
  thumbnailUrl?: string
  label: string
}

export interface TimelineTransition {
  id: string
  type: 'none' | 'crossfade' | 'fade_black' | 'fade_white' | 'wipe_left'
  duration: number
}

export interface UseTimelineReturn {
  clips: TimelineClip[]
  transitions: TimelineTransition[]
  totalDuration: number
  addClip: (clip: Omit<TimelineClip, 'id' | 'startTime'>) => void
  removeClip: (id: string) => void
  updateTransition: (index: number, transition: Partial<TimelineTransition>) => void
  reorderClips: (fromIndex: number, toIndex: number) => void
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function recalculateStartTimes(clips: TimelineClip[]): TimelineClip[] {
  let currentTime = 0
  return clips.map((clip) => {
    const updated = { ...clip, startTime: currentTime }
    currentTime += clip.duration
    return updated
  })
}

function buildDefaultTransitions(clipCount: number): TimelineTransition[] {
  const transitionCount = Math.max(0, clipCount - 1)
  return Array.from({ length: transitionCount }, (_, i) => ({
    id: generateId() + `-t${i}`,
    type: 'none' as const,
    duration: 0.5,
  }))
}

export function useTimeline(initialClips?: TimelineClip[]): UseTimelineReturn {
  const [clips, setClips] = useState<TimelineClip[]>(() => {
    if (!initialClips || initialClips.length === 0) return []
    return recalculateStartTimes(initialClips)
  })

  const [transitions, setTransitions] = useState<TimelineTransition[]>(() => {
    if (!initialClips || initialClips.length === 0) return []
    return buildDefaultTransitions(initialClips.length)
  })

  const addClip = useCallback((clip: Omit<TimelineClip, 'id' | 'startTime'>) => {
    setClips((prev) => {
      const currentEnd = prev.reduce((sum, c) => sum + c.duration, 0)
      const newClip: TimelineClip = {
        ...clip,
        id: generateId(),
        startTime: currentEnd,
      }
      const next = [...prev, newClip]

      // Sync transitions: need (n-1) transitions for n clips
      setTransitions((prevTransitions) => {
        const needed = next.length - 1
        if (prevTransitions.length >= needed) return prevTransitions
        const extra = needed - prevTransitions.length
        const newTransitions = Array.from({ length: extra }, () => ({
          id: generateId() + '-t',
          type: 'none' as const,
          duration: 0.5,
        }))
        return [...prevTransitions, ...newTransitions]
      })

      return next
    })
  }, [])

  const removeClip = useCallback((id: string) => {
    setClips((prev) => {
      const filtered = prev.filter((c) => c.id !== id)
      return recalculateStartTimes(filtered)
    })

    setTransitions((prev) => {
      if (prev.length === 0) return prev
      return prev.slice(0, -1)
    })
  }, [])

  const updateTransition = useCallback(
    (index: number, update: Partial<TimelineTransition>) => {
      setTransitions((prev) => {
        const updated = [...prev]
        if (index < 0 || index >= updated.length) return prev
        updated[index] = { ...updated[index], ...update }
        return updated
      })
    },
    []
  )

  const reorderClips = useCallback((fromIndex: number, toIndex: number) => {
    setClips((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex >= prev.length
      ) {
        return prev
      }
      const reordered = [...prev]
      const [removed] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, removed)
      return recalculateStartTimes(reordered)
    })
  }, [])

  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0)

  return {
    clips,
    transitions,
    totalDuration,
    addClip,
    removeClip,
    updateTransition,
    reorderClips,
  }
}
