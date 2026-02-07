'use client';

import { cn } from '@/lib/utils';
import { CameraWork, CameraSupportLevel } from '@/lib/camera/types';
import { getSupportBadgeInfo } from '@/lib/camera/provider-support';

interface CameraWorkCardProps {
  cameraWork: CameraWork;
  selected: boolean;
  onSelect: () => void;
  /** プロバイダー非対応の場合 true（グレーアウト表示） */
  disabled?: boolean;
  /** カメラワークのサポートレベル（指定時にバッジ表示） */
  supportLevel?: CameraSupportLevel;
}

export function CameraWorkCard({
  cameraWork,
  selected,
  onSelect,
  disabled = false,
  supportLevel,
}: CameraWorkCardProps) {
  // サポートバッジ情報を取得
  const badgeInfo = supportLevel ? getSupportBadgeInfo(supportLevel) : null;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={cn(
        'rounded-lg border-2 overflow-hidden transition-all text-left relative',
        disabled
          ? 'opacity-50 cursor-not-allowed border-[#333333]'
          : 'hover:border-[#505050] hover:shadow-md',
        selected && !disabled
          ? 'border-[#fce300] ring-2 ring-[#fce300]/30'
          : 'border-[#404040]'
      )}
    >
      {/* サポートレベルバッジ（右上） */}
      {badgeInfo && !disabled && (
        <div className="absolute top-1 right-1 z-10">
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
              badgeInfo.className
            )}
            title={badgeInfo.description}
          >
            {badgeInfo.label}
          </span>
        </div>
      )}

      {/* アイコン表示エリア */}
      <div
        className={cn(
          'aspect-video flex items-center justify-center bg-gradient-to-br',
          disabled ? 'from-[#1a1a1a] to-[#2a2a2a]' : 'from-[#2a2a2a] to-[#333333]'
        )}
      >
        <span className={cn('text-4xl', disabled ? 'opacity-40' : 'opacity-80 animate-pulse')}>
          {cameraWork.iconSymbol}
        </span>
      </div>

      {/* ラベル */}
      <div className="p-3 bg-[#2a2a2a]">
        <div className={cn('font-medium text-sm truncate text-white', disabled && 'text-gray-500')}>
          {cameraWork.label}
        </div>
        <div className={cn('text-xs mt-1 line-clamp-2', disabled ? 'text-gray-600' : 'text-gray-400')}>
          {cameraWork.description}
        </div>
        {disabled && (
          <div className="text-orange-400 text-xs mt-2 font-medium">⚠️ 非対応</div>
        )}
        {selected && !disabled && (
          <div className="text-[#fce300] text-xs mt-2 font-medium">● 選択中</div>
        )}
      </div>
    </button>
  );
}
