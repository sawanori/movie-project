"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { RangeSlider } from "@/components/ui/range-slider";
import { Play, Pause, RefreshCw } from "lucide-react";
import type { StoryboardScene } from "@/lib/api/client";

// 起承転結のラベルと色
const ACT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  introduction: { label: "起", color: "text-blue-400", bgColor: "bg-blue-500/20 border-blue-500/30" },
  development: { label: "承", color: "text-green-400", bgColor: "bg-green-500/20 border-green-500/30" },
  turn: { label: "転", color: "text-yellow-400", bgColor: "bg-yellow-500/20 border-yellow-500/30" },
  conclusion: { label: "結", color: "text-red-400", bgColor: "bg-red-500/20 border-red-500/30" },
};

interface SceneTrimCardProps {
  scene: StoryboardScene;
  duration: number;
  trimRange: [number, number];
  onTrimChange: (range: [number, number]) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  disabled?: boolean;
  /** キャッシュバスター付きURL取得関数 */
  getVideoCacheBustedUrl?: (url: string) => string;
}

export function SceneTrimCard({
  scene,
  duration,
  trimRange,
  onTrimChange,
  onRegenerate,
  isRegenerating = false,
  disabled = false,
  getVideoCacheBustedUrl,
}: SceneTrimCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const animationRef = useRef<number | null>(null);

  const actConfig = ACT_CONFIG[scene.act] || { label: "?", color: "text-zinc-400", bgColor: "bg-zinc-500/20" };
  const usedDuration = trimRange[1] - trimRange[0];
  const videoUrl = scene.video_url
    ? (getVideoCacheBustedUrl ? getVideoCacheBustedUrl(scene.video_url) : scene.video_url)
    : null;

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // スライダー上のホバー位置に動画をシーク
  const handleHoverTime = useCallback((time: number) => {
    if (!videoRef.current || disabled) return;

    // 再生中の場合は一時停止
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsPreviewMode(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }

    setIsHovering(true);
    videoRef.current.currentTime = time;
  }, [isPlaying, disabled]);

  // ホバー終了時
  const handleHoverEnd = useCallback(() => {
    setIsHovering(false);
    // 開始位置に戻す
    if (videoRef.current) {
      videoRef.current.currentTime = trimRange[0];
    }
  }, [trimRange]);

  // プレビュー再生（トリム範囲内のみ）
  const handlePreview = useCallback(() => {
    if (!videoRef.current || disabled) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsPreviewMode(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    // 開始位置にシーク
    videoRef.current.currentTime = trimRange[0];
    videoRef.current.play();
    setIsPlaying(true);
    setIsPreviewMode(true);

    // 終了位置で停止するためのチェック
    const checkTime = () => {
      if (!videoRef.current) return;

      if (videoRef.current.currentTime >= trimRange[1]) {
        videoRef.current.pause();
        setIsPlaying(false);
        setIsPreviewMode(false);
        animationRef.current = null;
        return;
      }

      animationRef.current = requestAnimationFrame(checkTime);
    };

    animationRef.current = requestAnimationFrame(checkTime);
  }, [isPlaying, trimRange, disabled]);

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setIsPreviewMode(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  // 動画がない場合
  if (!videoUrl) {
    return (
      <div className={`rounded-xl p-3 border ${actConfig.bgColor}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-lg font-bold ${actConfig.color}`}>{actConfig.label}</span>
          <span className="text-zinc-400 text-sm">Scene {scene.display_order}</span>
        </div>
        <div className="aspect-[9/16] bg-zinc-900 rounded-lg flex items-center justify-center">
          <span className="text-zinc-500 text-sm">動画なし</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-3 border ${actConfig.bgColor} ${disabled ? "opacity-50" : ""}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${actConfig.color}`}>{actConfig.label}</span>
          <span className="text-zinc-400 text-sm">Scene {scene.display_order}</span>
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isRegenerating || disabled}
            className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="再生成"
          >
            <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* 動画プレビュー（9:16アスペクト比） */}
      <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-zinc-900 mb-3">
        <video
          ref={videoRef}
          src={videoUrl}
          poster={scene.scene_image_url || undefined}
          preload="metadata"
          className="w-full h-full object-contain"
          muted
          playsInline
          onEnded={handleVideoEnded}
        />
        <button
          onClick={handlePreview}
          disabled={disabled}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <Pause className="h-8 w-8 text-white drop-shadow-lg" />
          ) : (
            <Play className="h-8 w-8 text-white drop-shadow-lg" />
          )}
        </button>

        {/* ステータスバッジ */}
        {isPreviewMode && (
          <div className="absolute bottom-2 left-2 right-2 bg-blue-500 text-white text-xs text-center rounded py-0.5">
            プレビュー中
          </div>
        )}
        {isHovering && !isPreviewMode && (
          <div className="absolute bottom-2 left-2 right-2 bg-yellow-500 text-black text-xs text-center rounded py-0.5">
            シーク中
          </div>
        )}
        {isRegenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-white text-sm flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              再生成中...
            </div>
          </div>
        )}
      </div>

      {/* トリムスライダー */}
      <div className="space-y-2">
        <RangeSlider
          min={0}
          max={duration}
          step={0.1}
          minRange={0.5}
          value={trimRange}
          onChange={onTrimChange}
          formatLabel={(v) => `${v.toFixed(1)}s`}
          onHoverTime={handleHoverTime}
          onHoverEnd={handleHoverEnd}
          disabled={disabled}
        />
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">
            {trimRange[0].toFixed(1)}s
          </span>
          <span className={`font-medium ${actConfig.color}`}>
            使用: {usedDuration.toFixed(1)}秒
          </span>
          <span className="text-zinc-400">
            {trimRange[1].toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}
