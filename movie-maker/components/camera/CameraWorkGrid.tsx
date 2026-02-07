'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CameraWork, CameraCategory, VideoProvider } from '@/lib/camera/types';
import { CAMERA_CATEGORIES } from '@/lib/camera/presets';
import {
  getCameraWorksByCategory,
  isCameraWorkSupported,
} from '@/lib/camera/camera-works';
import { getCameraSupportLevel } from '@/lib/camera/provider-support';
import { CameraWorkCard } from './CameraWorkCard';

interface CameraWorkGridProps {
  selected?: CameraWork;
  onSelect: (cameraWork: CameraWork) => void;
  /** 動画生成プロバイダー（指定時、非対応カメラワークをグレーアウト） */
  videoProvider?: VideoProvider;
}

export function CameraWorkGrid({
  selected,
  onSelect,
  videoProvider,
}: CameraWorkGridProps) {
  const [category, setCategory] = useState<CameraCategory | 'all'>('all');

  const filteredWorks = getCameraWorksByCategory(category);

  // プロバイダーに対応しているかをチェックするヘルパー
  const isSupported = (work: CameraWork) =>
    !videoProvider || isCameraWorkSupported(work, videoProvider);

  return (
    <div className="space-y-4">
      {/* プロンプトベース制御の説明 */}
      <div className="bg-[#00bdb6]/10 border border-[#00bdb6]/30 rounded-lg p-3 text-sm">
        <div className="flex items-center gap-2 text-[#00bdb6] font-medium">
          <span>💡</span>
          <span>カメラワークはプロンプト経由で制御されます</span>
        </div>
        <p className="text-gray-400 mt-1 text-xs">
          AIが自然言語でカメラの動きを解釈します。結果は入力画像やストーリーによって変わることがあります。
        </p>
      </div>

      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
            category === 'all'
              ? 'bg-[#fce300] text-[#212121]'
              : 'bg-[#333333] text-gray-300 hover:bg-[#404040]'
          )}
        >
          すべて ({getCameraWorksByCategory('all').length})
        </button>
        {CAMERA_CATEGORIES.map((cat) => {
          const count = getCameraWorksByCategory(cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                category === cat.id
                  ? 'bg-[#fce300] text-[#212121]'
                  : 'bg-[#333333] text-gray-300 hover:bg-[#404040]'
              )}
            >
              {cat.icon} {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto p-1">
        {filteredWorks.map((work) => (
          <CameraWorkCard
            key={work.id}
            cameraWork={work}
            selected={selected?.id === work.id}
            onSelect={() => onSelect(work)}
            disabled={!isSupported(work)}
            supportLevel={videoProvider ? getCameraSupportLevel(work.name, videoProvider) : undefined}
          />
        ))}
      </div>

      {/* 選択中の表示 */}
      {selected && (
        <div className="bg-[#fce300]/10 border border-[#fce300]/30 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{selected.iconSymbol}</span>
            <div>
              <div className="font-medium text-[#fce300]">{selected.label}</div>
              <div className="text-sm text-gray-300">{selected.description}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
