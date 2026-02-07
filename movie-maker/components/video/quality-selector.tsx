'use client';

import { useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface QualitySelectorProps {
  hls: Hls | null;
  className?: string;
}

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  name: string;
}

/**
 * HLS 品質セレクター
 *
 * hls.js インスタンスを受け取り、品質レベルの選択UIを提供する。
 * -1 は自動品質選択を表す。
 */
export function QualitySelector({ hls, className }: QualitySelectorProps) {
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto

  const updateLevels = useCallback(() => {
    if (!hls) return;
    const hlsLevels = hls.levels.map((level, index) => ({
      index,
      height: level.height,
      bitrate: level.bitrate,
      name: `${level.height}p`,
    }));
    setLevels(hlsLevels);
  }, [hls]);

  const handleLevelSwitch = useCallback((_: unknown, data: { level: number }) => {
    setCurrentLevel(data.level);
  }, []);

  useEffect(() => {
    if (!hls) return;

    hls.on(Hls.Events.MANIFEST_PARSED, updateLevels);
    hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitch);

    // 全てのイベントリスナーを解除
    return () => {
      hls.off(Hls.Events.MANIFEST_PARSED, updateLevels);
      hls.off(Hls.Events.LEVEL_SWITCHED, handleLevelSwitch);
    };
  }, [hls, updateLevels, handleLevelSwitch]);

  const handleQualityChange = (level: number) => {
    if (hls) {
      // hls.js API: currentLevel is a writable property for quality switching
      // eslint-disable-next-line react-hooks/immutability
      hls.currentLevel = level;
      setCurrentLevel(level);
    }
  };

  if (levels.length === 0) return null;

  return (
    <select
      value={currentLevel}
      onChange={(e) => handleQualityChange(Number(e.target.value))}
      className={className || 'bg-black/50 text-white text-sm px-2 py-1 rounded'}
      aria-label="Video quality"
    >
      <option value={-1}>Auto</option>
      {levels.map((level) => (
        <option key={level.index} value={level.index}>
          {level.name}
        </option>
      ))}
    </select>
  );
}

/**
 * 現在の品質レベル名を取得
 */
export function getCurrentQualityName(
  hls: Hls | null,
  currentLevel: number
): string {
  if (!hls || currentLevel === -1) return 'Auto';

  const level = hls.levels[currentLevel];
  if (!level) return 'Auto';

  return `${level.height}p`;
}

/**
 * 品質レベルのビットレートをフォーマット
 */
export function formatBitrate(bitrate: number): string {
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(1)} Mbps`;
  }
  return `${(bitrate / 1000).toFixed(0)} kbps`;
}
