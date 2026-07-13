'use client'

import type { TimelineClip } from '@/lib/hooks/use-timeline'

interface TimelineClipProps {
  clip: TimelineClip
  isSelected: boolean
  onSelect: (id: string) => void
  width: number
}

export function TimelineClipComponent({
  clip,
  isSelected,
  onSelect,
  width,
}: TimelineClipProps) {
  return (
    <div
      data-selected={isSelected}
      style={{ width: `${width}px` }}
      className={[
        'relative h-16 flex flex-col justify-between p-2 rounded border cursor-pointer select-none overflow-hidden shrink-0',
        isSelected
          ? 'border-blue-500 bg-blue-900/40'
          : 'border-gray-600 bg-gray-800 hover:bg-gray-700',
      ].join(' ')}
      onClick={() => onSelect(clip.id)}
    >
      {clip.thumbnailUrl && (
        <img
          src={clip.thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
      )}
      <span className="relative z-10 text-xs font-medium text-white truncate">
        {clip.label}
      </span>
      <span className="relative z-10 text-xs text-gray-300">
        {clip.duration.toFixed(1)}s
      </span>
    </div>
  )
}
