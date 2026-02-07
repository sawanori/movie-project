"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { videosApi } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";
import { HistoryVideoCard, HistoryVideoItem } from "./components/HistoryVideoCard";
import {
  Loader2,
  Video,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [videos, setVideos] = useState<HistoryVideoItem[]>([]);
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

  const loadVideos = useCallback(async () => {
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
  }, [page]);

  useEffect(() => {
    if (user) {
      loadVideos();
    }
  }, [user, loadVideos]);

  const handleDelete = async (id: string) => {
    if (!confirm("この動画を削除しますか？")) return;

    setDeleting(id);
    try {
      await videosApi.delete(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
      setTotal((prev) => prev - 1);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "削除に失敗しました";
      alert(message);
    } finally {
      setDeleting(null);
    }
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
                <HistoryVideoCard
                  key={video.id}
                  video={video}
                  onDelete={handleDelete}
                  deleting={deleting}
                  formatDate={formatDate}
                />
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
