"use client";

import { useState, RefObject } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { screenshotsApi, Screenshot, ScreenshotSourceType } from "@/lib/api/client";

interface ScreenshotButtonProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  sourceType: ScreenshotSourceType;
  sourceId: string;
  onScreenshotCreated?: (screenshot: Screenshot) => void;
  onError?: (error: string) => void;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
}

export function ScreenshotButton({
  videoRef,
  sourceType,
  sourceId,
  onScreenshotCreated,
  onError,
  className,
  variant = "outline",
  size = "sm",
}: ScreenshotButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleScreenshot = async () => {
    const video = videoRef.current;
    if (!video) {
      onError?.("動画が見つかりません");
      return;
    }

    // 動画がロードされているか確認
    if (video.readyState < 2) {
      onError?.("動画がまだロードされていません");
      return;
    }

    const timestamp = video.currentTime;

    setIsLoading(true);
    try {
      const screenshot = await screenshotsApi.create({
        source_type: sourceType,
        source_id: sourceId,
        timestamp_seconds: timestamp,
      });

      onScreenshotCreated?.(screenshot);
    } catch (error) {
      console.error("Screenshot error:", error);
      onError?.(
        error instanceof Error
          ? error.message
          : "スクリーンショットの保存に失敗しました"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isIconOnly = size === "icon";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleScreenshot}
      disabled={isLoading}
      className={className}
      title={isIconOnly ? (isLoading ? "保存中..." : "スクリーンショット") : undefined}
    >
      {isLoading ? (
        <Loader2 className={`w-4 h-4 animate-spin ${isIconOnly ? "" : "mr-2"}`} />
      ) : (
        <Camera className={`w-4 h-4 ${isIconOnly ? "" : "mr-2"}`} />
      )}
      {!isIconOnly && (isLoading ? "保存中..." : "スクリーンショット")}
    </Button>
  );
}
