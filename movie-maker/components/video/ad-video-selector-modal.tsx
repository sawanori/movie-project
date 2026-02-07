"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X, Check, Loader2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { videosApi, storyboardApi, Storyboard, userVideosApi, UserVideo } from "@/lib/api/client";
import { AspectRatio } from "@/lib/types/video";
import { SelectedVideo } from "./ad-cut-card";
import { UserVideoUploader } from "./user-video-uploader";

interface VideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
}

type TabType = "scene" | "storyboard" | "uploaded";

interface AdVideoSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (video: SelectedVideo) => void;
  cutDescription: string;
  cutDuration: number;
  aspectRatio: AspectRatio;
}

// 動画のメタデータを取得するヘルパー関数
const getVideoDuration = (url: string): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = url;
    video.onloadedmetadata = () => {
      resolve(video.duration);
    };
    video.onerror = () => {
      console.warn("Failed to load video metadata, using default");
      resolve(5.0);
    };
    // タイムアウト設定（5秒）
    setTimeout(() => {
      resolve(5.0);
    }, 5000);
  });
};

export function AdVideoSelectorModal({
  isOpen,
  onClose,
  onSelect,
  cutDescription,
  cutDuration,
  aspectRatio,
}: AdVideoSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("scene");
  const [sceneVideos, setSceneVideos] = useState<VideoItem[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [userVideos, setUserVideos] = useState<UserVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"scene" | "storyboard" | "uploaded" | null>(null);
  const [showUploader, setShowUploader] = useState(false);

  // 動画一覧を読み込み
  useEffect(() => {
    if (!isOpen) return;

    const loadVideos = async () => {
      setLoading(true);
      try {
        const [videosResponse, storyboardResponse, userVideosResponse] = await Promise.all([
          videosApi.list(1, 100).catch(() => ({ videos: [], total: 0 })),
          storyboardApi.list(1, 100).catch(() => ({ storyboards: [], total: 0 })),
          userVideosApi.list(1, 100).catch(() => ({ videos: [], total: 0, page: 1, per_page: 100, has_next: false })),
        ]);

        console.log("[AdVideoSelector] Loaded user videos:", userVideosResponse.videos?.length || 0);

        // completedのみフィルタ（final_video_urlがある）
        setSceneVideos(
          (videosResponse.videos || []).filter(
            (v: VideoItem) => v.status === "completed" && v.final_video_url
          )
        );

        // ストーリーボードの各シーンも取得
        setStoryboards(storyboardResponse.storyboards || []);

        // ユーザーアップロード動画
        setUserVideos(userVideosResponse.videos || []);
      } catch (err) {
        console.error("Failed to load videos:", err);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, [isOpen]);

  // リセット
  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setSelectedType(null);
      setShowUploader(false);
    }
  }, [isOpen]);

  // シーン動画リスト
  const filteredSceneVideos = useMemo(() => {
    return sceneVideos;
  }, [sceneVideos]);

  // ストーリーボード動画リスト（completedシーンのみ）
  const storyboardVideos = useMemo(() => {
    const videos: Array<{
      id: string;
      storyboardId: string;
      sceneNumber: number;
      description: string;
      thumbnailUrl: string;
      videoUrl: string;
      duration: number;
    }> = [];

    storyboards.forEach((sb) => {
      sb.scenes?.forEach((scene) => {
        if (scene.status === "completed" && scene.video_url) {
          videos.push({
            id: `${sb.id}_${scene.scene_number}`,
            storyboardId: sb.id,
            sceneNumber: scene.scene_number,
            description: scene.description_ja,
            thumbnailUrl: scene.scene_image_url || sb.source_image_url,
            videoUrl: scene.video_url,
            duration: scene.duration_seconds || 5,
          });
        }
      });
    });

    return videos;
  }, [storyboards]);

  // 選択ハンドラ
  const handleSelect = async () => {
    console.log("[AdVideoSelector] handleSelect called:", { selectedId, selectedType });
    if (!selectedId || !selectedType) return;

    let videoUrl = "";
    let thumbnailUrl = "";
    let originalDuration = 5;

    if (selectedType === "scene") {
      const video = sceneVideos.find((v) => v.id === selectedId);
      if (video && video.final_video_url) {
        videoUrl = video.final_video_url;
        thumbnailUrl = video.original_image_url;
        originalDuration = await getVideoDuration(videoUrl);
      }
    } else if (selectedType === "storyboard") {
      const video = storyboardVideos.find((v) => v.id === selectedId);
      if (video) {
        videoUrl = video.videoUrl;
        thumbnailUrl = video.thumbnailUrl;
        originalDuration = video.duration;
      }
    } else if (selectedType === "uploaded") {
      const video = userVideos.find((v) => v.id === selectedId);
      console.log("[AdVideoSelector] Found uploaded video:", video);
      if (video) {
        videoUrl = video.video_url;
        thumbnailUrl = video.thumbnail_url || "";
        originalDuration = video.duration_seconds;
      }
    }

    if (!videoUrl) return;

    const selectedVideo: SelectedVideo = {
      id: selectedId,
      type: selectedType,
      videoUrl,
      thumbnailUrl,
      originalDuration,
      trimStart: 0,
      trimEnd: Math.min(cutDuration, originalDuration),
    };

    onSelect(selectedVideo);
    onClose();
  };

  // アップロード完了ハンドラ
  const handleUploadComplete = (video: UserVideo) => {
    setUserVideos((prev) => [video, ...prev]);
    setShowUploader(false);
    setSelectedId(video.id);
    setSelectedType("uploaded");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* モーダル */}
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] bg-background rounded-xl shadow-xl flex flex-col mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold">動画を選択</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {cutDescription}
            </p>
            <p className="text-xs text-muted-foreground">
              推奨秒数: {cutDuration}秒
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("scene")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "scene"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            シーン動画 ({filteredSceneVideos.length})
          </button>
          <button
            onClick={() => setActiveTab("storyboard")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "storyboard"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            ストーリー動画 ({storyboardVideos.length})
          </button>
          <button
            onClick={() => setActiveTab("uploaded")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "uploaded"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            マイ動画 ({userVideos.length})
          </button>
        </div>

        {/* 動画リスト */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === "scene" ? (
            filteredSceneVideos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                シーン動画がありません
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filteredSceneVideos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => {
                      setSelectedId(video.id);
                      setSelectedType("scene");
                    }}
                    className={cn(
                      "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                      selectedId === video.id && selectedType === "scene"
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-primary/50"
                    )}
                  >
                    <img
                      src={video.original_image_url}
                      alt={video.user_prompt}
                      className="w-full h-full object-cover"
                    />
                    {selectedId === video.id && selectedType === "scene" && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )
          ) : activeTab === "storyboard" ? (
            storyboardVideos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                ストーリー動画がありません
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {storyboardVideos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => {
                      setSelectedId(video.id);
                      setSelectedType("storyboard");
                    }}
                    className={cn(
                      "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                      selectedId === video.id && selectedType === "storyboard"
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-primary/50"
                    )}
                  >
                    <img
                      src={video.thumbnailUrl}
                      alt={video.description}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <span className="text-xs text-white">
                        {video.duration.toFixed(1)}秒
                      </span>
                    </div>
                    {selectedId === video.id && selectedType === "storyboard" && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )
          ) : (
            /* マイ動画タブ */
            showUploader ? (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUploader(false)}
                >
                  ← 戻る
                </Button>
                <UserVideoUploader
                  onUploadComplete={handleUploadComplete}
                  onError={(err) => console.error("Upload error:", err)}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Button
                  variant="outline"
                  onClick={() => setShowUploader(true)}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  新規アップロード
                </Button>

                {userVideos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>アップロードした動画はありません</p>
                    <p className="text-xs mt-1">MP4/MOV、最大50MB、10秒まで</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {userVideos.map((video) => (
                      <button
                        key={video.id}
                        onClick={() => {
                          console.log("[AdVideoSelector] Selected user video:", video.id, video.title);
                          setSelectedId(video.id);
                          setSelectedType("uploaded");
                        }}
                        className={cn(
                          "relative aspect-video rounded-lg overflow-hidden border-2 transition-all bg-zinc-900",
                          selectedId === video.id && selectedType === "uploaded"
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-transparent hover:border-primary/50"
                        )}
                      >
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={video.title}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                            <Video className="w-6 h-6 text-zinc-500" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                          <span className="text-xs text-white">
                            {video.duration_seconds.toFixed(1)}秒
                          </span>
                        </div>
                        {selectedId === video.id && selectedType === "uploaded" && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-primary" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t">
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedId || !selectedType}
          >
            選択
          </Button>
        </div>
      </div>
    </div>
  );
}
