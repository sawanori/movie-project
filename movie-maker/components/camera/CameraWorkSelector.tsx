'use client';

import { useState } from 'react';
import {
  CameraPreset,
  CameraWork,
  CameraWorkSelection,
  VideoProvider,
} from '@/lib/camera/types';
import { CAMERA_PRESETS } from '@/lib/camera/presets';
import { CameraPresetCard } from './CameraPresetCard';
import { CameraWorkGrid } from './CameraWorkGrid';

interface CameraWorkSelectorProps {
  value: CameraWorkSelection;
  onChange: (value: CameraWorkSelection) => void;
  /** 動画生成プロバイダー（VEO非対応カメラワークのグレーアウト表示用） */
  videoProvider?: VideoProvider;
}

export function CameraWorkSelector({
  value,
  onChange,
  videoProvider,
}: CameraWorkSelectorProps) {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');

  const handlePresetSelect = (preset: CameraPreset) => {
    if (preset === 'custom') {
      setShowCustom(true);
      // カスタムを選択しても、実際のカメラワークが選ばれるまではプロンプトは空
      onChange({
        preset: 'custom',
        customCameraWork: value.customCameraWork,
        promptText: value.customCameraWork?.promptText || '',
      });
      return;
    }

    const config = CAMERA_PRESETS.find((p) => p.id === preset);
    onChange({
      preset,
      customCameraWork: undefined,
      promptText: config?.promptText || '',
    });
    setShowCustom(false);
  };

  const handleCustomSelect = (cameraWork: CameraWork) => {
    onChange({
      preset: 'custom',
      customCameraWork: cameraWork,
      promptText: cameraWork.promptText,
    });
  };

  const handleBackToPresets = () => {
    setShowCustom(false);
    // プリセットに戻る場合、デフォルトでシンプルを選択
    const simplePreset = CAMERA_PRESETS.find((p) => p.id === 'simple');
    onChange({
      preset: 'simple',
      customCameraWork: undefined,
      promptText: simplePreset?.promptText || '',
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium flex items-center gap-2 text-white">
        <span>🎬</span>
        <span>カメラの動き</span>
      </h3>

      {!showCustom ? (
        <div className="space-y-2">
          {CAMERA_PRESETS.map((preset) => (
            <CameraPresetCard
              key={preset.id}
              preset={preset}
              selected={value.preset === preset.id && !showCustom}
              onSelect={() => handlePresetSelect(preset.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleBackToPresets}
            className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
          >
            <span>←</span>
            <span>プリセットに戻る</span>
          </button>

          <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#404040]">
            <h4 className="font-medium mb-3 flex items-center gap-2 text-white">
              <span>⚙️</span>
              <span>カスタム - カメラワークを選ぶ</span>
            </h4>
            <CameraWorkGrid
              selected={value.customCameraWork}
              onSelect={handleCustomSelect}
              videoProvider={videoProvider}
            />
          </div>
        </div>
      )}
    </div>
  );
}
