'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

interface UseLazyVideoOptions {
  /** ビューポートに入る前にロードを開始するマージン (デフォルト: "200px") */
  rootMargin?: string;
  /** 表示割合の閾値 (デフォルト: 0) */
  threshold?: number;
}

interface UseLazyVideoReturn {
  /** video要素に付与するref */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 動画をロードするべきかどうか */
  shouldLoad: boolean;
  /** ビューポートに入ったかどうか */
  isIntersecting: boolean;
}

/**
 * Check if IntersectionObserver is available (SSR-safe)
 * This is computed once at module load time on the client
 */
function hasIntersectionObserver(): boolean {
  return typeof window !== 'undefined' && 'IntersectionObserver' in window;
}

/**
 * 動画の遅延読み込みを制御するカスタムフック
 *
 * ⚠️ 注意: このフックは .map() ループ内で直接使用できません。
 * 必ず分離したコンポーネント内で使用してください。
 *
 * @example
 * // ❌ NG: .map() 内で直接使用
 * {videos.map(v => {
 *   const { videoRef } = useLazyVideo(); // エラー！
 * })}
 *
 * // ✅ OK: 分離したコンポーネント内で使用
 * function VideoCard({ video }) {
 *   const { videoRef, shouldLoad } = useLazyVideo();
 *   return <video ref={videoRef} src={shouldLoad ? video.url : undefined} />;
 * }
 * {videos.map(v => <VideoCard key={v.id} video={v} />)}
 */
export function useLazyVideo(options: UseLazyVideoOptions = {}): UseLazyVideoReturn {
  const { rootMargin = '200px', threshold = 0 } = options;
  // React 19: RefObject<T | null> が推奨
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  // Compute initial shouldLoad state synchronously based on environment
  // This avoids calling setState in effect for SSR fallback
  const initialShouldLoad = useMemo(() => !hasIntersectionObserver(), []);
  const [shouldLoad, setShouldLoad] = useState(initialShouldLoad);

  useEffect(() => {
    // Skip if IntersectionObserver is not available (already handled by initial state)
    if (!hasIntersectionObserver()) {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // 一度ロード開始したら監視を終了
    if (shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(video);

    return () => observer.disconnect();
  }, [rootMargin, threshold, shouldLoad]);

  return { videoRef, shouldLoad, isIntersecting };
}
