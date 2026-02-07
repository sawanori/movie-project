'use client';

import { CheckCircle, XCircle, Loader2, Clock, Download, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyVideo } from "@/lib/hooks/use-lazy-video";
import { formatRelativeTime } from "@/lib/utils";

export interface ConcatItem {
  id: string;
  status: string;
  progress: number;
  source_video_ids: string[];
  transition: string;
  transition_duration: number;
  final_video_url: string | null;
  total_duration: number | null;
  error_message: string | null;
  created_at: string;
}

interface ConcatVideoCardProps {
  concat: ConcatItem;
  onDownload: (concat: ConcatItem) => void;
  getTransitionLabel: (transition: string) => string;
}

function statusIcon(status: string) {
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
}

export function ConcatVideoCard({ concat, onDownload, getTransitionLabel }: ConcatVideoCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();

  return (
    <div className="bg-zinc-900 rounded-xl p-4 flex items-center gap-4">
      {/* Thumbnail / Video */}
      <div className="w-24 h-32 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
        {concat.final_video_url ? (
          <video
            ref={videoRef}
            src={shouldLoad ? concat.final_video_url : undefined}
            preload="none"
            className="w-full h-full object-cover"
            muted
            onMouseEnter={(e) => shouldLoad && e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="h-8 w-8 text-zinc-600" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {statusIcon(concat.status)}
          <span className="text-white font-medium">
            {concat.status === "completed" && "完了"}
            {concat.status === "processing" && `処理中... ${concat.progress}%`}
            {concat.status === "pending" && "待機中"}
            {concat.status === "failed" && "失敗"}
          </span>
        </div>

        <div className="text-zinc-400 text-sm space-y-1">
          <p>
            {concat.source_video_ids.length}本の動画で作成
            {concat.total_duration && ` (${concat.total_duration.toFixed(1)}秒)`}
          </p>
          <p>
            トランジション: {getTransitionLabel(concat.transition)}
            {concat.transition !== "none" && ` (${concat.transition_duration}秒)`}
          </p>
          <p className="text-zinc-500 text-xs">
            {formatRelativeTime(concat.created_at)}
          </p>
        </div>

        {concat.error_message && (
          <p className="text-red-400 text-sm mt-2 truncate">
            {concat.error_message}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        {concat.status === "completed" && concat.final_video_url && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDownload(concat)}
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
