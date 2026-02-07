"use client";

import { useRef, useState, useCallback } from "react";
import { RangeSlider } from "@/components/ui/range-slider";
import { Play, Pause, X, ChevronUp, ChevronDown, Film, Upload } from "lucide-react";

interface SelectableItem {
  id: string;
  type: "scene" | "storyboard" | "uploaded";
  label: string;
  thumbnailUrl: string;
  videoUrl: string;
}

interface VideoTrimCardProps {
  item: SelectableItem;
  index: number;
  duration: number;
  trimRange: [number, number];
  onTrimChange: (range: [number, number]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function VideoTrimCard({
  item,
  index,
  duration,
  trimRange,
  onTrimChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  isFirst,
  isLast,
}: VideoTrimCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const animationRef = useRef<number | null>(null);

  const usedDuration = trimRange[1] - trimRange[0];

  // スライダー上のホバー位置に動画をシーク
  const handleHoverTime = useCallback((time: number) => {
    if (!videoRef.current) return;

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
  }, [isPlaying]);

  // ホバー終了時
  const handleHoverEnd = useCallback(() => {
    setIsHovering(false);
    // 開始位置に戻す
    if (videoRef.current) {
      videoRef.current.currentTime = trimRange[0];
    }
  }, [trimRange]);

  const handlePreview = useCallback(() => {
    if (!videoRef.current) return;

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
  }, [isPlaying, trimRange]);

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setIsPreviewMode(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  return (
    <div
      className={`rounded-xl p-4 ${
        item.type === "storyboard"
          ? "bg-purple-900/20 border border-purple-500/30"
          : item.type === "uploaded"
          ? "bg-green-900/20 border border-green-500/30"
          : "bg-zinc-800"
      }`}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg">{index + 1}</span>
          <div className="flex items-center gap-1">
            {item.type === "storyboard" && (
              <Film className="h-4 w-4 text-purple-400" />
            )}
            {item.type === "uploaded" && (
              <Upload className="h-4 w-4 text-green-400" />
            )}
            <span className="text-zinc-300 text-sm truncate max-w-[150px]">
              {item.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="上に移動"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="下に移動"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-zinc-400 hover:text-red-400"
            title="削除"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 動画プレビューとスライダー */}
      <div className="flex gap-4">
        {/* 動画サムネイル/プレビュー */}
        <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-900">
          <video
            ref={videoRef}
            src={item.videoUrl}
            poster={item.thumbnailUrl || undefined}
            preload="metadata"
            className="w-full h-full object-cover"
            muted
            playsInline
            onEnded={handleVideoEnded}
          />
          <button
            onClick={handlePreview}
            className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white" />
            )}
          </button>
          {isPreviewMode && (
            <div className="absolute bottom-1 left-1 right-1 bg-blue-500 text-white text-[10px] text-center rounded px-1">
              プレビュー中
            </div>
          )}
          {isHovering && !isPreviewMode && (
            <div className="absolute bottom-1 left-1 right-1 bg-yellow-500 text-black text-[10px] text-center rounded px-1">
              シーク中
            </div>
          )}
        </div>

        {/* スライダーと情報 */}
        <div className="flex-1 min-w-0">
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
          />
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-zinc-400">
              開始: {trimRange[0].toFixed(1)}s
            </span>
            <span className="text-blue-400 font-medium">
              使用: {usedDuration.toFixed(1)}秒
            </span>
            <span className="text-zinc-400">
              終了: {trimRange[1].toFixed(1)}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
