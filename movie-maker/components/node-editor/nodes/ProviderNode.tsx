'use client';

import { useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Settings, Info } from 'lucide-react';
import {
  BaseNode,
  inputHandleClassName,
  outputHandleClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import { HANDLE_IDS } from '@/lib/types/node-editor';
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

// Handle ごとに対応するプロバイダーを定義
const HANDLE_PROVIDER_COMPAT: Record<string, VideoProvider[]> = {
  [HANDLE_IDS.KLING_MODE_INPUT]: ['piapi_kling'],
  [HANDLE_IDS.KLING_ELEMENTS_INPUT]: ['piapi_kling'],
  [HANDLE_IDS.KLING_END_FRAME_INPUT]: ['piapi_kling'],
  [HANDLE_IDS.KLING_CAMERA_CONTROL_INPUT]: ['piapi_kling'],
  [HANDLE_IDS.ACT_TWO_INPUT]: ['runway'],
  [HANDLE_IDS.HAILUO_END_FRAME_INPUT]: ['hailuo'],
};

type DurationConfig =
  | { type: 'fixed'; value: number }
  | { type: 'preset'; presets: number[]; default: number }
  | { type: 'range'; min: number; max: number; step: number; default: number };

const DURATION_CONFIG: Record<VideoProvider, DurationConfig> = {
  runway:      { type: 'fixed',  value: 5 },
  veo:         { type: 'preset', presets: [4, 6, 8], default: 8 },
  domoai:      { type: 'fixed',  value: 5 },
  hailuo:      { type: 'fixed',  value: 6 },
  piapi_kling: { type: 'preset', presets: [5, 10], default: 5 },
  seedance:    { type: 'range',  min: 4, max: 15, step: 1, default: 5 },
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
      // プロバイダー切替時に duration を新プロバイダーのデフォルト値にリセット
      const config = DURATION_CONFIG[provider];
      const newDuration =
        config.type === 'fixed' ? null :
        config.type === 'preset' ? config.default :
        config.default;
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

  // 保存済グラフ再読込時に duration を現プロバイダーの有効範囲に正規化する
  useEffect(() => {
    const config = DURATION_CONFIG[data.provider];
    let normalized: number | null;
    if (config.type === 'fixed') {
      normalized = null;
    } else if (config.type === 'preset') {
      normalized = config.presets.includes(data.duration ?? 0) ? data.duration! : config.default;
    } else {
      normalized = Math.max(config.min, Math.min(config.max, data.duration ?? config.default));
    }
    if (normalized !== data.duration) {
      updateNodeData({ duration: normalized });
    }
  }, [data.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BaseNode
      title="プロバイダー"
      icon={<Settings className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      style={{ minHeight: '240px' }}
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
          value={data.aspectRatio ?? '9:16'}
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

      {/* 動画時間 (プロバイダー設定に応じて表示切替) */}
      {(() => {
        const config = DURATION_CONFIG[data.provider];
        if (config.type === 'fixed') {
          return (
            <div>
              <label className={nodeLabelClassName}>動画時間</label>
              <p className="text-xs text-gray-400">{config.value} 秒 (固定)</p>
            </div>
          );
        }
        if (config.type === 'preset') {
          return (
            <div>
              <label className={nodeLabelClassName}>動画時間</label>
              <select
                value={data.duration ?? config.default}
                onChange={(e) => updateNodeData({ duration: Number(e.target.value) })}
                className={nodeSelectClassName}
              >
                {config.presets.map((sec) => (
                  <option key={sec} value={sec}>{sec} 秒</option>
                ))}
              </select>
            </div>
          );
        }
        // range type
        return (
          <div>
            <label className={nodeLabelClassName}>動画時間</label>
            <input
              type="number"
              min={config.min}
              max={config.max}
              step={config.step}
              value={data.duration ?? config.default}
              onChange={(e) => {
                const v = e.target.value === '' ? config.default : Number(e.target.value);
                updateNodeData({ duration: v });
              }}
              className={nodeSelectClassName}
            />
            <p className="text-[10px] text-gray-500 mt-1">{config.min}-{config.max} 秒</p>
          </div>
        );
      })()}

      {/* 凡例: 左ハンドル接続説明 */}
      <div className="mt-3 flex gap-1.5 rounded-md border border-[#2a2a2a] bg-[#111] p-2">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-gray-500" />
        <p className="text-[10px] leading-relaxed text-gray-500">
          左ハンドルに繋いだ設定のみが反映されます。未接続の場合はグラフ全体から自動採用されますが、明示的な接続を推奨します。
        </p>
      </div>

      {/* 入力ハンドル (Kling/Runway/Hailuo 設定ノード接続) */}
      {[
        { id: HANDLE_IDS.KLING_MODE_INPUT, label: 'Kling Mode', top: '10%' },
        { id: HANDLE_IDS.KLING_ELEMENTS_INPUT, label: 'Elements', top: '25%' },
        { id: HANDLE_IDS.KLING_END_FRAME_INPUT, label: 'End Frame', top: '40%' },
        { id: HANDLE_IDS.KLING_CAMERA_CONTROL_INPUT, label: 'Camera', top: '55%' },
        { id: HANDLE_IDS.ACT_TWO_INPUT, label: 'Act-Two', top: '70%' },
        { id: HANDLE_IDS.HAILUO_END_FRAME_INPUT, label: 'Hailuo EF', top: '85%' },
      ].map(({ id, label, top }) => {
        const isCompat = HANDLE_PROVIDER_COMPAT[id]?.includes(data.provider) ?? true;
        return (
          <Handle
            key={id}
            type="target"
            position={Position.Left}
            id={id}
            className={cn(
              inputHandleClassName,
              !isCompat && 'opacity-30 cursor-not-allowed'
            )}
            style={{ top }}
            title={
              !isCompat
                ? `このプロバイダーでは使用されません (${label})`
                : label
            }
          />
        );
      })}

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
