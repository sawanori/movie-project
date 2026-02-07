'use client';

import { cn } from '@/lib/utils';
import { CameraPresetConfig } from '@/lib/camera/types';

interface CameraPresetCardProps {
  preset: CameraPresetConfig;
  selected: boolean;
  onSelect: () => void;
}

export function CameraPresetCard({ preset, selected, onSelect }: CameraPresetCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-all',
        'hover:border-[#505050] hover:bg-[#333333]',
        selected
          ? 'border-[#fce300] bg-[#fce300]/10'
          : 'border-[#404040] bg-[#2a2a2a]'
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{preset.icon}</span>
        <div className="flex-1">
          <div className="font-medium text-white">{preset.label}</div>
          <div className="text-sm text-gray-400">{preset.description}</div>
        </div>
        {selected && (
          <span className="text-[#fce300] text-lg">✓</span>
        )}
        {preset.id === 'custom' && !selected && (
          <span className="text-gray-500">▶</span>
        )}
      </div>
    </button>
  );
}
