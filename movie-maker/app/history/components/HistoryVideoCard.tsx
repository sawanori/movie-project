'use client';

import Link from 'next/link';
import { useLazyVideo } from '@/lib/hooks/use-lazy-video';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
} from 'lucide-react';

export interface HistoryVideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
  expires_at: string | null;
}

interface HistoryVideoCardProps {
  video: HistoryVideoItem;
  onDelete: (id: string) => void;
  deleting: string | null;
  formatDate: (date: string) => string;
}

function statusBadge(status: string) {
  const config = {
    completed: {
      icon: CheckCircle,
      label: '完了',
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    },
    processing: {
      icon: Loader2,
      label: '処理中',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    },
    pending: {
      icon: Clock,
      label: '待機中',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    },
    failed: {
      icon: XCircle,
      label: '失敗',
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    },
  }[status] || {
    icon: Clock,
    label: status,
    className: 'bg-zinc-100 text-zinc-800',
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        config.className
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} />
      {config.label}
    </span>
  );
}

export function HistoryVideoCard({
  video,
  onDelete,
  deleting,
  formatDate,
}: HistoryVideoCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();

  return (
    <div
      className="group relative rounded-xl bg-white shadow-sm dark:bg-zinc-900"
    >
      <Link href={`/generate/${video.id}`}>
        <div className="aspect-[9/16] overflow-hidden rounded-t-xl bg-zinc-100 dark:bg-zinc-800">
          {video.final_video_url ? (
            <video
              ref={videoRef}
              src={shouldLoad ? video.final_video_url : undefined}
              poster={video.original_image_url}
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
            onClick={() => onDelete(video.id)}
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
  );
}
