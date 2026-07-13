'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTimeline } from '@/lib/hooks/use-timeline'
import { TimelineTrack } from './timeline-track'
import { BGMWaveform } from './bgm-waveform'
import { TransitionSelector } from './transition-selector'
import type { TransitionType } from './transition-selector'

interface Scene {
  id: string
  videoUrl?: string
  thumbnailUrl?: string
  duration: number
  label: string
}

interface TimelineEditorProps {
  scenes: Scene[]
  bgmUrl?: string
  onTransitionChange?: (sceneIndex: number, type: string, duration: number) => void
  onExport?: () => void
}

const DEFAULT_PIXELS_PER_SECOND = 50

export function TimelineEditor({
  scenes,
  bgmUrl,
  onTransitionChange,
  onExport,
}: TimelineEditorProps) {
  const { clips, transitions, totalDuration, addClip, updateTransition } = useTimeline()
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>()
  const [activeTransitionIndex, setActiveTransitionIndex] = useState<number | null>(null)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const [isBgmPlaying, setIsBgmPlaying] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    scenes.forEach((scene, index) => {
      addClip({
        sceneIndex: index,
        duration: scene.duration,
        label: scene.label,
        videoUrl: scene.videoUrl,
        thumbnailUrl: scene.thumbnailUrl,
      })
    })
  }, [scenes, addClip])

  const handleTransitionChange = useCallback(
    (type: TransitionType, duration: number) => {
      if (activeTransitionIndex === null) return
      updateTransition(activeTransitionIndex, { type, duration })
      onTransitionChange?.(activeTransitionIndex, type, duration)
    },
    [activeTransitionIndex, updateTransition, onTransitionChange]
  )

  const activeTransition =
    activeTransitionIndex !== null ? transitions[activeTransitionIndex] : null

  return (
    <div className="flex flex-col gap-3 bg-gray-950 p-4 rounded-lg border border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400" htmlFor="zoom-slider">
            ズーム
          </label>
          <input
            id="zoom-slider"
            aria-label="ズーム"
            type="range"
            min="20"
            max="200"
            step="10"
            value={pixelsPerSecond}
            onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
            className="w-28"
          />
          <span className="text-xs text-gray-400">{pixelsPerSecond}px/s</span>
        </div>

        <button
          aria-label="エクスポート"
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
          onClick={onExport}
        >
          エクスポート
        </button>
      </div>

      <div className="overflow-x-auto">
        <TimelineTrack
          clips={clips}
          transitions={transitions}
          selectedClipId={selectedClipId}
          onClipSelect={setSelectedClipId}
          onTransitionClick={(index) =>
            setActiveTransitionIndex((prev) => (prev === index ? null : index))
          }
          pixelsPerSecond={pixelsPerSecond}
        />
      </div>

      <div className="overflow-x-auto">
        <BGMWaveform
          audioUrl={bgmUrl}
          duration={totalDuration}
          pixelsPerSecond={pixelsPerSecond}
          isPlaying={isBgmPlaying}
          onPlayPause={() => setIsBgmPlaying((p) => !p)}
        />
      </div>

      {activeTransition && (
        <div className="mt-2">
          <TransitionSelector
            selectedType={activeTransition.type}
            duration={activeTransition.duration}
            onChange={handleTransitionChange}
          />
        </div>
      )}
    </div>
  )
}
