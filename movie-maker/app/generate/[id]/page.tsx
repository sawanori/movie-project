"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { videosApi } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  ArrowLeft,
  Clock,
  RefreshCw,
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
  error_message: string | null;
  expires_at: string | null;
  created_at: string;
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
        setStatus(newStatus);

        if (newStatus.status === "completed" || newStatus.status === "failed") {
          // 完了したら詳細を再取得
          const detail = await videosApi.get(videoId);
          setVideo(detail);
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
      setVideo(detail);
      setStatus(statusRes);
    } catch (err: any) {
      setError(err.message || "動画の取得に失敗しました");
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
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          ダッシュボードに戻る
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Video Preview */}
          <div className="aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900">
            {isCompleted && video.final_video_url ? (
              <video
                src={video.final_video_url}
                controls
                autoPlay
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
                  <a
                    href={video.final_video_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="w-full">
                      <Download className="mr-2 h-4 w-4" />
                      動画をダウンロード
                    </Button>
                  </a>
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
          </div>
        </div>
      </main>
    </div>
  );
}
