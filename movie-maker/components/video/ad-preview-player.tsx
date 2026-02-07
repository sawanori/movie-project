"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack } from "lucide-react";
import { cn } from "@/lib/utils";
import { AspectRatio, getAspectRatioCSS } from "@/lib/types/video";

interface VideoItem {
  id: string;
  videoUrl: string;
  label: string;
  startTime: number;
  endTime: number;
}

interface AdPreviewPlayerProps {
  videos: VideoItem[];
  aspectRatio?: AspectRatio;
  onVideoChange?: (index: number) => void;
}

export function AdPreviewPlayer({ videos, aspectRatio = "9:16", onVideoChange }: AdPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // refで最新値を追跡（クロージャ問題回避）
  const currentIndexRef = useRef(currentIndex);
  const videosRef = useRef(videos);
  const isTransitioningRef = useRef(false);

  // refを常に最新に保つ
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  // Compute safe current index (clamp to valid range)
  const safeCurrentIndex = useMemo(() => {
    if (videos.length === 0) return 0;
    return Math.min(currentIndex, videos.length - 1);
  }, [currentIndex, videos.length]);

  const currentVideo = videos[safeCurrentIndex];

  // Sync internal index with safe index when videos change
  // Use microtask to avoid synchronous setState in effect
  useEffect(() => {
    if (currentIndex !== safeCurrentIndex) {
      queueMicrotask(() => {
        setCurrentIndex(safeCurrentIndex);
      });
    }
  }, [safeCurrentIndex, currentIndex]);

  // 動画が変わったら再生開始
  useEffect(() => {
    // トランジションフラグをリセット
    isTransitioningRef.current = false;

    if (videoRef.current && currentVideo) {
      // Set loading via callback to avoid synchronous setState in effect
      const video = videoRef.current;
      video.currentTime = currentVideo.startTime;

      // Use event handler instead of synchronous setState
      const handleLoadStart = () => setIsLoading(true);
      video.addEventListener('loadstart', handleLoadStart, { once: true });

      if (isPlaying) {
        video.play().catch(() => {
          setIsPlaying(false);
        });
      }
    }
    onVideoChange?.(safeCurrentIndex);
  }, [safeCurrentIndex, currentVideo?.videoUrl, currentVideo?.startTime, isPlaying, onVideoChange, currentVideo]);

  // 次の動画へ（refを使用して最新値を取得）
  const goToNextInternal = useCallback(() => {
    const vids = videosRef.current;
    if (vids.length === 0) return;

    setCurrentIndex(prev => {
      const nextIndex = prev + 1;
      if (nextIndex < vids.length) {
        return nextIndex;
      } else {
        return 0; // ループ
      }
    });
  }, []);

  // 前の動画へ
  const goToPrev = useCallback(() => {
    const vids = videosRef.current;
    if (vids.length === 0) return;

    setCurrentIndex(prev => {
      if (prev > 0) {
        return prev - 1;
      } else {
        return vids.length - 1; // 最後へ
      }
    });
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // トリミング終了時間で次の動画へ
  const handleTimeUpdate = useCallback(() => {
    // 既にトランジション中なら何もしない
    if (isTransitioningRef.current) return;

    const video = videoRef.current;
    const idx = currentIndexRef.current;
    const vids = videosRef.current;

    if (video && vids[idx]) {
      const endTime = vids[idx].endTime;
      if (video.currentTime >= endTime) {
        isTransitioningRef.current = true;
        goToNextInternal();
      }
    }
  }, [goToNextInternal]);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      }
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handleLoadedData = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleEnded = useCallback(() => {
    // handleTimeUpdateで既に処理済みの場合はスキップ
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    goToNextInternal();
  }, [goToNextInternal]);

  // アスペクト比に応じたコンテナサイズ
  const containerStyle = useMemo(() => {
    switch (aspectRatio) {
      case "16:9":
        return "w-full max-w-[400px]";
      case "1:1":
        return "w-full max-w-[300px]";
      case "9:16":
      default:
        return "w-full max-w-[280px]";
    }
  }, [aspectRatio]);

  // 空状態
  if (videos.length === 0) {
    return (
      <div className={cn(containerStyle, "mx-auto")}>
        <div
          className="bg-zinc-800 rounded-xl flex items-center justify-center border-2 border-dashed border-zinc-700"
          style={{ aspectRatio: getAspectRatioCSS(aspectRatio) }}
        >
          <div className="text-center p-4">
            <Play className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">動画を選択すると</p>
            <p className="text-zinc-500 text-sm">プレビューが表示されます</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(containerStyle, "mx-auto")}>
      {/* 現在の動画ラベル */}
      <div className="mb-2 px-1">
        <p className="text-zinc-400 text-xs truncate">
          {currentIndex + 1}/{videos.length}: {currentVideo?.label}
        </p>
      </div>

      {/* 動画プレーヤー */}
      <div
        className="relative bg-black rounded-xl overflow-hidden"
        style={{ aspectRatio: getAspectRatioCSS(aspectRatio) }}
      >
        <video
          ref={videoRef}
          src={currentVideo?.videoUrl}
          preload="auto"
          className="w-full h-full object-contain"
          muted={isMuted}
          autoPlay
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedData={handleLoadedData}
        />

        {/* ローディングオーバーレイ */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* コントロールオーバーレイ */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          {/* 再生コントロール */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <button
              onClick={goToPrev}
              className="text-white/80 hover:text-white transition-colors"
              title="前の動画"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
            <button
              onClick={goToNextInternal}
              className="text-white/80 hover:text-white transition-colors"
              title="次の動画"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          {/* 再生位置インジケーター & ミュート */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5 flex-1 justify-center">
              {videos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToIndex(i)}
                  className={cn(
                    "w-6 h-6 rounded-full text-xs font-medium transition-all",
                    i === currentIndex
                      ? "bg-white text-black scale-110"
                      : "bg-white/30 text-white hover:bg-white/50"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={toggleMute}
              className="text-white/80 hover:text-white transition-colors ml-2"
              title={isMuted ? "ミュート解除" : "ミュート"}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
