'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Film } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { FilmGrainNodeData } from '@/lib/types/node-editor';

interface FilmGrainNodeProps extends NodeProps {
  data: FilmGrainNodeData;
  selected: boolean;
}

type FilmGrainLevel = 'none' | 'light' | 'medium' | 'heavy';

const GRAIN_OPTIONS: { value: FilmGrainLevel; label: string; description: string }[] = [
  { value: 'none', label: 'なし', description: 'グレインなし' },
  { value: 'light', label: '軽め', description: '控えめなフィルム感' },
  { value: 'medium', label: '中程度', description: 'バランスの取れたグレイン' },
  { value: 'heavy', label: '強め', description: 'ヴィンテージ感のある強いグレイン' },
];

export function FilmGrainNode({ data, selected, id }: FilmGrainNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<FilmGrainNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="フィルムグレイン"
      icon={<Film className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      <div className="space-y-2">
        {GRAIN_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => updateNodeData({ grain: option.value })}
            className={cn(
              'w-full p-3 rounded-lg text-left transition-all',
              data.grain === option.value
                ? 'bg-[#fce300] text-black'
                : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
            )}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span
              className={cn(
                'block text-xs mt-1',
                data.grain === option.value ? 'text-black/70' : 'text-gray-500'
              )}
            >
              {option.description}
            </span>
          </button>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="film_grain"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
