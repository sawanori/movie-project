"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { videosApi } from "@/lib/api/client";
import { formatDate, cn } from "@/lib/utils";
import {
  Loader2,
  Video,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface VideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
  expires_at: string | null;
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const perPage = 12;
  const totalPages = Math.ceil(total / perPage);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadVideos();
    }
  }, [user, page]);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const res = await videosApi.list(page, perPage);
      setVideos(res.videos);
      setTotal(res.total);
    } catch (error) {
      console.error("Failed to load videos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この動画を削除しますか？")) return;

    setDeleting(id);
    try {
      await videosApi.delete(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
      setTotal((prev) => prev - 1);
    } catch (error: any) {
      alert(error.message || "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  };

  const statusBadge = (status: string) => {
    const config = {
      completed: {
        icon: CheckCircle,
        label: "完了",
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      },
      processing: {
        icon: Loader2,
        label: "処理中",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      },
      pending: {
        icon: Clock,
        label: "待機中",
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      },
      failed: {
        icon: XCircle,
        label: "失敗",
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      },
    }[status] || {
      icon: Clock,
      label: status,
      className: "bg-zinc-100 text-zinc-800",
    };

    const Icon = config.icon;

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
          config.className
        )}
      >
        <Icon className={cn("h-3 w-3", status === "processing" && "animate-spin")} />
        {config.label}
      </span>
    );
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              生成履歴
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              全{total}件の動画
            </p>
          </div>
          <Link href="/generate">
            <Button>新規作成</Button>
          </Link>
        </div>

        {loading ? (
          <div className="mt-12 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : videos.length === 0 ? (
          <div className="mt-12 rounded-xl border-2 border-dashed border-zinc-200 p-12 text-center dark:border-zinc-800">
            <Video className="mx-auto h-12 w-12 text-zinc-400" />
            <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
              まだ動画がありません
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              最初の動画を作成してみましょう
            </p>
            <Link href="/generate" className="mt-4 inline-block">
              <Button>動画を作成</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="group relative rounded-xl bg-white shadow-sm dark:bg-zinc-900"
                >
                  <Link href={`/generate/${video.id}`}>
                    <div className="aspect-[9/16] overflow-hidden rounded-t-xl bg-zinc-100 dark:bg-zinc-800">
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
                  </Link>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      {statusBadge(video.status)}
                      <button
                        onClick={() => handleDelete(video.id)}
                        disabled={deleting === video.id}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                      >
                        {deleting === video.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {video.user_prompt}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {formatDate(video.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
