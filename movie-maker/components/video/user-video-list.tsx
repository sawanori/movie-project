"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Video, Play, Loader2 } from "lucide-react";
import { userVideosApi, UserVideo, UserVideoListResponse } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface UserVideoListProps {
  onSelect?: (video: UserVideo) => void;
  selectedVideoId?: string;
  className?: string;
  refreshTrigger?: number;
}

export function UserVideoList({
  onSelect,
  selectedVideoId,
  className,
  refreshTrigger = 0,
}: UserVideoListProps) {
  const [videos, setVideos] = useState<UserVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadVideos = useCallback(async (pageNum: number, append = false) => {
    try {
      setLoading(true);
      setError(null);
      const response: UserVideoListResponse = await userVideosApi.list(pageNum, 20);

      if (append) {
        setVideos((prev) => [...prev, ...response.videos]);
      } else {
        setVideos(response.videos);
      }

      setHasMore(response.has_next);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadVideos(1, false);
  }, [loadVideos, refreshTrigger]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadVideos(nextPage, true);
  };

  const handleDelete = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("この動画を削除しますか？")) {
      return;
    }

    try {
      setDeletingId(videoId);
      await userVideosApi.delete(videoId);
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    return `${seconds.toFixed(1)}秒`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (loading && videos.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-center p-8", className)}>
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => loadVideos(1, false)}
          className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={cn("text-center p-8 text-gray-400", className)}>
        <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>アップロードした動画はありません</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-sm text-gray-400">
        {total}件の動画
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {videos.map((video) => (
          <div
            key={video.id}
            onClick={() => onSelect?.(video)}
            className={cn(
              "group relative rounded-lg overflow-hidden cursor-pointer transition-all",
              "border-2",
              selectedVideoId === video.id
                ? "border-blue-500 ring-2 ring-blue-500/30"
                : "border-transparent hover:border-gray-600"
            )}
          >
            {/* サムネイル */}
            <div className="aspect-video bg-gray-800 relative">
              {video.thumbnail_url ? (
                <img
                  src={video.thumbnail_url}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="w-8 h-8 text-gray-600" />
                </div>
              )}

              {/* 再生アイコンオーバーレイ */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Play className="w-10 h-10 text-white" />
              </div>

              {/* 尺バッジ */}
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                {formatDuration(video.duration_seconds)}
              </div>

              {/* 削除ボタン */}
              <button
                onClick={(e) => handleDelete(video.id, e)}
                disabled={deletingId === video.id}
                className={cn(
                  "absolute top-2 right-2 p-1.5 rounded bg-red-500/80 text-white",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "hover:bg-red-500 disabled:opacity-50"
                )}
                aria-label="削除"
              >
                {deletingId === video.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* 情報 */}
            <div className="p-2 bg-gray-900">
              <p className="text-white text-sm font-medium truncate" title={video.title}>
                {video.title}
              </p>
              <p className="text-gray-400 text-xs">
                {video.width}x{video.height} · {formatFileSize(video.file_size_bytes)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className={cn(
              "px-4 py-2 rounded-lg bg-gray-800 text-white",
              "hover:bg-gray-700 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            ) : null}
            もっと読み込む
          </button>
        </div>
      )}
    </div>
  );
}
