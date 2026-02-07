'use client';

import { useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';

interface HLSPlayerProps {
  /** HLS マスタープレイリストURL */
  hlsUrl: string | null | undefined;
  /** フォールバック用の通常動画URL */
  fallbackUrl: string | null | undefined;
  /** ポスター画像 */
  poster?: string;
  /** 自動再生 */
  autoPlay?: boolean;
  /** ミュート */
  muted?: boolean;
  /** ループ再生 */
  loop?: boolean;
  /** className */
  className?: string;
  /** コントロール表示 */
  controls?: boolean;
  /** preload設定 */
  preload?: 'none' | 'metadata' | 'auto';
  /** 再生エラー時のコールバック */
  onError?: (error: Error) => void;
  /** 再生開始時のコールバック */
  onPlay?: () => void;
  /** 一時停止時のコールバック */
  onPause?: () => void;
  /** 再生終了時のコールバック */
  onEnded?: () => void;
}

export function HLSPlayer({
  hlsUrl,
  fallbackUrl,
  poster,
  autoPlay = false,
  muted = true,
  loop = false,
  className,
  controls = true,
  preload = 'metadata',
  onError,
  onPlay,
  onPause,
  onEnded,
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  // HLSアクティブ状態をrefで管理（再レンダリング不要）
  const isHLSActiveRef = useRef(false);

  // フォールバック処理
  const fallbackToMp4 = useCallback(() => {
    const video = videoRef.current;
    if (video && fallbackUrl) {
      video.src = fallbackUrl;
      isHLSActiveRef.current = false;
    }
  }, [fallbackUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // クリーンアップ関数
    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      isHLSActiveRef.current = false;
    };

    // HLS URLがない場合はフォールバック
    if (!hlsUrl) {
      cleanup();
      if (fallbackUrl) {
        video.src = fallbackUrl;
      }
      return cleanup;
    }

    // Safari/iOS はネイティブHLSサポート（優先）
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      cleanup();
      video.src = hlsUrl;
      isHLSActiveRef.current = true;
      return cleanup;
    }

    // hls.js サポートチェック
    if (Hls.isSupported()) {
      // 既存のインスタンスをクリーンアップ
      cleanup();

      const hls = new Hls({
        // 品質自動切替設定
        autoStartLoad: true,
        startLevel: -1, // 自動選択
        capLevelToPlayerSize: true, // プレイヤーサイズに合わせる
        // バッファ設定（短い動画用に最適化）
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        maxBufferSize: 30 * 1000 * 1000, // 30MB
        // エラーリカバリー
        enableWorker: true,
        lowLatencyMode: false,
        // フラグメント読み込み設定
        fragLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 3,
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        isHLSActiveRef.current = true;
        if (autoPlay) {
          video.play().catch((e) => {
            // 自動再生がブロックされた場合（ブラウザポリシー）
            console.warn('Autoplay was prevented:', e);
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data.type, data.details);

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // ネットワークエラー時はリトライ
              console.log('HLS network error, attempting recovery...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              // メディアエラー時はリカバリー
              console.log('HLS media error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              // 回復不能エラー時はフォールバック
              console.log('HLS unrecoverable error, falling back to MP4...');
              hls.destroy();
              hlsRef.current = null;
              fallbackToMp4();
              onError?.(new Error(`HLS error: ${data.type} - ${data.details}`));
              break;
          }
        }
      });

      hlsRef.current = hls;

      return cleanup;
    }

    // hls.js 非サポート時はフォールバック
    if (fallbackUrl) {
      video.src = fallbackUrl;
    }

    return cleanup;
  }, [hlsUrl, fallbackUrl, autoPlay, fallbackToMp4, onError]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      controls={controls}
      preload={preload}
      playsInline
      className={className}
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
    />
  );
}

/**
 * HLS インスタンスへのアクセスが必要な場合のフック
 */
export function useHLSInstance() {
  const hlsRef = useRef<Hls | null>(null);
  return hlsRef;
}

/**
 * HLS がサポートされているかチェック
 */
export function isHLSSupported(): boolean {
  if (typeof window === 'undefined') return false;

  // Safari/iOS のネイティブサポート
  const video = document.createElement('video');
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    return true;
  }

  // hls.js サポート
  return Hls.isSupported();
}
