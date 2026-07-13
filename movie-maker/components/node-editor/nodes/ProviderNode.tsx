'use client';

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Settings, Info, ChevronDown, ChevronRight } from 'lucide-react';
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
import { emitNodeDataUpdate } from '../utils/emit-node-data';
import { useProviderModels } from '../hooks/useProviderModels';

type SelectionPriority = 'quality' | 'speed' | 'cost';

// おまかせ (auto) の優先度選択肢
const PRIORITY_OPTIONS: { value: SelectionPriority; label: string; description: string }[] = [
  { value: 'quality', label: '品質優先', description: '最も品質の高いモデルを自動選択' },
  { value: 'speed', label: '速度優先', description: '最も速いモデルを自動選択' },
  { value: 'cost', label: 'コスト優先', description: '最もコストの低いモデルを自動選択' },
];

// 優先度に応じてモデルを並べ替える (先頭が現優先度での最有力候補)。
function sortModelsByPriority<
  T extends { quality_score: number; speed_score: number; cost_per_second: number },
>(models: T[], priority: SelectionPriority): T[] {
  return [...models].sort((a, b) => {
    if (priority === 'quality') return b.quality_score - a.quality_score;
    if (priority === 'speed') return b.speed_score - a.speed_score;
    return a.cost_per_second - b.cost_per_second;
  });
}

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
  const [isSeedanceAdvancedOpen, setIsSeedanceAdvancedOpen] = useState(false);

  // providerMode 未指定 (旧グラフ) は explicit 扱い。
  const isAuto = data.providerMode === 'auto';

  // おまかせ表示用のモデルメタデータ。取得失敗時は data=undefined のまま静的 UI を継続する。
  const { data: models } = useProviderModels();

  const updateNodeData = useCallback(
    (updates: Partial<ProviderNodeData>) => {
      emitNodeDataUpdate<ProviderNodeData>(id, updates);
    },
    [id]
  );

  const handleModeChange = useCallback(
    (mode: 'explicit' | 'auto') => {
      if (mode === 'auto') {
        // 初回 auto 化時に優先度デフォルト (quality) を確定させる
        updateNodeData({
          providerMode: 'auto',
          selectionPriority: data.selectionPriority ?? 'quality',
        });
      } else {
        updateNodeData({ providerMode: 'explicit' });
      }
    },
    [updateNodeData, data.selectionPriority]
  );

  const handlePriorityChange = useCallback(
    (priority: SelectionPriority) => {
      updateNodeData({ selectionPriority: priority });
    },
    [updateNodeData]
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
      {/* プロバイダー選択モード切替 (具体的に選ぶ / おまかせ) */}
      <div className="mb-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#1a1a1a] p-0.5">
          <button
            onClick={() => handleModeChange('explicit')}
            className={cn(
              'rounded-md py-1.5 text-xs font-medium transition-all',
              !isAuto ? 'bg-[#fce300] text-black' : 'text-gray-400 hover:text-white'
            )}
          >
            具体的に選ぶ
          </button>
          <button
            onClick={() => handleModeChange('auto')}
            className={cn(
              'rounded-md py-1.5 text-xs font-medium transition-all',
              isAuto ? 'bg-[#fce300] text-black' : 'text-gray-400 hover:text-white'
            )}
          >
            おまかせ
          </button>
        </div>
      </div>

      {/* プロバイダー選択 (具体的に選ぶ = explicit) */}
      {!isAuto && (
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
      )}

      {/* おまかせ (auto): 優先度選択 + モデル実力値表示 */}
      {isAuto && (
        <div className="mb-3">
          <label className={nodeLabelClassName}>おまかせ優先度</label>
          <div className="grid grid-cols-1 gap-1">
            {PRIORITY_OPTIONS.map((opt) => {
              const isSelected = (data.selectionPriority ?? 'quality') === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handlePriorityChange(opt.value)}
                  className={cn(
                    'flex flex-col items-start p-2 rounded-lg text-left transition-all',
                    isSelected
                      ? 'bg-[#fce300] text-black'
                      : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
                  )}
                >
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span
                    className={cn(
                      'text-[10px]',
                      isSelected ? 'text-black/70' : 'text-gray-500'
                    )}
                  >
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>

          {/* モデル実力値 (取得成功時のみ。失敗時は非表示にして優先度 UI を継続) */}
          {models && models.length > 0 && (
            <div className="mt-2 space-y-1 rounded-md border border-[#2a2a2a] bg-[#111] p-2">
              <p className="text-[10px] font-medium text-gray-400">対象モデル (実力値)</p>
              {sortModelsByPriority(models, data.selectionPriority ?? 'quality').map((m) => (
                <div
                  key={`${m.provider}-${m.name}`}
                  className="flex items-center justify-between text-[10px] text-gray-500"
                  title={`品質 ${m.quality_score} / 速度 ${m.speed_score} / $${m.cost_per_second}/秒 / 最大 ${m.max_duration}秒`}
                >
                  <span className="truncate text-gray-300">{m.name}</span>
                  <span className="ml-2 shrink-0 tabular-nums">
                    品質{m.quality_score} / ${m.cost_per_second}/秒 / {m.max_duration}秒
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* おまかせ対象は registry 登録モデルのみ (domoai は明示指定専用) */}
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
            おまかせは登録済みモデルから自動選択します。DomoAI は「具体的に選ぶ」でのみ利用できます。
          </p>
        </div>
      )}

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

      {/* 動画時間 (プロバイダー設定に応じて表示切替。auto では非表示) */}
      {!isAuto && (() => {
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

      {/* 速度モード (Seedance のみ、explicit 時のみ) */}
      {!isAuto && data.provider === 'seedance' && (
        <div className="mt-3">
          <label className={nodeLabelClassName}>速度モード</label>
          <select
            value={data.seedanceMode ?? 'pro'}
            onChange={(e) => updateNodeData({ seedanceMode: e.target.value as 'pro' | 'fast' })}
            className={nodeSelectClassName}
          >
            <option value="pro">Pro (高品質、$0.13/秒)</option>
            <option value="fast">Fast (高速、$0.10/秒)</option>
          </select>
        </div>
      )}

      {/* Seedance 詳細設定 (折りたたみ、explicit 時のみ) */}
      {!isAuto && data.provider === 'seedance' && (
        <div className="mt-3 border-t border-[#2a2a2a] pt-3">
          <button
            onClick={() => setIsSeedanceAdvancedOpen((o) => !o)}
            className="flex items-center gap-2 text-[10px] text-gray-400 hover:text-white"
          >
            {isSeedanceAdvancedOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Seedance 詳細設定
            {data.seedanceResolution === '1080p' && (
              <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-300 rounded border border-yellow-500/40">
                ⚠ 1080p (VIP)
              </span>
            )}
          </button>

          {isSeedanceAdvancedOpen && (
            <div className="mt-2 space-y-3 p-2 bg-[#1a1a1a] rounded">
              {/* BGM 自動生成 */}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.seedanceGenerateAudio ?? false}
                  onChange={(e) =>
                    updateNodeData({ seedanceGenerateAudio: e.target.checked })
                  }
                />
                BGM 自動生成 (Seedance による音声生成)
              </label>

              {/* シード値 */}
              <div>
                <label className={nodeLabelClassName}>シード値 (任意、再現性)</label>
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  value={data.seedanceSeed ?? ''}
                  placeholder="未指定=ランダム"
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    updateNodeData({ seedanceSeed: v });
                  }}
                  className={nodeSelectClassName}
                />
              </div>

              {/* 解像度 */}
              <div>
                <label className={nodeLabelClassName}>解像度</label>
                <select
                  value={data.seedanceResolution ?? '720p'}
                  onChange={(e) =>
                    updateNodeData({
                      seedanceResolution: e.target.value as '480p' | '720p' | '1080p',
                    })
                  }
                  className={nodeSelectClassName}
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p (推奨)</option>
                  <option value="1080p">1080p (VIP プラン必須)</option>
                </select>
                {(data.seedanceResolution === '1080p') && (
                  <div className="mt-1 rounded px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                    1080p は Seedance VIP プラン契約が必要です。非 VIP 環境ではリクエストが拒否されます。
                  </div>
                )}
              </div>

              {/* カメラ固定 */}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.seedanceCameraFixed ?? false}
                  onChange={(e) =>
                    updateNodeData({ seedanceCameraFixed: e.target.checked })
                  }
                />
                カメラ固定 (商品撮影/静物向け)
              </label>
            </div>
          )}
        </div>
      )}

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

      {/* Seedance Omni Reference 入力ハンドル (seedance のみ表示) */}
      {data.provider === 'seedance' && (
        <Handle
          type="target"
          position={Position.Left}
          id={HANDLE_IDS.OMNI_REFERENCE_INPUT}
          className={inputHandleClassName}
          style={{ top: '95%' }}
          title="Omni Reference (Seedance 専用)"
        />
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
