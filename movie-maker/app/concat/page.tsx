"use client";

import { useEffect, useState, useCallback, useMemo, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { VideoTrimCard } from "@/components/video/video-trim-card";
import { AdPreviewPlayer } from "@/components/video/ad-preview-player";
import { AspectRatioSelector } from "@/components/video/aspect-ratio-selector";
import { BGMGenerator } from "@/components/video/bgm-generator";
import { SceneGeneratorModal } from "@/components/video/scene-generator-modal";
import { SceneImageGeneratorModal } from "@/components/video/scene-image-generator-modal";
import { AdModeSelector } from "@/components/video/ad-mode-selector";
import { AdScriptInput } from "@/components/video/ad-script-input";
import { AdScriptPreview } from "@/components/video/ad-script-preview";
import { AdStoryboard, EditableCut, SelectedVideo } from "@/components/video/ad-storyboard";
import { AdVideoSelectorModal } from "@/components/video/ad-video-selector-modal";
import {
  videosApi,
  storyboardApi,
  userVideosApi,
  adCreatorApi,
  adCreatorProjectsApi,
  Storyboard,
  AdScriptResponse,
  AdCut,
  UserVideo,
  AdCreatorDraftMetadata,
  AdCreatorSelectableItem,
  AdCreatorTrimSetting,
  AdCreatorEditableCut,
  AdCreatorProject,
  MaterialExportCut,
} from "@/lib/api/client";
import {
  useAutoSaveAdCreatorDraft,
} from "@/lib/hooks/use-auto-save-ad-creator-draft";
import { AspectRatio, ASPECT_RATIOS, VideoProvider } from "@/lib/types/video";
import { CameraWorkSelection, CameraPreset } from "@/lib/camera/types";
import { CAMERA_PRESETS } from "@/lib/camera/presets";
import { CameraWorkModal } from "@/components/camera/CameraWorkModal";
import { distributeDurations } from "@/lib/duration-adjuster";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Video,
  CheckCircle,
  Loader2,
  Play,
  Download,
  History,
  Film,
  Scissors,
  RefreshCw,
  Check,
  X,
  Plus,
  Upload,
  Save,
  AlertCircle,
} from "lucide-react";

interface VideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
}

// 選択可能な動画アイテム（シーン動画/ストーリー動画/アップロード動画共通）
interface SelectableItem {
  id: string;
  type: "scene" | "storyboard" | "uploaded";
  label: string;
  thumbnailUrl: string;
  videoUrl: string;
}

// トリミング設定
interface TrimSetting {
  startTime: number;
  endTime: number;
  duration: number;
}

type TabType = "scene" | "storyboard" | "uploaded";

type TransitionType =
  | "none"
  | "fade"
  | "dissolve"
  | "wipeleft"
  | "wiperight"
  | "slideup"
  | "slidedown"
  | "circleopen"
  | "circleclose";

const TRANSITIONS: { value: TransitionType; label: string; description: string }[] = [
  { value: "none", label: "なし", description: "カット切り替え" },
  { value: "fade", label: "フェード", description: "黒経由でフェード" },
  { value: "dissolve", label: "ディゾルブ", description: "クロスフェード" },
  { value: "wipeleft", label: "ワイプ左", description: "左方向へワイプ" },
  { value: "wiperight", label: "ワイプ右", description: "右方向へワイプ" },
  { value: "slideup", label: "スライド上", description: "上方向へスライド" },
  { value: "slidedown", label: "スライド下", description: "下方向へスライド" },
];

// 動画のメタデータを取得するヘルパー関数
interface VideoMetadata {
  duration: number;
  aspectRatio: AspectRatio;
}

const getVideoMetadata = (url: string): Promise<VideoMetadata> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = url;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const ratio = width / height;

      // アスペクト比を判定
      let aspectRatio: AspectRatio;
      if (ratio > 1.2) {
        aspectRatio = "16:9"; // 横長
      } else if (ratio < 0.8) {
        aspectRatio = "9:16"; // 縦長
      } else {
        aspectRatio = "1:1"; // 正方形
      }

      resolve({
        duration: video.duration,
        aspectRatio,
      });
    };
    video.onerror = () => {
      console.warn("Failed to load video metadata, using defaults");
      resolve({
        duration: 5.0,
        aspectRatio: "9:16", // デフォルトは縦長
      });
    };
    // タイムアウト設定（5秒）
    setTimeout(() => {
      resolve({
        duration: 5.0,
        aspectRatio: "9:16",
      });
    }, 5000);
  });
};

// 後方互換性のため
const getVideoDuration = async (url: string): Promise<number> => {
  const metadata = await getVideoMetadata(url);
  return metadata.duration;
};

function ConcatPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // プロジェクト管理（ダッシュボードからの読み込み/保存用）
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [projectLoading, setProjectLoading] = useState(false);

  // アスペクト比選択
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio | null>(null);

  // AI脚本モード関連
  const [adMode, setAdMode] = useState<"ai" | "manual" | null>(null);
  const [adScript, setAdScript] = useState<AdScriptResponse | null>(null);
  const [scriptConfirmed, setScriptConfirmed] = useState(false);
  const [isRegeneratingScript, setIsRegeneratingScript] = useState(false);
  const [storyboardCuts, setStoryboardCuts] = useState<EditableCut[]>([]);
  const [targetDuration, setTargetDuration] = useState<number | null>(null); // CM全体の目標尺（秒）
  const [currentAdCutId, setCurrentAdCutId] = useState<string | null>(null);
  const [isVideoSelectorOpen, setIsVideoSelectorOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>("scene");
  const [availableVideos, setAvailableVideos] = useState<VideoItem[]>([]);
  const [availableStoryboards, setAvailableStoryboards] = useState<Storyboard[]>([]);
  const [userUploadedVideos, setUserUploadedVideos] = useState<UserVideo[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectableItem[]>([]);
  const [trimSettings, setTrimSettings] = useState<Record<string, TrimSetting>>({});
  const [transition, setTransition] = useState<TransitionType>("none");
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [loading, setLoading] = useState(true);
  // 動画のアスペクト比キャッシュ（id -> aspectRatio）
  const [videoAspectRatios, setVideoAspectRatios] = useState<Record<string, AspectRatio>>({});
  const [processing, setProcessing] = useState(false);
  const [isExportingMaterials, setIsExportingMaterials] = useState(false);
  const [concatJobId, setConcatJobId] = useState<string | null>(null);
  const [concatStatus, setConcatStatus] = useState<{
    status: string;
    progress: number;
    video_url?: string;
    total_duration?: number;
  } | null>(null);

  // シーン生成モーダル
  const [isSceneGeneratorOpen, setIsSceneGeneratorOpen] = useState(false);

  // 画像生成モーダル（カットから新規動画生成時の画像生成フェーズ）
  const [isImageGeneratorOpen, setIsImageGeneratorOpen] = useState(false);
  const [imageGeneratorCut, setImageGeneratorCut] = useState<{
    cutId: string;
    descriptionJa: string;
    dialogue?: string;
    // 既存の生成画像（ある場合）
    initialImage?: {
      imageUrl: string;
      promptJa: string;
      promptEn: string;
    };
  } | null>(null);
  // 画像生成完了後にシーン生成モーダルに渡す初期画像URL
  const [initialImageForSceneGenerator, setInitialImageForSceneGenerator] = useState<string | null>(null);

  // 動画生成プロバイダー選択（全体設定）
  const [videoProvider, setVideoProvider] = useState<VideoProvider>("runway");
  const [klingMode, setKlingMode] = useState<"std" | "pro">("std");
  // デフォルトカメラワーク設定（全体設定）
  const [defaultCameraWork, setDefaultCameraWork] = useState<CameraWorkSelection>({
    preset: "simple",
    promptText: "static shot, camera remains still",
  });
  // カットごとのカメラワーク設定（cutId -> CameraWorkSelection）
  const [cameraWorkSelections, setCameraWorkSelections] = useState<Record<string, CameraWorkSelection>>({});
  // カメラワーク設定モーダル用のカットID
  const [cameraWorkModalCutId, setCameraWorkModalCutId] = useState<string | null>(null);
  // 全体設定用カメラワークモーダル表示フラグ
  const [isCameraWorkModalOpen, setIsCameraWorkModalOpen] = useState(false);
  // 現在動画生成中のカットID（シーン生成モーダルにプロンプトを渡すため）
  const [currentGeneratingCutId, setCurrentGeneratingCutId] = useState<string | null>(null);

  // ドラフト復元モーダル
  const [showDraftRestoreModal, setShowDraftRestoreModal] = useState(false);
  // ドラフトチェック中フラグ（ページ読み込み時のブロック用）
  const [isCheckingDraft, setIsCheckingDraft] = useState(true);

  // 1:1 アスペクト比ではシーン生成不可
  const canGenerateScene = selectedAspectRatio !== null && selectedAspectRatio !== "1:1";

  // ドラフト自動保存フック
  const {
    saveStatus,
    lastSavedAt,
    draftRestored,
    restoredDraft,
    draftExistsInfo,
    saveDraft,
    clearDraft,
    markDraftRestored,
    checkDraftExists,
    fetchDraft,
  } = useAutoSaveAdCreatorDraft({
    // TODO: 一時保存機能は読み込み速度の問題があるため一時的に無効化
    // 改善後に再度有効化する
    enabled: false, // !processing && concatStatus?.status !== "completed",
    getAspectRatio: () => selectedAspectRatio,
    getAdMode: () => adMode,
    getAdScript: () => adScript,
    getScriptConfirmed: () => scriptConfirmed,
    getTargetDuration: () => targetDuration,
    getStoryboardCuts: () => storyboardCuts.map((cut) => ({
      id: cut.id,
      cut_number: cut.cut_number,
      scene_type: cut.scene_type,
      scene_type_label: cut.scene_type_label,
      description_ja: cut.description_ja,
      description_en: cut.description_en,
      duration: cut.duration,
      // セリフと効果音を保存
      dialogue: cut.dialogue,
      sound_effect: cut.sound_effect,
      video: cut.video ? {
        id: cut.video.id,
        type: cut.video.type as 'scene' | 'storyboard' | 'uploaded',
        videoUrl: cut.video.videoUrl,
        thumbnailUrl: cut.video.thumbnailUrl,
        originalDuration: cut.video.originalDuration,
        trimStart: cut.video.trimStart,
        trimEnd: cut.video.trimEnd,
      } : null,
      // 生成画像の一時保存
      generatedImageUrl: cut.generatedImageUrl,
      generatedPromptJa: cut.generatedPromptJa,
      generatedPromptEn: cut.generatedPromptEn,
    })),
    getSelectedItems: () => selectedItems.map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      thumbnailUrl: item.thumbnailUrl,
      videoUrl: item.videoUrl,
    })),
    getTrimSettings: () => {
      const settings: Record<string, AdCreatorTrimSetting> = {};
      for (const [key, value] of Object.entries(trimSettings)) {
        settings[key] = {
          startTime: value.startTime,
          endTime: value.endTime,
          duration: value.duration,
        };
      }
      return settings;
    },
    getTransition: () => transition,
    getTransitionDuration: () => transitionDuration,
  });

  // シーン生成完了時のハンドラ
  const handleSceneGenerated = useCallback(() => {
    loadVideos();
  }, []);

  // AI脚本モード選択ハンドラ
  const handleSelectAdMode = useCallback((mode: "ai" | "manual") => {
    setAdMode(mode);
    if (mode === "manual") {
      // マニュアルモードの場合は既存フローへ
      setAdScript(null);
      setStoryboardCuts([]);
    }
  }, []);

  // AI脚本生成完了ハンドラ
  const handleScriptGenerated = useCallback((script: AdScriptResponse, duration: number) => {
    setAdScript(script);
    setTargetDuration(duration);  // 前のページで選択した尺をセット
    setScriptConfirmed(false);
    setStoryboardCuts([]);
  }, []);

  // 脚本確認・カット編集へ進むハンドラ（編集済みカットを受け取る）
  const handleConfirmScript = useCallback((editedCuts: AdCut[]) => {
    if (!adScript || !targetDuration) return;
    // 編集済みカットをEditableCutに変換して初期化
    const initialCuts: EditableCut[] = editedCuts.map((cut) => ({
      ...cut,
      video: null,
    }));
    // CM尺に合わせて秒数を均等に分配
    const distributedCuts = distributeDurations(initialCuts, targetDuration);
    setStoryboardCuts(distributedCuts);
    setScriptConfirmed(true);
  }, [adScript, targetDuration]);

  // AI脚本再生成ハンドラ（入力画面に戻る）
  const handleRegenerateScript = useCallback(() => {
    setAdScript(null);
    setScriptConfirmed(false);
    setStoryboardCuts([]);
  }, []);

  // カットに動画を割り当てるモーダルを開く
  const handleOpenVideoSelector = useCallback((cutId: string) => {
    setCurrentAdCutId(cutId);
    setIsVideoSelectorOpen(true);
  }, []);

  // カットに新規動画を生成（まず画像生成モーダルを開く）
  const handleGenerateVideoForCut = useCallback((cutId: string, descriptionEn: string) => {
    // カット情報を取得して画像生成モーダルを開く
    const cut = storyboardCuts.find((c) => c.id === cutId);
    if (!cut) return;

    setImageGeneratorCut({
      cutId,
      descriptionJa: cut.description_ja,
      dialogue: cut.dialogue,
      // 既存の生成画像があれば渡す
      initialImage: cut.generatedImageUrl ? {
        imageUrl: cut.generatedImageUrl,
        promptJa: cut.generatedPromptJa || "",
        promptEn: cut.generatedPromptEn || "",
      } : undefined,
    });
    setCurrentAdCutId(cutId);
    setIsImageGeneratorOpen(true);
  }, [storyboardCuts]);

  // 画像生成完了後のハンドラ（カットに画像を一時保存）
  const handleImageConfirmed = useCallback((imageUrl: string, promptJa: string, promptEn: string) => {
    // imageGeneratorCut.cutId を使用（currentAdCutIdよりも信頼性が高い）
    const targetCutId = imageGeneratorCut?.cutId;
    if (!targetCutId) {
      return;
    }

    // カットに生成画像を保存
    setStoryboardCuts((prev) =>
      prev.map((cut) =>
        cut.id === targetCutId
          ? {
              ...cut,
              generatedImageUrl: imageUrl,
              generatedPromptJa: promptJa,
              generatedPromptEn: promptEn,
            }
          : cut
      )
    );

    // モーダルを閉じる
    setIsImageGeneratorOpen(false);
    setImageGeneratorCut(null);
    setCurrentAdCutId(null);
  }, [imageGeneratorCut, currentAdCutId]);

  // 保存された画像から動画を生成（シーン生成モーダルを開く）
  const handleGenerateVideoFromImage = useCallback((cutId: string, imageUrl: string) => {
    setCurrentAdCutId(cutId);
    setCurrentGeneratingCutId(cutId);
    setInitialImageForSceneGenerator(imageUrl);
    setIsSceneGeneratorOpen(true);
  }, []);

  // 動画選択完了ハンドラ
  const handleVideoSelected = useCallback((video: SelectedVideo) => {
    if (!currentAdCutId) return;
    setStoryboardCuts((prev) =>
      prev.map((cut) =>
        cut.id === currentAdCutId ? { ...cut, video } : cut
      )
    );
    setIsVideoSelectorOpen(false);
    setCurrentAdCutId(null);
  }, [currentAdCutId]);

  // カットから直接動画を作成
  const handleCreateVideoFromCuts = useCallback(
    async (cuts: EditableCut[]) => {
      // 動画が割り当てられているカットのみ処理
      const cutsWithVideo = cuts.filter((cut) => cut.video !== null);

      if (cutsWithVideo.length < 2) {
        alert("2本以上の動画を選択してください");
        return;
      }

      setProcessing(true);
      setConcatStatus(null);

      try {
        // カットをconcat APIの形式に変換
        const videos = cutsWithVideo.map((cut) => ({
          video_url: cut.video!.videoUrl,
          start_time: cut.video!.trimStart,
          end_time: cut.video!.trimEnd,
        }));

        // トランジションなしで結合
        const res = await videosApi.concatV2({
          videos,
          transition: "none",
          transition_duration: 0,
        });
        setConcatJobId(res.id);
      } catch (error) {
        console.error("Failed to start concat:", error);
        alert("結合に失敗しました");
        setProcessing(false);
      }
    },
    []
  );

  // 選択したアスペクト比のラベルを取得
  const selectedAspectRatioLabel = useMemo(() => {
    if (!selectedAspectRatio) return null;
    return ASPECT_RATIOS.find((r) => r.value === selectedAspectRatio);
  }, [selectedAspectRatio]);

  // アスペクト比を変更する際に選択をリセット
  const handleChangeAspectRatio = useCallback(() => {
    setSelectedAspectRatio(null);
    setAdMode(null);
    setAdScript(null);
    setScriptConfirmed(false);
    setStoryboardCuts([]);
    setCurrentAdCutId(null);
    setSelectedItems([]);
    setTrimSettings({});
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadVideos();
    }
  }, [user]);

  // URLパラメータからプロジェクト読み込み
  useEffect(() => {
    const projectId = searchParams.get("project_id");
    if (projectId && user && !currentProjectId && !projectLoading) {
      loadProject(projectId);
    }
  }, [searchParams, user, currentProjectId, projectLoading]);

  // プロジェクトを読み込む関数
  const loadProject = async (projectId: string) => {
    setProjectLoading(true);
    try {
      const project = await adCreatorProjectsApi.get(projectId);
      setCurrentProjectId(project.id);
      setProjectTitle(project.title);

      // プロジェクトデータから状態を復元
      if (project.aspect_ratio) {
        setSelectedAspectRatio(project.aspect_ratio as AspectRatio);
      }
      if (project.target_duration) {
        setTargetDuration(project.target_duration);
      }

      // project_data (AdCreatorDraftMetadata) から詳細を復元
      if (project.project_data) {
        const data = project.project_data;

        if (data.ad_mode) {
          setAdMode(data.ad_mode);
        }
        if (data.ad_script) {
          setAdScript(data.ad_script);
        }
        if (data.script_confirmed) {
          setScriptConfirmed(data.script_confirmed);
        }
        if (data.storyboard_cuts && data.storyboard_cuts.length > 0) {
          // AdCreatorEditableCut[] を EditableCut[] に変換
          const cuts: EditableCut[] = data.storyboard_cuts.map((cut) => ({
            id: cut.id,
            cut_number: cut.cut_number,
            scene_type: cut.scene_type,
            scene_type_label: cut.scene_type_label,
            description_ja: cut.description_ja,
            description_en: cut.description_en,
            duration: cut.duration,
            dialogue: cut.dialogue,
            sound_effect: cut.sound_effect,
            video: cut.video ? {
              id: cut.video.id,
              type: cut.video.type,
              videoUrl: cut.video.videoUrl,
              thumbnailUrl: cut.video.thumbnailUrl || "",
              originalDuration: cut.video.originalDuration,
              trimStart: cut.video.trimStart,
              trimEnd: cut.video.trimEnd,
            } : null,
            generatedImageUrl: cut.generatedImageUrl,
            generatedPromptJa: cut.generatedPromptJa,
            generatedPromptEn: cut.generatedPromptEn,
          }));
          setStoryboardCuts(cuts);
        }
        if (data.selected_items && data.selected_items.length > 0) {
          // AdCreatorSelectableItem[] を SelectableItem[] に変換
          const items: SelectableItem[] = data.selected_items.map((item) => ({
            id: item.id,
            type: item.type,
            label: item.label,
            thumbnailUrl: item.thumbnailUrl,
            videoUrl: item.videoUrl,
          }));
          setSelectedItems(items);
        }
        if (data.trim_settings) {
          // Record<string, AdCreatorTrimSetting> を Record<string, TrimSetting> に変換
          const settings: Record<string, TrimSetting> = {};
          for (const [key, value] of Object.entries(data.trim_settings)) {
            settings[key] = {
              startTime: value.startTime,
              endTime: value.endTime,
              duration: value.duration,
            };
          }
          setTrimSettings(settings);
        }
        if (data.transition) {
          setTransition(data.transition as TransitionType);
        }
        if (data.transition_duration) {
          setTransitionDuration(data.transition_duration);
        }
      }

      // 動画完了済みの場合はステータスを設定
      if (project.status === "completed" && project.final_video_url) {
        setConcatStatus({
          status: "completed",
          progress: 100,
          video_url: project.final_video_url,
        });
      }
    } catch (error) {
      console.error("Failed to load project:", error);
      alert("プロジェクトの読み込みに失敗しました");
      // URLからproject_idを削除
      router.replace("/concat");
    } finally {
      setProjectLoading(false);
    }
  };

  // ドラフト存在確認（軽量）→ モーダル表示
  // TODO: 一時保存機能は読み込み速度の問題があるため一時的に無効化
  useEffect(() => {
    // 一時保存機能無効化中はすぐにチェック完了としてUIを表示
    setIsCheckingDraft(false);

    /* 一時保存機能有効化時は以下を使用
    const checkDraft = async () => {
      if (user && !draftRestored) {
        const result = await checkDraftExists();
        if (result.exists) {
          // ドラフトが存在すればモーダルを表示
          setShowDraftRestoreModal(true);
        }
      }
      // チェック完了（軽量なのですぐ終わる）
      setIsCheckingDraft(false);
    };

    if (user) {
      checkDraft();
    } else if (!authLoading) {
      setIsCheckingDraft(false);
    }
    */
  }, [user, authLoading]);

  // プロジェクト保存済みフラグ（二重保存防止）- useRefで管理
  const projectSavedRef = useRef(false);

  // プロジェクトを保存する関数
  const saveProjectToDatabase = useCallback(async (videoUrl: string) => {
    // 二重保存防止
    if (projectSavedRef.current) {
      console.log("[ConcatPage] Project already saved, skipping...");
      return;
    }
    projectSavedRef.current = true;

    console.log("[ConcatPage] Video completed, saving project...");
    console.log("[ConcatPage] videoUrl:", videoUrl);
    console.log("[ConcatPage] currentProjectId:", currentProjectId);
    console.log("[ConcatPage] selectedAspectRatio:", selectedAspectRatio);

    // プロジェクトデータを構築
    const projectData: AdCreatorDraftMetadata = {
      schema_version: 1,
      aspect_ratio: selectedAspectRatio,
      ad_mode: adMode,
      ad_script: adScript,
      script_confirmed: scriptConfirmed,
      storyboard_cuts: storyboardCuts.map((cut) => ({
        id: cut.id,
        cut_number: cut.cut_number,
        scene_type: cut.scene_type,
        scene_type_label: cut.scene_type_label,
        description_ja: cut.description_ja,
        description_en: cut.description_en,
        duration: cut.duration,
        dialogue: cut.dialogue,
        sound_effect: cut.sound_effect,
        video: cut.video ? {
          id: cut.video.id,
          type: cut.video.type as 'scene' | 'storyboard' | 'uploaded',
          videoUrl: cut.video.videoUrl,
          thumbnailUrl: cut.video.thumbnailUrl,
          originalDuration: cut.video.originalDuration,
          trimStart: cut.video.trimStart,
          trimEnd: cut.video.trimEnd,
        } : null,
        generatedImageUrl: cut.generatedImageUrl,
        generatedPromptJa: cut.generatedPromptJa,
        generatedPromptEn: cut.generatedPromptEn,
      })),
      target_duration: targetDuration,
      selected_items: selectedItems.map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        thumbnailUrl: item.thumbnailUrl,
        videoUrl: item.videoUrl,
      })),
      trim_settings: (() => {
        const settings: Record<string, AdCreatorTrimSetting> = {};
        for (const [key, value] of Object.entries(trimSettings)) {
          settings[key] = {
            startTime: value.startTime,
            endTime: value.endTime,
            duration: value.duration,
          };
        }
        return settings;
      })(),
      transition: transition,
      transition_duration: transitionDuration,
      last_saved_at: new Date().toISOString(),
      auto_saved: false,
    };

    try {
      if (currentProjectId) {
        // 既存プロジェクトを更新
        console.log("[ConcatPage] Updating existing project:", currentProjectId);
        await adCreatorProjectsApi.update(currentProjectId, {
          status: "completed",
          final_video_url: videoUrl,
          project_data: projectData,
        });
        console.log("[ConcatPage] Project updated successfully:", currentProjectId);
      } else {
        // 新規プロジェクトを作成
        const title = projectTitle || `広告動画 ${new Date().toLocaleDateString("ja-JP")}`;
        console.log("[ConcatPage] Creating new project with title:", title);
        const project = await adCreatorProjectsApi.create({
          title,
          aspect_ratio: selectedAspectRatio || "16:9",
          target_duration: targetDuration || 30,
          theory: adScript?.theory,
          project_data: projectData,
        });
        setCurrentProjectId(project.id);
        setProjectTitle(project.title);
        console.log("[ConcatPage] New project created successfully:", project.id);

        // URLにproject_idを追加（ページリロード時に復元可能に）
        router.replace(`/concat?project_id=${project.id}`);
      }
    } catch (error) {
      console.error("[ConcatPage] Failed to save project:", error);
      // エラー時はリトライ可能にするためフラグをリセット
      projectSavedRef.current = false;
    }
  }, [
    currentProjectId,
    projectTitle,
    selectedAspectRatio,
    targetDuration,
    adMode,
    adScript,
    scriptConfirmed,
    storyboardCuts,
    selectedItems,
    trimSettings,
    transition,
    transitionDuration,
    router,
  ]);

  // 動画結合完了時にドラフトをクリアし、プロジェクトを保存
  useEffect(() => {
    if (concatStatus?.status === "completed" && concatStatus.video_url) {
      clearDraft();
      saveProjectToDatabase(concatStatus.video_url);
    }
  }, [concatStatus?.status, concatStatus?.video_url, clearDraft, saveProjectToDatabase]);

  // 復元中フラグ
  const [isRestoring, setIsRestoring] = useState(false);

  // ドラフトを復元する関数（フルデータ取得→復元）
  const restoreDraftState = useCallback(async () => {
    setIsRestoring(true);

    // フルデータを取得
    const success = await fetchDraft();
    if (!success) {
      // 取得失敗時はエラー表示してリセット
      alert("ドラフトの読み込みに失敗しました");
      setIsRestoring(false);
      setShowDraftRestoreModal(false);
    }
    // 成功時は useEffect で復元処理が実行される
  }, [fetchDraft]);

  /**
   * 編集用素材をProRes形式でZIPダウンロード
   * AIモード（storyboardCuts）と手動モード（selectedItems）の両方に対応
   */
  const handleExportMaterials = useCallback(async () => {
    let cuts: MaterialExportCut[] = [];

    // AIモード: storyboardCutsから動画を取得
    const cutsWithVideo = storyboardCuts.filter((cut) => cut.video);
    if (cutsWithVideo.length > 0) {
      cuts = cutsWithVideo.map((cut) => ({
        cut_number: cut.cut_number,
        label: cut.scene_type_label || `カット${cut.cut_number}`,
        video_url: cut.video!.videoUrl,
        trim_start: cut.video!.trimStart,
        trim_end: cut.video!.trimEnd,
      }));
    }
    // 手動モード: selectedItemsから動画を取得
    else if (selectedItems.length > 0) {
      cuts = selectedItems.map((item, index) => {
        const trim = trimSettings[item.id];
        return {
          cut_number: index + 1,
          label: item.label || `カット${index + 1}`,
          video_url: item.videoUrl,
          trim_start: trim?.startTime || 0,
          trim_end: trim?.endTime || null,
        };
      });
    }

    if (cuts.length === 0) {
      alert("エクスポートする動画がありません");
      return;
    }

    setIsExportingMaterials(true);
    try {
      const blob = await adCreatorApi.exportMaterials(cuts, selectedAspectRatio || "16:9");

      // ダウンロード実行
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `materials_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export materials:", error);
      alert(error instanceof Error ? error.message : "素材エクスポートに失敗しました");
    } finally {
      setIsExportingMaterials(false);
    }
  }, [storyboardCuts, selectedItems, trimSettings, selectedAspectRatio]);

  // restoredDraftが設定されたら実際の復元処理を実行
  useEffect(() => {
    if (!restoredDraft || !isRestoring) return;

    const draft = restoredDraft.draft_metadata;

    // アスペクト比を復元
    if (draft.aspect_ratio) {
      setSelectedAspectRatio(draft.aspect_ratio);
    }

    // モードを復元
    if (draft.ad_mode) {
      setAdMode(draft.ad_mode);
    }

    // AI脚本を復元
    if (draft.ad_script) {
      setAdScript(draft.ad_script);
    }

    // 脚本確認フラグを復元
    setScriptConfirmed(draft.script_confirmed);

    // CM目標尺を復元
    if (draft.target_duration !== undefined && draft.target_duration !== null) {
      setTargetDuration(draft.target_duration);
    }

    // カットを復元
    if (draft.storyboard_cuts && draft.storyboard_cuts.length > 0) {
      setStoryboardCuts(draft.storyboard_cuts.map((cut) => ({
        id: cut.id,
        cut_number: cut.cut_number,
        scene_type: cut.scene_type,
        scene_type_label: cut.scene_type_label,
        description_ja: cut.description_ja,
        description_en: cut.description_en,
        duration: cut.duration,
        // セリフと効果音を復元
        dialogue: cut.dialogue,
        sound_effect: cut.sound_effect,
        video: cut.video ? {
          id: cut.video.id,
          type: cut.video.type,
          videoUrl: cut.video.videoUrl,
          thumbnailUrl: cut.video.thumbnailUrl || '',
          originalDuration: cut.video.originalDuration,
          trimStart: cut.video.trimStart,
          trimEnd: cut.video.trimEnd,
        } : null,
        // 生成画像を復元
        generatedImageUrl: cut.generatedImageUrl,
        generatedPromptJa: cut.generatedPromptJa,
        generatedPromptEn: cut.generatedPromptEn,
      })));
    }

    // 手動モード用: 選択アイテムを復元
    if (draft.selected_items && draft.selected_items.length > 0) {
      setSelectedItems(draft.selected_items.map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        thumbnailUrl: item.thumbnailUrl,
        videoUrl: item.videoUrl,
      })));
    }

    // トリム設定を復元
    if (draft.trim_settings && Object.keys(draft.trim_settings).length > 0) {
      const settings: Record<string, TrimSetting> = {};
      for (const [key, value] of Object.entries(draft.trim_settings)) {
        settings[key] = {
          startTime: value.startTime,
          endTime: value.endTime,
          duration: value.duration,
        };
      }
      setTrimSettings(settings);
    }

    // トランジションを復元
    if (draft.transition) {
      setTransition(draft.transition as TransitionType);
    }
    setTransitionDuration(draft.transition_duration || 0.5);

    markDraftRestored();
    setShowDraftRestoreModal(false);
    setIsRestoring(false);
  }, [restoredDraft, isRestoring, markDraftRestored]);

  // ドラフトを破棄する関数
  const discardDraft = useCallback(() => {
    clearDraft();
    markDraftRestored();
    setShowDraftRestoreModal(false);
  }, [clearDraft, markDraftRestored]);

  // ステータスポーリング
  useEffect(() => {
    if (!concatJobId) return;

    const pollStatus = async () => {
      try {
        const status = await videosApi.getConcatStatus(concatJobId);
        setConcatStatus(status);

        if (status.status === "completed" || status.status === "failed") {
          setProcessing(false);
        }
      } catch (error) {
        console.error("Failed to poll concat status:", error);
      }
    };

    const interval = setInterval(pollStatus, 3000);
    pollStatus(); // 初回実行

    return () => clearInterval(interval);
  }, [concatJobId]);

  const loadVideos = async () => {
    try {
      // シーン動画、ストーリーボード、ユーザー動画を並行取得
      const [videosRes, storyboardsRes, userVideosRes] = await Promise.all([
        videosApi.list(1, 100),
        storyboardApi.list(1, 100),
        userVideosApi.list(1, 100).catch(() => ({ videos: [], total: 0, page: 1, per_page: 100, has_next: false })),
      ]);

      // 完了済みのシーン動画のみ表示
      const completedVideos = (videosRes.videos || []).filter(
        (v: VideoItem) => v.status === "completed" && v.final_video_url
      );
      setAvailableVideos(completedVideos);

      // 完了済みのストーリーボード（final_video_urlあり）のみ表示
      const completedStoryboards = (storyboardsRes.storyboards || []).filter(
        (s: Storyboard) => s.status === "completed" && s.final_video_url
      );
      setAvailableStoryboards(completedStoryboards);

      // ユーザーアップロード動画
      setUserUploadedVideos(userVideosRes.videos || []);

      // 動画のアスペクト比を非同期で検出
      const detectAspectRatios = async () => {
        const ratios: Record<string, AspectRatio> = {};

        // シーン動画のアスペクト比を検出
        for (const video of completedVideos) {
          if (video.final_video_url) {
            try {
              const metadata = await getVideoMetadata(video.final_video_url);
              ratios[video.id] = metadata.aspectRatio;
            } catch {
              ratios[video.id] = "9:16"; // デフォルト
            }
          }
        }

        // ストーリーボードのアスペクト比を検出
        for (const storyboard of completedStoryboards) {
          if (storyboard.final_video_url) {
            try {
              const metadata = await getVideoMetadata(storyboard.final_video_url);
              ratios[storyboard.id] = metadata.aspectRatio;
            } catch {
              ratios[storyboard.id] = "9:16"; // デフォルト
            }
          }
        }

        setVideoAspectRatios(ratios);
      };

      detectAspectRatios();
    } catch (error) {
      console.error("Failed to load videos:", error);
    } finally {
      setLoading(false);
    }
  };

  // シーン動画を選択/解除
  const toggleVideoSelection = async (video: VideoItem) => {
    const itemKey = video.id;
    const isSelected = selectedItems.some((i) => i.id === video.id && i.type === "scene");

    if (isSelected) {
      // 選択解除時: trimSettingsからも削除
      setSelectedItems(selectedItems.filter((i) => !(i.id === video.id && i.type === "scene")));
      setTrimSettings((prev) => {
        const next = { ...prev };
        delete next[itemKey];
        return next;
      });
    } else if (selectedItems.length < 10) {
      // 選択時: 動画の長さを取得してtrimSettingsに追加
      const duration = await getVideoDuration(video.final_video_url!);
      const item: SelectableItem = {
        id: video.id,
        type: "scene",
        label: video.user_prompt,
        thumbnailUrl: video.original_image_url,
        videoUrl: video.final_video_url!,
      };
      setSelectedItems([...selectedItems, item]);
      setTrimSettings((prev) => ({
        ...prev,
        [itemKey]: {
          startTime: 0,
          endTime: duration,
          duration: duration,
        },
      }));
    }
  };

  // ストーリーボードを選択/解除
  const toggleStoryboardSelection = async (storyboard: Storyboard) => {
    const itemKey = storyboard.id;
    const isSelected = selectedItems.some((i) => i.id === storyboard.id && i.type === "storyboard");

    if (isSelected) {
      // 選択解除時: trimSettingsからも削除
      setSelectedItems(selectedItems.filter((i) => !(i.id === storyboard.id && i.type === "storyboard")));
      setTrimSettings((prev) => {
        const next = { ...prev };
        delete next[itemKey];
        return next;
      });
    } else if (selectedItems.length < 10) {
      // 選択時: 動画の長さを取得してtrimSettingsに追加
      const duration = await getVideoDuration(storyboard.final_video_url!);
      const item: SelectableItem = {
        id: storyboard.id,
        type: "storyboard",
        label: storyboard.title || `ストーリー ${new Date(storyboard.created_at).toLocaleDateString()}`,
        thumbnailUrl: storyboard.source_image_url,
        videoUrl: storyboard.final_video_url!,
      };
      setSelectedItems([...selectedItems, item]);
      setTrimSettings((prev) => ({
        ...prev,
        [itemKey]: {
          startTime: 0,
          endTime: duration,
          duration: duration,
        },
      }));
    }
  };

  // アップロード動画を選択/解除
  const toggleUserVideoSelection = async (video: UserVideo) => {
    const itemKey = video.id;
    const isSelected = selectedItems.some((i) => i.id === video.id && i.type === "uploaded");

    if (isSelected) {
      // 選択解除時: trimSettingsからも削除
      setSelectedItems(selectedItems.filter((i) => !(i.id === video.id && i.type === "uploaded")));
      setTrimSettings((prev) => {
        const next = { ...prev };
        delete next[itemKey];
        return next;
      });
    } else if (selectedItems.length < 10) {
      // 選択時: 動画の長さを使用してtrimSettingsに追加
      const duration = video.duration_seconds;
      const item: SelectableItem = {
        id: video.id,
        type: "uploaded",
        label: video.title,
        thumbnailUrl: video.thumbnail_url || "",
        videoUrl: video.video_url,
      };
      setSelectedItems([...selectedItems, item]);
      setTrimSettings((prev) => ({
        ...prev,
        [itemKey]: {
          startTime: 0,
          endTime: duration,
          duration: duration,
        },
      }));
    }
  };

  // トリム範囲を更新
  const handleTrimChange = (itemId: string, range: [number, number]) => {
    setTrimSettings((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        startTime: range[0],
        endTime: range[1],
      },
    }));
  };

  // アイテムを削除
  const removeItem = (itemId: string, itemType: "scene" | "storyboard" | "uploaded") => {
    setSelectedItems(selectedItems.filter((i) => !(i.id === itemId && i.type === itemType)));
    setTrimSettings((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === selectedItems.length - 1)
    ) {
      return;
    }

    const newItems = [...selectedItems];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    setSelectedItems(newItems);
  };

  const handleConcat = async () => {
    if (selectedItems.length < 2) {
      alert("2本以上の動画を選択してください");
      return;
    }

    // トリミング設定の検証
    for (const item of selectedItems) {
      const trim = trimSettings[item.id];
      if (!trim) {
        alert(`動画「${item.label}」のトリミング情報が取得できませんでした`);
        return;
      }
      if (trim.endTime - trim.startTime < 0.5) {
        alert(`動画「${item.label}」のトリム範囲は0.5秒以上必要です`);
        return;
      }
    }

    setProcessing(true);
    setConcatStatus(null);

    try {
      // V2 API を使用（トリミング対応）
      const videos = selectedItems.map((item) => {
        const trim = trimSettings[item.id];
        return {
          video_id: item.type === "scene" ? item.id : undefined,
          // storyboardとuploadedはvideo_urlを使用
          video_url: (item.type === "storyboard" || item.type === "uploaded") ? item.videoUrl : undefined,
          start_time: trim?.startTime ?? 0,
          end_time: trim?.endTime ?? undefined,
        };
      });

      const res = await videosApi.concatV2({
        videos,
        transition,
        transition_duration: transition === "none" ? 0 : transitionDuration,
      });
      setConcatJobId(res.id);
    } catch (error) {
      console.error("Failed to start concat:", error);
      alert("結合に失敗しました");
      setProcessing(false);
    }
  };

  const estimatedDuration = useCallback(() => {
    let baseDuration = 0;
    selectedItems.forEach((item) => {
      const trim = trimSettings[item.id];
      if (trim) {
        baseDuration += trim.endTime - trim.startTime;
      }
    });
    if (transition !== "none" && selectedItems.length > 1) {
      return Math.max(0, baseDuration - transitionDuration * (selectedItems.length - 1));
    }
    return baseDuration;
  }, [selectedItems, trimSettings, transition, transitionDuration]);

  const [downloading, setDownloading] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [videoWithBgmUrl, setVideoWithBgmUrl] = useState<string | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<'original' | 'hd' | '4k' | 'prores' | 'prores_hd' | 'prores_4k'>('original');
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [isConvertingProRes, setIsConvertingProRes] = useState(false);
  const [proResConversionPhase, setProResConversionPhase] = useState<'idle' | 'upscaling' | 'converting'>('idle');
  const [upscaleForProResProgress, setUpscaleForProResProgress] = useState(0);
  // 60fps補間用
  const [enable60fps, setEnable60fps] = useState(false);
  const [is60fpsProcessing, setIs60fpsProcessing] = useState(false);
  const [fps60Progress, setFps60Progress] = useState(0);

  const handleDownload = async () => {
    const downloadUrl = videoWithBgmUrl || concatStatus?.video_url;
    if (!downloadUrl || !concatJobId) return;

    setUpscaleError(null);

    // For original resolution, just download directly (with optional 60fps)
    if (selectedResolution === 'original') {
      setDownloading(true);
      try {
        let finalUrl = downloadUrl;

        // 60fps補間が有効な場合
        if (enable60fps) {
          setIs60fpsProcessing(true);
          setFps60Progress(0);

          // 60fps補間を開始
          await videosApi.interpolateConcat60fps(concatJobId, 'apo-8');

          // ポーリングで完了を待つ
          let interpolatedUrl: string | null = null;
          const maxAttempts = 120; // 最大20分
          let attempts = 0;

          while (!interpolatedUrl && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 10000));
            attempts++;

            const status = await videosApi.getConcatInterpolate60fpsStatus(concatJobId);
            setFps60Progress(status.progress || Math.min(attempts * 2, 90));

            if (status.status === 'completed' && status.interpolated_video_url) {
              interpolatedUrl = status.interpolated_video_url;
            } else if (status.status === 'failed') {
              throw new Error(status.message || '60fps補間に失敗しました');
            }
          }

          if (!interpolatedUrl) {
            throw new Error('60fps補間がタイムアウトしました');
          }

          finalUrl = interpolatedUrl;
          setIs60fpsProcessing(false);
        }

        const response = await fetch(finalUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        const fpsLabel = enable60fps ? '_60fps' : '';
        a.download = `ad_video${fpsLabel}_${timestamp}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("Download failed:", error);
        setUpscaleError(error instanceof Error ? error.message : "ダウンロードに失敗しました");
      } finally {
        setDownloading(false);
        setIs60fpsProcessing(false);
      }
      return;
    }

    // For ProRes, convert on-the-fly and download
    if (selectedResolution === 'prores') {
      setIsConvertingProRes(true);
      try {
        const blob = await videosApi.downloadAsProRes(downloadUrl);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `ad_video_prores_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("ProRes conversion failed:", error);
        setUpscaleError(error instanceof Error ? error.message : "ProRes変換に失敗しました");
      } finally {
        setIsConvertingProRes(false);
      }
      return;
    }

    // For ProRes + Upscale (HD or 4K)
    if (selectedResolution === 'prores_hd' || selectedResolution === 'prores_4k') {
      const targetResolution = selectedResolution === 'prores_hd' ? 'hd' : '4k';

      // Phase 1: Upscale
      setProResConversionPhase('upscaling');
      setUpscaleForProResProgress(0);

      try {
        // Start upscale
        await videosApi.upscaleConcat(concatJobId, targetResolution);

        // Poll for upscale completion
        let upscaledUrl: string | null = null;
        const maxAttempts = 100; // 5 minutes max
        let attempts = 0;

        while (!upscaledUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          attempts++;

          const status = await videosApi.getConcatUpscaleStatus(concatJobId);
          setUpscaleForProResProgress(status.progress || Math.min(attempts * 3, 90));

          if (status.status === 'completed' && status.upscaled_video_url) {
            upscaledUrl = status.upscaled_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || 'アップスケールに失敗しました');
          }
        }

        if (!upscaledUrl) {
          throw new Error('アップスケールがタイムアウトしました');
        }

        // Phase 2: ProRes conversion
        setProResConversionPhase('converting');

        const blob = await videosApi.downloadAsProRes(upscaledUrl);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `ad_video_prores_${targetResolution}_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("ProRes + Upscale failed:", error);
        setUpscaleError(error instanceof Error ? error.message : "処理に失敗しました");
      } finally {
        setProResConversionPhase('idle');
        setUpscaleForProResProgress(0);
      }
      return;
    }

    // For HD/4K, we need to upscale first (with optional 60fps interpolation)
    setIsUpscaling(true);
    try {
      let sourceUrlForUpscale: string | undefined = undefined;

      // 60fps補間が有効な場合、まず補間を実行
      if (enable60fps) {
        setIs60fpsProcessing(true);
        setFps60Progress(0);

        // 60fps補間を開始
        await videosApi.interpolateConcat60fps(concatJobId, 'apo-8');

        // ポーリングで完了を待つ
        let interpolatedUrl: string | null = null;
        const maxAttempts = 120; // 最大20分
        let attempts = 0;

        while (!interpolatedUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 10000));
          attempts++;

          const status = await videosApi.getConcatInterpolate60fpsStatus(concatJobId);
          setFps60Progress(status.progress || Math.min(attempts * 2, 90));

          if (status.status === 'completed' && status.interpolated_video_url) {
            interpolatedUrl = status.interpolated_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || '60fps補間に失敗しました');
          }
        }

        if (!interpolatedUrl) {
          throw new Error('60fps補間がタイムアウトしました');
        }

        sourceUrlForUpscale = interpolatedUrl;
        setIs60fpsProcessing(false);
      }

      // Start upscale (60fps補間後のURLがあればそれを使用)
      await videosApi.upscaleConcat(concatJobId, selectedResolution as 'hd' | '4k', sourceUrlForUpscale);

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const status = await videosApi.getConcatUpscaleStatus(concatJobId);

          if (status.status === 'completed' && status.upscaled_video_url) {
            clearInterval(pollInterval);
            setIsUpscaling(false);

            // Download the upscaled video
            const link = document.createElement('a');
            link.href = status.upscaled_video_url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
            const fpsLabel = enable60fps ? '_60fps' : '';
            link.download = `ad_video_${selectedResolution}${fpsLabel}_${timestamp}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setShowDownloadModal(false);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setIsUpscaling(false);
            setUpscaleError(status.message || 'アップスケールに失敗しました');
          }
        } catch (error) {
          clearInterval(pollInterval);
          setIsUpscaling(false);
          setUpscaleError('ステータス確認に失敗しました');
        }
      }, 3000);

      // Timeout after 5 minutes (upscale only) or 25 minutes (with 60fps)
      const timeoutMs = enable60fps ? 1500000 : 300000;
      setTimeout(() => {
        if (isUpscaling) {
          setIsUpscaling(false);
          setUpscaleError('処理がタイムアウトしました。もう一度お試しください。');
        }
      }, timeoutMs);

    } catch (error) {
      console.error("Upscale failed:", error);
      setIsUpscaling(false);
      setIs60fpsProcessing(false);
      setUpscaleError(error instanceof Error ? error.message : "処理に失敗しました");
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
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">アドクリエイター</h1>
              <p className="text-zinc-400 text-sm">
                複数の動画を繋ぎ合わせて広告動画を作成
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* アスペクト比表示 */}
            {selectedAspectRatio && selectedAspectRatioLabel && (
              <button
                onClick={handleChangeAspectRatio}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <span className="text-zinc-400 text-sm">
                  {selectedAspectRatioLabel.label}
                </span>
                <span className="text-blue-400 text-sm font-medium">
                  {selectedAspectRatio}
                </span>
                <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            )}
            {/* 保存状態インジケーター */}
            {saveStatus !== 'idle' && (
              <span className={cn(
                "text-xs px-2 py-1 rounded",
                saveStatus === 'saving' && "bg-blue-500/20 text-blue-400",
                saveStatus === 'saved' && "bg-green-500/20 text-green-400",
                saveStatus === 'error' && "bg-red-500/20 text-red-400",
              )}>
                {saveStatus === 'saving' && "保存中..."}
                {saveStatus === 'saved' && "保存しました"}
                {saveStatus === 'error' && "保存エラー"}
              </span>
            )}
            {/* 手動保存ボタン */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveDraft()}
              disabled={processing || concatStatus?.status === "completed"}
              className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600"
            >
              <Save className="h-4 w-4 mr-2" />
              一時保存
            </Button>
            <Link href="/concat/history">
              <Button size="sm" className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600">
                <History className="h-4 w-4 mr-2" />
                履歴
              </Button>
            </Link>
          </div>
        </div>

        {/* 結合完了時 */}
        {concatStatus?.status === "completed" && concatStatus.video_url && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            {/* 成功アイコンとタイトル */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">作成完了！</h2>
            </div>

            {/* 動画プレビュー（アスペクト比に応じたサイズ） */}
            <div className={cn(
              "mb-6",
              selectedAspectRatio === "16:9" ? "w-full max-w-2xl" :
              selectedAspectRatio === "1:1" ? "w-full max-w-md" :
              "w-full max-w-xs"
            )}>
              <div className="bg-black rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
                <video
                  src={videoWithBgmUrl || concatStatus.video_url}
                  preload="auto"
                  controls
                  autoPlay
                  muted
                  className="w-full h-full"
                  style={{
                    aspectRatio: selectedAspectRatio?.replace(":", "/") || "9/16"
                  }}
                />
              </div>
              {videoWithBgmUrl && (
                <div className="mt-2 text-center">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                    🎵 BGM付き
                  </span>
                </div>
              )}
            </div>

            {/* 動画情報 */}
            <div className="flex items-center gap-4 text-zinc-400 text-sm mb-8">
              {concatStatus.total_duration && (
                <span className="flex items-center gap-1.5">
                  <Play className="h-4 w-4" />
                  再生時間: {concatStatus.total_duration.toFixed(1)}秒
                </span>
              )}
              <span className="text-zinc-600">|</span>
              <span className="flex items-center gap-1.5">
                <Film className="h-4 w-4" />
                {selectedItems.length}本の動画を結合
              </span>
            </div>

            {/* アクションボタン */}
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <Button
                onClick={() => setShowDownloadModal(true)}
                size="lg"
                className="bg-white text-black hover:bg-zinc-200 px-8"
              >
                <Download className="h-5 w-5 mr-2" />
                ダウンロード
              </Button>
              <Button
                size="lg"
                className="px-8 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600"
                onClick={() => {
                  setConcatJobId(null);
                  setConcatStatus(null);
                  setSelectedItems([]);
                  setTrimSettings({});
                  setSelectedAspectRatio(null);
                  setVideoWithBgmUrl(null);
                }}
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                新しく作成
              </Button>
              {/* 編集用素材ダウンロードボタン */}
              {(storyboardCuts.some((cut) => cut.video) || selectedItems.length > 0) && (
                <Button
                  onClick={handleExportMaterials}
                  disabled={isExportingMaterials}
                  size="lg"
                  className="px-8 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600"
                >
                  {isExportingMaterials ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      書き出し中...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      編集用素材ダウンロード
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* BGM生成セクション */}
            {concatJobId && (
              <div className="w-full max-w-md mx-auto">
                <BGMGenerator
                  concatId={concatJobId}
                  concatVideoUrl={videoWithBgmUrl || concatStatus.video_url}
                  onBgmApplied={(url) => {
                    setVideoWithBgmUrl(url);
                  }}
                />
                {videoWithBgmUrl && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                    <p className="text-emerald-400 text-sm">
                      ✓ BGM付き動画が生成されました
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 処理中 */}
        {processing && concatStatus?.status !== "completed" && (
          <div className="mb-8 p-6 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <h2 className="text-lg font-semibold text-white">作成中...</h2>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 mt-4">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${concatStatus?.progress || 0}%` }}
              />
            </div>
            <p className="text-zinc-400 text-sm mt-2">
              {concatStatus?.progress || 0}% 完了
            </p>
          </div>
        )}

        {/* ドラフトチェック中のローディング表示 */}
        {!processing && concatStatus?.status !== "completed" && !selectedAspectRatio && isCheckingDraft && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        )}

        {/* アスペクト比選択画面（ドラフトチェック完了後に表示） */}
        {!processing && concatStatus?.status !== "completed" && !selectedAspectRatio && !isCheckingDraft && !showDraftRestoreModal && (
          <AspectRatioSelector onSelect={setSelectedAspectRatio} />
        )}

        {/* モード選択画面（1:1以外のみ） */}
        {!processing && concatStatus?.status !== "completed" && selectedAspectRatio && selectedAspectRatio !== "1:1" && !adMode && (
          <AdModeSelector
            selectedAspectRatio={selectedAspectRatio}
            onSelectMode={handleSelectAdMode}
            onBack={handleChangeAspectRatio}
          />
        )}

        {/* AI脚本入力画面 */}
        {!processing && concatStatus?.status !== "completed" && selectedAspectRatio && adMode === "ai" && !adScript && (
          <AdScriptInput
            selectedAspectRatio={selectedAspectRatio}
            onBack={() => setAdMode(null)}
            onScriptGenerated={handleScriptGenerated}
          />
        )}

        {/* AI脚本確認画面 */}
        {!processing && concatStatus?.status !== "completed" && selectedAspectRatio && adMode === "ai" && adScript && targetDuration && !scriptConfirmed && (
          <AdScriptPreview
            script={adScript}
            targetDuration={targetDuration}
            onBack={handleRegenerateScript}
            onConfirm={handleConfirmScript}
            onRegenerate={handleRegenerateScript}
            isRegenerating={isRegeneratingScript}
          />
        )}

        {/* AI脚本ストーリーボード画面（カット編集） */}
        {!processing && concatStatus?.status !== "completed" && selectedAspectRatio && adMode === "ai" && adScript && scriptConfirmed && storyboardCuts.length > 0 && (
          <div className="max-w-4xl mx-auto">
            {/* 動画生成設定パネル */}
            <div className="bg-zinc-900 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-3">動画生成設定</h3>
              <div className="flex flex-wrap items-center gap-4">
                {/* プロバイダー選択 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">AI:</span>
                  <div className="flex gap-1">
                    {[
                      { id: "runway" as VideoProvider, label: "Runway", icon: "🎬" },
                      { id: "piapi_kling" as VideoProvider, label: "Kling", icon: "🎥" },
                      { id: "veo" as VideoProvider, label: "VEO", icon: "🌟" },
                      { id: "domoai" as VideoProvider, label: "DomoAI", icon: "🎨" },
                      { id: "hailuo" as VideoProvider, label: "Hailuo", icon: "🌊" },
                    ].map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setVideoProvider(provider.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm transition-colors",
                          videoProvider === provider.id
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        {provider.icon} {provider.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Klingモード選択 */}
                {videoProvider === "piapi_kling" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">モード:</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setKlingMode("std")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm transition-colors",
                          klingMode === "std"
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        Standard
                      </button>
                      <button
                        onClick={() => setKlingMode("pro")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm transition-colors",
                          klingMode === "pro"
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        Pro
                      </button>
                    </div>
                  </div>
                )}

                {/* カメラワーク選択 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">カメラ:</span>
                  <div className="flex gap-1">
                    {CAMERA_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          if (preset.id === "custom") {
                            // カスタムの場合はモーダルを開く
                            setIsCameraWorkModalOpen(true);
                          } else {
                            setDefaultCameraWork({
                              preset: preset.id,
                              promptText: preset.promptText,
                            });
                          }
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm transition-colors",
                          defaultCameraWork.preset === preset.id
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        {preset.icon} {preset.label}
                      </button>
                    ))}
                  </div>
                  {/* カスタム選択時は選択中のカメラワーク名を表示 */}
                  {defaultCameraWork.preset === "custom" && defaultCameraWork.customCameraWork && (
                    <span className="text-sm text-blue-400">
                      ({defaultCameraWork.customCameraWork.label})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <AdStoryboard
              script={adScript}
              cuts={storyboardCuts}
              aspectRatio={selectedAspectRatio}
              targetDuration={targetDuration}
              onBack={() => setScriptConfirmed(false)}
              onNext={handleCreateVideoFromCuts}
              onSelectVideo={handleOpenVideoSelector}
              onGenerateVideo={handleGenerateVideoForCut}
              onRegenerate={handleRegenerateScript}
              onCutsChange={setStoryboardCuts}
              onGenerateVideoFromImage={handleGenerateVideoFromImage}
            />
          </div>
        )}

        {/* メインコンテンツ（手動選択モード or 1:1） */}
        {!processing && concatStatus?.status !== "completed" && selectedAspectRatio && (adMode === "manual" || selectedAspectRatio === "1:1") && (
          <div className="space-y-6">
            {/* アスペクト比表示 & 戻るボタン */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  // 1:1の場合はアスペクト比選択へ、それ以外はモード選択へ
                  if (selectedAspectRatio === "1:1") {
                    setSelectedAspectRatio(null);
                  } else {
                    setAdMode(null);
                  }
                  setSelectedItems([]);
                  setTrimSettings({});
                }}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>戻る</span>
              </button>
              <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded-lg">
                <span className="text-zinc-400 text-sm">アスペクト比:</span>
                <span className="text-white font-medium">
                  {selectedAspectRatio === "9:16" ? "縦長" : selectedAspectRatio === "16:9" ? "横長" : "正方形"} ({selectedAspectRatio})
                </span>
              </div>
            </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 左側: プレビュー + 動画選択 */}
            <div className="lg:col-span-2 space-y-6">
              {/* プレビューエリア */}
              <div className="bg-zinc-900 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-white mb-4">プレビュー</h2>
                <div className="flex justify-center">
                  <AdPreviewPlayer
                    videos={selectedItems.map((item) => ({
                      id: item.id,
                      videoUrl: item.videoUrl,
                      label: item.label,
                      startTime: trimSettings[item.id]?.startTime || 0,
                      endTime: trimSettings[item.id]?.endTime || trimSettings[item.id]?.duration || 5,
                    }))}
                    aspectRatio={selectedAspectRatio}
                  />
                </div>
              </div>

              {/* 動画選択エリア */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">
                  動画を選択（{selectedItems.length}/10）
                </h2>

              {/* タブ切り替え */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setActiveTab("scene")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                    activeTab === "scene"
                      ? "bg-blue-500 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  <Video className="h-4 w-4" />
                  シーン動画
                  <span className="ml-1 text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded">
                    {availableVideos.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("storyboard")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                    activeTab === "storyboard"
                      ? "bg-blue-500 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  <Film className="h-4 w-4" />
                  ストーリー動画
                  <span className="ml-1 text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded">
                    {availableStoryboards.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("uploaded")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                    activeTab === "uploaded"
                      ? "bg-blue-500 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  アップロード動画
                  <span className="ml-1 text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded">
                    {userUploadedVideos.length}
                  </span>
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
              ) : activeTab === "scene" ? (
                /* シーン動画一覧 */
                availableVideos.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900 rounded-xl">
                    <Video className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                    <p className="text-zinc-400">完了済みのシーン動画がありません</p>
                    <Link href="/generate/story">
                      <Button className="mt-4">動画を生成</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {availableVideos.map((video) => {
                      const isSelected = selectedItems.some(
                        (item) => item.id === video.id && item.type === "scene"
                      );
                      const selectionIndex = selectedItems.findIndex(
                        (item) => item.id === video.id && item.type === "scene"
                      );
                      const videoRatio = videoAspectRatios[video.id];
                      const isCompatible = !videoRatio || videoRatio === selectedAspectRatio;
                      const isDisabled = !isCompatible && !isSelected;

                      return (
                        <button
                          key={video.id}
                          onClick={() => !isDisabled && toggleVideoSelection(video)}
                          disabled={isDisabled}
                          className={cn(
                            "relative aspect-[9/16] rounded-xl overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-blue-500 ring-2 ring-blue-500/30"
                              : isDisabled
                              ? "border-zinc-800 opacity-40 cursor-not-allowed"
                              : "border-zinc-800 hover:border-zinc-600"
                          )}
                        >
                          {video.final_video_url ? (
                            <video
                              src={video.final_video_url}
                              poster={video.original_image_url}
                              preload="none"
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <img
                              src={video.original_image_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                          {isSelected && (
                            <div className="absolute top-2 left-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                              {selectionIndex + 1}
                            </div>
                          )}
                          {/* アスペクト比不一致の警告 */}
                          {isDisabled && videoRatio && (
                            <div className="absolute top-2 right-2 bg-red-500/80 px-2 py-0.5 rounded text-white text-xs">
                              {videoRatio}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-white text-xs truncate">
                              {video.user_prompt}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {/* 新規シーン生成ボタン */}
                    {canGenerateScene ? (
                      <button
                        onClick={() => setIsSceneGeneratorOpen(true)}
                        className="relative aspect-[9/16] rounded-xl overflow-hidden border-2 border-dashed border-zinc-600 hover:border-blue-500 hover:bg-blue-500/10 transition-all flex flex-col items-center justify-center gap-2"
                      >
                        <Plus className="h-8 w-8 text-zinc-400" />
                        <span className="text-zinc-400 text-sm">新規シーン</span>
                        <span className="text-zinc-500 text-xs">を生成</span>
                      </button>
                    ) : selectedAspectRatio === "1:1" ? (
                      <div className="relative aspect-[9/16] rounded-xl overflow-hidden border-2 border-dashed border-zinc-700 bg-zinc-800/50 flex flex-col items-center justify-center gap-2 cursor-not-allowed">
                        <Plus className="h-8 w-8 text-zinc-600" />
                        <span className="text-zinc-500 text-xs text-center px-2">
                          1:1では<br />生成不可
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              ) : activeTab === "storyboard" ? (
                /* ストーリー動画一覧 */
                availableStoryboards.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900 rounded-xl">
                    <Film className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                    <p className="text-zinc-400">完了済みのストーリー動画がありません</p>
                    <Link href="/generate/storyboard">
                      <Button className="mt-4">ストーリーを作成</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {availableStoryboards.map((storyboard) => {
                      const isSelected = selectedItems.some(
                        (item) => item.id === storyboard.id && item.type === "storyboard"
                      );
                      const selectionIndex = selectedItems.findIndex(
                        (item) => item.id === storyboard.id && item.type === "storyboard"
                      );
                      const videoRatio = videoAspectRatios[storyboard.id];
                      const isCompatible = !videoRatio || videoRatio === selectedAspectRatio;
                      const isDisabled = !isCompatible && !isSelected;

                      return (
                        <button
                          key={storyboard.id}
                          onClick={() => !isDisabled && toggleStoryboardSelection(storyboard)}
                          disabled={isDisabled}
                          className={cn(
                            "relative aspect-[9/16] rounded-xl overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-purple-500 ring-2 ring-purple-500/30"
                              : isDisabled
                              ? "border-zinc-800 opacity-40 cursor-not-allowed"
                              : "border-zinc-800 hover:border-zinc-600"
                          )}
                        >
                          {storyboard.final_video_url ? (
                            <video
                              src={storyboard.final_video_url}
                              poster={storyboard.source_image_url}
                              preload="none"
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <img
                              src={storyboard.source_image_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                          {isSelected && (
                            <div className="absolute top-2 left-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                              {selectionIndex + 1}
                            </div>
                          )}
                          {/* アスペクト比不一致の警告またはストーリーバッジ */}
                          {isDisabled && videoRatio ? (
                            <div className="absolute top-2 right-2 bg-red-500/80 px-2 py-0.5 rounded text-white text-xs">
                              {videoRatio}
                            </div>
                          ) : (
                            <div className="absolute top-2 right-2 bg-purple-500/80 px-2 py-0.5 rounded text-white text-xs flex items-center gap-1">
                              <Film className="h-3 w-3" />
                              {storyboard.scenes?.length || 4}シーン
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-white text-xs truncate">
                              {storyboard.title || `ストーリー動画`}
                            </p>
                            {storyboard.total_duration && (
                              <p className="text-zinc-400 text-xs">
                                {storyboard.total_duration.toFixed(1)}秒
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                /* アップロード動画一覧 */
                userUploadedVideos.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900 rounded-xl">
                    <Upload className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                    <p className="text-zinc-400">アップロードした動画がありません</p>
                    <p className="text-zinc-500 text-sm mt-2">ダッシュボードから動画をアップロードしてください</p>
                    <Link href="/dashboard">
                      <Button className="mt-4">ダッシュボードへ</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {userUploadedVideos.map((video) => {
                      const isSelected = selectedItems.some(
                        (item) => item.id === video.id && item.type === "uploaded"
                      );
                      const selectionIndex = selectedItems.findIndex(
                        (item) => item.id === video.id && item.type === "uploaded"
                      );
                      const isMaxSelected = selectedItems.length >= 10 && !isSelected;

                      return (
                        <button
                          key={video.id}
                          onClick={() => !isMaxSelected && toggleUserVideoSelection(video)}
                          disabled={isMaxSelected}
                          className={cn(
                            "relative aspect-[9/16] rounded-xl overflow-hidden border-2 transition-all bg-zinc-900",
                            isSelected
                              ? "border-green-500 ring-2 ring-green-500/30"
                              : isMaxSelected
                              ? "border-zinc-800 opacity-40 cursor-not-allowed"
                              : "border-zinc-800 hover:border-zinc-600"
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
                              <Video className="h-8 w-8 text-zinc-600" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute top-2 left-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                              {selectionIndex + 1}
                            </div>
                          )}
                          <div className="absolute top-2 right-2 bg-green-500/80 px-2 py-0.5 rounded text-white text-xs flex items-center gap-1">
                            <Upload className="h-3 w-3" />
                            アップロード
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-white text-xs truncate">
                              {video.title}
                            </p>
                            <p className="text-zinc-400 text-xs">
                              {video.duration_seconds.toFixed(1)}秒
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
              </div>
            </div>

            {/* 右側: 設定パネル */}
            <div className="space-y-6">
              {/* 選択した動画の順序 & トリミング調整 */}
              <div className="bg-zinc-900 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Scissors className="h-4 w-4 text-blue-400" />
                  <h3 className="text-white font-medium">結合順序 & トリミング</h3>
                </div>
                {selectedItems.length === 0 ? (
                  <p className="text-zinc-500 text-sm">
                    動画を選択してください
                  </p>
                ) : (
                  <div className="space-y-4">
                    {selectedItems.map((item, index) => {
                      const trim = trimSettings[item.id];
                      return (
                        <VideoTrimCard
                          key={`${item.type}-${item.id}`}
                          item={item}
                          index={index}
                          duration={trim?.duration ?? 5}
                          trimRange={[trim?.startTime ?? 0, trim?.endTime ?? (trim?.duration ?? 5)]}
                          onTrimChange={(range) => handleTrimChange(item.id, range)}
                          onMoveUp={() => moveItem(index, "up")}
                          onMoveDown={() => moveItem(index, "down")}
                          onRemove={() => removeItem(item.id, item.type)}
                          isFirst={index === 0}
                          isLast={index === selectedItems.length - 1}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* トランジション設定 */}
              <div className="bg-zinc-900 rounded-xl p-4">
                <h3 className="text-white font-medium mb-3">トランジション</h3>
                <div className="space-y-2">
                  {TRANSITIONS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTransition(t.value)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition ${
                        transition === t.value
                          ? "bg-blue-500/20 border border-blue-500"
                          : "bg-zinc-800 hover:bg-zinc-700"
                      }`}
                    >
                      <p className="text-white text-sm font-medium">{t.label}</p>
                      <p className="text-zinc-400 text-xs">{t.description}</p>
                    </button>
                  ))}
                </div>

                {transition !== "none" && (
                  <div className="mt-4">
                    <label className="text-zinc-400 text-sm">
                      トランジション時間: {transitionDuration}秒
                    </label>
                    <input
                      type="range"
                      min="0.2"
                      max="2"
                      step="0.1"
                      value={transitionDuration}
                      onChange={(e) =>
                        setTransitionDuration(parseFloat(e.target.value))
                      }
                      className="w-full mt-2"
                    />
                  </div>
                )}
              </div>

              {/* プレビュー情報 */}
              {selectedItems.length >= 2 && (
                <div className="bg-zinc-900 rounded-xl p-4">
                  <h3 className="text-white font-medium mb-2">出力情報</h3>
                  <div className="text-zinc-400 text-sm space-y-1">
                    <p>動画数: {selectedItems.length}本</p>
                    <p>
                      　シーン: {selectedItems.filter((i) => i.type === "scene").length}本
                      　ストーリー: {selectedItems.filter((i) => i.type === "storyboard").length}本
                    </p>
                    <p className="text-blue-400">推定再生時間: 約{estimatedDuration().toFixed(1)}秒</p>
                  </div>
                </div>
              )}

              {/* 結合ボタン */}
              <Button
                onClick={handleConcat}
                disabled={selectedItems.length < 2 || processing}
                className="w-full"
                size="lg"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {selectedItems.length < 2
                  ? "2本以上選択してください"
                  : "広告を作成"}
              </Button>
            </div>
          </div>
          </div>
        )}

        {/* Download Modal */}
        {showDownloadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-700">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  ダウンロード
                </h3>
                <button
                  onClick={() => {
                    if (!downloading && !isUpscaling) {
                      setShowDownloadModal(false);
                      setUpscaleError(null);
                    }
                  }}
                  disabled={downloading || isUpscaling}
                  className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!isUpscaling && proResConversionPhase === 'idle' ? (
                <>
                  <p className="mb-4 text-sm text-zinc-400">
                    出力解像度を選択してください
                  </p>

                  <div className="space-y-3">
                    {/* Original */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === 'original'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value="original"
                        checked={selectedResolution === 'original'}
                        onChange={() => setSelectedResolution('original')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-white">
                          オリジナル (720p)
                        </div>
                        <div className="text-sm text-zinc-400">
                          そのままダウンロード（即時）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'original'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-zinc-600'
                      }`}>
                        {selectedResolution === 'original' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* HD */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === 'hd'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value="hd"
                        checked={selectedResolution === 'hd'}
                        onChange={() => setSelectedResolution('hd')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-white">
                          フルHD (1080p)
                        </div>
                        <div className="text-sm text-zinc-400">
                          高解像度化（約1〜2分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'hd'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-zinc-600'
                      }`}>
                        {selectedResolution === 'hd' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* 4K */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === '4k'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value="4k"
                        checked={selectedResolution === '4k'}
                        onChange={() => setSelectedResolution('4k')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-white">
                          4K (2160p)
                          <span className="rounded bg-gradient-to-r from-blue-500 to-cyan-500 px-1.5 py-0.5 text-xs text-white">
                            最高画質
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          最高解像度（約1〜2分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === '4k'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-zinc-600'
                      }`}>
                        {selectedResolution === '4k' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* ProRes */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === 'prores'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value="prores"
                        checked={selectedResolution === 'prores'}
                        onChange={() => setSelectedResolution('prores')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-white">
                          ProRes 422 HQ
                          <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                            編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          10bit・デバンド処理済み（約30秒〜1分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'prores'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-600'
                      }`}>
                        {selectedResolution === 'prores' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* ProRes (フルHD) */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === 'prores_hd'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value="prores_hd"
                        checked={selectedResolution === 'prores_hd'}
                        onChange={() => setSelectedResolution('prores_hd')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-white">
                          ProRes 422 HQ (フルHD)
                          <span className="rounded bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-xs text-white">
                            高解像度編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          1080p・10bit・デバンド処理（約2〜3分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'prores_hd'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-zinc-600'
                      }`}>
                        {selectedResolution === 'prores_hd' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* ProRes (4K) */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === 'prores_4k'
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value="prores_4k"
                        checked={selectedResolution === 'prores_4k'}
                        onChange={() => setSelectedResolution('prores_4k')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-white">
                          ProRes 422 HQ (4K)
                          <span className="rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 text-xs text-white">
                            最高品質編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          2160p・10bit・デバンド処理（約3〜5分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'prores_4k'
                          ? 'border-amber-500 bg-amber-500'
                          : 'border-zinc-600'
                      }`}>
                        {selectedResolution === 'prores_4k' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>
                  </div>

                  {/* 60fps スムーズ化オプション */}
                  <div className="mt-4 pt-4 border-t border-zinc-700">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={enable60fps}
                        onChange={(e) => setEnable60fps(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-white">
                          60fps スムーズ化
                          <span className="rounded bg-gradient-to-r from-cyan-500 to-teal-500 px-1.5 py-0.5 text-xs text-white">
                            Topaz AI
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          AIフレーム補間で滑らかな動きに（追加で約2〜5分）
                        </div>
                      </div>
                    </label>
                  </div>

                  {upscaleError && (
                    <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                      {upscaleError}
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-zinc-600 text-white hover:bg-zinc-800"
                      onClick={() => {
                        setShowDownloadModal(false);
                        setUpscaleError(null);
                      }}
                      disabled={proResConversionPhase !== 'idle'}
                    >
                      キャンセル
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-500"
                      onClick={handleDownload}
                      disabled={downloading || isConvertingProRes || is60fpsProcessing}
                    >
                      {downloading || isConvertingProRes || is60fpsProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {is60fpsProcessing ? `60fps変換中... ${fps60Progress}%` :
                           isConvertingProRes ? 'ProRes変換中...' : 'ダウンロード中...'}
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          ダウンロード
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-500" />
                  <p className="mt-4 text-white font-medium">
                    {proResConversionPhase === 'upscaling' ? 'アップスケール中...' :
                     proResConversionPhase === 'converting' ? 'ProRes変換中...' :
                     selectedResolution === 'hd' ? 'フルHD に変換中...' :
                     selectedResolution === '4k' ? '4K に変換中...' : 'ProRes に変換中...'}
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {proResConversionPhase === 'upscaling' ? `ステップ 1/2: 高解像度化 (${upscaleForProResProgress}%)` :
                     proResConversionPhase === 'converting' ? 'ステップ 2/2: ProRes変換中...' :
                     selectedResolution === 'prores' ? 'デバンド処理を適用中（約30秒〜1分）' : '処理には1〜2分かかります'}
                  </p>
                  {proResConversionPhase === 'upscaling' && (
                    <div className="mt-4 mx-auto w-48">
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-700">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                          style={{ width: `${upscaleForProResProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* シーン生成モーダル */}
      {selectedAspectRatio && selectedAspectRatio !== "1:1" && (
        <SceneGeneratorModal
          isOpen={isSceneGeneratorOpen}
          onClose={() => {
            setIsSceneGeneratorOpen(false);
            setInitialImageForSceneGenerator(null);
            setCurrentAdCutId(null);
            setCurrentGeneratingCutId(null);
          }}
          aspectRatio={selectedAspectRatio}
          onVideoGenerated={handleSceneGenerated}
          initialImageUrl={initialImageForSceneGenerator || undefined}
          initialPrompt={
            currentGeneratingCutId
              ? storyboardCuts.find((cut) => cut.id === currentGeneratingCutId)?.description_ja
              : undefined
          }
          initialVideoProvider={videoProvider}
          initialCameraWork={
            currentGeneratingCutId && cameraWorkSelections[currentGeneratingCutId]
              ? cameraWorkSelections[currentGeneratingCutId]
              : defaultCameraWork
          }
          initialKlingMode={klingMode}
        />
      )}

      {/* 画像生成モーダル（カットから新規動画生成時） */}
      {selectedAspectRatio && selectedAspectRatio !== "1:1" && imageGeneratorCut && (
        <SceneImageGeneratorModal
          isOpen={isImageGeneratorOpen}
          onClose={() => {
            setIsImageGeneratorOpen(false);
            setImageGeneratorCut(null);
            setCurrentAdCutId(null);
          }}
          descriptionJa={imageGeneratorCut.descriptionJa}
          dialogue={imageGeneratorCut.dialogue}
          aspectRatio={selectedAspectRatio}
          onImageConfirmed={handleImageConfirmed}
          initialImage={imageGeneratorCut.initialImage}
        />
      )}

      {/* AI脚本モード用の動画選択モーダル */}
      {selectedAspectRatio && currentAdCutId && (
        <AdVideoSelectorModal
          isOpen={isVideoSelectorOpen}
          onClose={() => {
            setIsVideoSelectorOpen(false);
            setCurrentAdCutId(null);
          }}
          onSelect={handleVideoSelected}
          cutDescription={
            storyboardCuts.find((c) => c.id === currentAdCutId)?.description_ja || ""
          }
          cutDuration={
            storyboardCuts.find((c) => c.id === currentAdCutId)?.duration || 5
          }
          aspectRatio={selectedAspectRatio}
        />
      )}

      {/* カメラワーク設定モーダル */}
      <CameraWorkModal
        isOpen={isCameraWorkModalOpen}
        onClose={() => setIsCameraWorkModalOpen(false)}
        value={defaultCameraWork}
        onConfirm={(value) => setDefaultCameraWork(value)}
        videoProvider={videoProvider}
      />

      {/* ドラフト復元モーダル */}
      {showDraftRestoreModal && draftExistsInfo?.exists && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">
                一時保存データがあります
              </h3>
            </div>
            <p className="text-zinc-400 text-sm mb-2">
              前回の編集内容を復元しますか？
            </p>
            <p className="text-zinc-500 text-xs mb-6">
              保存日時: {draftExistsInfo.last_saved_at
                ? new Date(draftExistsInfo.last_saved_at).toLocaleString('ja-JP')
                : '不明'}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={discardDraft}
                disabled={isRestoring}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-white"
              >
                破棄して新規作成
              </Button>
              <Button
                onClick={restoreDraftState}
                disabled={isRestoring}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    読み込み中...
                  </>
                ) : (
                  "復元する"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// useSearchParams を Suspense でラップ
export default function ConcatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#212121]">
          <Loader2 className="h-8 w-8 animate-spin text-[#fce300]" />
        </div>
      }
    >
      <ConcatPageContent />
    </Suspense>
  );
}
