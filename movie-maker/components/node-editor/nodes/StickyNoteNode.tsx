'use client'

import { useCallback } from 'react'
import { type NodeProps } from '@xyflow/react'
import { StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StickyNoteNodeData } from '@/lib/types/node-editor'
import { emitNodeDataUpdate } from '../utils/emit-node-data'

type StickyNoteNodeProps = NodeProps & {
  data: StickyNoteNodeData
  selected: boolean
}

const COLOR_CLASSES: Record<StickyNoteNodeData['color'], { bg: string; border: string; text: string }> = {
  yellow: { bg: 'bg-yellow-900/30', border: 'border-yellow-600/50', text: 'text-yellow-200' },
  pink:   { bg: 'bg-pink-900/30',   border: 'border-pink-600/50',   text: 'text-pink-200' },
  blue:   { bg: 'bg-blue-900/30',   border: 'border-blue-600/50',   text: 'text-blue-200' },
}

export function StickyNoteNode({ data, selected, id }: StickyNoteNodeProps) {
  const colors = COLOR_CLASSES[data.color]

  const updateNodeData = useCallback(
    (updates: Partial<StickyNoteNodeData>) => {
      emitNodeDataUpdate<StickyNoteNodeData>(id, updates)
    },
    [id]
  )

  return (
    <div
      className={cn(
        'relative rounded-xl p-4 min-w-[200px] max-w-[300px] transition-all border',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-[#fce300]'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <StickyNote className={cn('w-4 h-4', colors.text)} />
        <div className="flex gap-1 ml-auto">
          {(['yellow', 'pink', 'blue'] as const).map((c) => (
            <button
              key={c}
              onClick={() => updateNodeData({ color: c })}
              aria-label={`色を${c}に変更`}
              className={cn(
                'w-3 h-3 rounded-full border',
                c === 'yellow' && 'bg-yellow-400',
                c === 'pink' && 'bg-pink-400',
                c === 'blue' && 'bg-blue-400',
                data.color === c && 'ring-2 ring-white ring-offset-1 ring-offset-black'
              )}
            />
          ))}
        </div>
      </div>

      <textarea
        value={data.text ?? ''}
        onChange={(e) => updateNodeData({ text: e.target.value })}
        placeholder="メモを入力..."
        rows={4}
        maxLength={500}
        className={cn(
          'w-full bg-transparent resize-none text-sm leading-relaxed',
          'focus:outline-none placeholder-gray-600',
          colors.text
        )}
      />
    </div>
  )
}
