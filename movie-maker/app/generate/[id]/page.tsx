"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { videosApi } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";
import { ScreenshotButton } from "@/components/video/screenshot-button";
import { HLSPlayer } from "@/components/video/hls-player";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  ArrowLeft,
  Clock,
  RefreshCw,
  X,
  Check,
} from "lucide-react";

interface VideoStatus {
  id: string;
  status: string;
  progress: number;
  message: string;
  video_url: string | null;
  expires_at: string | null;
}

interface VideoDetail {
  id: string;
  status: string;
  progress: number;
  original_image_url: string;
  user_prompt: string;
  optimized_prompt: string | null;
  final_video_url: string | null;
  hls_master_url?: string | null;  // HLS adaptive streaming URL
  error_message: string | null;
  expires_at: string | null;
  created_at: string;
  film_grain: string | null;
  use_lut: boolean | null;
  camera_work: string | null;
}

export default function VideoDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const videoId = params.id as string;

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [screenshotMessage, setScreenshotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<'original' | 'hd' | '4k' | 'prores' | 'prores_hd' | 'prores_4k'>('original');
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState(0);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [isConvertingProRes, setIsConvertingProRes] = useState(false);
  const [proResConversionPhase, setProResConversionPhase] = useState<'idle' | 'upscaling' | 'converting'>('idle');
  const [upscaleForProResProgress, setUpscaleForProResProgress] = useState(0);
  // 60fps補間用
  const [enable60fps, setEnable60fps] = useState(false);
  const [is60fpsProcessing, setIs60fpsProcessing] = useState(false);
  const [fps60Progress, setFps60Progress] = useState(0);

  const handleDownload = async () => {
    if (!video || !video.final_video_url) return;

    setUpscaleError(null);

    // For original resolution, just download directly (with optional 60fps)
    if (selectedResolution === 'original') {
      setDownloading(true);
      try {
        let finalUrl = video.final_video_url;

        // 60fps補間が有効な場合
        if (enable60fps) {
          setIs60fpsProcessing(true);
          setFps60Progress(0);

          // 60fps補間を開始
          await videosApi.interpolate60fps(videoId, 'apo-8');

          // ポーリングで完了を待つ
          let interpolatedUrl: string | null = null;
          const maxAttempts = 120; // 最大20分
          let attempts = 0;

          while (!interpolatedUrl && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 10000));
            attempts++;

            const status = await videosApi.getInterpolate60fpsStatus(videoId);
            setFps60Progress(status.progress || Math.min(attempts * 2, 90));

            if (status.status === 'completed' && status.interpolated_video_url) {
              interpolatedUrl = status.interpolated_video_url;
            } else if (status.status === 'failed') {
              throw new Error(status.message || '60fps補間に失敗しました');
            }
          }

          if (!interpolatedUrl) {
            throw new Error('60fps補間がタイムアウトしました');
          }

          finalUrl = interpolatedUrl;
          setIs60fpsProcessing(false);
        }

        const response = await fetch(finalUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        const fpsLabel = enable60fps ? '_60fps' : '';
        a.download = `video${fpsLabel}_${timestamp}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (err) {
        console.error("Download failed:", err);
        setUpscaleError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
      } finally {
        setDownloading(false);
        setIs60fpsProcessing(false);
      }
      return;
    }

    // For ProRes, convert on-the-fly and download
    if (selectedResolution === 'prores') {
      setIsConvertingProRes(true);
      try {
        const blob = await videosApi.downloadAsProRes(video.final_video_url);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `video_prores_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (err) {
        console.error("ProRes conversion failed:", err);
        setUpscaleError(err instanceof Error ? err.message : "ProRes変換に失敗しました");
      } finally {
        setIsConvertingProRes(false);
      }
      return;
    }

    // For ProRes + Upscale (HD or 4K)
    if (selectedResolution === 'prores_hd' || selectedResolution === 'prores_4k') {
      const targetResolution = selectedResolution === 'prores_hd' ? 'hd' : '4k';

      // Phase 1: Upscale
      setProResConversionPhase('upscaling');
      setUpscaleForProResProgress(0);

      try {
        // Start upscale
        await videosApi.upscaleVideo(videoId, targetResolution);

        // Poll for upscale completion
        let upscaledUrl: string | null = null;
        const maxAttempts = 100; // 5 minutes max
        let attempts = 0;

        while (!upscaledUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          attempts++;

          const status = await videosApi.getVideoUpscaleStatus(videoId);
          setUpscaleForProResProgress(status.progress || Math.min(attempts * 3, 90));

          if (status.status === 'completed' && status.upscaled_video_url) {
            upscaledUrl = status.upscaled_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || 'アップスケールに失敗しました');
          }
        }

        if (!upscaledUrl) {
          throw new Error('アップスケールがタイムアウトしました');
        }

        // Phase 2: ProRes conversion
        setProResConversionPhase('converting');

        const blob = await videosApi.downloadAsProRes(upscaledUrl);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `video_prores_${targetResolution}_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (err) {
        console.error("ProRes + Upscale failed:", err);
        setUpscaleError(err instanceof Error ? err.message : "処理に失敗しました");
      } finally {
        setProResConversionPhase('idle');
        setUpscaleForProResProgress(0);
      }
      return;
    }

    // For HD/4K, start upscale process (with optional 60fps interpolation)
    try {
      setIsUpscaling(true);
      setUpscaleProgress(0);

      let sourceUrlForUpscale: string | undefined = undefined;

      // 60fps補間が有効な場合、まず補間を実行
      if (enable60fps) {
        setIs60fpsProcessing(true);
        setFps60Progress(0);

        // 60fps補間を開始
        await videosApi.interpolate60fps(videoId, 'apo-8');

        // ポーリングで完了を待つ
        let interpolatedUrl: string | null = null;
        const maxAttempts = 120; // 最大20分
        let attempts = 0;

        while (!interpolatedUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 10000));
          attempts++;

          const status = await videosApi.getInterpolate60fpsStatus(videoId);
          setFps60Progress(status.progress || Math.min(attempts * 2, 90));

          if (status.status === 'completed' && status.interpolated_video_url) {
            interpolatedUrl = status.interpolated_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || '60fps補間に失敗しました');
          }
        }

        if (!interpolatedUrl) {
          throw new Error('60fps補間がタイムアウトしました');
        }

        sourceUrlForUpscale = interpolatedUrl;
        setIs60fpsProcessing(false);
      }

      // Start upscale (60fps補間後のURLがあればそれを使用)
      const upscaleResponse = await videosApi.upscaleVideo(videoId, selectedResolution, sourceUrlForUpscale);

      // If already completed
      if (upscaleResponse.status === 'completed' && upscaleResponse.upscaled_video_url) {
        const link = document.createElement('a');
        link.href = upscaleResponse.upscaled_video_url;
        const fpsLabel = enable60fps ? '_60fps' : '';
        link.download = `video_${selectedResolution}${fpsLabel}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsUpscaling(false);
        setShowDownloadModal(false);
        return;
      }

      // Poll for upscale completion
      const pollUpscale = async () => {
        try {
          const status = await videosApi.getVideoUpscaleStatus(videoId);
          setUpscaleProgress(status.progress);

          if (status.status === 'completed' && status.upscaled_video_url) {
            // Download the upscaled video
            const link = document.createElement('a');
            link.href = status.upscaled_video_url;
            const fpsLabel = enable60fps ? '_60fps' : '';
            link.download = `video_${selectedResolution}${fpsLabel}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsUpscaling(false);
            setShowDownloadModal(false);
            return;
          }

          if (status.status === 'failed') {
            setUpscaleError(status.message || 'アップスケールに失敗しました');
            setIsUpscaling(false);
            return;
          }

          // Continue polling
          setTimeout(pollUpscale, 3000);
        } catch (error) {
          console.error("Upscale polling failed:", error);
          setTimeout(pollUpscale, 5000);
        }
      };

      pollUpscale();
    } catch (error) {
      console.error("Failed to start upscale:", error);
      setUpscaleError(error instanceof Error ? error.message : 'アップスケールの開始に失敗しました');
      setIsUpscaling(false);
      setIs60fpsProcessing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && videoId) {
      loadVideo();
    }
  }, [user, videoId]);

  // ポーリング
  useEffect(() => {
    if (!status || status.status === "completed" || status.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const newStatus = await videosApi.getStatus(videoId);

        if (newStatus.status === "completed" || newStatus.status === "failed") {
          // 完了したら詳細を先に取得してから両方のステートを更新
          // これにより、isCompleted=trueでfinal_video_url=nullという中間状態を防ぐ
          const detail = await videosApi.get(videoId);
          setVideo(detail);
          setStatus(newStatus);
        } else {
          setStatus(newStatus);
        }
      } catch (err) {
        console.error("Failed to poll status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, videoId]);

  const loadVideo = async () => {
    try {
      const [detail, statusRes] = await Promise.all([
        videosApi.get(videoId),
        videosApi.getStatus(videoId),
      ]);
      console.log("[VideoDetail] Loaded video:", {
        id: detail.id,
        status: detail.status,
        final_video_url: detail.final_video_url,
      });
      console.log("[VideoDetail] Status:", statusRes);
      setVideo(detail);
      setStatus(statusRes);
    } catch (err: unknown) {
      console.error("[VideoDetail] Load error:", err);
      const message = err instanceof Error ? err.message : "動画の取得に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <div className="mx-auto max-w-4xl px-4 py-24 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
            {error || "動画が見つかりません"}
          </h1>
          <Link href="/dashboard" className="mt-4 inline-block">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              ダッシュボードに戻る
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isProcessing = status?.status === "pending" || status?.status === "processing";
  const isCompleted = status?.status === "completed";
  const isFailed = status?.status === "failed";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </button>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            ダッシュボード
          </Link>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Video Preview */}
          <div className="space-y-4">
            <div className="aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900">
              {isCompleted && video.final_video_url ? (
                <HLSPlayer
                  hlsUrl={video.hls_master_url}
                  fallbackUrl={video.final_video_url}
                  poster={video.original_image_url}
                  preload="auto"
                  controls
                  autoPlay
                  muted
                  loop
                  className="h-full w-full object-contain"
                />
              ) : (
              <div className="relative h-full w-full">
                <img
                  src={video.original_image_url}
                  alt=""
                  className="h-full w-full object-contain opacity-50"
                />
                {isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                    <p className="mt-4 text-lg font-medium text-white">
                      {status?.message}
                    </p>
                    <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all"
                        style={{ width: `${status?.progress || 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      {status?.progress}%
                    </p>
                  </div>
                )}
                {isFailed && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                    <XCircle className="h-12 w-12 text-red-500" />
                    <p className="mt-4 text-lg font-medium text-white">
                      生成に失敗しました
                    </p>
                    <p className="mt-2 text-sm text-white/80">
                      {video.error_message}
                    </p>
                  </div>
                )}
                {isCompleted && !video.final_video_url && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                    <p className="mt-4 text-lg font-medium text-white">
                      動画を読み込み中...
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Screenshot Button */}
            {isCompleted && video.final_video_url && (
              <div className="flex items-center gap-4">
                <ScreenshotButton
                  videoRef={videoRef}
                  sourceType="video_generation"
                  sourceId={videoId}
                  variant="default"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onScreenshotCreated={() => {
                    setScreenshotMessage({ type: 'success', text: 'スクリーンショットを保存しました' });
                    setTimeout(() => setScreenshotMessage(null), 3000);
                  }}
                  onError={(err) => {
                    setScreenshotMessage({ type: 'error', text: err });
                    setTimeout(() => setScreenshotMessage(null), 5000);
                  }}
                />
                {screenshotMessage && (
                  <span className={`text-sm ${screenshotMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {screenshotMessage.text}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            {/* Status */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                ステータス
              </h2>
              <div className="mt-4 flex items-center gap-3">
                {isProcessing && (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                      <RefreshCw className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">
                        生成中
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {status?.message}
                      </p>
                    </div>
                  </>
                )}
                {isCompleted && (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">
                        完了
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        動画の生成が完了しました
                      </p>
                    </div>
                  </>
                )}
                {isFailed && (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">
                        失敗
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {video.error_message || "エラーが発生しました"}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {isCompleted && video.final_video_url && (
                <div className="mt-6">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setSelectedResolution('original');
                      setUpscaleError(null);
                      setShowDownloadModal(true);
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    動画をダウンロード
                  </Button>
                  {video.expires_at && (
                    <p className="mt-2 text-center text-xs text-zinc-500">
                      <Clock className="mr-1 inline-block h-3 w-3" />
                      {formatDate(video.expires_at)} まで有効
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                詳細
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="font-medium text-zinc-700 dark:text-zinc-300">
                    プロンプト
                  </dt>
                  <dd className="mt-1 text-zinc-600 dark:text-zinc-400">
                    {video.user_prompt}
                  </dd>
                </div>
                {video.optimized_prompt && (
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">
                      最適化後のプロンプト
                    </dt>
                    <dd className="mt-1 text-zinc-600 dark:text-zinc-400">
                      {video.optimized_prompt}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="font-medium text-zinc-700 dark:text-zinc-300">
                    作成日時
                  </dt>
                  <dd className="mt-1 text-zinc-600 dark:text-zinc-400">
                    {formatDate(video.created_at)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 生成設定 */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                生成設定
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                {video.camera_work && (
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">
                      カメラワーク
                    </dt>
                    <dd className="mt-1 text-zinc-600 dark:text-zinc-400">
                      {video.camera_work}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </main>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                ダウンロード
              </h3>
              <button
                onClick={() => {
                  if (!isUpscaling && !downloading && !isConvertingProRes) {
                    setShowDownloadModal(false);
                  }
                }}
                disabled={isUpscaling || downloading || isConvertingProRes || proResConversionPhase !== 'idle'}
                className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isUpscaling && !downloading && !isConvertingProRes && proResConversionPhase === 'idle' ? (
              <>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  出力解像度を選択してください
                </p>

                <div className="space-y-3">
                  {/* Original */}
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                      selectedResolution === 'original'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="original"
                      checked={selectedResolution === 'original'}
                      onChange={() => setSelectedResolution('original')}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-zinc-900 dark:text-white">
                        オリジナル (720p)
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        そのままダウンロード（即時）
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selectedResolution === 'original'
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {selectedResolution === 'original' && (
                        <Check className="h-full w-full p-0.5 text-white" />
                      )}
                    </div>
                  </label>

                  {/* HD */}
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                      selectedResolution === 'hd'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="hd"
                      checked={selectedResolution === 'hd'}
                      onChange={() => setSelectedResolution('hd')}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-zinc-900 dark:text-white">
                        フルHD (1080p)
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        高解像度化（約1〜2分）
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selectedResolution === 'hd'
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {selectedResolution === 'hd' && (
                        <Check className="h-full w-full p-0.5 text-white" />
                      )}
                    </div>
                  </label>

                  {/* 4K */}
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                      selectedResolution === '4k'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="4k"
                      checked={selectedResolution === '4k'}
                      onChange={() => setSelectedResolution('4k')}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                        4K (2160p)
                        <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                          最高画質
                        </span>
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        超高解像度化（約2〜3分）
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selectedResolution === '4k'
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {selectedResolution === '4k' && (
                        <Check className="h-full w-full p-0.5 text-white" />
                      )}
                    </div>
                  </label>

                  {/* ProRes */}
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                      selectedResolution === 'prores'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="prores"
                      checked={selectedResolution === 'prores'}
                      onChange={() => setSelectedResolution('prores')}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                        ProRes 422 HQ
                        <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                          編集用
                        </span>
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        10bit・デバンド処理済み（約30秒〜1分）
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selectedResolution === 'prores'
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {selectedResolution === 'prores' && (
                        <Check className="h-full w-full p-0.5 text-white" />
                      )}
                    </div>
                  </label>

                  {/* ProRes (フルHD) */}
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                      selectedResolution === 'prores_hd'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="prores_hd"
                      checked={selectedResolution === 'prores_hd'}
                      onChange={() => setSelectedResolution('prores_hd')}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                        ProRes 422 HQ (フルHD)
                        <span className="rounded bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-xs text-white">
                          高解像度編集用
                        </span>
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        1080p・10bit・デバンド処理（約2〜3分）
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selectedResolution === 'prores_hd'
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {selectedResolution === 'prores_hd' && (
                        <Check className="h-full w-full p-0.5 text-white" />
                      )}
                    </div>
                  </label>

                  {/* ProRes (4K) */}
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                      selectedResolution === 'prores_4k'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="prores_4k"
                      checked={selectedResolution === 'prores_4k'}
                      onChange={() => setSelectedResolution('prores_4k')}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                        ProRes 422 HQ (4K)
                        <span className="rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 text-xs text-white">
                          最高品質編集用
                        </span>
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        2160p・10bit・デバンド処理（約3〜5分）
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selectedResolution === 'prores_4k'
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {selectedResolution === 'prores_4k' && (
                        <Check className="h-full w-full p-0.5 text-white" />
                      )}
                    </div>
                  </label>
                </div>

                {/* 60fps スムーズ化オプション */}
                <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enable60fps}
                      onChange={(e) => setEnable60fps(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white text-cyan-500 focus:ring-cyan-500 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                        60fps スムーズ化
                        <span className="rounded bg-gradient-to-r from-cyan-500 to-teal-500 px-1.5 py-0.5 text-xs text-white">
                          Topaz AI
                        </span>
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        AIフレーム補間で滑らかな動きに（追加で約2〜5分）
                      </div>
                    </div>
                  </label>
                </div>

                {upscaleError && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                    {upscaleError}
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDownloadModal(false)}
                    disabled={is60fpsProcessing}
                  >
                    キャンセル
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleDownload}
                    disabled={is60fpsProcessing}
                  >
                    {is60fpsProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        60fps変換中... {fps60Progress}%
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        ダウンロード
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
                <p className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
                  {is60fpsProcessing
                    ? '60fps変換中...'
                    : proResConversionPhase === 'upscaling'
                    ? 'アップスケール中...'
                    : proResConversionPhase === 'converting'
                    ? 'ProRes変換中...'
                    : isConvertingProRes
                    ? 'ProRes変換中...'
                    : downloading
                    ? 'ダウンロード中...'
                    : `${selectedResolution === 'hd' ? 'フルHD' : '4K'} にアップスケール中...`}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {proResConversionPhase === 'upscaling'
                    ? `ステップ 1/2: 高解像度化 (${upscaleForProResProgress}%)`
                    : proResConversionPhase === 'converting'
                    ? 'ステップ 2/2: ProRes変換中...'
                    : isConvertingProRes
                    ? 'しばらくお待ちください（約30秒〜1分）'
                    : 'しばらくお待ちください（約1〜2分）'}
                </p>
                {proResConversionPhase === 'upscaling' && (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                        style={{ width: `${upscaleForProResProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {upscaleProgress > 0 && !isConvertingProRes && proResConversionPhase === 'idle' && (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                        style={{ width: `${upscaleProgress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {upscaleProgress}%
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
