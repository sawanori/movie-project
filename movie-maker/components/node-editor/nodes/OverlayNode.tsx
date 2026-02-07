'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Type } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
  nodeInputClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import type { OverlayNodeData } from '@/lib/types/node-editor';

interface OverlayNodeProps extends NodeProps {
  data: OverlayNodeData;
  selected: boolean;
}

type OverlayPosition = 'top' | 'center' | 'bottom';

const POSITION_OPTIONS: { value: OverlayPosition; label: string }[] = [
  { value: 'top', label: '上部' },
  { value: 'center', label: '中央' },
  { value: 'bottom', label: '下部' },
];

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'sans-serif', label: 'ゴシック体' },
  { value: 'serif', label: '明朝体' },
  { value: 'monospace', label: '等幅フォント' },
];

const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: '#ffffff', label: '白' },
  { value: '#000000', label: '黒' },
  { value: '#fce300', label: 'イエロー' },
  { value: '#ff0000', label: 'レッド' },
  { value: '#00ff00', label: 'グリーン' },
  { value: '#0000ff', label: 'ブルー' },
];

export function OverlayNode({ data, selected, id }: OverlayNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<OverlayNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="テキストオーバーレイ"
      icon={<Type className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[260px]"
    >
      <div className="space-y-4">
        {/* テキスト入力 */}
        <div>
          <label className={nodeLabelClassName}>テキスト</label>
          <input
            type="text"
            value={data.text}
            onChange={(e) => updateNodeData({ text: e.target.value })}
            placeholder="オーバーレイテキスト"
            maxLength={100}
            className={nodeInputClassName}
          />
        </div>

        {/* 位置選択 */}
        <div>
          <label className={nodeLabelClassName}>位置</label>
          <select
            value={data.position}
            onChange={(e) =>
              updateNodeData({ position: e.target.value as OverlayPosition })
            }
            className={nodeSelectClassName}
          >
            {POSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* フォント選択 */}
        <div>
          <label className={nodeLabelClassName}>フォント</label>
          <select
            value={data.font}
            onChange={(e) => updateNodeData({ font: e.target.value })}
            className={nodeSelectClassName}
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 色選択 */}
        <div>
          <label className={nodeLabelClassName}>色</label>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateNodeData({ color: opt.value })}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  data.color === opt.value
                    ? 'border-[#fce300] scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: opt.value }}
                title={opt.label}
              />
            ))}
          </div>
        </div>

        {/* プレビュー */}
        {data.text && (
          <div className="p-3 rounded-lg bg-[#1a1a1a] border border-[#404040]">
            <div className="text-xs text-gray-500 mb-1">プレビュー:</div>
            <div
              style={{
                fontFamily: data.font,
                color: data.color,
              }}
              className="text-sm"
            >
              {data.text}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="overlay"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
