"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Trash2, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { screenshotsApi, Screenshot } from "@/lib/api/client";

interface ScreenshotGalleryProps {
  onSelectForGeneration?: (imageUrl: string) => void;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  refreshTrigger?: number;
}

export function ScreenshotGallery({
  onSelectForGeneration,
  onError,
  onSuccess,
  refreshTrigger,
}: ScreenshotGalleryProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  const loadScreenshots = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await screenshotsApi.list(page, perPage);
      setScreenshots(response.screenshots);
      setTotal(response.total);
    } catch (error) {
      console.error("Failed to load screenshots:", error);
      onError?.("スクリーンショットの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [page, onError]);

  useEffect(() => {
    loadScreenshots();
  }, [loadScreenshots, refreshTrigger]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await screenshotsApi.delete(id);
      setScreenshots((prev) => prev.filter((s) => s.id !== id));
      setTotal((prev) => prev - 1);
      onSuccess?.("スクリーンショットを削除しました");
    } catch (error) {
      console.error("Failed to delete screenshot:", error);
      onError?.("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUseForGeneration = (imageUrl: string) => {
    onSelectForGeneration?.(imageUrl);
    onSuccess?.("画像を選択しました");
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}秒`;
  };

  const totalPages = Math.ceil(total / perPage);

  if (isLoading && screenshots.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>スクリーンショットがありません</p>
        <p className="text-sm mt-1">
          動画再生中に「スクリーンショット」ボタンを押すと保存できます
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total}件のスクリーンショット
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadScreenshots}
          disabled={isLoading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          更新
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {screenshots.map((screenshot) => (
          <div key={screenshot.id} className="relative group">
            <div className="aspect-video relative rounded-lg overflow-hidden bg-muted">
              <Image
                src={screenshot.image_url}
                alt={screenshot.title || "Screenshot"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 25vw"
                unoptimized
              />
            </div>

            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
              {onSelectForGeneration && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleUseForGeneration(screenshot.image_url)}
                  title="動画生成に使用"
                >
                  <ImagePlus className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(screenshot.id)}
                disabled={deletingId === screenshot.id}
                title="削除"
              >
                {deletingId === screenshot.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {formatTimestamp(screenshot.timestamp_seconds)}
            </p>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
          >
            次へ
          </Button>
        </div>
      )}
    </div>
  );
}
