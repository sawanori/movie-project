'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Palette } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { LUTNodeData } from '@/lib/types/node-editor';

interface LUTNodeProps extends NodeProps {
  data: LUTNodeData;
  selected: boolean;
}

export function LUTNode({ data, selected, id }: LUTNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<LUTNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="カラーグレーディング"
      icon={<Palette className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[220px]"
    >
      <div className="space-y-4">
        {/* LUT有効化トグル */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-white">LUTを適用</span>
            <p className="text-xs text-gray-500">映画的な色調補正</p>
          </div>
          <button
            onClick={() => updateNodeData({ useLut: !data.useLut })}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              data.useLut ? 'bg-[#fce300]' : 'bg-[#404040]'
            )}
          >
            <span
              className={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                data.useLut ? 'translate-x-7' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* 説明 */}
        <div className="text-xs text-gray-500">
          {data.useLut ? (
            <p className="text-[#00bdb6]">LUTが適用されます</p>
          ) : (
            <p>オリジナルの色調を維持します</p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="lut"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
