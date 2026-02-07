"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { storyboardApi, Storyboard } from "@/lib/api/client";
import { formatDate, cn } from "@/lib/utils";
import { useLazyVideo } from "@/lib/hooks/use-lazy-video";
import {
  Loader2,
  Clapperboard,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Play,
  Film,
  ArrowLeft,
} from "lucide-react";

interface StoryboardHistoryCardProps {
  storyboard: Storyboard;
  deleting: string | null;
  onDelete: (id: string) => void;
  statusBadge: (status: string) => React.ReactNode;
}

function StoryboardHistoryCard({
  storyboard,
  deleting,
  onDelete,
  statusBadge,
}: StoryboardHistoryCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();

  return (
    <div className="group relative rounded-xl bg-white shadow-sm dark:bg-zinc-900">
      {/* Thumbnail */}
      <div className="aspect-[9/16] overflow-hidden rounded-t-xl bg-zinc-100 dark:bg-zinc-800">
        {storyboard.final_video_url ? (
          <video
            ref={videoRef}
            src={shouldLoad ? storyboard.final_video_url : undefined}
            poster={storyboard.source_image_url}
            preload="none"
            className="h-full w-full object-cover"
            muted
            onMouseEnter={(e) => shouldLoad && e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <img
            src={storyboard.source_image_url}
            alt=""
            className={cn(
              "h-full w-full object-cover",
              storyboard.status !== "completed" && "opacity-70"
            )}
          />
        )}

        {/* Play overlay for completed videos */}
        {storyboard.final_video_url && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="rounded-full bg-white/90 p-3">
              <Play className="h-6 w-6 text-zinc-900" fill="currentColor" />
            </div>
          </div>
        )}

        {/* 4 scene preview stripe */}
        <div className="absolute bottom-0 left-0 right-0 flex h-12 bg-gradient-to-t from-black/80 to-transparent p-1">
          <div className="flex flex-1 gap-0.5">
            {storyboard.scenes.slice(0, 4).map((scene, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 overflow-hidden rounded-sm",
                  scene.status === "completed"
                    ? "opacity-100"
                    : "opacity-50"
                )}
              >
                {scene.scene_image_url ? (
                  <img
                    src={scene.scene_image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-zinc-700" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          {statusBadge(storyboard.status)}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(storyboard.id);
            }}
            disabled={deleting === storyboard.id}
            className="relative z-10 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
          >
            {deleting === storyboard.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
        <h3 className="mt-2 line-clamp-1 font-medium text-zinc-900 dark:text-white">
          {storyboard.title || "無題のストーリー"}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {formatDate(storyboard.created_at)}
        </p>
        {storyboard.total_duration && (
          <p className="mt-1 text-xs text-zinc-400">
            {storyboard.total_duration}秒
          </p>
        )}
      </div>

      {/* Click to view/continue */}
      <Link
        href={`/generate/storyboard?id=${storyboard.id}`}
        className="absolute inset-0"
      />
    </div>
  );
}

export default function StoryboardHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
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
      loadStoryboards();
    }
  }, [user, page]);

  const loadStoryboards = async () => {
    setLoading(true);
    try {
      const res = await storyboardApi.list(page, perPage);
      setStoryboards(res.storyboards);
      setTotal(res.total);
    } catch (error) {
      console.error("Failed to load storyboards:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このストーリーボードを削除しますか？")) return;

    setDeleting(id);
    try {
      await storyboardApi.delete(id);
      setStoryboards((prev) => prev.filter((s) => s.id !== id));
      setTotal((prev) => prev - 1);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "削除に失敗しました";
      alert(message);
    } finally {
      setDeleting(null);
    }
  };

  const statusBadge = (status: string) => {
    const config: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
      completed: {
        icon: CheckCircle,
        label: "完了",
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      },
      generating: {
        icon: Loader2,
        label: "生成中",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      },
      videos_ready: {
        icon: Play,
        label: "確認待ち",
        className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      },
      concatenating: {
        icon: Film,
        label: "結合中",
        className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      },
      draft: {
        icon: Clock,
        label: "下書き",
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      },
      failed: {
        icon: XCircle,
        label: "失敗",
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      },
    };

    const defaultConfig = {
      icon: Clock,
      label: status,
      className: "bg-zinc-100 text-zinc-800",
    };

    const currentConfig = config[status] || defaultConfig;
    const Icon = currentConfig.icon;

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
          currentConfig.className
        )}
      >
        <Icon className={cn("h-3 w-3", (status === "generating" || status === "concatenating") && "animate-spin")} />
        {currentConfig.label}
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
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              ストーリー生成履歴
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              全{total}件のストーリーボード
            </p>
          </div>
          <Link href="/generate/storyboard">
            <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
              <Clapperboard className="mr-2 h-4 w-4" />
              新規作成
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : storyboards.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-zinc-200 p-12 text-center dark:border-zinc-800">
            <Clapperboard className="mx-auto h-12 w-12 text-zinc-400" />
            <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
              まだストーリーボードがありません
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              最初のストーリー動画を作成してみましょう
            </p>
            <Link href="/generate/storyboard" className="mt-4 inline-block">
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                ストーリーを作成
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {storyboards.map((storyboard) => (
                <StoryboardHistoryCard
                  key={storyboard.id}
                  storyboard={storyboard}
                  deleting={deleting}
                  onDelete={handleDelete}
                  statusBadge={statusBadge}
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
