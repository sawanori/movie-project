"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { motionsApi, userVideosApi, adCreatorProjectsApi } from "@/lib/api/client";
import type { EnhanceModel, TopazUpscaleScale } from "@/lib/api/client";
import { StoryboardCard, VideoItemCard, AdProjectCard, MotionCard, UserVideoCard } from "./components/video-cards";
import { formatRelativeTime } from "@/lib/utils";
import { SlowNetworkWarning } from "@/components/ui/slow-network-warning";
import { Plus, Video, Loader2, Combine, History, Upload, X, Film, Clapperboard, Settings, Play, CheckCircle, Image as ImageIcon, ArrowUpCircle } from "lucide-react";
import { useVideos, useStoryboards, useUsage, useMotions, useUserVideos, useAdProjects, useLibraryImages, type Usage } from "@/lib/hooks/use-dashboard-data";
import { CardGridSkeleton, UsageCardSkeleton } from "./components/skeletons";

type TabType = "storyboard" | "scene" | "adcreator" | "motions" | "uploaded" | "images";

const MOTION_CATEGORIES = [
  { id: "expression", label: "表情", folder: "expressions" },
  { id: "gesture", label: "ジェスチャー", folder: "gestures" },
  { id: "action", label: "アクション", folder: "actions" },
  { id: "speaking", label: "会話", folder: "speaking" },
] as const;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("storyboard");
  const [uploadingUserVideo, setUploadingUserVideo] = useState(false);
  const [bgmModalVideoId, setBgmModalVideoId] = useState<string | null>(null);
  const [uploadingBgm, setUploadingBgm] = useState(false);
  // Motion upload states
  const [motionUploadOpen, setMotionUploadOpen] = useState(false);
  const [motionFile, setMotionFile] = useState<File | null>(null);
  const [motionCategory, setMotionCategory] = useState<'expression' | 'gesture' | 'action' | 'speaking'>('expression');
  const [motionId, setMotionId] = useState('');
  const [motionNameJa, setMotionNameJa] = useState('');
  const [motionNameEn, setMotionNameEn] = useState('');
  const [motionDuration, setMotionDuration] = useState(5);
  const [uploadingMotion, setUploadingMotion] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Topaz upscale states
  const [upscaleModalVideoId, setUpscaleModalVideoId] = useState<string | null>(null);
  const [upscaleModel, setUpscaleModel] = useState<EnhanceModel>('prob-4');
  const [upscaleScale, setUpscaleScale] = useState<TopazUpscaleScale>('2x');
  const [upscaleEstimate, setUpscaleEstimate] = useState<{
    estimated_credits_min: number;
    estimated_credits_max: number;
    estimated_time_min: number;
    estimated_time_max: number;
    target_width: number;
    target_height: number;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [startingUpscale, setStartingUpscale] = useState(false);
  const [upscaleStatuses, setUpscaleStatuses] = useState<Record<string, { status: string; progress: number }>>({});

  // Polling cleanup refs to prevent memory leaks
  const pollingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const mountedRef = useRef(true);

  // Cleanup polling on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(pollingTimeoutsRef.current).forEach(clearTimeout);
      pollingTimeoutsRef.current = {};
    };
  }, []);

  // Close upscale modal when switching away from uploaded tab
  useEffect(() => {
    if (activeTab !== 'uploaded') {
      setUpscaleModalVideoId(null);
      setUpscaleEstimate(null);
    }
  }, [activeTab]);

  // ESC key handler for upscale modal
  useEffect(() => {
    if (!upscaleModalVideoId) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUpscaleModalVideoId(null);
        setUpscaleEstimate(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [upscaleModalVideoId]);

  // SWR hooks - storyboards and usage are always loaded
  const { data: storyboards = [], isLoading: loadingStoryboards } = useStoryboards(!!user);
  const { data: usage, isLoading: loadingUsage } = useUsage(!!user);

  // Tab-specific lazy loading - only fetch when tab is active
  const { data: videos = [], isLoading: loadingVideos, mutate: mutateVideos } = useVideos(!!user && activeTab === 'scene');
  const { data: motions = [], isLoading: loadingMotions, mutate: mutateMotions } = useMotions(!!user && activeTab === 'motions');
  const { data: userVideos = [], isLoading: loadingUserVideos, mutate: mutateUserVideos } = useUserVideos(!!user && activeTab === 'uploaded');
  const { data: adProjects = [], isLoading: loadingAdProjects, mutate: mutateAdProjects } = useAdProjects(!!user && activeTab === 'adcreator');
  const { data: libraryImages = [], isLoading: loadingLibrary } = useLibraryImages(!!user && activeTab === 'images');

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Check if it's a video file
      if (file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov')) {
        setMotionFile(file);
      } else {
        alert('動画ファイル（MP4, MOV）のみアップロードできます');
      }
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const handleDeleteVideo = async (e: React.MouseEvent, videoId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("この動画を削除しますか？")) {
      return;
    }

    try {
      const { videosApi } = await import("@/lib/api/client");
      await videosApi.delete(videoId);
      mutateVideos(videos.filter((v) => v.id !== videoId), false);
    } catch (error) {
      console.error("Failed to delete video:", error);
      alert("削除に失敗しました");
    }
  };

  const handleDeleteStoryboard = async (e: React.MouseEvent, storyboardId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("このストーリーボードを削除しますか？")) {
      return;
    }

    try {
      const { storyboardApi } = await import("@/lib/api/client");
      await storyboardApi.delete(storyboardId);
      // Revalidate storyboards after deletion
      const { useStoryboards } = await import("@/lib/hooks/use-dashboard-data");
      // Trigger revalidation by mutating the cache
      const { mutate } = await import("swr");
      mutate('dashboard-storyboards');
    } catch (error) {
      console.error("Failed to delete storyboard:", error);
      alert("削除に失敗しました");
    }
  };

  const handleAddBgm = async (videoId: string, file: File) => {
    setUploadingBgm(true);
    try {
      const { videosApi } = await import("@/lib/api/client");
      // Upload BGM
      const uploadRes = await videosApi.uploadBgm(file);

      // Add BGM to video
      await videosApi.addBgmToVideo(videoId, uploadRes.bgm_url);

      // Update video status
      mutateVideos(videos.map((v) =>
        v.id === videoId ? { ...v, status: "processing" } : v
      ), false);

      setBgmModalVideoId(null);
      alert("BGMの追加を開始しました。処理が完了するまでお待ちください。");
    } catch (error) {
      console.error("Failed to add BGM:", error);
      alert("BGMの追加に失敗しました");
    } finally {
      setUploadingBgm(false);
    }
  };

  const handleUploadMotion = async () => {
    if (!motionFile || !motionId || !motionNameJa || !motionNameEn) {
      alert("すべての項目を入力してください");
      return;
    }

    setUploadingMotion(true);
    try {
      const result = await motionsApi.upload({
        file: motionFile,
        category: motionCategory,
        motion_id: motionId,
        name_ja: motionNameJa,
        name_en: motionNameEn,
        duration_seconds: motionDuration,
      });

      alert(result.message);

      // Reset form
      setMotionFile(null);
      setMotionId('');
      setMotionNameJa('');
      setMotionNameEn('');
      setMotionDuration(5);
      setMotionUploadOpen(false);

      // Reload motions list
      const updatedMotions = await motionsApi.list();
      mutateMotions(updatedMotions, false);
    } catch (error) {
      console.error("Failed to upload motion:", error);
      alert(error instanceof Error ? error.message : "アップロードに失敗しました");
    } finally {
      setUploadingMotion(false);
    }
  };

  const handleDeleteMotion = async (motionId: string, motionName: string) => {
    if (!confirm(`モーション「${motionName}」を削除しますか？`)) {
      return;
    }

    try {
      await motionsApi.delete(motionId);
      alert("モーションを削除しました");

      // Reload motions list
      const updatedMotions = await motionsApi.list();
      mutateMotions(updatedMotions, false);
    } catch (error) {
      console.error("Failed to delete motion:", error);
      alert(error instanceof Error ? error.message : "削除に失敗しました");
    }
  };

  const handleDeleteUserVideo = async (e: React.MouseEvent, videoId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("この動画を削除しますか？")) {
      return;
    }

    try {
      await userVideosApi.delete(videoId);
      mutateUserVideos(userVideos.filter((v) => v.id !== videoId), false);
    } catch (error) {
      console.error("Failed to delete user video:", error);
      alert("削除に失敗しました");
    }
  };

  // Topaz upscale polling (with mounted check, retry limit, and timeout tracking)
  const pollUpscaleStatus = async (videoId: string, retryCount = 0) => {
    if (!mountedRef.current) return;
    const MAX_RETRIES = 60; // 5 minutes at 5-second intervals
    try {
      const status = await userVideosApi.getUpscaleStatus(videoId);
      if (!mountedRef.current) return;

      if (status.status === 'completed') {
        delete pollingTimeoutsRef.current[videoId];
        setUpscaleStatuses(prev => {
          const next = { ...prev };
          delete next[videoId];
          return next;
        });
        // SWR再取得で upscaled_video_url を反映
        mutateUserVideos();
        alert('アップスケールが完了しました');
        return;
      }

      if (status.status === 'failed') {
        delete pollingTimeoutsRef.current[videoId];
        setUpscaleStatuses(prev => {
          const next = { ...prev };
          delete next[videoId];
          return next;
        });
        alert(`アップスケールに失敗しました: ${status.error_message || '不明なエラー'}`);
        return;
      }

      // processing/pending → 継続ポーリング
      setUpscaleStatuses(prev => ({
        ...prev,
        [videoId]: { status: status.status, progress: status.progress },
      }));
      pollingTimeoutsRef.current[videoId] = setTimeout(() => pollUpscaleStatus(videoId), 5000);
    } catch (error) {
      if (!mountedRef.current) return;
      console.error("Upscale polling failed:", error);
      if (retryCount >= MAX_RETRIES) {
        delete pollingTimeoutsRef.current[videoId];
        setUpscaleStatuses(prev => {
          const next = { ...prev };
          delete next[videoId];
          return next;
        });
        alert('アップスケールのステータス確認に失敗しました。ページを更新してください。');
        return;
      }
      pollingTimeoutsRef.current[videoId] = setTimeout(() => pollUpscaleStatus(videoId, retryCount + 1), 10000);
    }
  };

  // 見積もり取得
  const handleEstimateUpscale = async () => {
    if (!upscaleModalVideoId) return;
    setEstimating(true);
    setUpscaleEstimate(null);
    try {
      const estimate = await userVideosApi.estimateUpscale(upscaleModalVideoId, {
        model: upscaleModel,
        scale: upscaleScale,
      });
      setUpscaleEstimate(estimate);
    } catch (error) {
      console.error("Estimate failed:", error);
      alert(error instanceof Error ? error.message : "見積もりの取得に失敗しました");
    } finally {
      setEstimating(false);
    }
  };

  // アップスケール開始
  const handleStartUpscale = async () => {
    if (!upscaleModalVideoId) return;
    setStartingUpscale(true);
    try {
      await userVideosApi.upscale(upscaleModalVideoId, {
        model: upscaleModel,
        scale: upscaleScale,
      });
      // ポーリング開始（初回もsetTimeoutで管理）
      setUpscaleStatuses(prev => ({
        ...prev,
        [upscaleModalVideoId]: { status: 'pending', progress: 0 },
      }));
      pollingTimeoutsRef.current[upscaleModalVideoId] = setTimeout(() => pollUpscaleStatus(upscaleModalVideoId), 5000);
      // モーダルを閉じる
      setUpscaleModalVideoId(null);
      setUpscaleEstimate(null);
    } catch (error) {
      console.error("Upscale failed:", error);
      alert(error instanceof Error ? error.message : "アップスケールの開始に失敗しました");
    } finally {
      setStartingUpscale(false);
    }
  };

  const handleDeleteAdProject = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("このプロジェクトを削除しますか？")) {
      return;
    }

    try {
      await adCreatorProjectsApi.delete(projectId);
      mutateAdProjects(adProjects.filter((p) => p.id !== projectId), false);
    } catch (error) {
      console.error("Failed to delete ad project:", error);
      alert("削除に失敗しました");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#212121]">
        <Loader2 className="h-8 w-8 animate-spin text-[#fce300]" />
      </div>
    );
  }

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
    <div className="min-h-screen bg-[#212121]">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Slow Network Warning */}
        <SlowNetworkWarning className="mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              ダッシュボード
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              ようこそ、{user.email}さん
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/concat/history">
              <Button variant="ghost" size="icon" title="広告履歴" className="text-gray-400 hover:text-white hover:bg-[#333333]">
                <History className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/generate/story">
              <Button className="bg-[#2a2a2a] border border-[#404040] text-white hover:bg-[#333333]">
                <Film className="mr-2 h-4 w-4" />
                シーン生成
              </Button>
            </Link>
            <Link href="/concat">
              <Button className="bg-[#00bdb6] hover:bg-[#00d4cc] text-[#212121] font-semibold border-0">
                <Combine className="mr-2 h-4 w-4" />
                アドクリエイター
              </Button>
            </Link>
            <Link href="/generate/storyboard">
              <Button className="bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0">
                <Clapperboard className="mr-2 h-4 w-4" />
                ストーリー生成
              </Button>
            </Link>
          </div>
        </div>

        {/* Usage Card */}
        {loadingUsage ? (
          <UsageCardSkeleton />
        ) : usage && (
          <div className="mt-8 rounded-xl bg-[#2a2a2a] border border-[#404040] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">
                  今月の使用状況
                </p>
                <p className="mt-1 text-3xl font-bold text-white">
                  {usage.videos_used} / {usage.videos_limit}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  残り {usage.videos_remaining} 本
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-full bg-[#fce300]/20 px-3 py-1 text-sm font-medium text-[#fce300]">
                  {planLabel(usage.plan_type)}
                </span>
                {usage.plan_type === "free" && (
                  <Link href="/pricing" className="mt-2 block text-sm text-[#00bdb6] hover:underline">
                    プランをアップグレード →
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#404040]">
                <div
                  className="h-full rounded-full bg-[#fce300]"
                  style={{
                    width: `${Math.min((usage.videos_used / usage.videos_limit) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabs and Content */}
        <div className="mt-8">
          {/* Tab Navigation */}
          <div className="flex items-center gap-4 border-b border-[#404040]">
            <button
              onClick={() => setActiveTab("storyboard")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "storyboard"
                  ? "border-[#fce300] text-[#fce300]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Clapperboard className="h-4 w-4" />
              ストーリー動画
              {storyboards.length > 0 && (
                <span className="ml-1 rounded-full bg-[#fce300]/20 px-2 py-0.5 text-xs text-[#fce300]">
                  {storyboards.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("scene")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "scene"
                  ? "border-[#fce300] text-[#fce300]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Film className="h-4 w-4" />
              シーン動画
              {videos.length > 0 && (
                <span className="ml-1 rounded-full bg-[#404040] px-2 py-0.5 text-xs text-gray-300">
                  {videos.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("adcreator")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "adcreator"
                  ? "border-[#00bdb6] text-[#00bdb6]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Combine className="h-4 w-4" />
              アドクリエイター
              {adProjects.length > 0 && (
                <span className="ml-1 rounded-full bg-[#00bdb6]/20 px-2 py-0.5 text-xs text-[#00bdb6]">
                  {adProjects.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("motions")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "motions"
                  ? "border-[#fce300] text-[#fce300]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Settings className="h-4 w-4" />
              モーション管理
              {motions.length > 0 && (
                <span className="ml-1 rounded-full bg-[#404040] px-2 py-0.5 text-xs text-gray-300">
                  {motions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("uploaded")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "uploaded"
                  ? "border-[#fce300] text-[#fce300]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Upload className="h-4 w-4" />
              アップロード動画
              {userVideos.length > 0 && (
                <span className="ml-1 rounded-full bg-[#404040] px-2 py-0.5 text-xs text-gray-300">
                  {userVideos.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("images")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "images"
                  ? "border-purple-500 text-purple-400 bg-purple-500/10"
                  : "border-transparent text-zinc-200 hover:text-white hover:bg-zinc-700"
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              画像
              {libraryImages.length > 0 && (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                  activeTab === "images"
                    ? "bg-purple-500/20 text-purple-300"
                    : "bg-zinc-700 text-zinc-300"
                }`}>
                  {libraryImages.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "storyboard" ? (
            /* Storyboard Tab */
            loadingStoryboards ? (
              <CardGridSkeleton />
            ) : storyboards.length === 0 ? (
              <div className="mt-4 rounded-xl border-2 border-dashed border-[#404040] p-12 text-center">
                <Clapperboard className="mx-auto h-12 w-12 text-gray-500" />
                <h3 className="mt-4 text-lg font-medium text-white">
                  まだストーリー動画がありません
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  起承転結のストーリー動画を作成してみましょう
                </p>
                <Link href="/generate/storyboard" className="mt-4 inline-block">
                  <Button className="bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0">
                    <Plus className="mr-2 h-4 w-4" />
                    ストーリーを作成
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {storyboards.map((storyboard) => (
                  <StoryboardCard
                    key={storyboard.id}
                    storyboard={storyboard}
                    onDelete={handleDeleteStoryboard}
                    formatRelativeTime={formatRelativeTime}
                  />
                ))}
              </div>
            )
          ) : activeTab === "scene" ? (
            /* Scene Tab */
            loadingVideos ? (
              <CardGridSkeleton />
            ) : videos.length === 0 ? (
              <div className="mt-4 rounded-xl border-2 border-dashed border-[#404040] p-12 text-center">
                <Video className="mx-auto h-12 w-12 text-gray-500" />
                <h3 className="mt-4 text-lg font-medium text-white">
                  まだシーン動画がありません
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  単独のシーン動画を作成してみましょう
                </p>
                <Link href="/generate/story" className="mt-4 inline-block">
                  <Button className="bg-[#2a2a2a] border border-[#404040] text-white hover:bg-[#333333]">
                    <Plus className="mr-2 h-4 w-4" />
                    シーンを作成
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {videos.map((video) => (
                  <VideoItemCard
                    key={video.id}
                    video={video}
                    onDelete={handleDeleteVideo}
                    formatRelativeTime={formatRelativeTime}
                    onBgmClick={(e, videoId) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBgmModalVideoId(videoId);
                    }}
                  />
                ))}
              </div>
            )
          ) : activeTab === "adcreator" ? (
            /* Ad Creator Projects Tab */
            loadingAdProjects ? (
              <CardGridSkeleton />
            ) : adProjects.length === 0 ? (
              <div className="mt-4 rounded-xl border-2 border-dashed border-[#404040] p-12 text-center">
                <Combine className="mx-auto h-12 w-12 text-gray-500" />
                <h3 className="mt-4 text-lg font-medium text-white">
                  アドクリエイターのプロジェクトがありません
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  アドクリエイターで広告動画を作成してみましょう
                </p>
                <Link href="/concat" className="mt-4 inline-block">
                  <Button className="bg-[#00bdb6] hover:bg-[#00d4cc] text-[#212121] font-semibold border-0">
                    <Plus className="mr-2 h-4 w-4" />
                    アドクリエイターを開く
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {adProjects.map((project) => (
                  <AdProjectCard
                    key={project.id}
                    project={project}
                    onDelete={handleDeleteAdProject}
                    formatRelativeTime={formatRelativeTime}
                  />
                ))}
              </div>
            )
          ) : activeTab === "motions" ? (
            /* Motions Tab */
            <div className="mt-4">
              {/* Upload button */}
              <div className="mb-6 flex justify-end">
                <Button
                  onClick={() => setMotionUploadOpen(true)}
                  className="bg-[#2a2a2a] border border-[#404040] text-white hover:bg-[#333333]"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  モーション動画をアップロード
                </Button>
              </div>

              {/* Motions list */}
              {loadingMotions ? (
                <CardGridSkeleton count={8} />
              ) : motions.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#404040] p-12 text-center">
                  <Play className="mx-auto h-12 w-12 text-gray-500" />
                  <h3 className="mt-4 text-lg font-medium text-white">
                    モーション動画がありません
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    Act-Two用のパフォーマンス動画をアップロードしてください
                  </p>
                  <Button
                    className="mt-4 bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0"
                    onClick={() => setMotionUploadOpen(true)}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    アップロード
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {MOTION_CATEGORIES.map((category) => {
                    const categoryMotions = motions.filter((m) => m.category === category.id);
                    if (categoryMotions.length === 0) return null;
                    return (
                      <div key={category.id}>
                        <h3 className="mb-3 text-sm font-medium text-gray-300">
                          {category.label}
                        </h3>
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {categoryMotions.map((motion) => (
                            <MotionCard
                              key={motion.id}
                              motion={motion}
                              onDelete={handleDeleteMotion}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Upload modal */}
              {motionUploadOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                  <div className="w-full max-w-lg rounded-xl bg-[#2a2a2a] border border-[#404040] p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                        モーション動画をアップロード
                      </h3>
                      <button
                        onClick={() => setMotionUploadOpen(false)}
                        className="text-gray-400 hover:text-white"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <p className="mt-2 text-sm text-gray-400">
                      Act-Two APIで使用するパフォーマンス動画をR2にアップロードします
                    </p>

                    <div className="mt-4 space-y-4">
                      {/* File selection (drag & drop supported) */}
                      <label
                        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all ${
                          isDragging
                            ? "border-[#fce300] bg-[#fce300]/10"
                            : motionFile
                            ? "border-green-500 bg-green-500/10"
                            : "border-[#505050] hover:border-[#606060]"
                        }`}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime,.mp4,.mov"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setMotionFile(file);
                          }}
                        />
                        {isDragging ? (
                          <>
                            <Upload className="h-10 w-10 text-[#fce300] animate-bounce" />
                            <span className="text-sm font-medium text-[#fce300]">
                              ここにドロップしてください
                            </span>
                          </>
                        ) : motionFile ? (
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle className="h-8 w-8 text-green-500" />
                            <span className="text-sm font-medium text-white">
                              {motionFile.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              クリックまたはドラッグで変更
                            </span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-10 w-10 text-gray-500" />
                            <span className="text-sm text-gray-400">
                              ドラッグ&ドロップ または クリックして選択
                            </span>
                            <span className="text-xs text-gray-500">
                              MP4, MOV形式（最大50MB）
                            </span>
                          </>
                        )}
                      </label>

                      {/* Category selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300">
                          カテゴリ
                        </label>
                        <select
                          value={motionCategory}
                          onChange={(e) => setMotionCategory(e.target.value as typeof motionCategory)}
                          className="mt-1 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[#fce300] focus:outline-none"
                        >
                          {MOTION_CATEGORIES.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Motion ID */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300">
                          モーションID（英数字、アンダースコア）
                        </label>
                        <input
                          type="text"
                          value={motionId}
                          onChange={(e) => setMotionId(e.target.value.replace(/[^a-z0-9_]/g, ''))}
                          placeholder="例: smile_gentle"
                          className="mt-1 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none"
                        />
                      </div>

                      {/* Japanese name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300">
                          日本語名
                        </label>
                        <input
                          type="text"
                          value={motionNameJa}
                          onChange={(e) => setMotionNameJa(e.target.value)}
                          placeholder="例: 穏やかな笑顔"
                          className="mt-1 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none"
                        />
                      </div>

                      {/* English name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300">
                          英語名
                        </label>
                        <input
                          type="text"
                          value={motionNameEn}
                          onChange={(e) => setMotionNameEn(e.target.value)}
                          placeholder="例: Gentle Smile"
                          className="mt-1 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none"
                        />
                      </div>

                      {/* Duration */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300">
                          再生時間（秒）
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={motionDuration}
                          onChange={(e) => setMotionDuration(parseInt(e.target.value) || 5)}
                          className="mt-1 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[#fce300] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setMotionUploadOpen(false)}
                        disabled={uploadingMotion}
                        className="border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white"
                      >
                        キャンセル
                      </Button>
                      <Button
                        onClick={handleUploadMotion}
                        disabled={uploadingMotion || !motionFile || !motionId || !motionNameJa || !motionNameEn}
                        className="bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0"
                      >
                        {uploadingMotion ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            アップロード中...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            アップロード
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "images" ? (
            /* Images Library Tab */
            <div className="mt-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">画像ライブラリ</h2>
                <Link href="/library">
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white font-semibold border-0">
                    <Plus className="mr-2 h-4 w-4" />
                    画像を生成
                  </Button>
                </Link>
              </div>

              {loadingLibrary ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                </div>
              ) : libraryImages.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-purple-500/30 bg-purple-500/5 p-12 text-center">
                  <ImageIcon className="mx-auto h-12 w-12 text-purple-400" />
                  <h3 className="mt-4 text-lg font-medium text-white">
                    画像がありません
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    「画像を生成」ボタンから画像を作成できます
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {libraryImages.map((image) => (
                    <div key={image.id} className="relative group rounded-lg overflow-hidden bg-[#2a2a2a] aspect-[9/16]">
                      <img
                        src={image.thumbnail_url || image.image_url}
                        alt={image.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <span className="text-white text-sm truncate">{image.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === "uploaded" ? (
            /* Uploaded Videos Tab */
            <div className="mt-4">
              {/* Upload area */}
              <div
                className={`mb-6 rounded-xl border-2 border-dashed p-8 transition-all ${
                  uploadingUserVideo
                    ? "border-[#fce300] bg-[#fce300]/10"
                    : "border-[#505050] hover:border-[#606060] hover:bg-[#2a2a2a]"
                }`}
                onDragEnter={(e) => {
                  if (uploadingUserVideo) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add("border-[#fce300]", "bg-[#fce300]/10");
                }}
                onDragOver={(e) => {
                  if (uploadingUserVideo) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  if (uploadingUserVideo) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-[#fce300]", "bg-[#fce300]/10");
                }}
                onDrop={async (e) => {
                  if (uploadingUserVideo) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-[#fce300]", "bg-[#fce300]/10");
                  const file = e.dataTransfer.files?.[0];
                  console.log("[Upload] Dropped file:", file?.name, file?.type);
                  if (file) {
                    const isVideo = file.type.startsWith("video/") ||
                                    file.name.toLowerCase().endsWith(".mp4") ||
                                    file.name.toLowerCase().endsWith(".mov");
                    if (isVideo) {
                      setUploadingUserVideo(true);
                      try {
                        const result = await userVideosApi.upload(file);
                        mutateUserVideos([result, ...userVideos], false);
                      } catch (error) {
                        console.error("Upload failed:", error);
                        alert(error instanceof Error ? error.message : "アップロードに失敗しました");
                      } finally {
                        setUploadingUserVideo(false);
                      }
                    } else {
                      alert("MP4またはMOV形式の動画をアップロードしてください");
                    }
                  }
                }}
              >
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3">
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    className="hidden"
                    disabled={uploadingUserVideo}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      console.log("[Upload] Selected file:", file?.name, file?.type);
                      if (file) {
                        setUploadingUserVideo(true);
                        try {
                          const result = await userVideosApi.upload(file);
                          mutateUserVideos([result, ...userVideos], false);
                        } catch (error) {
                          console.error("Upload failed:", error);
                          alert(error instanceof Error ? error.message : "アップロードに失敗しました");
                        } finally {
                          setUploadingUserVideo(false);
                        }
                      }
                      // Reset input to allow uploading the same file again
                      e.target.value = "";
                    }}
                  />
                  {uploadingUserVideo ? (
                    <>
                      <Loader2 className="h-10 w-10 text-[#fce300] animate-spin" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-white">
                          アップロード中...
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          しばらくお待ちください
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-gray-500" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-white">
                          ドラッグ&ドロップ または クリックしてアップロード
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          MP4, MOV形式 / 最大50MB / 最大10秒 / 最大4K
                        </p>
                      </div>
                    </>
                  )}
                </label>
              </div>

              {/* Videos list */}
              {loadingUserVideos ? (
                <CardGridSkeleton count={8} />
              ) : userVideos.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#404040] p-12 text-center">
                  <Video className="mx-auto h-12 w-12 text-gray-500" />
                  <h3 className="mt-4 text-lg font-medium text-white">
                    アップロードした動画はありません
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    上のエリアに動画をドラッグ&ドロップしてください
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {userVideos.map((video) => (
                    <UserVideoCard
                      key={video.id}
                      video={video}
                      onDelete={handleDeleteUserVideo}
                      formatRelativeTime={formatRelativeTime}
                      onUpscale={(videoId) => {
                        setUpscaleModalVideoId(videoId);
                        setUpscaleEstimate(null);
                        setUpscaleModel('prob-4');
                        setUpscaleScale('2x');
                      }}
                      upscaleStatus={upscaleStatuses[video.id] || null}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Upscale Modal */}
        {upscaleModalVideoId && (() => {
          const video = userVideos.find(v => v.id === upscaleModalVideoId);
          if (!video) return null;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setUpscaleModalVideoId(null);
                  setUpscaleEstimate(null);
                }
              }}
            >
              <div className="w-full max-w-lg rounded-xl bg-[#2a2a2a] border border-[#404040] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">アップスケール設定</h3>
                  <button
                    onClick={() => { setUpscaleModalVideoId(null); setUpscaleEstimate(null); }}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* 現在の解像度 */}
                <div className="mb-4 rounded-lg bg-[#1a1a1a] p-3">
                  <p className="text-xs text-gray-400">現在の解像度</p>
                  <p className="text-sm font-medium text-white">{video.width} x {video.height}</p>
                </div>

                {/* 倍率選択 */}
                <div className="mb-4">
                  <label className="text-xs text-gray-400 mb-1 block">倍率</label>
                  <div className="flex gap-2">
                    {(['2x', '4x'] as TopazUpscaleScale[]).map((scale) => (
                      <button
                        key={scale}
                        onClick={() => { setUpscaleScale(scale); setUpscaleEstimate(null); }}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                          upscaleScale === scale
                            ? 'bg-[#fce300] text-black'
                            : 'bg-[#1a1a1a] text-gray-300 hover:bg-[#333]'
                        }`}
                      >
                        {scale}
                      </button>
                    ))}
                  </div>
                </div>

                {/* モデル選択 */}
                <div className="mb-4">
                  <label className="text-xs text-gray-400 mb-1 block">モデル</label>
                  <select
                    value={upscaleModel}
                    onChange={(e) => { setUpscaleModel(e.target.value as EnhanceModel); setUpscaleEstimate(null); }}
                    className="w-full rounded-lg bg-[#1a1a1a] border border-[#404040] px-3 py-2 text-sm text-white focus:border-[#fce300] focus:outline-none"
                  >
                    <option value="prob-4">Proteus（汎用・推奨）</option>
                    <option value="ahq-12">Artemis HQ（高画質）</option>
                    <option value="amq-13">Artemis MQ（中画質）</option>
                    <option value="alq-13">Artemis LQ（低画質復元）</option>
                    <option value="ghq-5">Gaia HQ（バランス型）</option>
                    <option value="gcg-5">Gaia CG（CG/アニメ向け）</option>
                    <option value="nyk-3">Nyx（デノイズ特化）</option>
                    <option value="rhea-1">Rhea（4x特化）</option>
                    <option value="iris-3">Iris（顔特化）</option>
                    <option value="thd-3">Theia Detail（ディテール強化）</option>
                    <option value="thf-4">Theia Fine（微細ディテール）</option>
                  </select>
                </div>

                {/* 見積もりボタン & 結果 */}
                {!upscaleEstimate ? (
                  <button
                    onClick={handleEstimateUpscale}
                    disabled={estimating}
                    className="w-full rounded-lg bg-[#333] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#444] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {estimating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        見積もり中...
                      </>
                    ) : (
                      '見積もりを取得'
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-[#1a1a1a] p-3 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">目標解像度</span>
                        <span className="text-white">{upscaleEstimate.target_width} x {upscaleEstimate.target_height}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">推定クレジット</span>
                        <span className="text-white">{upscaleEstimate.estimated_credits_min}〜{upscaleEstimate.estimated_credits_max}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">推定処理時間</span>
                        <span className="text-white">
                          {Math.ceil(upscaleEstimate.estimated_time_min / 60)}〜{Math.ceil(upscaleEstimate.estimated_time_max / 60)}分
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleStartUpscale}
                      disabled={startingUpscale}
                      className="w-full rounded-lg bg-[#fce300] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#fce300]/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {startingUpscale ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          開始中...
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="h-4 w-4" />
                          アップスケール開始
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* BGM Upload Modal */}
        {bgmModalVideoId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl bg-[#2a2a2a] border border-[#404040] p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  BGMを追加
                </h3>
                <button
                  onClick={() => setBgmModalVideoId(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mt-2 text-sm text-gray-400">
                この動画にBGMを追加します。処理には数分かかる場合があります。
              </p>

              <label
                className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#505050] p-8 transition-colors hover:border-[#606060]"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add("border-[#fce300]", "bg-[#fce300]/10");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-[#fce300]", "bg-[#fce300]/10");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-[#fce300]", "bg-[#fce300]/10");
                  const file = e.dataTransfer.files?.[0];
                  if (file && bgmModalVideoId && !uploadingBgm) {
                    handleAddBgm(bgmModalVideoId, file);
                  }
                }}
              >
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && bgmModalVideoId) {
                      handleAddBgm(bgmModalVideoId, file);
                    }
                  }}
                  disabled={uploadingBgm}
                />
                {uploadingBgm ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-[#fce300]" />
                    <span className="text-sm text-gray-400">
                      アップロード中...
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-gray-500" />
                    <span className="text-sm text-gray-400">
                      クリックまたはドラッグ&ドロップ
                    </span>
                    <span className="text-xs text-gray-500">
                      MP3, WAV, M4A（20MB以下）
                    </span>
                  </>
                )}
              </label>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setBgmModalVideoId(null)}
                  disabled={uploadingBgm}
                  className="border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white"
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
