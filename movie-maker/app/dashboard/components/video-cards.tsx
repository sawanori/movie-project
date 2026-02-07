'use client';

import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Clock, Trash2, Music, Play, Combine, Video, ArrowUpCircle, Download } from "lucide-react";
import { useLazyVideo } from "@/lib/hooks/use-lazy-video";
import { useNetworkStatus, isSlowConnection } from "@/lib/hooks/use-network-status";
import type { Storyboard, Motion, AdCreatorProject, UserVideo } from "@/lib/api/client";

// VideoItem type (from dashboard/page.tsx)
export interface VideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
}

// Shared status icon function
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

// ===== StoryboardCard =====
interface StoryboardCardProps {
  storyboard: Storyboard;
  onDelete: (e: React.MouseEvent, id: string) => void;
  formatRelativeTime: (date: string) => string;
}

export function StoryboardCard({ storyboard, onDelete, formatRelativeTime }: StoryboardCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();
  const { quality } = useNetworkStatus();
  const isSlow = isSlowConnection(quality);

  return (
    <div
      className="group relative rounded-xl bg-[#2a2a2a] border border-[#404040] p-4 transition-all hover:border-[#505050]"
    >
      {/* Delete button */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => onDelete(e, storyboard.id)}
          className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Link href={`/generate/storyboard?id=${storyboard.id}`}>
        <div className="aspect-[9/16] overflow-hidden rounded-lg bg-[#1a1a1a]">
          {storyboard.final_video_url ? (
            <video
              ref={videoRef}
              src={shouldLoad ? storyboard.final_video_url : undefined}
              poster={storyboard.source_image_url}
              preload="none"
              className="h-full w-full object-cover"
              muted
              onMouseEnter={(e) => !isSlow && shouldLoad && e.currentTarget.play()}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : (
            <img
              src={storyboard.source_image_url}
              alt=""
              className="h-full w-full object-cover opacity-50"
            />
          )}
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2">
            {statusIcon(storyboard.status)}
            <span className="text-sm font-medium text-white">
              {storyboard.status === "completed" && "Complete"}
              {storyboard.status === "videos_ready" && "Videos Ready"}
              {storyboard.status === "generating" && "Generating"}
              {storyboard.status === "concatenating" && "Concatenating"}
              {storyboard.status === "draft" && "Draft"}
              {storyboard.status === "failed" && "Failed"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-400">
            {storyboard.title || "Untitled Story"}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {formatRelativeTime(storyboard.created_at)}
            </p>
            <span className="text-xs text-gray-500">
              {storyboard.scenes?.length || 0} scenes
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

// ===== VideoItemCard =====
interface VideoItemCardProps {
  video: VideoItem;
  onDelete: (e: React.MouseEvent, id: string) => void;
  formatRelativeTime: (date: string) => string;
  onBgmClick: (e: React.MouseEvent, videoId: string) => void;
}

export function VideoItemCard({ video, onDelete, formatRelativeTime, onBgmClick }: VideoItemCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();
  const { quality } = useNetworkStatus();
  const isSlow = isSlowConnection(quality);

  return (
    <div
      className="group relative rounded-xl bg-[#2a2a2a] border border-[#404040] p-4 transition-all hover:border-[#505050]"
    >
      {/* Action buttons */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {/* BGM add button (completed videos only) */}
        {video.status === "completed" && (
          <button
            onClick={(e) => onBgmClick(e, video.id)}
            className="rounded-full bg-[#00bdb6] p-2 text-[#212121] hover:bg-[#00d4cc]"
            title="Add BGM"
          >
            <Music className="h-4 w-4" />
          </button>
        )}
        {/* Delete button */}
        <button
          onClick={(e) => onDelete(e, video.id)}
          className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Link href={`/generate/${video.id}`}>
        <div className="aspect-[9/16] overflow-hidden rounded-lg bg-[#1a1a1a]">
          {video.final_video_url ? (
            <video
              ref={videoRef}
              src={shouldLoad ? video.final_video_url : undefined}
              poster={video.original_image_url}
              preload="none"
              className="h-full w-full object-cover"
              muted
              onMouseEnter={(e) => !isSlow && shouldLoad && e.currentTarget.play()}
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
            <span className="text-sm font-medium text-white">
              {video.status === "completed" && "Complete"}
              {video.status === "processing" && "Processing"}
              {video.status === "pending" && "Pending"}
              {video.status === "failed" && "Failed"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-400">
            {video.user_prompt}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {formatRelativeTime(video.created_at)}
          </p>
        </div>
      </Link>
    </div>
  );
}

// ===== AdProjectCard =====
interface AdProjectCardProps {
  project: AdCreatorProject;
  onDelete: (e: React.MouseEvent, id: string) => void;
  formatRelativeTime: (date: string) => string;
}

export function AdProjectCard({ project, onDelete, formatRelativeTime }: AdProjectCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();
  const { quality } = useNetworkStatus();
  const isSlow = isSlowConnection(quality);

  return (
    <div
      className="group relative rounded-xl bg-[#2a2a2a] border border-[#404040] p-4 transition-all hover:border-[#505050]"
    >
      {/* Delete button */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => onDelete(e, project.id)}
          className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Link href={`/concat?project_id=${project.id}`}>
        <div className="aspect-video overflow-hidden rounded-lg bg-[#1a1a1a]">
          {project.thumbnail_url ? (
            <img
              src={project.thumbnail_url}
              alt={project.title}
              className="h-full w-full object-cover"
            />
          ) : project.final_video_url ? (
            <video
              ref={videoRef}
              src={shouldLoad ? project.final_video_url : undefined}
              poster={project.thumbnail_url || undefined}
              preload="none"
              className="h-full w-full object-cover"
              muted
              onMouseEnter={(e) => !isSlow && shouldLoad && e.currentTarget.play()}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Combine className="h-12 w-12 text-gray-600" />
            </div>
          )}
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2">
            {statusIcon(project.status)}
            <span className="text-sm font-medium text-white">
              {project.status === "completed" && "Complete"}
              {project.status === "processing" && "Processing"}
              {project.status === "draft" && "Draft"}
              {project.status === "failed" && "Failed"}
            </span>
            {project.theory && (
              <span className="ml-auto rounded bg-[#00bdb6]/20 px-2 py-0.5 text-xs text-[#00bdb6]">
                {project.theory === "aida" && "AIDA"}
                {project.theory === "pasona" && "PASONA"}
                {project.theory === "kishoutenketsu" && "Kishoutenketsu"}
                {project.theory === "storytelling" && "Story"}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-white">
            {project.title}
          </p>
          {project.description && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-400">
              {project.description}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {formatRelativeTime(project.created_at)}
            </p>
            <span className="text-xs text-gray-500">
              {project.target_duration}s / {project.aspect_ratio}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

// ===== MotionCard =====
interface MotionCardProps {
  motion: Motion;
  onDelete: (motionId: string, motionName: string) => void;
}

export function MotionCard({ motion, onDelete }: MotionCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();
  const { quality } = useNetworkStatus();
  const isSlow = isSlowConnection(quality);

  return (
    <div
      className="group relative rounded-lg bg-[#2a2a2a] border border-[#404040] overflow-hidden"
    >
      {/* Video preview (vertical 9:16) */}
      <div className="aspect-[9/16] bg-[#1a1a1a] relative">
        {motion.motion_url ? (
          <video
            ref={videoRef}
            src={shouldLoad ? motion.motion_url : undefined}
            preload="none"
            className="h-full w-full object-contain bg-black"
            muted
            loop
            playsInline
            onMouseEnter={(e) => !isSlow && shouldLoad && e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Play className="h-8 w-8 text-zinc-400" />
          </div>
        )}
        {/* Play icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Play className="h-10 w-10 text-white" />
        </div>
        {/* Delete button */}
        <button
          onClick={() => onDelete(motion.id, motion.name_ja)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {/* Duration badge */}
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {motion.duration_seconds}s
        </span>
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-white truncate">
          {motion.name_ja}
        </p>
        <p className="text-xs text-gray-400 truncate">{motion.name_en}</p>
        <p className="mt-1 text-xs text-gray-500 truncate">ID: {motion.id}</p>
      </div>
    </div>
  );
}

// ===== UserVideoCard =====
interface UserVideoCardProps {
  video: UserVideo;
  onDelete: (e: React.MouseEvent, id: string) => void;
  formatRelativeTime: (date: string) => string;
  onUpscale?: (videoId: string) => void;
  upscaleStatus?: { status: string; progress: number } | null;
}

export function UserVideoCard({ video, onDelete, formatRelativeTime, onUpscale, upscaleStatus }: UserVideoCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();
  const { quality } = useNetworkStatus();
  const isSlow = isSlowConnection(quality);

  return (
    <div
      className="group relative rounded-xl bg-[#2a2a2a] border border-[#404040] overflow-hidden transition-all hover:border-[#505050]"
    >
      {/* Delete button */}
      <button
        onClick={(e) => onDelete(e, video.id)}
        className="absolute right-2 top-2 z-10 rounded-full bg-red-500 p-2 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Video preview with lazy loading */}
      <div className="aspect-video bg-[#1a1a1a] relative">
        {video.video_url ? (
          <video
            ref={videoRef}
            src={shouldLoad ? video.video_url : undefined}
            poster={video.thumbnail_url || undefined}
            preload="none"
            className="h-full w-full object-contain"
            muted
            playsInline
            onMouseEnter={(e) => !isSlow && shouldLoad && e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Video className="h-8 w-8 text-gray-600" />
          </div>
        )}
        {/* Play icon overlay on hover */}
        {video.video_url && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Play className="h-10 w-10 text-white" />
          </div>
        )}
        {/* Duration badge */}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
          {video.duration_seconds.toFixed(1)}s
        </span>
        {/* Upscaled badge */}
        {video.upscaled_video_url && (
          <span className="absolute top-2 left-2 rounded bg-green-600/90 px-2 py-0.5 text-xs text-white flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            アップスケール済み
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-white truncate" title={video.title}>
          {video.title}
        </p>
        <p className="text-xs text-gray-400">
          {video.width}x{video.height} / {(video.file_size_bytes / (1024 * 1024)).toFixed(1)}MB
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {formatRelativeTime(video.created_at)}
        </p>

        {/* Upscale status / button */}
        {upscaleStatus && (upscaleStatus.status === 'pending' || upscaleStatus.status === 'processing') ? (
          <div className="mt-2">
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              アップスケール中... {upscaleStatus.progress}%
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-[#404040] overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${upscaleStatus.progress}%` }}
              />
            </div>
          </div>
        ) : video.upscaled_video_url ? (
          <a
            href={video.upscaled_video_url}
            download
            className="mt-2 flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3 w-3" />
            アップスケール版をダウンロード
          </a>
        ) : (
          <button
            onClick={() => onUpscale?.(video.id)}
            className="mt-2 flex items-center gap-1.5 text-xs text-[#fce300] hover:text-[#fce300]/80 transition-colors"
          >
            <ArrowUpCircle className="h-3 w-3" />
            アップスケール
          </button>
        )}
      </div>
    </div>
  );
}
