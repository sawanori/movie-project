'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { KlingModeNodeData } from '@/lib/types/node-editor';

interface KlingModeNodeProps extends NodeProps {
  data: KlingModeNodeData;
  selected: boolean;
}

const KLING_MODES: { value: 'std' | 'pro'; label: string; description: string }[] = [
  { value: 'std', label: 'Standard', description: '標準モード（高速・低コスト）' },
  { value: 'pro', label: 'Professional', description: 'プロモード（高品質）' },
];

export function KlingModeNode({ data, selected, id }: KlingModeNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<KlingModeNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="Kling モード"
      icon={<Zap className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      <div className="space-y-2">
        {KLING_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => updateNodeData({ mode: mode.value })}
            className={cn(
              'w-full p-3 rounded-lg text-left transition-all',
              data.mode === mode.value
                ? 'bg-[#fce300] text-black'
                : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
            )}
          >
            <span className="text-sm font-medium">{mode.label}</span>
            <span
              className={cn(
                'block text-xs mt-1',
                data.mode === mode.value ? 'text-black/70' : 'text-gray-500'
              )}
            >
              {mode.description}
            </span>
          </button>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="kling_mode"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
