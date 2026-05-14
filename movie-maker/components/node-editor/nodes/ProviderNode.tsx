'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Settings } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { ProviderNodeData, VideoProvider } from '@/lib/types/node-editor';

interface ProviderNodeProps extends NodeProps {
  data: ProviderNodeData;
  selected: boolean;
}

const PROVIDERS: { value: VideoProvider; label: string; description: string }[] = [
  { value: 'runway', label: 'Runway', description: '高品質・Act-Two対応' },
  { value: 'piapi_kling', label: 'Kling', description: '要素合成・終了フレーム' },
  { value: 'veo', label: 'Veo', description: 'Google AI' },
  { value: 'domoai', label: 'DomoAI', description: 'アニメーション特化' },
  { value: 'hailuo', label: 'Hailuo', description: 'カメラワーク対応' },
  { value: 'seedance', label: 'Seedance 2.0', description: 'ByteDance製・高品質I2V/T2V' },
];

const ASPECT_RATIOS: { value: '9:16' | '16:9'; label: string }[] = [
  { value: '9:16', label: '縦型 (9:16)' },
  { value: '16:9', label: '横型 (16:9)' },
];

// プロバイダー別の動画時間選択肢。空配列 = duration 設定 UI を表示しない (固定/自動)。
const DURATION_OPTIONS: Record<VideoProvider, number[]> = {
  runway: [],          // 5秒固定
  veo: [],             // プロバイダーが自動決定 (6〜10秒)
  domoai: [],          // 固定
  hailuo: [],          // 6秒固定
  piapi_kling: [5, 10],
  seedance: [5, 10, 15],
};

export function ProviderNode({ data, selected, id }: ProviderNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<ProviderNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleProviderChange = useCallback(
    (provider: VideoProvider) => {
      // プロバイダー切替時に duration をデフォルト値にリセット
      // (前プロバイダーの選択肢が新プロバイダーに無効な値だと UI が崩れるため)
      const newDuration = DURATION_OPTIONS[provider].length > 0
        ? DURATION_OPTIONS[provider][0]
        : null;
      updateNodeData({ provider, duration: newDuration });

      // プロバイダー変更をグローバルに通知
      const providerEvent = new CustomEvent('providerChange', {
        detail: { provider },
      });
      window.dispatchEvent(providerEvent);
    },
    [updateNodeData]
  );

  const handleAspectRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData({
        aspectRatio: e.target.value as '9:16' | '16:9',
      });
    },
    [updateNodeData]
  );

  return (
    <BaseNode
      title="プロバイダー"
      icon={<Settings className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {/* プロバイダー選択 */}
      <div className="mb-3">
        <label className={nodeLabelClassName}>動画生成エンジン</label>
        <div className="grid grid-cols-1 gap-1">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.value}
              onClick={() => handleProviderChange(provider.value)}
              className={cn(
                'flex flex-col items-start p-2 rounded-lg text-left transition-all',
                data.provider === provider.value
                  ? 'bg-[#fce300] text-black'
                  : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
              )}
            >
              <span className="text-xs font-medium">{provider.label}</span>
              <span
                className={cn(
                  'text-[10px]',
                  data.provider === provider.value
                    ? 'text-black/70'
                    : 'text-gray-500'
                )}
              >
                {provider.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* アスペクト比 */}
      <div className="mb-3">
        <label className={nodeLabelClassName}>アスペクト比</label>
        <select
          value={data.aspectRatio}
          onChange={handleAspectRatioChange}
          className={nodeSelectClassName}
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio.value} value={ratio.value}>
              {ratio.label}
            </option>
          ))}
        </select>
      </div>

      {/* 動画時間 (対応プロバイダーのみ表示) */}
      {DURATION_OPTIONS[data.provider].length > 0 && (
        <div>
          <label className={nodeLabelClassName}>動画時間</label>
          <select
            value={data.duration ?? DURATION_OPTIONS[data.provider][0]}
            onChange={(e) => updateNodeData({ duration: Number(e.target.value) })}
            className={nodeSelectClassName}
          >
            {DURATION_OPTIONS[data.provider].map((sec) => (
              <option key={sec} value={sec}>
                {sec} 秒
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 出力ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        id="config"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
