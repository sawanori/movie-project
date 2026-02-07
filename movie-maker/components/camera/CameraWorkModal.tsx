'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CameraPreset, CameraWork, CameraWorkSelection, VideoProvider } from '@/lib/camera/types';
import { CAMERA_PRESETS, CAMERA_CATEGORIES } from '@/lib/camera/presets';
import { getCameraWorksByCategory, isCameraWorkSupported } from '@/lib/camera/camera-works';
import { getCameraSupportLevel, getSupportBadgeInfo } from '@/lib/camera/provider-support';

interface CameraWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: CameraWorkSelection;
  onConfirm: (value: CameraWorkSelection) => void;
  /** 動画生成プロバイダー（VEO非対応カメラワークのグレーアウト表示用） */
  videoProvider?: VideoProvider;
}

export function CameraWorkModal({ isOpen, onClose, value, onConfirm, videoProvider }: CameraWorkModalProps) {
  const [localValue, setLocalValue] = useState<CameraWorkSelection>(value);
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');
  const [category, setCategory] = useState<string>('all');

  // 値が変更されたらローカル状態を更新
  useEffect(() => {
    setLocalValue(value);
    setShowCustom(value.preset === 'custom');
  }, [value]);

  // ESCキーで閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handlePresetSelect = useCallback((preset: CameraPreset) => {
    if (preset === 'custom') {
      setShowCustom(true);
      return;
    }
    const config = CAMERA_PRESETS.find((p) => p.id === preset);
    setLocalValue({
      preset,
      customCameraWork: undefined,
      promptText: config?.promptText || '',
    });
    setShowCustom(false);
  }, []);

  const handleCustomSelect = useCallback((cameraWork: CameraWork) => {
    setLocalValue({
      preset: 'custom',
      customCameraWork: cameraWork,
      promptText: cameraWork.promptText,
    });
  }, []);

  const handleConfirm = () => {
    onConfirm(localValue);
    onClose();
  };

  const handleBackToPresets = () => {
    setShowCustom(false);
  };

  if (!isOpen) return null;

  const filteredWorks = getCameraWorksByCategory(category);

  // プロバイダーに対応しているかをチェックするヘルパー
  const isSupported = (work: CameraWork) =>
    !videoProvider || isCameraWorkSupported(work, videoProvider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* モーダル本体 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">🎬</span>
            <span>カメラワーク設定</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {!showCustom ? (
            /* プリセット選択 */
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                シーンに合わせてカメラの動きを選択してください
              </p>
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.id)}
                  className={cn(
                    'w-full p-4 rounded-xl border-2 text-left transition-all',
                    'hover:border-blue-300 hover:bg-blue-50',
                    localValue.preset === preset.id && preset.id !== 'custom'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{preset.icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-lg">{preset.label}</div>
                      <div className="text-sm text-gray-500">{preset.description}</div>
                    </div>
                    {localValue.preset === preset.id && preset.id !== 'custom' && (
                      <span className="text-blue-500 text-xl">✓</span>
                    )}
                    {preset.id === 'custom' && (
                      <span className="text-gray-400 text-xl">▶</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* カスタム選択 */
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleBackToPresets}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <span>←</span>
                <span>プリセットに戻る</span>
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-blue-800 font-medium">
                  <span>💡</span>
                  <span>122種類のカメラワークから選択</span>
                </div>
                <p className="text-blue-700 mt-1 text-xs">
                  カテゴリでフィルタリングして、お好みのカメラワークを選んでください。
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
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      {cat.icon} {cat.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* カメラワークグリッド */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto p-1">
                {filteredWorks.map((work) => {
                  const disabled = !isSupported(work);
                  const supportLevel = videoProvider ? getCameraSupportLevel(work.name, videoProvider) : undefined;
                  const badgeInfo = supportLevel ? getSupportBadgeInfo(supportLevel) : null;
                  return (
                    <button
                      key={work.id}
                      type="button"
                      onClick={disabled ? undefined : () => handleCustomSelect(work)}
                      disabled={disabled}
                      className={cn(
                        'rounded-lg border-2 overflow-hidden transition-all text-left relative',
                        disabled
                          ? 'opacity-50 cursor-not-allowed border-gray-200'
                          : 'hover:border-blue-300 hover:shadow-md',
                        localValue.customCameraWork?.id === work.id && !disabled
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : 'border-gray-200'
                      )}
                    >
                      {/* サポートレベルバッジ */}
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
                      <div className={cn(
                        'aspect-video flex items-center justify-center bg-gradient-to-br',
                        disabled ? 'from-gray-100 to-gray-200' : 'from-gray-50 to-gray-100'
                      )}>
                        <span className={cn('text-3xl', disabled ? 'opacity-40' : 'opacity-80')}>
                          {work.iconSymbol}
                        </span>
                      </div>
                      <div className="p-2 bg-white">
                        <div className={cn('font-medium text-sm truncate', disabled && 'text-gray-400')}>
                          {work.label}
                        </div>
                        <div className={cn('text-xs mt-0.5 line-clamp-1', disabled ? 'text-gray-400' : 'text-gray-500')}>
                          {work.description}
                        </div>
                        {disabled && (
                          <div className="text-orange-500 text-xs mt-1 font-medium">VEO非対応</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 選択中の表示 */}
              {localValue.customCameraWork && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{localValue.customCameraWork.iconSymbol}</span>
                    <div>
                      <div className="font-medium text-blue-900">{localValue.customCameraWork.label}</div>
                      <div className="text-sm text-blue-700">{localValue.customCameraWork.description}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {showCustom && localValue.customCameraWork ? (
              <span className="flex items-center gap-2">
                <span className="font-medium">選択中:</span>
                <span>{localValue.customCameraWork.iconSymbol}</span>
                <span>{localValue.customCameraWork.label}</span>
              </span>
            ) : !showCustom && localValue.preset !== 'custom' ? (
              <span className="flex items-center gap-2">
                <span className="font-medium">選択中:</span>
                <span>{CAMERA_PRESETS.find(p => p.id === localValue.preset)?.icon}</span>
                <span>{CAMERA_PRESETS.find(p => p.id === localValue.preset)?.label}</span>
              </span>
            ) : (
              <span className="text-gray-400">カメラワークを選択してください</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={showCustom && !localValue.customCameraWork}
              className={cn(
                'px-6 py-2 rounded-lg font-medium transition-colors',
                showCustom && !localValue.customCameraWork
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              )}
            >
              適用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
