"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { authApi, videosApi } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import { Plus, Video, Clock, CheckCircle, XCircle, Loader2, Trash2 } from "lucide-react";

interface VideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
}

interface Usage {
  plan_type: string;
  videos_used: number;
  videos_limit: number;
  videos_remaining: number;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [videosRes, usageRes] = await Promise.all([
        videosApi.list(1, 10),
        authApi.getUsage(),
      ]);
      setVideos(videosRes.videos);
      setUsage(usageRes);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, videoId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("この動画を削除しますか？")) {
      return;
    }

    try {
      await videosApi.delete(videoId);
      setVideos(videos.filter((v) => v.id !== videoId));
    } catch (error) {
      console.error("Failed to delete video:", error);
      alert("削除に失敗しました");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const planLabel = (plan: string) => {
    const labels: Record<string, string> = {
      free: "無料トライアル",
      starter: "Starter",
      pro: "Pro",
      business: "Business",
    };
    return labels[plan] || plan;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              ダッシュボード
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              ようこそ、{user.email}さん
            </p>
          </div>
          <Link href="/generate/story">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              動画を作成
            </Button>
          </Link>
        </div>

        {/* Usage Card */}
        {usage && (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  今月の使用状況
                </p>
                <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">
                  {usage.videos_used} / {usage.videos_limit}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  残り {usage.videos_remaining} 本
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  {planLabel(usage.plan_type)}
                </span>
                {usage.plan_type === "free" && (
                  <Link href="/pricing" className="mt-2 block text-sm text-purple-600 hover:underline">
                    プランをアップグレード →
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-purple-600"
                  style={{
                    width: `${Math.min((usage.videos_used / usage.videos_limit) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Recent Videos */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            最近の動画
          </h2>

          {loading ? (
            <div className="mt-4 flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : videos.length === 0 ? (
            <div className="mt-4 rounded-xl border-2 border-dashed border-zinc-200 p-12 text-center dark:border-zinc-800">
              <Video className="mx-auto h-12 w-12 text-zinc-400" />
              <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
                まだ動画がありません
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                最初の動画を作成してみましょう
              </p>
              <Link href="/generate/story" className="mt-4 inline-block">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  動画を作成
                </Button>
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="group relative rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900"
                >
                  <button
                    onClick={(e) => handleDelete(e, video.id)}
                    className="absolute right-2 top-2 z-10 rounded-full bg-red-500 p-2 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                    title="削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <Link href={`/generate/${video.id}`}>
                    <div className="aspect-[9/16] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      {video.final_video_url ? (
                        <video
                          src={video.final_video_url}
                          className="h-full w-full object-cover"
                          muted
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }}
                        />
                      ) : (
                        <img
                          src={video.original_image_url}
                          alt=""
                          className="h-full w-full object-cover opacity-50"
                        />
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        {statusIcon(video.status)}
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">
                          {video.status === "completed" && "完了"}
                          {video.status === "processing" && "処理中"}
                          {video.status === "pending" && "待機中"}
                          {video.status === "failed" && "失敗"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {video.user_prompt}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {formatRelativeTime(video.created_at)}
                      </p>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
