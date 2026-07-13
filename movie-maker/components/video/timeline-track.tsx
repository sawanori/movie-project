'use client'

import { TimelineClipComponent } from './timeline-clip'
import type { TimelineClip, TimelineTransition } from '@/lib/hooks/use-timeline'

interface TimelineTrackProps {
  clips: TimelineClip[]
  transitions: TimelineTransition[]
  selectedClipId?: string
  onClipSelect: (id: string) => void
  onTransitionClick: (index: number) => void
  pixelsPerSecond?: number
}

const TRANSITION_LABEL: Record<TimelineTransition['type'], string> = {
  none: 'カット',
  crossfade: 'CF',
  fade_black: 'FB',
  fade_white: 'FW',
  wipe_left: 'WL',
}

export function TimelineTrack({
  clips,
  transitions,
  selectedClipId,
  onClipSelect,
  onTransitionClick,
  pixelsPerSecond = 50,
}: TimelineTrackProps) {
  return (
    <div className="flex items-center overflow-x-auto py-2">
      {clips.map((clip, index) => (
        <div key={clip.id} className="flex items-center shrink-0">
          <div
            data-clip-id={clip.id}
            style={{ width: `${clip.duration * pixelsPerSecond}px` }}
          >
            <TimelineClipComponent
              clip={clip}
              isSelected={selectedClipId === clip.id}
              onSelect={onClipSelect}
              width={clip.duration * pixelsPerSecond}
            />
          </div>

          {index < transitions.length && (
            <button
              data-transition={index}
              className="shrink-0 mx-1 px-1 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600"
              onClick={() => onTransitionClick(index)}
              title={transitions[index].type}
            >
              {TRANSITION_LABEL[transitions[index].type]}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
