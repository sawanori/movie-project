"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImageCropper } from "@/components/ui/image-cropper";
import { videosApi, storyboardApi, Storyboard, StoryboardScene, DraftMetadata, textToImageApi } from "@/lib/api/client";
import { StructuredImageForm, createEmptyStructuredInput, hasStructuredInputData } from "@/components/ui/structured-image-form";
import type { StructuredImageInput, ImageInputMode, ImageProvider } from "@/lib/constants/image-generation";
import { supportsStructuredInput, supportsReferenceImage, getProviderMaxLength } from "@/lib/constants/image-generation";
import { ImageProviderSelector } from "@/components/ui/image-provider-selector";
import { ReferenceImageSelector } from "@/components/ui/reference-image-selector";
import type { ReferenceImage } from "@/lib/constants/image-generation";
import {
  useAutoSaveDraft,
  isDraftStale,
  getDraftAgeDays,
  convertStringKeysToNumber,
} from "@/lib/hooks/use-auto-save-draft";
import { SceneTrimCard } from "@/components/video/scene-trim-card";
import { ScreenshotButton } from "@/components/video/screenshot-button";
import { ScreenshotGallery } from "@/components/video/screenshot-gallery";
import { HLSPlayer } from "@/components/video/hls-player";
import { ElementImagesUploader } from "@/components/video/element-images-uploader";
import { RangeSlider } from "@/components/ui/range-slider";
import { CameraWorkModal } from "@/components/camera";
import { CameraWorkSelection, CameraPreset } from "@/lib/camera/types";
import type { VideoProvider } from "@/lib/types/video";
import { CAMERA_PRESETS } from "@/lib/camera/presets";
import { CAMERA_WORKS } from "@/lib/camera/camera-works";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Upload,
  Loader2,
  Clapperboard,
  Pencil,
  Check,
  X,
  Download,
  ArrowLeft,
  Sparkles,
  Film,
  RefreshCw,
  ImageIcon,
  Smile,
  Frown,
  Heart,
  Zap,
  Moon,
  MessageSquare,
  Video,
  RotateCcw,
  Merge,
  List,
  Languages,
  Camera,
  Plus,
  Trash2,
  GripVertical,
  Save,
} from "lucide-react";

type Step = "input" | "preview" | "upload" | "mood" | "edit" | "generating" | "review" | "concatenating" | "completed";

// ムード/テーマの選択肢
const MOOD_OPTIONS = [
  { id: "happy", label: "楽しい・ポップ", icon: Smile, color: "bg-yellow-500" },
  { id: "sad", label: "感動・切ない", icon: Frown, color: "bg-blue-500" },
  { id: "romantic", label: "ロマンチック", icon: Heart, color: "bg-pink-500" },
  { id: "energetic", label: "エネルギッシュ", icon: Zap, color: "bg-orange-500" },
  { id: "calm", label: "穏やか・癒し", icon: Moon, color: "bg-teal-500" },
] as const;

type MoodId = typeof MOOD_OPTIONS[number]["id"];

/**
 * ビデオURLにキャッシュバスティングパラメータを追加
 *
 * ブラウザがビデオをキャッシュして古いバージョンを表示する問題を防ぐ
 * R2のURLにはファイル名にタイムスタンプが含まれているが、
 * 一部のブラウザでキャッシュ問題が発生する場合があるため、
 * 追加のクエリパラメータを付与する
 */
const getVideoCacheBustedUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  // URLからタイムスタンプ部分を抽出してキャッシュバスティングパラメータとして使用
  // 例: /storyboard_xxx/scene_1_1609459200.mp4 -> v=scene_1_1609459200
  const filename = url.split('/').pop()?.replace('.mp4', '') || '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(filename)}`;
};

// ソート可能なシーンカードラッパー
function SortableSceneCard({
  scene,
  children,
  disabled = false,
}: {
  scene: StoryboardScene;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
    >
      {/* ドラッグハンドル */}
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 p-1.5 rounded bg-zinc-800/80 cursor-grab active:cursor-grabbing z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="ドラッグして並べ替え"
        >
          <GripVertical className="h-4 w-4 text-white" />
        </div>
      )}
      {children}
    </div>
  );
}

function StoryboardPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storyboardIdFromUrl = searchParams.get("id");

  // State
  const [step, setStep] = useState<Step>("input");
  // Text-to-Image 構造化入力
  const [imageInputMode, setImageInputMode] = useState<ImageInputMode>("form");
  const [structuredInput, setStructuredInput] = useState<StructuredImageInput>(createEmptyStructuredInput());
  const [freeTextDescription, setFreeTextDescription] = useState("");
  const [generatingFromText, setGeneratingFromText] = useState(false);
  const [imageProvider, setImageProvider] = useState<ImageProvider>("nanobanana");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedPromptJa, setGeneratedPromptJa] = useState<string>("");
  const [generatedPromptEn, setGeneratedPromptEn] = useState<string>("");
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);  // BFL FLUX.2用複数参照画像
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [rawImageForCrop, setRawImageForCrop] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ description_ja: "", runway_prompt: "" });
  const [translating, setTranslating] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imageSourceMode, setImageSourceMode] = useState<'upload' | 'gallery'>('upload');
  const [galleryRefreshTrigger, setGalleryRefreshTrigger] = useState(0);

  // Mood selection state
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [customMoodText, setCustomMoodText] = useState("");
  const [uploadingSceneImage, setUploadingSceneImage] = useState<number | null>(null);

  // Video review state
  const [retryingSceneVideo, setRetryingSceneVideo] = useState<number | null>(null);
  const [concatenating, setConcatenating] = useState(false);
  const [concatJobId, setConcatJobId] = useState<string | null>(null);

  // Regenerate modal state
  const [regenerateModalScene, setRegenerateModalScene] = useState<number | null>(null);
  const [regenerateDescriptionJa, setRegenerateDescriptionJa] = useState("");
  const [regeneratePrompt, setRegeneratePrompt] = useState("");
  const [regenerateTranslating, setRegenerateTranslating] = useState(false);
  const [regenerateSaving, setRegenerateSaving] = useState(false);
  const [regeneratePromptSaved, setRegeneratePromptSaved] = useState(false);
  const [originalPrompt, setOriginalPrompt] = useState("");
  // Kling専用: 終了フレーム画像（2枚目の画像で遷移動画を生成）
  const [endFrameImageUrl, setEndFrameImageUrl] = useState<string | null>(null);
  const [endFrameUploading, setEndFrameUploading] = useState(false);
  // シーンごとのビデオモード（I2V/V2V）
  const [sceneVideoModes, setSceneVideoModes] = useState<Record<number, 'i2v' | 'v2v'>>({});
  // カスタム画像がアップロードされたシーン（V2V選択不可）
  const [customImageScenes, setCustomImageScenes] = useState<Set<number>>(new Set());
  // シーンごとの終了フレーム画像（Kling専用: 2枚目の画像で遷移動画を生成）
  const [sceneEndFrameImages, setSceneEndFrameImages] = useState<Record<number, string>>({});
  const [sceneEndFrameUploading, setSceneEndFrameUploading] = useState<Record<number, boolean>>({});
  // 初期の終了フレーム画像（uploadステップで設定、全シーン共通のデフォルト値として使用）
  const [initialEndFrameImageUrl, setInitialEndFrameImageUrl] = useState<string | null>(null);
  const [initialEndFrameImagePreview, setInitialEndFrameImagePreview] = useState<string | null>(null);
  const [initialEndFrameUploading, setInitialEndFrameUploading] = useState(false);

  // Scene image generation state
  const [generatingImages, setGeneratingImages] = useState(false);

  // Video provider selection
  const [videoProvider, setVideoProvider] = useState<VideoProvider>('runway');

  // Kling AI mode selection (Standard or Pro)
  const [klingMode, setKlingMode] = useState<'std' | 'pro'>('std');

  // Kling Elements: 一貫性向上用の追加画像
  const [elementImages, setElementImages] = useState<string[]>([]);

  // Aspect ratio selection
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [showAspectRatioModal, setShowAspectRatioModal] = useState(false);
  const [pendingImageForAspectSelect, setPendingImageForAspectSelect] = useState<string | null>(null);

  // Trim settings for each scene
  const [sceneTrimSettings, setSceneTrimSettings] = useState<
    Record<string, { startTime: number; endTime: number; duration: number }>
  >({});
  const [applyTrim, setApplyTrim] = useState(true);
  // シーンごとのvideo ref（ホバーシーク用）
  const sceneVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  // 完成動画のvideo ref（スクリーンショット用）
  const finalVideoRef = useRef<HTMLVideoElement>(null);
  const [hoveringSceneId, setHoveringSceneId] = useState<string | null>(null);

  // Camera work modal state
  const [cameraWorkModalScene, setCameraWorkModalScene] = useState<number | null>(null);
  const [cameraWorkSelections, setCameraWorkSelections] = useState<Record<number, CameraWorkSelection>>({});

  // Sub-scene state
  const [addingSubScene, setAddingSubScene] = useState<number | null>(null);
  const [deletingSubScene, setDeletingSubScene] = useState<number | null>(null);

  // Scene editing state
  const [deletingScene, setDeletingScene] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  // シーン追加モーダル状態
  const [showAddSceneModal, setShowAddSceneModal] = useState(false);
  const [addSceneDescription, setAddSceneDescription] = useState("");
  const [addingScene, setAddingScene] = useState(false);

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Download modal state (final video)
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<'original' | 'hd' | '4k' | 'prores' | 'prores_hd' | 'prores_4k'>('original');
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState(0);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [isConvertingProRes, setIsConvertingProRes] = useState(false);
  const [proResConversionPhase, setProResConversionPhase] = useState<'idle' | 'upscaling' | 'converting'>('idle');
  const [upscaleForProResProgress, setUpscaleForProResProgress] = useState(0);
  // 60fps補間用
  const [enable60fps, setEnable60fps] = useState(false);
  const [is60fpsProcessing, setIs60fpsProcessing] = useState(false);
  const [fps60Progress, setFps60Progress] = useState(0);

  // Scene download modal state
  const [showSceneDownloadModal, setShowSceneDownloadModal] = useState(false);
  const [downloadingSceneNumber, setDownloadingSceneNumber] = useState<number | null>(null);
  const [sceneSelectedResolution, setSceneSelectedResolution] = useState<'original' | 'hd' | '4k' | 'prores' | 'prores_hd' | 'prores_4k'>('original');
  const [isSceneUpscaling, setIsSceneUpscaling] = useState(false);
  const [sceneUpscaleProgress, setSceneUpscaleProgress] = useState(0);
  const [sceneUpscaleError, setSceneUpscaleError] = useState<string | null>(null);
  const [isSceneConvertingProRes, setIsSceneConvertingProRes] = useState(false);
  const [sceneProResConversionPhase, setSceneProResConversionPhase] = useState<'idle' | 'upscaling' | 'converting'>('idle');
  const [sceneUpscaleForProResProgress, setSceneUpscaleForProResProgress] = useState(0);

  // Add scene image upload state (extends existing modal)
  const [addSceneImageFile, setAddSceneImageFile] = useState<File | null>(null);
  const [addSceneImagePreview, setAddSceneImagePreview] = useState<string | null>(null);
  const [addSceneRunwayPrompt, setAddSceneRunwayPrompt] = useState("");
  const [addSceneTranslating, setAddSceneTranslating] = useState(false);

  // Add scene V2V mode state
  const [addSceneVideoMode, setAddSceneVideoMode] = useState<'i2v' | 'v2v'>('i2v');
  const [addSceneSourceSceneId, setAddSceneSourceSceneId] = useState<string | null>(null);
  const [addSceneAutoGenerate, setAddSceneAutoGenerate] = useState(false);
  const [addSceneImageSourceMode, setAddSceneImageSourceMode] = useState<'upload' | 'gallery'>('upload');
  const [addSceneImageUrl, setAddSceneImageUrl] = useState<string | null>(null); // For screenshots (already uploaded)

  // Scene generation state (for newly added scenes)
  const [generatingSceneImage, setGeneratingSceneImage] = useState<string | null>(null);
  const [generatingSceneVideo, setGeneratingSceneVideo] = useState<string | null>(null);

  // ===== ドラフト（一時保存）関連 =====
  const [showDraftRestoreModal, setShowDraftRestoreModal] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftMetadata | null>(null);
  const [draftAge, setDraftAge] = useState(0);

  // 自動保存フックの統合
  const {
    saveStatus,
    lastSavedAt,
    draftRestored,
    saveDraft,
    clearDraft,
    markDraftRestored,
  } = useAutoSaveDraft({
    storyboardId: storyboard?.id || null,
    enabled: !!storyboard && step !== 'upload' && step !== 'completed',
    getCurrentStep: useCallback(() => step, [step]),
    getEditingScene: useCallback(() => editingScene, [editingScene]),
    getEditForm: useCallback(() => editingScene !== null ? {
      descriptionJa: editForm.description_ja,
      runwayPrompt: editForm.runway_prompt,
    } : null, [editingScene, editForm]),
    getCameraSelections: useCallback(() => {
      // CameraWorkSelection を DraftCameraWorkSelection に変換
      type DraftCameraPreset = 'simple' | 'cinematic' | 'dynamic' | 'custom';
      const result: Record<number, { preset: DraftCameraPreset; customCameraWorkId?: number; promptText: string }> = {};
      for (const [key, value] of Object.entries(cameraWorkSelections)) {
        result[parseInt(key, 10)] = {
          preset: value.preset as DraftCameraPreset,
          customCameraWorkId: value.customCameraWork?.id,
          promptText: value.promptText,
        };
      }
      return result;
    }, [cameraWorkSelections]),
    getTrimSettings: useCallback(() => {
      const result: Record<number, { start: number; end: number; enabled?: boolean }> = {};
      for (const [key, value] of Object.entries(sceneTrimSettings)) {
        result[parseInt(key, 10)] = {
          start: value.startTime,
          end: value.endTime,
          enabled: true,
        };
      }
      return result;
    }, [sceneTrimSettings]),
    getVideoModes: useCallback(() => sceneVideoModes, [sceneVideoModes]),
    getCustomImageScenes: useCallback(() => customImageScenes, [customImageScenes]),
    getFilmGrain: useCallback(() => 'none' as const, []),
    getUseLut: useCallback(() => false, []),
    getLutIntensity: useCallback(() => 0, []),
    getApplyTrim: useCallback(() => applyTrim, [applyTrim]),
    getVideoProvider: useCallback(() => videoProvider, [videoProvider]),
    getAspectRatio: useCallback(() => aspectRatio, [aspectRatio]),
    getSelectedMood: useCallback(() => selectedMood, [selectedMood]),
    getCustomMoodText: useCallback(() => customMoodText, [customMoodText]),
    getSceneEndFrameImages: useCallback(() => sceneEndFrameImages, [sceneEndFrameImages]),
  });

  /**
   * ドラフトからUI状態を復元
   */
  const restoreDraftState = useCallback((draft: DraftMetadata) => {
    // ステップの復元
    if (draft.current_step) {
      setStep(draft.current_step);
    }

    // 編集シーンの復元
    if (draft.editing_scene !== null) {
      setEditingScene(draft.editing_scene);
      if (draft.edit_form) {
        setEditForm({
          description_ja: draft.edit_form.descriptionJa || '',
          runway_prompt: draft.edit_form.runwayPrompt || '',
        });
      }
    }

    // カメラワーク選択の復元（DraftCameraWorkSelection → CameraWorkSelection）
    if (draft.camera_selections) {
      const restored: Record<number, CameraWorkSelection> = {};
      for (const [key, draftSel] of Object.entries(draft.camera_selections)) {
        const sceneNum = parseInt(key, 10);
        if (isNaN(sceneNum)) continue;

        // CameraWork を ID から検索
        const customCameraWork = draftSel.customCameraWorkId
          ? CAMERA_WORKS.find(cw => cw.id === draftSel.customCameraWorkId)
          : undefined;

        restored[sceneNum] = {
          preset: (draftSel.preset as CameraPreset) || 'simple',
          customCameraWork,
          promptText: draftSel.promptText || '',
        };
      }
      setCameraWorkSelections(restored);
    }

    // トリム設定の復元
    if (draft.trim_settings) {
      const trimSettings: Record<string, { startTime: number; endTime: number; duration: number }> = {};
      for (const [key, value] of Object.entries(draft.trim_settings)) {
        trimSettings[key] = {
          startTime: value.start,
          endTime: value.end,
          duration: value.end - value.start,
        };
      }
      setSceneTrimSettings(trimSettings);
    }

    // ビデオモードの復元
    if (draft.video_modes) {
      const converted = convertStringKeysToNumber(draft.video_modes);
      setSceneVideoModes(converted as Record<number, 'i2v' | 'v2v'>);
    }

    // カスタム画像シーンの復元
    if (draft.custom_image_scenes) {
      setCustomImageScenes(new Set(draft.custom_image_scenes));
    }

    // その他の設定復元
    if (draft.apply_trim !== undefined) setApplyTrim(draft.apply_trim);
    if (draft.video_provider) setVideoProvider(draft.video_provider as VideoProvider);
    if (draft.aspect_ratio) setAspectRatio(draft.aspect_ratio);
    if (draft.selected_mood) setSelectedMood(draft.selected_mood as MoodId);
    if (draft.custom_mood_text) setCustomMoodText(draft.custom_mood_text);

    // シーンごとの終了フレーム画像の復元（Kling専用）
    if (draft.scene_end_frame_images) {
      const converted = convertStringKeysToNumber(draft.scene_end_frame_images);
      setSceneEndFrameImages(converted);
    }

    // 復元完了をマーク
    markDraftRestored();
  }, [markDraftRestored]);

  /**
   * ドラフト復元を実行
   */
  const handleRestoreDraft = useCallback(() => {
    if (pendingDraft) {
      restoreDraftState(pendingDraft);
      setPendingDraft(null);
    }
    setShowDraftRestoreModal(false);
  }, [pendingDraft, restoreDraftState]);

  /**
   * ドラフト復元をスキップ（新規開始）
   */
  const handleDiscardDraft = useCallback(async () => {
    if (storyboard?.id) {
      await clearDraft();
    }
    setPendingDraft(null);
    setShowDraftRestoreModal(false);
  }, [storyboard?.id, clearDraft]);

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load existing storyboard from URL parameter
  useEffect(() => {
    if (!user || !storyboardIdFromUrl || storyboard) return;

    const loadExistingStoryboard = async () => {
      setLoadingExisting(true);
      try {
        const sb = await storyboardApi.get(storyboardIdFromUrl);
        console.log('[DEBUG] Initial load - scenes:', sb.scenes.map((s: { scene_number: number; video_url: string | null }) => ({
          scene: s.scene_number,
          video_url: s.video_url?.split('/').pop()
        })));
        console.log('[DEBUG] Storyboard video_provider:', sb.video_provider);
        setStoryboard(sb);
        setImagePreview(sb.source_image_url);

        // Set video provider from storyboard (important for regeneration)
        if (sb.video_provider) {
          setVideoProvider(sb.video_provider);
          console.log('[DEBUG] Set videoProvider to:', sb.video_provider);
        }

        // ドラフト（一時保存）があるかチェック
        if (sb.draft_metadata && !draftRestored) {
          const draft = sb.draft_metadata as DraftMetadata;
          const age = getDraftAgeDays(draft);
          const isStale = isDraftStale(draft);

          setPendingDraft(draft);
          setDraftAge(age);

          // 古いドラフトの場合は警告付きで表示
          if (isStale) {
            console.log(`[DEBUG] Draft is stale (${age} days old)`);
          }

          // ドラフト復元モーダルを表示
          setShowDraftRestoreModal(true);
        }

        // Determine the appropriate step based on status
        switch (sb.status) {
          case "draft":
            setStep("edit");
            break;
          case "generating":
            setStep("generating");
            break;
          case "videos_ready":
            setStep("review");
            break;
          case "concatenating":
            setStep("concatenating");
            break;
          case "completed":
            setStep("completed");
            break;
          case "failed":
            // Allow retry from edit step
            setStep("edit");
            break;
          default:
            setStep("edit");
        }
      } catch (error) {
        console.error("Failed to load storyboard:", error);
        // If storyboard not found, stay on upload step
      } finally {
        setLoadingExisting(false);
      }
    };

    loadExistingStoryboard();
  }, [user, storyboardIdFromUrl, storyboard, draftRestored]);

  // Start polling when step changes to generating or concatenating (for loaded storyboards)
  useEffect(() => {
    if (!storyboard) return;

    if (step === "generating" && storyboard.status === "generating") {
      pollStatus();
    } else if (step === "concatenating" && storyboard.status === "concatenating") {
      pollConcatenationStatus();
    }
    // Only run once when storyboard is first loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboard?.id, step]);

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Process file (shared between click and drag) - shows aspect ratio selection first
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Store image and show aspect ratio selection modal
      setPendingImageForAspectSelect(reader.result as string);
      setShowAspectRatioModal(true);
    };
    reader.readAsDataURL(file);
  };

  // Handle aspect ratio confirmation - then open cropper
  const handleAspectRatioConfirm = () => {
    if (pendingImageForAspectSelect) {
      setRawImageForCrop(pendingImageForAspectSelect);
      setShowCropper(true);
      setShowAspectRatioModal(false);
      setPendingImageForAspectSelect(null);
    }
  };

  // Cancel aspect ratio selection
  const handleAspectRatioCancel = () => {
    setShowAspectRatioModal(false);
    setPendingImageForAspectSelect(null);
  };

  // Handle cropped image
  const handleCropComplete = (croppedBlob: Blob) => {
    // Convert Blob to File
    const croppedFile = new File([croppedBlob], "cropped-image.jpg", {
      type: "image/jpeg",
    });
    setImageFile(croppedFile);

    // Create preview URL
    const previewUrl = URL.createObjectURL(croppedBlob);
    setImagePreview(previewUrl);

    // Close cropper
    setShowCropper(false);
    setRawImageForCrop(null);
  };

  // Cancel cropping
  const handleCropCancel = () => {
    setShowCropper(false);
    setRawImageForCrop(null);
  };

  // ===== Text-to-Image ハンドラー =====

  // 参照画像のアップロード（input step用）
  const handleReferenceImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    try {
      const { image_url } = await videosApi.uploadImage(file);
      setReferenceImageUrl(image_url);
      // プレビューも設定
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("参照画像のアップロードに失敗:", error);
      alert("画像のアップロードに失敗しました");
    }
  };

  // 画像プロバイダー変更ハンドラ
  const handleImageProviderChange = (provider: ImageProvider) => {
    setImageProvider(provider);
    // Flux選択時は強制的にテキスト入力モードに切り替え
    if (!supportsStructuredInput(provider)) {
      setImageInputMode("text");
    }
    // 参照画像非対応プロバイダーの場合は参照画像をクリア
    if (!supportsReferenceImage(provider)) {
      setReferenceImageUrl(null);
    }
    // プロバイダー変更時は複数参照画像をクリア（BFL FLUX.2専用機能のため）
    if (provider !== "bfl_flux2_pro") {
      setReferenceImages([]);
    }
  };

  // 画像生成が可能かどうかをチェック
  const canGenerateImage = (): boolean => {
    if (imageInputMode === "form") {
      return hasStructuredInputData(structuredInput);
    } else {
      return freeTextDescription.trim().length > 0;
    }
  };

  // テキストから画像を生成
  const handleGenerateImageFromText = async () => {
    // バリデーション
    if (imageInputMode === "form") {
      if (!hasStructuredInputData(structuredInput)) {
        alert("被写体を入力してください");
        return;
      }
    } else {
      if (!freeTextDescription.trim()) {
        alert("画像の説明を入力してください");
        return;
      }
    }

    setGeneratingFromText(true);
    try {
      const result = await textToImageApi.generate({
        // フォームモードの場合は structured_input を送信
        structured_input: imageInputMode === "form" ? structuredInput : null,
        // テキストモードの場合は free_text_description を送信
        free_text_description: imageInputMode === "text" ? freeTextDescription : null,
        // Nano Banana用: reference_image_url（BFL FLUX.2では使用不可）
        reference_image_url: imageProvider === "nanobanana" ? (referenceImageUrl || null) : null,
        // BFL FLUX.2用: reference_images（複数参照画像）
        reference_images: imageProvider === "bfl_flux2_pro" && referenceImages.length > 0 ? referenceImages : undefined,
        aspect_ratio: aspectRatio,
        image_provider: imageProvider,
      });

      setGeneratedImageUrl(result.image_url);
      setGeneratedPromptJa(result.generated_prompt_ja);
      setGeneratedPromptEn(result.generated_prompt_en);
      setStep("preview");
    } catch (error) {
      console.error("画像生成に失敗:", error);
      alert(error instanceof Error ? error.message : "画像生成に失敗しました");
    } finally {
      setGeneratingFromText(false);
    }
  };

  // 画像のみでスキップ（参照画像を使用して直接uploadステップへ）
  const handleSkipWithImageOnly = () => {
    if (!referenceImageUrl) {
      alert("画像を選択してください");
      return;
    }
    setUploadedImageUrl(referenceImageUrl);
    setStep("upload");
  };

  // プレビューから確定して次へ
  const handleConfirmGeneratedImage = () => {
    if (generatedImageUrl) {
      setUploadedImageUrl(generatedImageUrl);
      setImagePreview(generatedImageUrl);
      setStep("upload");
    }
  };

  // プレビューから再生成
  const handleRegenerateFromText = () => {
    setGeneratedImageUrl(null);
    setStep("input");
  };

  // 終了フレーム画像のアップロード処理（for upload step）
  const processInitialEndFrameImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (event) => {
      setInitialEndFrameImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // R2へアップロード
    setInitialEndFrameUploading(true);
    try {
      const uploadRes = await videosApi.uploadImage(file);
      setInitialEndFrameImageUrl(uploadRes.image_url);
    } catch (error) {
      console.error('Failed to upload end frame image:', error);
      alert('終了フレーム画像のアップロードに失敗しました');
      setInitialEndFrameImagePreview(null);
    } finally {
      setInitialEndFrameUploading(false);
    }
  };

  // Handle end frame image selection (for upload step)
  const handleEndFrameImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processInitialEndFrameImage(file);
  };

  // 終了フレーム画像のドラッグ＆ドロップ
  const [initialEndFrameDragging, setInitialEndFrameDragging] = useState(false);

  const handleInitialEndFrameDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInitialEndFrameDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) {
      processInitialEndFrameImage(files[0]);
    }
  }, []);

  // Handle provider change (clears end frame image when switching away from Kling)
  const handleProviderChange = (newProvider: VideoProvider) => {
    setVideoProvider(newProvider);

    // Kling AI以外に切り替えた場合、終了フレーム画像とKling Elements画像をクリア
    if (newProvider !== 'piapi_kling') {
      setInitialEndFrameImageUrl(null);
      setInitialEndFrameImagePreview(null);
      setElementImages([]);  // Kling Elements画像をクリア
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Step 1: Upload image and move to mood selection
  const handleUploadAndSelectMood = async () => {
    if (!imageFile) return;

    try {
      setUploading(true);

      // Upload image
      const uploadRes = await videosApi.uploadImage(imageFile);
      setUploadedImageUrl(uploadRes.image_url);

      // Move to mood selection step
      setStep("mood");
    } catch (error) {
      console.error("Failed to upload image:", error);
      alert("画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  // Step 1b: Use screenshot from gallery
  const handleSelectScreenshot = (imageUrl: string) => {
    // Screenshot is already uploaded to R2, so we can use it directly
    setUploadedImageUrl(imageUrl);
    setImagePreview(imageUrl);
    // Move to mood selection step
    setStep("mood");
  };

  // Step 2: Generate storyboard with selected mood
  const handleGenerateStoryboard = async () => {
    if (!uploadedImageUrl) return;

    // テキスト入力またはムード選択のいずれかが必要
    if (!customMoodText.trim() && !selectedMood) {
      alert("動画のイメージを入力するか、雰囲気を選択してください");
      return;
    }

    // テキスト入力 + ムード選択を組み合わせる
    const moodLabel = selectedMood
      ? MOOD_OPTIONS.find(m => m.id === selectedMood)?.label || ""
      : "";

    // テキスト入力があればそれを優先、なければムードラベルを使用
    // 両方ある場合は組み合わせる
    let moodText = "";
    if (customMoodText.trim() && moodLabel) {
      moodText = `${customMoodText.trim()}（${moodLabel}）`;
    } else if (customMoodText.trim()) {
      moodText = customMoodText.trim();
    } else {
      moodText = moodLabel;
    }

    try {
      setGeneratingStoryboard(true);

      // Generate storyboard with mood, video provider, aspect ratio, and element images
      const elementImagesParam = videoProvider === 'piapi_kling' && elementImages.length > 0
        ? elementImages.map(url => ({ image_url: url }))
        : undefined;
      const sb = await storyboardApi.create(uploadedImageUrl, moodText, videoProvider, aspectRatio, elementImagesParam);
      setStoryboard(sb);

      // Kling AI選択時かつ終了フレーム画像が設定されている場合、
      // 全ての親シーン（サブシーン以外）に終了フレーム画像を適用
      if (videoProvider === 'piapi_kling' && initialEndFrameImageUrl) {
        const endFrameImages: Record<number, string> = {};
        sb.scenes
          .filter(scene => !scene.parent_scene_id)  // 親シーンのみ
          .forEach(scene => {
            endFrameImages[scene.scene_number] = initialEndFrameImageUrl;
          });
        setSceneEndFrameImages(endFrameImages);
      }

      setStep("edit");
    } catch (error) {
      console.error("Failed to generate storyboard:", error);
      alert("ストーリーボードの生成に失敗しました");
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  // Upload custom scene image
  const handleUploadSceneImage = async (sceneNumber: number, file: File) => {
    if (!storyboard) return;

    try {
      setUploadingSceneImage(sceneNumber);

      // Upload image
      const uploadRes = await videosApi.uploadImage(file);

      // Update scene with new image
      const updated = await storyboardApi.updateSceneImage(storyboard.id, sceneNumber, uploadRes.image_url);
      setStoryboard(updated);

      // カスタム画像がアップロードされたシーンを記録（V2V選択不可にする）
      setCustomImageScenes(prev => new Set(prev).add(sceneNumber));
      // このシーンのビデオモード選択をクリア（強制I2V）
      setSceneVideoModes(prev => {
        const newModes = { ...prev };
        delete newModes[sceneNumber];
        return newModes;
      });
    } catch (error) {
      console.error("Failed to upload scene image:", error);
      alert("画像のアップロードに失敗しました");
    } finally {
      setUploadingSceneImage(null);
    }
  };

  // Edit scene
  const handleEditScene = (scene: StoryboardScene) => {
    setEditingScene(scene.scene_number);
    setEditForm({
      description_ja: scene.description_ja,
      runway_prompt: scene.runway_prompt,
    });
  };

  const handleSaveScene = async () => {
    if (!storyboard || editingScene === null) return;

    try {
      const updated = await storyboardApi.updateScene(storyboard.id, editingScene, editForm);
      setStoryboard(updated);
      setEditingScene(null);
    } catch (error) {
      console.error("Failed to update scene:", error);
      alert("シーンの更新に失敗しました");
    }
  };

  // Translate Japanese description to English prompt
  const handleTranslateScene = async () => {
    if (!editForm.description_ja.trim() || editingScene === null || !storyboard) return;

    setTranslating(true);
    try {
      // storyboard.idを渡してテンプレート構造を維持した翻訳を取得
      const result = await storyboardApi.translateScene(editForm.description_ja, editingScene, storyboard.id);
      setEditForm({ ...editForm, runway_prompt: result.runway_prompt });
    } catch (error) {
      console.error("Failed to translate:", error);
      alert("翻訳に失敗しました");
    } finally {
      setTranslating(false);
    }
  };

  // Handle camera work selection confirm
  const handleCameraWorkConfirm = async (sceneNumber: number, selection: CameraWorkSelection) => {
    if (!storyboard) return;

    try {
      // Update local state
      setCameraWorkSelections(prev => ({
        ...prev,
        [sceneNumber]: selection,
      }));

      // Update in backend
      const cameraWorkText = selection.preset === 'custom' && selection.customCameraWork
        ? selection.customCameraWork.promptText
        : CAMERA_PRESETS.find(p => p.id === selection.preset)?.promptText || '';

      await storyboardApi.updateScene(storyboard.id, sceneNumber, {
        camera_work: cameraWorkText,
      });

      // Refresh storyboard
      const updated = await storyboardApi.get(storyboard.id);
      setStoryboard(updated);
    } catch (error) {
      console.error("Failed to update camera work:", error);
      alert("カメラワークの更新に失敗しました");
    }
  };

  // Get camera work selection for a scene
  const getCameraWorkSelection = (sceneNumber: number): CameraWorkSelection => {
    if (cameraWorkSelections[sceneNumber]) {
      return cameraWorkSelections[sceneNumber];
    }
    // Default to simple preset
    return {
      preset: 'simple',
      promptText: CAMERA_PRESETS.find(p => p.id === 'simple')?.promptText || '',
    };
  };

  // ===== サブシーン（追加カット）ハンドラ =====

  // サブシーン追加
  const handleAddSubScene = async (parentSceneNumber: number) => {
    if (!storyboard) return;

    // 親シーンを取得
    const parentScene = storyboard.scenes.find(
      s => s.scene_number === parentSceneNumber && !s.parent_scene_id
    );
    if (!parentScene) return;

    // 同一親のサブシーン数をチェック（最大3つまで）
    const subSceneCount = storyboard.scenes.filter(
      s => s.parent_scene_id === parentScene.id
    ).length;

    if (subSceneCount >= 3) {
      alert("このシーンには最大3つまでカットを追加できます");
      return;
    }

    try {
      setAddingSubScene(parentSceneNumber);
      const updated = await storyboardApi.addSubScene(storyboard.id, parentSceneNumber);
      setStoryboard(updated);

      // 新しく追加されたサブシーンを見つけて編集モードを開く
      const newSubScene = updated.scenes.find(
        (s: StoryboardScene) => s.parent_scene_id === parentScene.id &&
          !storyboard.scenes.some(existing => existing.id === s.id)
      );
      if (newSubScene) {
        // 編集モードを開く
        setEditingScene(newSubScene.scene_number);
        setEditForm({
          description_ja: newSubScene.description_ja || "",
          runway_prompt: newSubScene.runway_prompt || "",
        });
      }
    } catch (error) {
      console.error("Failed to add sub-scene:", error);
      alert("カットの追加に失敗しました");
    } finally {
      setAddingSubScene(null);
    }
  };

  // サブシーン削除
  const handleDeleteSubScene = async (sceneNumber: number) => {
    if (!storyboard) return;

    const scene = storyboard.scenes.find(s => s.scene_number === sceneNumber);
    if (!scene || !scene.parent_scene_id) {
      alert("親シーンは削除できません");
      return;
    }

    if (!confirm("このカットを削除しますか？")) return;

    try {
      setDeletingSubScene(sceneNumber);
      const updated = await storyboardApi.deleteSubScene(storyboard.id, sceneNumber);
      setStoryboard(updated);
    } catch (error) {
      console.error("Failed to delete sub-scene:", error);
      alert("カットの削除に失敗しました");
    } finally {
      setDeletingSubScene(null);
    }
  };

  // シーン削除
  const handleDeleteScene = async (sceneId: string) => {
    if (!storyboard) return;

    const scene = storyboard.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // 最後の1シーンは削除不可
    if (storyboard.scenes.length <= 1) {
      alert("最後のシーンは削除できません");
      return;
    }

    const displayOrder = scene.display_order || scene.scene_number;
    if (!confirm(`シーン #${displayOrder} を削除しますか？\n動画も削除されます。この操作は取り消せません。`)) {
      return;
    }

    try {
      setDeletingScene(sceneId);
      const result = await storyboardApi.deleteScene(storyboard.id, sceneId);
      // 更新されたシーン一覧でストーリーボードを更新
      setStoryboard({ ...storyboard, scenes: result.scenes });
    } catch (error: unknown) {
      console.error("Failed to delete scene:", error);
      const errorMessage = error instanceof Error ? error.message : "削除に失敗しました";
      alert(errorMessage);
    } finally {
      setDeletingScene(null);
    }
  };

  // シーン追加（画像アップロード・V2V対応版）
  const handleAddScene = async () => {
    if (!storyboard || !addSceneDescription.trim()) return;

    // V2Vモード時は参照シーン必須
    if (addSceneVideoMode === 'v2v' && !addSceneSourceSceneId) {
      alert("V2Vモードでは参照シーンを選択してください");
      return;
    }

    try {
      setAddingScene(true);

      let customImageUrl: string | undefined;

      // I2Vモードでカスタム画像がある場合
      if (addSceneVideoMode === 'i2v') {
        if (addSceneImageUrl) {
          // スクリーンショットから選択した場合（既にアップロード済み）
          customImageUrl = addSceneImageUrl;
        } else if (addSceneImageFile) {
          // 新規アップロードの場合
          const uploadRes = await videosApi.uploadImage(addSceneImageFile);
          customImageUrl = uploadRes.image_url;
        }
      }

      // V2V用の参照動画URL取得
      let sourceVideoUrl: string | undefined;
      if (addSceneVideoMode === 'v2v' && addSceneSourceSceneId) {
        const sourceScene = storyboard.scenes.find(s => s.id === addSceneSourceSceneId);
        sourceVideoUrl = sourceScene?.video_url || undefined;
      }

      // シーン追加API呼び出し
      const result = await storyboardApi.addScene(storyboard.id, {
        description_ja: addSceneDescription.trim(),
        runway_prompt: addSceneRunwayPrompt.trim() || undefined,
        custom_image_url: customImageUrl,
        video_mode: addSceneVideoMode,
        source_video_url: sourceVideoUrl,
        auto_generate_video: addSceneAutoGenerate,
      });

      // storyboard更新
      setStoryboard(prev => prev ? {
        ...prev,
        scenes: result.scenes,
      } : null);

      // 自動生成開始時はポーリングを開始
      if (addSceneAutoGenerate) {
        const newScene = result.scene;
        setRetryingSceneVideo(newScene.scene_number);
        pollSingleSceneStatus(newScene.scene_number);
      }

      // モーダルを閉じてリセット
      setShowAddSceneModal(false);
      setAddSceneDescription("");
      setAddSceneRunwayPrompt("");
      setAddSceneImageFile(null);
      setAddSceneImagePreview(null);
      setAddSceneImageUrl(null);
      setAddSceneImageSourceMode('upload');
      setAddSceneVideoMode('i2v');
      setAddSceneSourceSceneId(null);
      setAddSceneAutoGenerate(false);

    } catch (error) {
      console.error("Failed to add scene:", error);
      alert("シーンの追加に失敗しました");
    } finally {
      setAddingScene(false);
    }
  };

  // シーン追加時の翻訳
  const handleAddSceneTranslate = async () => {
    if (!addSceneDescription.trim() || !storyboard) return;

    setAddSceneTranslating(true);
    try {
      // 新規シーンなのでscene_numberは仮に999を使用（翻訳のみに影響）
      const result = await storyboardApi.translateScene(
        addSceneDescription,
        999,
        storyboard.id
      );
      setAddSceneRunwayPrompt(result.runway_prompt);
    } catch (error) {
      console.error("Failed to translate:", error);
      alert("翻訳に失敗しました");
    } finally {
      setAddSceneTranslating(false);
    }
  };

  // シーン画像生成（手動）
  const handleGenerateSceneImage = async (sceneId: string) => {
    if (!storyboard) return;

    const scene = storyboard.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    try {
      setGeneratingSceneImage(sceneId);

      // 画像再生成API呼び出し（新規シーンにも使用可能）
      const result = await storyboardApi.regenerateImage(
        storyboard.id,
        scene.scene_number
      );

      // storyboard更新
      setStoryboard(result);

    } catch (error) {
      console.error("Failed to generate scene image:", error);
      alert("画像の生成に失敗しました");
    } finally {
      setGeneratingSceneImage(null);
    }
  };

  // シーン動画生成（手動）- 既存のretryingSceneVideoとpollSingleSceneStatusを再利用
  const handleGenerateSceneVideo = async (sceneId: string) => {
    if (!storyboard) return;

    const scene = storyboard.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    try {
      setGeneratingSceneVideo(sceneId);
      setRetryingSceneVideo(scene.scene_number);

      // 動画再生成API呼び出し
      await storyboardApi.regenerateVideo(storyboard.id, scene.scene_number, {
        video_provider: videoProvider,
        kling_mode: videoProvider === 'piapi_kling' ? klingMode : undefined,
      });

      // Wait a bit for the backend to update the status before polling
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // ポーリング開始（既存の関数を使用）
      pollSingleSceneStatus(scene.scene_number);

    } catch (error) {
      console.error("Failed to generate scene video:", error);
      alert("動画の生成に失敗しました");
      setGeneratingSceneVideo(null);
      setRetryingSceneVideo(null);
    }
  };

  // ドラッグ&ドロップ：開始
  const handleDragStart = (event: DragStartEvent) => {
    setActiveSceneId(event.active.id as string);
  };

  // ドラッグ&ドロップ：終了（並べ替え実行）
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSceneId(null);

    if (!over || active.id === over.id || !storyboard) return;

    const oldIndex = storyboard.scenes.findIndex(s => s.id === active.id);
    const newIndex = storyboard.scenes.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // 楽観的更新
    const newScenes = arrayMove(storyboard.scenes, oldIndex, newIndex);
    setStoryboard({ ...storyboard, scenes: newScenes });

    // API呼び出し
    setIsReordering(true);
    try {
      const result = await storyboardApi.reorderScenes(
        storyboard.id,
        newScenes.map(s => s.id)
      );
      // サーバーからの正確なデータで更新
      setStoryboard({ ...storyboard, scenes: result.scenes });
    } catch (error: unknown) {
      // 失敗時は元に戻す
      const errorMessage = error instanceof Error ? error.message : "不明なエラー";
      alert("並べ替えに失敗しました: " + errorMessage);
      const original = await storyboardApi.get(storyboard.id);
      setStoryboard(original);
    } finally {
      setIsReordering(false);
    }
  };

  // 同一親のサブシーン数を取得
  const getSubSceneCount = (parentScene: StoryboardScene) => {
    if (!storyboard) return 0;
    return storyboard.scenes.filter(s => s.parent_scene_id === parentScene.id).length;
  };

  // Regenerate scene image (now available for all scenes)
  const handleRegenerateImage = async (sceneNumber: number) => {
    if (!storyboard) return;

    try {
      setRegeneratingScene(sceneNumber);
      const updated = await storyboardApi.regenerateImage(storyboard.id, sceneNumber);
      setStoryboard(updated);
    } catch (error) {
      console.error("Failed to regenerate image:", error);
      alert("画像の再生成に失敗しました");
    } finally {
      setRegeneratingScene(null);
    }
  };

  // Generate all scene images (after story approval)
  const handleGenerateImages = async () => {
    if (!storyboard) return;

    // サブシーンのプロンプト未入力をチェック
    const subScenesWithoutPrompt = storyboard.scenes.filter(
      s => s.parent_scene_id && (!s.runway_prompt || !s.description_ja)
    );

    if (subScenesWithoutPrompt.length > 0) {
      const confirmed = window.confirm(
        `${subScenesWithoutPrompt.length}件のサブシーンにプロンプトが未入力です。\n` +
        `未入力のサブシーンは画像生成がスキップされます。\n\n` +
        `続行しますか？`
      );
      if (!confirmed) return;
    }

    try {
      setGeneratingImages(true);
      const updated = await storyboardApi.generateImages(storyboard.id);
      setStoryboard(updated);
    } catch (error) {
      console.error("Failed to generate images:", error);
      alert("画像の生成に失敗しました");
    } finally {
      setGeneratingImages(false);
    }
  };

  // Check if all scenes have images (sub-scenes without prompts are excluded from the check)
  const allScenesHaveImages = storyboard?.scenes?.every(
    (scene) => {
      // プロンプト未入力のサブシーンは画像がなくてもOK
      if (scene.parent_scene_id && (!scene.runway_prompt || !scene.description_ja)) {
        return true;
      }
      return scene.scene_image_url !== null;
    }
  ) ?? false;

  // Open regenerate modal
  const openRegenerateModal = (sceneNumber: number) => {
    if (!storyboard) return;
    const scene = storyboard.scenes.find(s => s.scene_number === sceneNumber);
    if (scene) {
      setRegenerateDescriptionJa(scene.description_ja);
      setRegeneratePrompt(scene.runway_prompt);
      setOriginalPrompt(scene.runway_prompt); // 元のプロンプトを保存
      setRegeneratePromptSaved(false); // 保存状態をリセット
      setEndFrameImageUrl(null); // 終了フレーム画像をリセット
      setRegenerateModalScene(sceneNumber);
    }
  };

  // Save prompt without regenerating
  const handleSavePrompt = async () => {
    if (!storyboard || regenerateModalScene === null) return;

    setRegenerateSaving(true);
    try {
      console.log('[DEBUG] Saving prompt for scene:', regenerateModalScene);
      console.log('[DEBUG] New prompt:', regeneratePrompt.substring(0, 100));

      const updated = await storyboardApi.updateScene(storyboard.id, regenerateModalScene, {
        description_ja: regenerateDescriptionJa,
        runway_prompt: regeneratePrompt,
      });

      console.log('[DEBUG] Prompt saved successfully');
      setStoryboard(updated);
      setOriginalPrompt(regeneratePrompt); // 保存後の値を元値として更新
      setRegeneratePromptSaved(true);
      alert('プロンプトを保存しました。内容を確認してから再生成してください。');
    } catch (error) {
      console.error('Failed to save prompt:', error);
      alert('プロンプトの保存に失敗しました');
    } finally {
      setRegenerateSaving(false);
    }
  };

  // Check if prompt has been modified
  const isPromptModified = regeneratePrompt !== originalPrompt;

  // Translate Japanese to English for regenerate modal
  const handleRegenerateTranslate = async () => {
    if (!regenerateDescriptionJa.trim() || regenerateModalScene === null || !storyboard) return;

    setRegenerateTranslating(true);
    try {
      const result = await storyboardApi.translateScene(
        regenerateDescriptionJa,
        regenerateModalScene,
        storyboard.id
      );
      setRegeneratePrompt(result.runway_prompt);
    } catch (error) {
      console.error("Failed to translate:", error);
      alert("翻訳に失敗しました");
    } finally {
      setRegenerateTranslating(false);
    }
  };

  // Regenerate scene video (review step) - saves prompt first if modified, then regenerates
  const handleRegenerateVideo = async (sceneNumber: number) => {
    console.log('[DEBUG] handleRegenerateVideo called for scene:', sceneNumber);
    if (!storyboard) return;

    try {
      // If prompt was modified, save it first
      if (isPromptModified) {
        console.log('[DEBUG] Prompt modified, saving first...');
        setRegenerateSaving(true);
        await storyboardApi.updateScene(storyboard.id, sceneNumber, {
          description_ja: regenerateDescriptionJa,
          runway_prompt: regeneratePrompt,
        });
        console.log('[DEBUG] Prompt saved successfully');
        setRegenerateSaving(false);
      }

      setRegenerateModalScene(null); // Close modal
      setEndFrameImageUrl(null);  // 終了フレーム画像もクリア
      setRetryingSceneVideo(sceneNumber);

      // Reset trim settings for this scene (since video is being regenerated)
      const sceneToReset = storyboard.scenes.find(s => s.scene_number === sceneNumber);
      if (sceneToReset) {
        setSceneTrimSettings(prev => {
          const updated = { ...prev };
          delete updated[sceneToReset.id];
          return updated;
        });
      }

      // Immediately clear the video_url in local state to show loading state
      setStoryboard((prev) =>
        prev
          ? {
              ...prev,
              scenes: prev.scenes.map((s) =>
                s.scene_number === sceneNumber
                  ? { ...s, status: "processing", progress: 0, video_url: null }
                  : s
              ),
            }
          : null
      );

      const videoMode = sceneVideoModes[sceneNumber] || 'i2v';
      console.log('[DEBUG] Calling regenerateVideo (without custom prompt - using DB value):', {
        storyboardId: storyboard.id,
        sceneNumber,
        videoProvider,
        videoMode,
        endFrameImageUrl: endFrameImageUrl ? 'set' : 'none',
      });
      // プロンプトを渡さない - DBに保存済みのプロンプトを使用
      await storyboardApi.regenerateVideo(storyboard.id, sceneNumber, {
        video_provider: videoProvider,
        video_mode: videoMode,
        kling_mode: videoProvider === 'piapi_kling' ? klingMode : undefined,
        image_tail_url: videoProvider === 'piapi_kling' && endFrameImageUrl ? endFrameImageUrl : undefined,
      });

      // Wait a bit for the backend to update the status before polling
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Start polling for this scene
      pollSingleSceneStatus(sceneNumber);
    } catch (error) {
      console.error("Failed to regenerate video:", error);
      alert("動画の再生成に失敗しました");
      setRetryingSceneVideo(null);
      // Reload storyboard to get current state
      const updated = await storyboardApi.get(storyboard.id);
      setStoryboard(updated);
    }
  };

  // Poll for single scene video regeneration
  const pollSingleSceneStatus = useCallback(async (sceneNumber: number) => {
    if (!storyboard) return;

    let sawGenerating = false;  // Track if we saw "generating" status
    let pollCount = 0;
    const maxPolls = 120;  // Max 6 minutes (120 * 3s)

    const poll = async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        alert("タイムアウト: 動画の再生成に時間がかかりすぎています");
        setRetryingSceneVideo(null);
        setGeneratingSceneVideo(null);  // Clear manual generation state
        return;
      }

      try {
        const status = await storyboardApi.getStatus(storyboard.id);
        const targetScene = status.scenes.find(s => s.scene_number === sceneNumber);

        // Track if we've seen the generating state
        if (targetScene?.status === "generating" || targetScene?.status === "processing") {
          sawGenerating = true;
        }

        // Update storyboard with latest status
        console.log('[DEBUG] Polling status response:', status.scenes.map(s => ({
          scene: s.scene_number,
          status: s.status,
          video_url: s.video_url?.split('/').pop()
        })));
        setStoryboard((prev) =>
          prev
            ? {
                ...prev,
                status: status.status,
                scenes: prev.scenes.map((s) => {
                  const updated = status.scenes.find((sc) => sc.scene_number === s.scene_number);
                  if (updated) {
                    console.log(`[DEBUG] Scene ${s.scene_number}: ${s.video_url?.split('/').pop()} -> ${updated.video_url?.split('/').pop()}`);
                  }
                  return updated
                    ? { ...s, status: updated.status, progress: updated.progress, video_url: updated.video_url }
                    : s;
                }),
              }
            : null
        );

        // Only consider "completed" as done if we've seen "generating" first
        // This prevents race conditions where we poll before status changes
        if (targetScene?.status === "completed" && sawGenerating) {
          // Fetch full storyboard data to get updated runway_prompt
          const fullData = await storyboardApi.get(storyboard.id);
          setStoryboard(fullData);
          setRetryingSceneVideo(null);
          setGeneratingSceneVideo(null);  // Clear manual generation state
          return;
        }

        if (targetScene?.status === "failed") {
          alert(`シーン${sceneNumber}の再生成に失敗しました: ${targetScene.error_message || "不明なエラー"}`);
          setRetryingSceneVideo(null);
          setGeneratingSceneVideo(null);  // Clear manual generation state
          return;
        }

        // Continue polling
        setTimeout(poll, 3000);
      } catch (error) {
        console.error("Polling failed:", error);
        setTimeout(poll, 5000);
      }
    };

    poll();
  }, [storyboard]);

  // Start concatenation
  const handleConcatenate = async () => {
    if (!storyboard) return;

    try {
      setConcatenating(true);

      // トリム適用時はconcat/v2 APIを使用
      if (applyTrim && Object.keys(sceneTrimSettings).length > 0) {
        // シーンをdisplay_order順にソート
        const sortedScenes = [...storyboard.scenes]
          .filter(s => s.video_url) // video_urlがあるシーンのみ
          .sort((a, b) => a.display_order - b.display_order);

        // トリム設定付きの動画配列を構築
        const videos = sortedScenes.map(scene => {
          const trim = sceneTrimSettings[scene.id];
          return {
            video_url: scene.video_url!,
            start_time: trim?.startTime ?? 0,
            end_time: trim?.endTime ?? trim?.duration ?? 5,
          };
        });

        // concat/v2 APIを呼び出し
        const res = await videosApi.concatV2({
          videos,
          transition: 'none',
          transition_duration: 0,
        });

        setConcatJobId(res.id);
        setStep("concatenating");
        // concatジョブのポーリングは別のuseEffectで処理
      } else {
        // トリムなし: 従来のstoryboard結合APIを使用
        await storyboardApi.concatenate(storyboard.id, {});
        setStep("concatenating");
        pollConcatenationStatus();
      }
    } catch (error) {
      console.error("Failed to start concatenation:", error);
      alert("結合の開始に失敗しました");
      setConcatenating(false);
    }
  };

  // Helper to get video duration
  const getVideoDuration = useCallback((url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.src = '';
        video.remove();
      };

      video.onloadedmetadata = () => {
        const duration = video.duration;
        cleanup();
        resolve(isFinite(duration) ? duration : 5);
      };

      video.onerror = () => {
        cleanup();
        resolve(5); // Default 5 seconds on error
      };

      // Timeout after 5 seconds
      const timeout = setTimeout(() => {
        cleanup();
        resolve(5);
      }, 5000);

      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        const duration = video.duration;
        cleanup();
        resolve(isFinite(duration) ? duration : 5);
      };

      video.src = getVideoCacheBustedUrl(url);
    });
  }, []);

  // Handle hover time on trim slider - seek video to hovered position
  const handleSceneHoverTime = useCallback((sceneId: string, time: number) => {
    const videoEl = sceneVideoRefs.current[sceneId];
    if (!videoEl) return;

    // Pause video if playing
    if (!videoEl.paused) {
      videoEl.pause();
    }

    setHoveringSceneId(sceneId);
    videoEl.currentTime = time;
  }, []);

  // Handle hover end on trim slider - reset to start position
  const handleSceneHoverEnd = useCallback((sceneId: string) => {
    const videoEl = sceneVideoRefs.current[sceneId];
    const trim = sceneTrimSettings[sceneId];

    setHoveringSceneId(null);

    if (videoEl && trim) {
      videoEl.currentTime = trim.startTime;
    }
  }, [sceneTrimSettings]);

  // Fetch video durations and populate trim settings when scenes are ready
  useEffect(() => {
    if (!storyboard || step !== 'review') return;

    const fetchDurations = async () => {
      for (const scene of storyboard.scenes) {
        // Skip if no video or already has trim settings
        if (!scene.video_url || sceneTrimSettings[scene.id]) continue;

        try {
          const duration = await getVideoDuration(scene.video_url);
          setSceneTrimSettings(prev => ({
            ...prev,
            [scene.id]: {
              startTime: 0,
              endTime: duration,
              duration: duration,
            },
          }));
        } catch (error) {
          console.error('Failed to get video duration:', error);
          // Use default duration
          setSceneTrimSettings(prev => ({
            ...prev,
            [scene.id]: {
              startTime: 0,
              endTime: 5,
              duration: 5,
            },
          }));
        }
      }
    };

    fetchDurations();
  }, [storyboard, step, getVideoDuration, sceneTrimSettings]);

  // Poll for concatenation status
  const pollConcatenationStatus = useCallback(async () => {
    if (!storyboard) return;

    const poll = async () => {
      try {
        const status = await storyboardApi.getStatus(storyboard.id);

        setStoryboard((prev) =>
          prev
            ? {
                ...prev,
                status: status.status,
                final_video_url: status.video_url,
              }
            : null
        );

        if (status.status === "completed") {
          setStep("completed");
          setConcatenating(false);
          return;
        }

        if (status.status === "failed") {
          alert("動画の結合に失敗しました: " + status.message);
          setStep("review");
          setConcatenating(false);
          return;
        }

        // Continue polling
        setTimeout(poll, 3000);
      } catch (error) {
        console.error("Polling failed:", error);
        setTimeout(poll, 5000);
      }
    };

    poll();
  }, [storyboard]);

  // Poll concat job status (for trimmed concatenation via videosApi.concatV2)
  useEffect(() => {
    if (!concatJobId) return;

    const pollConcatJob = async () => {
      try {
        const status = await videosApi.getConcatStatus(concatJobId);

        if (status.status === "completed") {
          // 結合完了: storyboardのfinal_video_urlを更新
          setStoryboard((prev) =>
            prev
              ? {
                  ...prev,
                  status: "completed",
                  final_video_url: status.video_url,
                }
              : null
          );
          setStep("completed");
          setConcatenating(false);
          setConcatJobId(null);
          return;
        }

        if (status.status === "failed") {
          alert("動画の結合に失敗しました: " + (status.error || "不明なエラー"));
          setStep("review");
          setConcatenating(false);
          setConcatJobId(null);
          return;
        }

        // 処理中の場合は続行
      } catch (error) {
        console.error("Concat job polling failed:", error);
      }
    };

    // 初回実行
    pollConcatJob();

    // 3秒ごとにポーリング
    const interval = setInterval(pollConcatJob, 3000);

    return () => clearInterval(interval);
  }, [concatJobId]);

  // Handle download with resolution selection
  const handleDownload = async () => {
    if (!storyboard || !storyboard.final_video_url) return;

    setUpscaleError(null);

    // For original resolution, just download directly (with optional 60fps)
    if (selectedResolution === 'original') {
      try {
        let finalUrl = storyboard.final_video_url;

        // 60fps補間が有効な場合
        if (enable60fps) {
          setIs60fpsProcessing(true);
          setFps60Progress(0);

          // 60fps補間を開始
          await storyboardApi.interpolate60fps(storyboard.id, 'apo-8');

          // ポーリングで完了を待つ
          let interpolatedUrl: string | null = null;
          const maxAttempts = 120; // 最大20分
          let attempts = 0;

          while (!interpolatedUrl && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 10000));
            attempts++;

            const status = await storyboardApi.getInterpolate60fpsStatus(storyboard.id);
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

        const link = document.createElement('a');
        link.href = finalUrl;
        const fpsLabel = enable60fps ? '_60fps' : '';
        link.download = `video_original${fpsLabel}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("Download failed:", error);
        setUpscaleError(error instanceof Error ? error.message : "ダウンロードに失敗しました");
      } finally {
        setIs60fpsProcessing(false);
      }
      return;
    }

    // For ProRes, convert on-the-fly and download
    if (selectedResolution === 'prores') {
      setIsConvertingProRes(true);
      try {
        const blob = await videosApi.downloadAsProRes(storyboard.final_video_url);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `video_prores_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (err) {
        console.error("ProRes conversion failed:", err);
        setUpscaleError(err instanceof Error ? err.message : "ProRes変換に失敗しました");
      } finally {
        setIsConvertingProRes(false);
      }
      return;
    }

    // For ProRes + Upscale (prores_hd or prores_4k)
    if (selectedResolution === 'prores_hd' || selectedResolution === 'prores_4k') {
      const targetResolution = selectedResolution === 'prores_hd' ? 'hd' : '4k';
      setProResConversionPhase('upscaling');
      setUpscaleForProResProgress(0);
      setUpscaleError(null);

      try {
        // Phase 1: Upscale
        await storyboardApi.upscale(storyboard.id, targetResolution);

        // Poll for upscale completion
        let upscaledUrl: string | null = null;
        while (!upscaledUrl) {
          const status = await storyboardApi.getUpscaleStatus(storyboard.id);
          setUpscaleForProResProgress(status.progress);

          if (status.status === 'completed' && status.upscaled_video_url) {
            upscaledUrl = status.upscaled_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || 'アップスケールに失敗しました');
          } else {
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        // Phase 2: ProRes conversion
        setProResConversionPhase('converting');

        const blob = await videosApi.downloadAsProRes(upscaledUrl);

        // Download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `video_prores_${targetResolution}_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setShowDownloadModal(false);
      } catch (err) {
        console.error("ProRes + Upscale failed:", err);
        setUpscaleError(err instanceof Error ? err.message : "処理に失敗しました");
      } finally {
        setProResConversionPhase('idle');
      }
      return;
    }

    // For HD/4K, start upscale process (with optional 60fps interpolation)
    try {
      setIsUpscaling(true);
      setUpscaleProgress(0);

      let sourceUrlForUpscale: string | undefined = undefined;

      // 60fps補間が有効な場合、まず補間を実行
      if (enable60fps) {
        setIs60fpsProcessing(true);
        setFps60Progress(0);

        // 60fps補間を開始
        await storyboardApi.interpolate60fps(storyboard.id, 'apo-8');

        // ポーリングで完了を待つ
        let interpolatedUrl: string | null = null;
        const maxAttempts = 120; // 最大20分
        let attempts = 0;

        while (!interpolatedUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 10000));
          attempts++;

          const status = await storyboardApi.getInterpolate60fpsStatus(storyboard.id);
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
      const upscaleResponse = await storyboardApi.upscale(storyboard.id, selectedResolution, sourceUrlForUpscale);

      // If already completed (shouldn't happen for HD/4K but just in case)
      if (upscaleResponse.status === 'completed' && upscaleResponse.upscaled_video_url) {
        const link = document.createElement('a');
        link.href = upscaleResponse.upscaled_video_url;
        const fpsLabel = enable60fps ? '_60fps' : '';
        link.download = `video_${selectedResolution}${fpsLabel}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowDownloadModal(false);
        setIsUpscaling(false);
        return;
      }

      // Poll for upscale completion
      const pollUpscale = async () => {
        try {
          const status = await storyboardApi.getUpscaleStatus(storyboard.id);
          setUpscaleProgress(status.progress);

          if (status.status === 'completed' && status.upscaled_video_url) {
            // Download the upscaled video
            const link = document.createElement('a');
            link.href = status.upscaled_video_url;
            const fpsLabel = enable60fps ? '_60fps' : '';
            link.download = `video_${selectedResolution}${fpsLabel}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setShowDownloadModal(false);
            setIsUpscaling(false);
            return;
          }

          if (status.status === 'failed') {
            setUpscaleError(status.message || 'アップスケールに失敗しました');
            setIsUpscaling(false);
            return;
          }

          // Continue polling
          setTimeout(pollUpscale, 3000);
        } catch (error) {
          console.error("Upscale polling failed:", error);
          setTimeout(pollUpscale, 5000);
        }
      };

      pollUpscale();
    } catch (error) {
      console.error("Failed to start upscale:", error);
      setUpscaleError(error instanceof Error ? error.message : 'アップスケールの開始に失敗しました');
      setIsUpscaling(false);
      setIs60fpsProcessing(false);
    }
  };

  // Handle scene download with resolution selection
  const handleSceneDownload = async () => {
    if (!storyboard || downloadingSceneNumber === null) return;

    const scene = storyboard.scenes.find(s => s.scene_number === downloadingSceneNumber);
    if (!scene || !scene.video_url) return;

    setSceneUpscaleError(null);

    // For original resolution, just download directly
    if (sceneSelectedResolution === 'original') {
      const link = document.createElement('a');
      link.href = scene.video_url;
      link.download = `scene_${downloadingSceneNumber}_original.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowSceneDownloadModal(false);
      setDownloadingSceneNumber(null);
      return;
    }

    // For ProRes, convert on-the-fly and download
    if (sceneSelectedResolution === 'prores') {
      setIsSceneConvertingProRes(true);
      try {
        const blob = await videosApi.downloadAsProRes(scene.video_url);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `scene_${downloadingSceneNumber}_prores_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowSceneDownloadModal(false);
        setDownloadingSceneNumber(null);
      } catch (err) {
        console.error("ProRes conversion failed:", err);
        setSceneUpscaleError(err instanceof Error ? err.message : "ProRes変換に失敗しました");
      } finally {
        setIsSceneConvertingProRes(false);
      }
      return;
    }

    // For ProRes + Upscale (prores_hd or prores_4k)
    if (sceneSelectedResolution === 'prores_hd' || sceneSelectedResolution === 'prores_4k') {
      const targetResolution = sceneSelectedResolution === 'prores_hd' ? 'hd' : '4k';
      setSceneProResConversionPhase('upscaling');
      setSceneUpscaleForProResProgress(0);
      setSceneUpscaleError(null);

      try {
        // Phase 1: Upscale
        await storyboardApi.upscaleScene(storyboard.id, downloadingSceneNumber, targetResolution);

        // Poll for upscale completion
        let upscaledUrl: string | null = null;
        while (!upscaledUrl) {
          const status = await storyboardApi.getSceneUpscaleStatus(storyboard.id, downloadingSceneNumber);
          setSceneUpscaleForProResProgress(status.progress);

          if (status.status === 'completed' && status.upscaled_video_url) {
            upscaledUrl = status.upscaled_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || 'アップスケールに失敗しました');
          } else {
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        // Phase 2: ProRes conversion
        setSceneProResConversionPhase('converting');

        const blob = await videosApi.downloadAsProRes(upscaledUrl);

        // Download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `scene_${downloadingSceneNumber}_prores_${targetResolution}_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setShowSceneDownloadModal(false);
        setDownloadingSceneNumber(null);
      } catch (err) {
        console.error("ProRes + Upscale failed:", err);
        setSceneUpscaleError(err instanceof Error ? err.message : "処理に失敗しました");
      } finally {
        setSceneProResConversionPhase('idle');
      }
      return;
    }

    // For HD/4K, start upscale process
    try {
      setIsSceneUpscaling(true);
      setSceneUpscaleProgress(0);

      // Start upscale
      const upscaleResponse = await storyboardApi.upscaleScene(
        storyboard.id,
        downloadingSceneNumber,
        sceneSelectedResolution as 'hd' | '4k'
      );

      // If already completed (shouldn't happen for HD/4K but just in case)
      if (upscaleResponse.status === 'completed' && upscaleResponse.upscaled_video_url) {
        const link = document.createElement('a');
        link.href = upscaleResponse.upscaled_video_url;
        link.download = `scene_${downloadingSceneNumber}_${sceneSelectedResolution}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowSceneDownloadModal(false);
        setDownloadingSceneNumber(null);
        setIsSceneUpscaling(false);
        return;
      }

      // Poll for upscale completion
      const pollSceneUpscale = async () => {
        try {
          const status = await storyboardApi.getSceneUpscaleStatus(
            storyboard.id,
            downloadingSceneNumber!
          );
          setSceneUpscaleProgress(status.progress);

          if (status.status === 'completed' && status.upscaled_video_url) {
            // Download the upscaled video
            const link = document.createElement('a');
            link.href = status.upscaled_video_url;
            link.download = `scene_${downloadingSceneNumber}_${sceneSelectedResolution}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setShowSceneDownloadModal(false);
            setDownloadingSceneNumber(null);
            setIsSceneUpscaling(false);
            return;
          }

          if (status.status === 'failed') {
            setSceneUpscaleError(status.message || 'アップスケールに失敗しました');
            setIsSceneUpscaling(false);
            return;
          }

          // Continue polling
          setTimeout(pollSceneUpscale, 3000);
        } catch (error) {
          console.error("Scene upscale polling failed:", error);
          setTimeout(pollSceneUpscale, 5000);
        }
      };

      pollSceneUpscale();
    } catch (error) {
      console.error("Failed to start scene upscale:", error);
      setSceneUpscaleError('アップスケールの開始に失敗しました');
      setIsSceneUpscaling(false);
    }
  };

  // Start video generation
  const handleStartGeneration = async () => {
    if (!storyboard) return;

    try {
      await storyboardApi.generate(storyboard.id, {
        video_provider: videoProvider,
        scene_video_modes: sceneVideoModes,  // シーンごとのI2V/V2V設定
        // Kling専用: シーンごとの終了フレーム画像
        scene_end_frame_images: videoProvider === 'piapi_kling' && Object.keys(sceneEndFrameImages).length > 0
          ? sceneEndFrameImages
          : undefined,
        // Kling Elements: 一貫性向上用の追加画像
        element_images: videoProvider === 'piapi_kling' && elementImages.length > 0
          ? elementImages.map(url => ({ image_url: url }))
          : undefined,
      });
      setStep("generating");
      pollStatus();
    } catch (error) {
      console.error("Failed to start generation:", error);
      alert("動画生成の開始に失敗しました");
    }
  };

  // Poll for status updates
  const pollStatus = useCallback(async () => {
    if (!storyboard) return;

    const poll = async () => {
      try {
        const status = await storyboardApi.getStatus(storyboard.id);

        // Update storyboard with latest status
        setStoryboard((prev) =>
          prev
            ? {
                ...prev,
                status: status.status,
                final_video_url: status.video_url,
                scenes: prev.scenes.map((s) => {
                  const updated = status.scenes.find((sc) => sc.scene_number === s.scene_number);
                  return updated
                    ? { ...s, status: updated.status, progress: updated.progress, video_url: updated.video_url }
                    : s;
                }),
              }
            : null
        );

        // videos_ready = all scenes completed, user can review before concatenation
        if (status.status === "videos_ready") {
          setStep("review");
          return;
        }

        if (status.status === "completed") {
          setStep("completed");
          return;
        }

        if (status.status === "failed") {
          alert("動画生成に失敗しました: " + status.message);
          setStep("edit");
          return;
        }

        // Continue polling
        setTimeout(poll, 3000);
      } catch (error) {
        console.error("Polling failed:", error);
        setTimeout(poll, 5000);
      }
    };

    poll();
  }, [storyboard]);

  if (authLoading || !user || loadingExisting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
          {loadingExisting && (
            <p className="mt-2 text-sm text-zinc-500">ストーリーボードを読み込み中...</p>
          )}
        </div>
      </div>
    );
  }

  const actLabels: Record<string, { label: string; color: string }> = {
    "起": { label: "起 (導入)", color: "bg-blue-500" },
    "承": { label: "承 (展開)", color: "bg-green-500" },
    "転": { label: "転 (転換)", color: "bg-orange-500" },
    "結": { label: "結 (結末)", color: "bg-purple-500" },
    "custom": { label: "追加", color: "bg-zinc-500" },
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      {/* Aspect Ratio Selection Modal */}
      {showAspectRatioModal && pendingImageForAspectSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-zinc-900 p-6">
            <h3 className="mb-2 text-center text-lg font-semibold text-white">
              アスペクト比を選択
            </h3>
            <p className="mb-6 text-center text-sm text-zinc-400">
              動画のアスペクト比を選択してください
            </p>

            {/* Preview image */}
            <div className="mb-6 flex justify-center">
              <img
                src={pendingImageForAspectSelect}
                alt="Preview"
                className="max-h-40 rounded-lg object-contain"
              />
            </div>

            {/* Aspect ratio buttons */}
            <div className="mb-6 flex justify-center gap-4">
              <button
                onClick={() => setAspectRatio('9:16')}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-4 transition-all ${
                  aspectRatio === '9:16'
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-zinc-500 bg-zinc-800 hover:border-zinc-400 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex h-16 w-10 items-center justify-center rounded border-2 border-current">
                  <span className="text-xs">9:16</span>
                </div>
                <span className="text-sm font-medium text-white">縦長</span>
                <span className="text-xs text-zinc-400">TikTok/Reels</span>
              </button>
              <button
                onClick={() => setAspectRatio('16:9')}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-4 transition-all ${
                  aspectRatio === '16:9'
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-zinc-500 bg-zinc-800 hover:border-zinc-400 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex h-10 w-16 items-center justify-center rounded border-2 border-current">
                  <span className="text-xs">16:9</span>
                </div>
                <span className="text-sm font-medium text-white">横長</span>
                <span className="text-xs text-zinc-400">YouTube</span>
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAspectRatioCancel}
                className="flex-1 rounded-lg border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleAspectRatioConfirm}
                className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-medium text-white hover:from-purple-700 hover:to-pink-700"
              >
                次へ：トリミング
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {showCropper && rawImageForCrop && (
        <ImageCropper
          imageSrc={rawImageForCrop}
          aspectRatio={aspectRatio === '9:16' ? 9 / 16 : 16 / 9}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Draft Restore Modal */}
      {showDraftRestoreModal && pendingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-zinc-900 p-6">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-purple-500/20 p-3">
                <RotateCcw className="h-8 w-8 text-purple-400" />
              </div>
            </div>
            <h3 className="mb-2 text-center text-lg font-semibold text-white">
              編集中のドラフトが見つかりました
            </h3>
            <p className="mb-2 text-center text-sm text-zinc-400">
              前回の編集状態を復元しますか？
            </p>
            {draftAge > 0 && (
              <p className={`mb-4 text-center text-xs ${draftAge >= 1 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                {draftAge}日前に保存されたドラフトです
                {draftAge >= 7 && ' (古いドラフトのため、復元後に内容を確認してください)'}
              </p>
            )}

            {/* ドラフト内容のプレビュー */}
            <div className="mb-6 rounded-lg bg-zinc-800 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-zinc-400">保存ステップ:</span>
                <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                  {pendingDraft.current_step === 'edit' && 'シーン編集'}
                  {pendingDraft.current_step === 'review' && '動画レビュー'}
                  {pendingDraft.current_step === 'generating' && '動画生成中'}
                  {pendingDraft.current_step === 'mood' && 'ムード選択'}
                  {!pendingDraft.current_step && '不明'}
                </span>
              </div>
              {Object.keys(pendingDraft.camera_selections || {}).length > 0 && (
                <div className="mb-1 text-xs text-zinc-500">
                  カメラワーク設定: {Object.keys(pendingDraft.camera_selections).length}シーン
                </div>
              )}
              {pendingDraft.video_provider && (
                <div className="text-xs text-zinc-500">
                  プロバイダー: {pendingDraft.video_provider.toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDiscardDraft}
                className="flex-1 rounded-lg border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                新規開始
              </button>
              <button
                onClick={handleRestoreDraft}
                className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-medium text-white hover:from-purple-700 hover:to-pink-700"
              >
                復元する
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              ストーリー生成
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              1枚の画像から起承転結4シーンの20秒動画を生成
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/generate/storyboard/history")}
          >
            <List className="mr-2 h-4 w-4" />
            履歴を見る
          </Button>

          {/* Save Button & Status Indicator */}
          {storyboard && step !== 'upload' && step !== 'completed' && (
            <div className="flex items-center gap-3">
              {/* Manual Save Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveDraft()}
                disabled={saveStatus === 'saving'}
                className="gap-1.5"
              >
                {saveStatus === 'saving' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                一時保存
              </Button>

              {/* Status Indicator */}
              <div className="flex items-center gap-2 text-xs">
                {saveStatus === 'saved' && (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">保存しました</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <X className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">保存エラー</span>
                  </>
                )}
                {saveStatus === 'idle' && lastSavedAt && (
                  <span className="text-zinc-500">
                    最終保存: {new Date(lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step: Input - 初期入力（画像 + テキスト） */}
        {step === "input" && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mx-auto max-w-4xl">
              <div className="mb-6 text-center">
                <Sparkles className="mx-auto h-12 w-12 text-purple-500" />
                <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                  ワンシーン動画を作成
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  画像をアップロード、またはテキストで画像を生成できます
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {/* 左カラム: 参照画像 + アスペクト比 */}
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      参照画像（オプション）
                    </h3>
                    <label
                      className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-6 transition-all ${
                        imagePreview
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReferenceImageSelect}
                        className="hidden"
                        disabled={generatingFromText}
                      />
                      {imagePreview ? (
                        <div className="relative">
                          <img
                            src={imagePreview}
                            alt="参照画像"
                            className="max-h-48 rounded-lg object-contain"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setImagePreview(null);
                              setReferenceImageUrl(null);
                            }}
                            className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-zinc-400" />
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            クリックして画像を選択
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {/* アスペクト比選択 */}
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      アスペクト比
                    </h3>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setAspectRatio("9:16")}
                        disabled={generatingFromText}
                        className={`flex-1 rounded-lg border-2 p-3 text-center transition-all ${
                          aspectRatio === "9:16"
                            ? "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
                            : "border-zinc-300 bg-zinc-100 hover:border-zinc-400 hover:bg-zinc-200 dark:border-zinc-500 dark:bg-zinc-800 dark:hover:border-zinc-400 dark:hover:bg-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        <div className="mx-auto mb-2 h-12 w-8 rounded border-2 border-current" />
                        <div className="text-sm font-medium">9:16 縦長</div>
                      </button>
                      <button
                        onClick={() => setAspectRatio("16:9")}
                        disabled={generatingFromText}
                        className={`flex-1 rounded-lg border-2 p-3 text-center transition-all ${
                          aspectRatio === "16:9"
                            ? "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
                            : "border-zinc-300 bg-zinc-100 hover:border-zinc-400 hover:bg-zinc-200 dark:border-zinc-500 dark:bg-zinc-800 dark:hover:border-zinc-400 dark:hover:bg-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        <div className="mx-auto mb-2 h-8 w-12 rounded border-2 border-current" />
                        <div className="text-sm font-medium">16:9 横長</div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 右カラム: 構造化入力フォーム or テキストエリア */}
                <div>
                  <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    画像の詳細を入力（オプション）
                  </h3>

                  {/* 画像生成モデル選択 */}
                  <div className="mb-4">
                    <ImageProviderSelector
                      value={imageProvider}
                      onChange={handleImageProviderChange}
                      disabled={generatingFromText}
                    />
                  </div>

                  {/* 参照画像選択（BFL FLUX.2のみ） */}
                  <div className="mb-4">
                    <ReferenceImageSelector
                      value={referenceImages}
                      onChange={setReferenceImages}
                      imageProvider={imageProvider}
                      availableImages={
                        storyboard?.scenes
                          ?.filter(scene => scene.scene_image_url)
                          .map((scene, index) => ({
                            url: scene.scene_image_url!,
                            label: `シーン ${index + 1}`
                          })) || []
                      }
                      disabled={generatingFromText}
                    />
                  </div>

                  {/* 入力モード切り替えタブ - Fluxの場合は非表示 */}
                  <div className="mb-4">
                    {supportsStructuredInput(imageProvider) ? (
                      <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                        <button
                          type="button"
                          onClick={() => setImageInputMode("form")}
                          disabled={generatingFromText}
                          className={cn(
                            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                            imageInputMode === "form"
                              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                              : "text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white"
                          )}
                        >
                          フォーム入力
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageInputMode("text")}
                          disabled={generatingFromText}
                          className={cn(
                            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                            imageInputMode === "text"
                              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                              : "text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white"
                          )}
                        >
                          テキスト入力
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-zinc-100 border border-zinc-300 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-300">
                        <span className="text-purple-600 dark:text-purple-400 font-medium">Flux</span> はシンプルなテキスト入力で高速に画像を生成します
                      </div>
                    )}
                  </div>

                  {/* 条件付きレンダリング */}
                  {imageInputMode === "form" ? (
                    <StructuredImageForm
                      value={structuredInput}
                      onChange={setStructuredInput}
                      disabled={generatingFromText}
                    />
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        画像の説明
                      </label>
                      <textarea
                        value={freeTextDescription}
                        onChange={(e) => setFreeTextDescription(e.target.value)}
                        placeholder={"生成したい画像の説明を自由に入力してください。\n\n例: 白い大理石のテーブルの上に置かれた高級感のあるコーヒーカップ。ゴールデンアワーの柔らかい光が左上から差し込み、暖かみのある色調で撮影。背景は軽くぼかしたモダンなカフェの内装。"}
                        disabled={generatingFromText}
                        rows={8}
                        maxLength={getProviderMaxLength(imageProvider)}
                        className={cn(
                          "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
                          "placeholder:text-zinc-400",
                          "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          "resize-none",
                          "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
                        )}
                      />
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>被写体、背景、照明、色調などを詳しく記述すると精度が上がります</span>
                        <span>{freeTextDescription.length.toLocaleString()}/{getProviderMaxLength(imageProvider).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* アクションボタン */}
              <div className="mt-8 space-y-3">
                <Button
                  onClick={handleGenerateImageFromText}
                  disabled={generatingFromText || !canGenerateImage()}
                  className="w-full"
                  size="lg"
                >
                  {generatingFromText ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      画像を生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      画像を生成
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-zinc-300 dark:border-zinc-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-900">
                      または
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleSkipWithImageOnly}
                  disabled={generatingFromText || !referenceImageUrl}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <ImageIcon className="mr-2 h-5 w-5" />
                  画像だけでスキップ
                </Button>

                <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                  ※ 画像またはテキストのどちらかは必須です
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview - 生成画像確認 */}
        {step === "preview" && generatedImageUrl && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 text-center">
                <Check className="mx-auto h-12 w-12 text-green-500" />
                <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                  画像が生成されました
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  この画像で動画を作成しますか？
                </p>
              </div>

              {/* 生成画像プレビュー */}
              <div className="mb-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                <img
                  src={generatedImageUrl}
                  alt="生成された画像"
                  className="w-full object-contain"
                  style={{ maxHeight: "400px" }}
                />
              </div>

              {/* 生成プロンプト表示 */}
              {generatedPromptJa && (
                <div className="mb-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
                  <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    生成プロンプト
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {generatedPromptJa}
                  </p>
                </div>
              )}

              {/* アクションボタン */}
              <div className="flex gap-4">
                <Button
                  onClick={handleRegenerateFromText}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  やり直す
                </Button>
                <Button
                  onClick={handleConfirmGeneratedImage}
                  className="flex-1"
                >
                  <Check className="mr-2 h-4 w-4" />
                  この画像で続ける
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 text-center">
                <Clapperboard className="mx-auto h-12 w-12 text-purple-500" />
                <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                  画像を選択
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  AIが画像を分析し、起承転結4シーンの構成を提案します
                </p>
              </div>

              {/* Tab switcher */}
              <div className="mb-6 flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                <button
                  onClick={() => setImageSourceMode('upload')}
                  className={`flex-1 rounded-md py-2 px-4 text-sm font-medium transition-all ${
                    imageSourceMode === 'upload'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                      : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white'
                  }`}
                >
                  <Upload className="inline-block w-4 h-4 mr-2" />
                  新規アップロード
                </button>
                <button
                  onClick={() => setImageSourceMode('gallery')}
                  className={`flex-1 rounded-md py-2 px-4 text-sm font-medium transition-all ${
                    imageSourceMode === 'gallery'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                      : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white'
                  }`}
                >
                  <Camera className="inline-block w-4 h-4 mr-2" />
                  スクリーンショットから選択
                </button>
              </div>

              {/* Upload mode */}
              {imageSourceMode === 'upload' && (
                <div className="max-w-md mx-auto">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <label
                      className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 transition-all ${
                        isDragging
                          ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30"
                          : imagePreview
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="max-h-64 rounded-lg object-contain"
                        />
                      ) : (
                        <>
                          <Upload className={`h-10 w-10 ${isDragging ? "text-purple-500" : "text-zinc-400"}`} />
                          <span className={`text-sm ${isDragging ? "text-purple-600 dark:text-purple-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                            {isDragging ? "ドロップして画像をアップロード" : "クリックまたはドラッグ&ドロップ"}
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {/* Video Provider & Aspect Ratio Selection */}
                  {imagePreview && (
                    <>
                    <div className="mt-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
                      <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        動画生成エンジン
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleProviderChange('runway')}
                          className={`rounded-lg border-2 p-3 text-left transition-all ${
                            videoProvider === 'runway'
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          <div className="font-medium text-zinc-900 dark:text-white">
                            Runway
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            高速・安定（5秒）
                          </div>
                        </button>
                        <button
                          onClick={() => handleProviderChange('piapi_kling')}
                          className={`rounded-lg border-2 p-3 text-left transition-all ${
                            videoProvider === 'piapi_kling'
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          <div className="font-medium text-zinc-900 dark:text-white">
                            Kling AI
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {klingMode === 'pro' ? 'Pro・高品質' : 'Standard・低コスト'}（5秒）
                          </div>
                        </button>
                        <button
                          onClick={() => handleProviderChange('veo')}
                          className={`rounded-lg border-2 p-3 text-left transition-all ${
                            videoProvider === 'veo'
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          <div className="font-medium text-zinc-900 dark:text-white">
                            Veo 3.1
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            高品質・音声付き（8秒）
                          </div>
                        </button>
                      </div>

                      {/* Kling AI モード選択（Kling選択時のみ表示） */}
                      {videoProvider === 'piapi_kling' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => setKlingMode('std')}
                            className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                              klingMode === 'std'
                                ? 'border-purple-500 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'
                            }`}
                          >
                            <div className="font-medium">Standard</div>
                            <div className="text-xs opacity-70">低コスト</div>
                          </button>
                          <button
                            onClick={() => setKlingMode('pro')}
                            className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                              klingMode === 'pro'
                                ? 'border-purple-500 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'
                            }`}
                          >
                            <div className="font-medium">Pro</div>
                            <div className="text-xs opacity-70">高品質</div>
                          </button>
                        </div>
                      )}

                      {/* Kling Elements: 一貫性向上用の追加画像（Kling選択時のみ表示） */}
                      {videoProvider === 'piapi_kling' && (
                        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-600">
                          <ElementImagesUploader
                            value={elementImages}
                            onChange={setElementImages}
                            maxImages={3}
                            videoProvider={videoProvider}
                            onUpload={async (file) => {
                              const result = await videosApi.uploadImage(file);
                              return result.image_url;
                            }}
                            disabled={generatingStoryboard}
                          />
                        </div>
                      )}

                      {/* 終了フレーム画像アップロード（Kling選択時のみ表示） */}
                      {videoProvider === 'piapi_kling' && (
                        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-600">
                          <h5 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            終了フレーム画像（オプション）
                          </h5>
                          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                            2枚目の画像を設定すると、1枚目から2枚目へ遷移する動画を生成します。
                            全シーンに共通で適用されます。
                          </p>

                          {initialEndFrameImagePreview ? (
                            <div className="relative flex justify-center">
                              <img
                                src={initialEndFrameImagePreview}
                                alt="終了フレーム"
                                className="max-h-48 max-w-full rounded-lg object-contain"
                              />
                              {initialEndFrameUploading && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setInitialEndFrameImagePreview(null);
                                  setInitialEndFrameImageUrl(null);
                                }}
                                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                                disabled={initialEndFrameUploading}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <label
                              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-4 transition-colors ${
                                initialEndFrameDragging
                                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                                  : "border-zinc-200 hover:border-purple-400 dark:border-zinc-700 dark:hover:border-purple-500"
                              }`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInitialEndFrameDragging(true);
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInitialEndFrameDragging(false);
                              }}
                              onDrop={handleInitialEndFrameDrop}
                            >
                              <ImageIcon className="mb-2 h-8 w-8 text-zinc-400" />
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                ドラッグ＆ドロップまたはクリックで選択
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleEndFrameImageSelect}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    </>
                  )}

                  <Button
                    className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600"
                    disabled={!imageFile || uploading}
                    onClick={handleUploadAndSelectMood}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        アップロード中...
                      </>
                    ) : (
                      <>
                        <ArrowLeft className="mr-2 h-4 w-4 rotate-180" />
                        次へ：動画のテーマを選択
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Gallery mode */}
              {imageSourceMode === 'gallery' && (
                <div>
                  <ScreenshotGallery
                    onSelectForGeneration={handleSelectScreenshot}
                    onError={(err) => alert(err)}
                    onSuccess={(msg) => console.log(msg)}
                    refreshTrigger={galleryRefreshTrigger}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Mood Selection */}
        {step === "mood" && uploadedImageUrl && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mx-auto max-w-2xl">
              {/* Header with image */}
              <div className="mb-6 flex items-start gap-6">
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded"
                  className="h-24 w-24 rounded-lg object-cover flex-shrink-0"
                />
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                    どんな動画を作りますか？
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    作りたい動画のイメージを入力してください。AIが起承転結4シーンの構成と画像を生成します。
                  </p>
                </div>
              </div>

              {/* Story Text Input - Large */}
              <div className="mb-6">
                <textarea
                  className="w-full rounded-xl border-2 border-zinc-200 p-4 text-base dark:border-zinc-700 dark:bg-zinc-800 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                  rows={5}
                  placeholder="例：「夏の終わりを感じる切ない青春ムービー」「おしゃれなカフェの雰囲気を伝える動画」「躍動感あふれるスポーツシーン」など、自由に入力してください"
                  value={customMoodText}
                  onChange={(e) => setCustomMoodText(e.target.value)}
                />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  詳しく書くほど、イメージに近い動画が生成されます
                </p>
              </div>

              {/* Mood Quick Select Buttons */}
              <div className="mb-6">
                <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  または、雰囲気を選択：
                </p>
                <div className="flex flex-wrap gap-2">
                  {MOOD_OPTIONS.map((mood) => {
                    const Icon = mood.icon;
                    const isSelected = selectedMood === mood.id;
                    return (
                      <button
                        key={mood.id}
                        onClick={() => {
                          setSelectedMood(isSelected ? null : mood.id);
                        }}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? "bg-purple-600 text-white"
                            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {mood.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                    setUploadedImageUrl(null);
                    setSelectedMood(null);
                    setCustomMoodText("");
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  戻る
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                  disabled={(!selectedMood && !customMoodText.trim()) || generatingStoryboard}
                  onClick={handleGenerateStoryboard}
                >
                  {generatingStoryboard ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                      AIがストーリーを構成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      ストーリーボードを生成
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Edit Storyboard */}
        {step === "edit" && storyboard && (
          <div className="space-y-6">
            {/* Source Image */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <div className="flex items-start gap-6">
                <img
                  src={storyboard.source_image_url}
                  alt="Source"
                  className="h-32 w-32 rounded-lg object-cover"
                />
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    {storyboard.title || "ストーリーボード"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    4シーン × 5秒 = 20秒のショートフィルム
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {allScenesHaveImages
                      ? "各シーンを編集して、理想の構成に調整してください"
                      : "ストーリーとプロンプトを確認してください。OKなら画像を生成します"}
                  </p>
                  {!allScenesHaveImages && (
                    <div className="mt-3">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        ストーリー確認中
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Scene Cards - grouped by act with sub-scenes */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={storyboard.scenes.map(s => s.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {storyboard.scenes.map((scene) => (
                    <SortableSceneCard
                      key={scene.id}
                      scene={scene}
                      disabled={isReordering || deletingScene !== null}
                    >
                      <div
                        className={`rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900 ${
                    scene.parent_scene_id ? "border-l-4 border-purple-300 dark:border-purple-700" : ""
                  }`}
                >
                  {/* Act Badge */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* シーン番号（display_order） */}
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">
                        #{scene.display_order || scene.scene_number}
                      </span>
                      {/* actバッジ（視覚的区別用） */}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${
                          actLabels[scene.act]?.color || "bg-zinc-500"
                        }`}
                      >
                        {scene.act}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">5秒</span>
                      {/* シーン削除ボタン（最低1シーンは残す） */}
                      {storyboard.scenes.length > 1 && (
                        <button
                          onClick={() => handleDeleteScene(scene.id)}
                          disabled={deletingScene !== null || deletingSubScene !== null}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800 transition-colors"
                          title="シーンを削除"
                        >
                          {deletingScene === scene.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Scene Image */}
                  <div className="relative mb-3 aspect-[9/16] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {scene.scene_image_url ? (
                      <img
                        src={scene.scene_image_url}
                        alt={`Scene ${scene.scene_number}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-center p-4">
                        <ImageIcon className="h-8 w-8 text-zinc-400" />
                        <p className="mt-2 text-xs text-zinc-500">
                          {generatingImages ? "生成中..." : "画像未生成"}
                        </p>
                      </div>
                    )}

                    {/* Regenerating overlay */}
                    {regeneratingScene === scene.scene_number && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                        <p className="mt-2 text-sm text-white">画像を再生成中...</p>
                      </div>
                    )}

                    {/* Generating images overlay */}
                    {generatingImages && !scene.scene_image_url && scene.scene_number > 1 && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                        <p className="mt-2 text-sm text-white">画像を生成中...</p>
                      </div>
                    )}

                    {/* Action buttons - only show if images have been generated */}
                    {allScenesHaveImages && (
                      <div className="absolute bottom-0 left-0 right-0 flex gap-1 bg-gradient-to-t from-black/80 to-transparent p-2">
                        {/* Regenerate Button */}
                        <button
                          onClick={() => handleRegenerateImage(scene.scene_number)}
                          disabled={regeneratingScene !== null || uploadingSceneImage !== null}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          再生成
                        </button>

                        {/* Upload custom image button */}
                        <label
                          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-zinc-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 ${
                            uploadingSceneImage !== null || regeneratingScene !== null ? "opacity-50 pointer-events-none" : ""
                          }`}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadSceneImage(scene.scene_number, file);
                            }}
                            disabled={uploadingSceneImage !== null || regeneratingScene !== null}
                          />
                          {uploadingSceneImage === scene.scene_number ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3" />
                          )}
                          差替え
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Scene Content */}
                  {editingScene === scene.scene_number ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">日本語説明</label>
                        <textarea
                          className="w-full rounded-lg border p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                          rows={3}
                          value={editForm.description_ja}
                          onChange={(e) =>
                            setEditForm({ ...editForm, description_ja: e.target.value })
                          }
                          placeholder="日本語説明"
                        />
                      </div>
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleTranslateScene}
                          disabled={translating || !editForm.description_ja.trim()}
                          className="gap-1"
                        >
                          {translating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Languages className="h-3 w-3" />
                          )}
                          英語に翻訳
                        </Button>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">Runway Prompt (英語)</label>
                        <textarea
                          className="w-full rounded-lg border p-2 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-800"
                          rows={4}
                          value={editForm.runway_prompt}
                          onChange={(e) =>
                            setEditForm({ ...editForm, runway_prompt: e.target.value })
                          }
                          placeholder="Runway Prompt"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveScene}>
                          <Check className="mr-1 h-3 w-3" />
                          保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingScene(null)}>
                          <X className="mr-1 h-3 w-3" />
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                        {scene.description_ja}
                      </p>
                      <p className="mb-3 text-xs text-zinc-500 line-clamp-3 font-mono">
                        {scene.runway_prompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setCameraWorkModalScene(scene.scene_number)}
                          className="flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs text-purple-700 hover:bg-purple-200 transition-colors dark:bg-purple-900/30 dark:text-purple-300"
                        >
                          <Camera className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">
                            {scene.camera_work ? scene.camera_work.split(',')[0].trim().slice(0, 15) : 'カメラ設定'}
                          </span>
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditScene(scene)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* I2V/V2V選択（画像生成後、シーン2以降、カスタム画像でない場合に表示） */}
                      {allScenesHaveImages && scene.scene_number > 1 && !customImageScenes.has(scene.scene_number) && (
                        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">生成:</span>
                            <div className="flex flex-1 gap-1">
                              <button
                                onClick={() => setSceneVideoModes(prev => ({ ...prev, [scene.scene_number]: 'i2v' }))}
                                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                                  (sceneVideoModes[scene.scene_number] || 'i2v') === 'i2v'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200'
                                }`}
                              >
                                I2V
                              </button>
                              <button
                                onClick={() => setSceneVideoModes(prev => ({ ...prev, [scene.scene_number]: 'v2v' }))}
                                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                                  sceneVideoModes[scene.scene_number] === 'v2v'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200'
                                }`}
                              >
                                V2V
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-[10px] text-zinc-400">
                            {sceneVideoModes[scene.scene_number] === 'v2v' ? '前シーンから継続' : '画像から生成'}
                          </p>
                        </div>
                      )}

                      {/* 終了フレーム画像（Kling専用オプション、画像生成後に表示） */}
                      {allScenesHaveImages && videoProvider === 'piapi_kling' && (
                        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-zinc-500">終了フレーム:</span>
                            <span className="text-[10px] text-zinc-400">(オプション)</span>
                          </div>
                          {sceneEndFrameImages[scene.scene_number] ? (
                            <div className="relative">
                              <div className="aspect-[9/16] max-h-20 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                                <img
                                  src={sceneEndFrameImages[scene.scene_number]}
                                  alt="終了フレーム"
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => setSceneEndFrameImages(prev => {
                                  const newImages = { ...prev };
                                  delete newImages[scene.scene_number];
                                  return newImages;
                                })}
                                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2 text-xs transition-colors hover:border-purple-400 hover:bg-purple-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-purple-500 dark:hover:bg-purple-900/20">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={sceneEndFrameUploading[scene.scene_number]}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  try {
                                    setSceneEndFrameUploading(prev => ({ ...prev, [scene.scene_number]: true }));
                                    const uploadRes = await videosApi.uploadImage(file);
                                    setSceneEndFrameImages(prev => ({ ...prev, [scene.scene_number]: uploadRes.image_url }));
                                  } catch (error) {
                                    console.error('Failed to upload end frame image:', error);
                                    alert('終了フレーム画像のアップロードに失敗しました');
                                  } finally {
                                    setSceneEndFrameUploading(prev => ({ ...prev, [scene.scene_number]: false }));
                                  }
                                }}
                              />
                              {sceneEndFrameUploading[scene.scene_number] ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                                  <span className="text-zinc-500">アップロード中...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="h-3 w-3 text-zinc-400" />
                                  <span className="text-zinc-500">画像を選択</span>
                                </>
                              )}
                            </label>
                          )}
                          <p className="mt-1 text-[10px] text-zinc-400">
                            指定すると開始→終了への遷移動画を生成
                          </p>
                        </div>
                      )}

                      {/* サブシーン追加ボタン（親シーンに表示、画像生成前でも追加可能） */}
                      {!scene.parent_scene_id && (
                        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                          <button
                            onClick={() => handleAddSubScene(scene.scene_number)}
                            disabled={addingSubScene !== null || getSubSceneCount(scene) >= 3}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 py-2 text-xs text-zinc-500 transition-colors hover:border-purple-400 hover:text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-600 dark:hover:border-purple-500"
                            title={getSubSceneCount(scene) >= 3 ? "最大3カットまで追加可能" : "カットを追加"}
                          >
                            {addingSubScene === scene.scene_number ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                追加中...
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                カット追加 ({getSubSceneCount(scene)}/3)
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                      </div>
                    </SortableSceneCard>
                  ))}
                </div>
              </SortableContext>

              {/* 並べ替え中インジケーター */}
              {isReordering && (
                <div className="fixed bottom-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  並べ替え中...
                </div>
              )}
            </DndContext>

            {/* シーン追加ボタン */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowAddSceneModal(true)}
                className="flex items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 px-6 py-3 text-sm text-zinc-500 transition-colors hover:border-purple-400 hover:text-purple-600 dark:border-zinc-600 dark:hover:border-purple-500"
              >
                <Plus className="h-5 w-5" />
                シーンを追加
              </button>
            </div>

            {/* Generate Button - Show different button based on image generation state */}
            <div className="flex justify-center">
              {!allScenesHaveImages ? (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-orange-500 px-8"
                  onClick={handleGenerateImages}
                  disabled={generatingImages || editingScene !== null}
                >
                  {generatingImages ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      シーン画像を生成中...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="mr-2 h-5 w-5" />
                      ストーリーOK！画像を生成する
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-pink-600 px-8"
                  onClick={handleStartGeneration}
                >
                  <Film className="mr-2 h-5 w-5" />
                  すべて生成する（{videoProvider === 'veo' ? 'Veo 3.1' : 'Runway'}）
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step: Generating */}
        {step === "generating" && storyboard && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            {(() => {
              const currentScene = storyboard.scenes.find(s => s.status === "generating");
              const completedCount = storyboard.scenes.filter(s => s.status === "completed").length;
              return (
                <div className="mb-8 text-center">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
                  <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                    {currentScene
                      ? `${actLabels[currentScene.act]?.label || currentScene.act} を生成中...`
                      : completedCount === 4
                      ? "動画を結合中..."
                      : "動画を生成中..."}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    起→承→転→結の順番でステップバイステップ生成しています
                  </p>
                  <p className="mt-1 text-xs text-purple-500">
                    {completedCount}/4 シーン完了
                  </p>
                </div>
              );
            })()}

            {/* Progress for each scene */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {storyboard.scenes.map((scene, index) => (
                <div
                  key={scene.id}
                  className={`rounded-lg border p-4 transition-all ${
                    scene.status === "generating"
                      ? "border-purple-500 ring-2 ring-purple-500/20"
                      : scene.status === "completed"
                      ? "border-green-500"
                      : "dark:border-zinc-700"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 font-mono">
                        {index + 1}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                          actLabels[scene.act]?.color || "bg-zinc-500"
                        }`}
                      >
                        {scene.act}
                      </span>
                    </div>
                    <span className={`text-xs ${
                      scene.status === "generating" ? "text-purple-500 font-medium" :
                      scene.status === "completed" ? "text-green-500" : "text-zinc-500"
                    }`}>
                      {scene.status === "completed"
                        ? "✓ 完了"
                        : scene.status === "generating"
                        ? `生成中 ${scene.progress}%`
                        : "待機中"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className={`h-full transition-all duration-300 ${
                        scene.status === "completed"
                          ? "bg-green-500"
                          : scene.status === "generating"
                          ? "bg-purple-500"
                          : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                      style={{ width: `${scene.status === "pending" ? 0 : scene.progress}%` }}
                    />
                  </div>
                  {scene.video_url && (
                    <div className="mt-2 aspect-[9/16] max-h-32 overflow-hidden rounded">
                      <video
                        key={scene.video_url}
                        src={getVideoCacheBustedUrl(scene.video_url)}
                        poster={scene.scene_image_url || undefined}
                        preload="auto"
                        className="h-full w-full object-contain"
                        muted
                        autoPlay
                        loop
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Review (videos ready, before concatenation) */}
        {step === "review" && storyboard && (
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <div className="text-center">
                <Video className="mx-auto h-12 w-12 text-green-500" />
                <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                  動画プレビュー
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  各シーンの動画を確認してください。気に入らない場合は再生成できます
                </p>
              </div>
            </div>

            {/* 4 Scene Video Previews */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={storyboard.scenes.map(s => s.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {storyboard.scenes.map((scene) => (
                    <SortableSceneCard
                      key={scene.id}
                      scene={scene}
                      disabled={isReordering || retryingSceneVideo !== null}
                    >
                      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900">
                        {/* Scene Number Badge */}
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {/* シーン番号（display_order） */}
                            <span className="text-sm font-bold text-zinc-900 dark:text-white">
                              #{scene.display_order || scene.scene_number}
                            </span>
                            {/* actバッジ（視覚的区別用） */}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${
                                actLabels[scene.act]?.color || "bg-zinc-500"
                              }`}
                            >
                              {scene.act}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">5秒</span>
                            {/* シーン削除ボタン（最低1シーンは残す） */}
                            {storyboard.scenes.length > 1 && (
                              <button
                                onClick={() => handleDeleteScene(scene.id)}
                                disabled={deletingScene !== null || retryingSceneVideo !== null}
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800 transition-colors"
                                title="シーンを削除"
                              >
                                {deletingScene === scene.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Video Preview */}
                  <div className="relative mb-3 aspect-[9/16] overflow-hidden rounded-lg bg-black">
                    {scene.video_url ? (
                      <video
                        key={scene.video_url}
                        ref={(el) => {
                          sceneVideoRefs.current[scene.id] = el;
                        }}
                        src={getVideoCacheBustedUrl(scene.video_url)}
                        poster={scene.scene_image_url || undefined}
                        preload="metadata"
                        className="h-full w-full object-contain"
                        controls
                        muted
                        loop
                      />
                    ) : retryingSceneVideo === scene.scene_number || generatingSceneVideo === scene.id ? (
                      <div className="flex h-full flex-col items-center justify-center text-zinc-500">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="mt-2 text-xs">動画生成中...</p>
                      </div>
                    ) : generatingSceneImage === scene.id ? (
                      <div className="flex h-full flex-col items-center justify-center text-zinc-500">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="mt-2 text-xs">画像生成中...</p>
                      </div>
                    ) : scene.scene_image_url ? (
                      <div className="relative h-full w-full">
                        <img
                          src={scene.scene_image_url}
                          alt={scene.description_ja || "シーン画像"}
                          className="h-full w-full object-contain"
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                          <button
                            onClick={() => handleGenerateSceneVideo(scene.id)}
                            disabled={retryingSceneVideo !== null}
                            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                          >
                            <Film className="h-4 w-4" />
                            動画を生成
                          </button>
                          <p className="mt-2 text-xs text-white/80">
                            画像から動画を生成します
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center bg-zinc-900 text-zinc-400">
                        <button
                          onClick={() => handleGenerateSceneImage(scene.id)}
                          disabled={generatingSceneImage !== null}
                          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                        >
                          <ImageIcon className="h-4 w-4" />
                          画像を生成
                        </button>
                        <p className="mt-2 text-xs">
                          AIで画像を生成します
                        </p>
                      </div>
                    )}

                    {/* Hover seek indicator */}
                    {hoveringSceneId === scene.id && (
                      <div className="absolute bottom-2 left-2 right-2 rounded bg-yellow-500 py-0.5 text-center text-xs text-black">
                        シーク中
                      </div>
                    )}

                    {/* Action Buttons */}
                    {scene.video_url && retryingSceneVideo !== scene.scene_number && (
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        {/* Screenshot Button */}
                        <ScreenshotButton
                          videoRef={{ current: sceneVideoRefs.current[scene.id] }}
                          sourceType="storyboard_scene"
                          sourceId={scene.id}
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full bg-purple-600 text-white hover:bg-purple-700 hover:text-white shadow-md"
                          onScreenshotCreated={() => {
                            setGalleryRefreshTrigger(prev => prev + 1);
                          }}
                          onError={(err) => {
                            console.error("Screenshot error:", err);
                          }}
                        />
                        {/* Download Button */}
                        <button
                          onClick={() => {
                            setDownloadingSceneNumber(scene.scene_number);
                            setSceneSelectedResolution('original');
                            setSceneUpscaleError(null);
                            setShowSceneDownloadModal(true);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white transition-colors hover:bg-black/90"
                          title="ダウンロード"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* Regenerating indicator */}
                    {retryingSceneVideo === scene.scene_number && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                        <div className="text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-white" />
                          <p className="mt-2 text-xs text-white">再生成中...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trim Controls */}
                  {scene.video_url && sceneTrimSettings[scene.id] && applyTrim && (
                    <div className="mb-3 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
                      <RangeSlider
                        min={0}
                        max={sceneTrimSettings[scene.id].duration}
                        step={0.1}
                        minRange={0.5}
                        value={[
                          sceneTrimSettings[scene.id].startTime,
                          sceneTrimSettings[scene.id].endTime,
                        ]}
                        onChange={(range) => {
                          setSceneTrimSettings(prev => ({
                            ...prev,
                            [scene.id]: {
                              ...prev[scene.id],
                              startTime: range[0],
                              endTime: range[1],
                            },
                          }));
                        }}
                        formatLabel={(v) => `${v.toFixed(1)}s`}
                        disabled={retryingSceneVideo !== null}
                        onHoverTime={(time) => handleSceneHoverTime(scene.id, time)}
                        onHoverEnd={() => handleSceneHoverEnd(scene.id)}
                      />
                      <div className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
                        使用: {(sceneTrimSettings[scene.id].endTime - sceneTrimSettings[scene.id].startTime).toFixed(1)}秒
                      </div>
                    </div>
                  )}

                  {/* I2V/V2V Mode Selection & Regenerate */}
                  {scene.video_url && retryingSceneVideo !== scene.scene_number && (
                    <div className="mb-3 space-y-2">
                      {/* I2V/V2V Toggle */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSceneVideoModes(prev => ({ ...prev, [scene.scene_number]: 'i2v' }))}
                          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                            (sceneVideoModes[scene.scene_number] || 'i2v') === 'i2v'
                              ? 'bg-purple-600 text-white'
                              : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                          }`}
                        >
                          I2V
                        </button>
                        {(() => {
                          // 直前シーンの動画があるかチェック
                          const sceneIndex = storyboard.scenes.findIndex(s => s.id === scene.id);
                          const prevScene = sceneIndex > 0 ? storyboard.scenes[sceneIndex - 1] : null;
                          const hasPrevVideo = prevScene?.video_url != null;
                          // カスタム画像がアップロードされている場合はV2V不可
                          const hasCustomImage = customImageScenes.has(scene.scene_number);
                          const canUseV2V = hasPrevVideo && !hasCustomImage;
                          return (
                            <button
                              onClick={() => canUseV2V && setSceneVideoModes(prev => ({ ...prev, [scene.scene_number]: 'v2v' }))}
                              disabled={!canUseV2V}
                              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                !canUseV2V
                                  ? 'cursor-not-allowed bg-zinc-50 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-600'
                                  : sceneVideoModes[scene.scene_number] === 'v2v'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                              }`}
                              title={hasCustomImage ? 'カスタム画像のためI2Vのみ' : !hasPrevVideo ? '直前のシーンに動画がありません' : '直前の動画から継続生成'}
                            >
                              V2V
                            </button>
                          );
                        })()}
                      </div>
                      {/* Regenerate Button - Opens modal to edit prompt */}
                      <button
                        onClick={() => openRegenerateModal(scene.scene_number)}
                        disabled={retryingSceneVideo !== null}
                        className="w-full flex items-center justify-center gap-1 rounded-md bg-purple-100 px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-200 disabled:opacity-50 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
                      >
                        <Pencil className="h-3 w-3" />
                        プロンプトを編集して再生成
                      </button>
                    </div>
                  )}

                  {/* Scene description */}
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                    {scene.description_ja}
                  </p>
                      </div>
                    </SortableSceneCard>
                  ))}

                  {/* Add Scene Button */}
                  <div
                    onClick={() => setShowAddSceneModal(true)}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 transition-colors hover:border-purple-400 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-purple-500 dark:hover:bg-purple-900/20"
                    style={{ minHeight: '400px' }}
                  >
                    <Plus className="h-12 w-12 text-zinc-400" />
                    <span className="mt-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      シーンを追加
                    </span>
                  </div>
                </div>
              </SortableContext>

              {/* 並べ替え中インジケーター */}
              {isReordering && (
                <div className="fixed bottom-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  並べ替え中...
                </div>
              )}
            </DndContext>

            {/* Trim Settings */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white">
                    トリム設定
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    各シーンの使用範囲を調整できます
                  </p>
                </div>
                <button
                  onClick={() => setApplyTrim(!applyTrim)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    applyTrim ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      applyTrim ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {applyTrim && Object.keys(sceneTrimSettings).length > 0 && (
                <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      合計使用時間
                    </span>
                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {storyboard.scenes.reduce((total, scene) => {
                        const trim = sceneTrimSettings[scene.id];
                        if (trim) {
                          return total + (trim.endTime - trim.startTime);
                        }
                        return total + 5; // default 5s
                      }, 0).toFixed(1)}秒
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    上の各シーンのスライダーで使用範囲を調整できます
                  </p>
                </div>
              )}
            </div>

            {/* Concatenate Button */}
            <div className="flex justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => setStep("edit")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                編集に戻る
              </Button>
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 px-8"
                onClick={handleConcatenate}
                disabled={retryingSceneVideo !== null || concatenating}
              >
                {concatenating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    準備中...
                  </>
                ) : (
                  <>
                    <Merge className="mr-2 h-5 w-5" />
                    動画を結合する
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Concatenating */}
        {step === "concatenating" && storyboard && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
              <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                動画を結合中...
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                4シーンを1本の20秒動画に結合しています
              </p>
            </div>

            {/* Scene thumbnails */}
            <div className="mt-8 flex justify-center gap-2">
              {storyboard.scenes.map((scene, index) => (
                <div key={scene.id} className="flex items-center">
                  <div className="h-16 w-10 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
                    {scene.video_url && (
                      <video
                        key={scene.video_url}
                        src={getVideoCacheBustedUrl(scene.video_url)}
                        poster={scene.scene_image_url || undefined}
                        preload="none"
                        className="h-full w-full object-cover"
                        muted
                      />
                    )}
                  </div>
                  {index < 3 && (
                    <div className="mx-1 text-zinc-400">→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Completed */}
        {step === "completed" && storyboard && storyboard.final_video_url && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mb-6 text-center">
              <Check className="mx-auto h-12 w-12 text-green-500" />
              <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                完成!
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                20秒のショートフィルムが完成しました
              </p>
            </div>

            {/* Video Player */}
            <div className="mx-auto max-w-md">
              <div className="aspect-[9/16] overflow-hidden rounded-xl bg-black">
                <HLSPlayer
                  key={storyboard.final_video_url}
                  hlsUrl={storyboard.hls_master_url}
                  fallbackUrl={getVideoCacheBustedUrl(storyboard.final_video_url)}
                  poster={storyboard.source_image_url}
                  preload="auto"
                  className="h-full w-full object-contain"
                  controls
                  autoPlay
                  muted={false}
                />
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {/* ダウンロード・スクリーンショットボタン */}
                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => {
                      setSelectedResolution('original');
                      setUpscaleError(null);
                      setShowDownloadModal(true);
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    ダウンロード
                  </Button>
                  <ScreenshotButton
                    videoRef={finalVideoRef}
                    sourceType="storyboard_scene"
                    sourceId={storyboard.id}
                    variant="default"
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onScreenshotCreated={() => {
                      setGalleryRefreshTrigger(prev => prev + 1);
                      alert("スクリーンショットを保存しました");
                    }}
                    onError={(err) => {
                      alert(err);
                    }}
                  />
                </div>

                {/* アクションボタン */}
                <div className="flex gap-3">
                  {/* 編集に戻るボタン */}
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => {
                      if (confirm("動画を編集しますか？再結合すると現在の完成動画は上書きされます。")) {
                        setStep("review");
                      }
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    編集に戻る
                  </Button>

                  {/* 新しく作成ボタン */}
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setStep("upload");
                      setStoryboard(null);
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                  >
                    <Clapperboard className="mr-2 h-4 w-4" />
                    新しく作成
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Camera Work Modal */}
        {cameraWorkModalScene !== null && (
          <CameraWorkModal
            isOpen={cameraWorkModalScene !== null}
            onClose={() => setCameraWorkModalScene(null)}
            value={getCameraWorkSelection(cameraWorkModalScene)}
            onConfirm={(selection) => {
              handleCameraWorkConfirm(cameraWorkModalScene, selection);
              setCameraWorkModalScene(null);
            }}
            videoProvider={videoProvider}
          />
        )}

        {/* Regenerate Video Modal */}
        {regenerateModalScene !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
              <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                シーン{regenerateModalScene}を再生成
              </h3>

              {/* 日本語説明 */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  日本語説明
                </label>
                <textarea
                  className="w-full rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  rows={3}
                  value={regenerateDescriptionJa}
                  onChange={(e) => setRegenerateDescriptionJa(e.target.value)}
                  placeholder="シーンの説明を日本語で入力"
                />
              </div>

              {/* 翻訳ボタン */}
              <div className="mb-4 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenerateTranslate}
                  disabled={regenerateTranslating || !regenerateDescriptionJa.trim()}
                  className="gap-1"
                >
                  {regenerateTranslating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  英語に翻訳
                </Button>
              </div>

              {/* 英語プロンプト */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  英語プロンプト（動画生成に使用）
                  {isPromptModified && (
                    <span className="ml-2 text-xs text-purple-500">（変更あり）</span>
                  )}
                </label>
                <textarea
                  className={`w-full rounded-lg border p-3 text-sm font-mono dark:bg-zinc-800 dark:text-white ${
                    isPromptModified
                      ? 'border-purple-400 dark:border-purple-500'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                  rows={5}
                  value={regeneratePrompt}
                  onChange={(e) => {
                    setRegeneratePrompt(e.target.value);
                    setRegeneratePromptSaved(false);
                  }}
                  placeholder="動画生成用のプロンプト（英語）"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  日本語を変更後「英語に翻訳」ボタンで変換するか、直接編集できます
                </p>
              </div>

              {/* I2V/V2V Mode Selection */}
              {regenerateModalScene !== null && (() => {
                const sceneNumber = regenerateModalScene;
                const scene = storyboard?.scenes.find(s => s.scene_number === sceneNumber);
                const hasCustomImage = customImageScenes.has(sceneNumber);
                const prevScene = storyboard?.scenes.find(s => s.scene_number === sceneNumber - 1);
                const hasPrevVideo = prevScene?.video_url != null;
                const canUseV2V = !hasCustomImage && hasPrevVideo;
                const currentMode = sceneVideoModes[sceneNumber] || 'i2v';

                return (
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      生成モード
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSceneVideoModes(prev => ({ ...prev, [sceneNumber]: 'i2v' }))}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          currentMode === 'i2v'
                            ? 'bg-purple-600 text-white'
                            : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                        }`}
                      >
                        I2V（画像→動画）
                      </button>
                      <button
                        onClick={() => canUseV2V && setSceneVideoModes(prev => ({ ...prev, [sceneNumber]: 'v2v' }))}
                        disabled={!canUseV2V}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          currentMode === 'v2v'
                            ? 'bg-purple-600 text-white'
                            : canUseV2V
                              ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                              : 'bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600'
                        }`}
                        title={hasCustomImage ? 'カスタム画像のためI2Vのみ' : !hasPrevVideo ? '直前のシーンに動画がありません' : 'V2V: 直前の動画から継続生成'}
                      >
                        V2V（動画→動画）
                      </button>
                    </div>
                    {!canUseV2V && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {hasCustomImage ? 'カスタム画像を使用しているためI2Vのみ選択可能です' : '直前のシーンに動画がないためI2Vのみ選択可能です'}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* 終了フレーム画像（Kling専用オプション） */}
              {videoProvider === 'piapi_kling' && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    終了フレーム画像（オプション）
                  </label>
                  <p className="mb-2 text-xs text-zinc-500">
                    2枚目の画像を指定すると、開始画像から終了画像への遷移動画を生成します
                  </p>
                  {endFrameImageUrl ? (
                    <div className="relative">
                      <div className="aspect-[9/16] max-h-32 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        <img
                          src={endFrameImageUrl}
                          alt="終了フレーム"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEndFrameImageUrl(null)}
                        className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 transition-colors hover:border-purple-400 hover:bg-purple-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-purple-500 dark:hover:bg-purple-900/20">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={endFrameUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setEndFrameUploading(true);
                            const uploadRes = await videosApi.uploadImage(file);
                            setEndFrameImageUrl(uploadRes.image_url);
                          } catch (error) {
                            console.error('Failed to upload end frame image:', error);
                            alert('終了フレーム画像のアップロードに失敗しました');
                          } finally {
                            setEndFrameUploading(false);
                          }
                        }}
                      />
                      {endFrameUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                          <span className="text-sm text-zinc-500">アップロード中...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 text-zinc-400" />
                          <span className="text-sm text-zinc-500">終了フレーム画像を選択</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setRegenerateModalScene(null);
                    setEndFrameImageUrl(null);  // 終了フレーム画像もクリア
                  }}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => handleRegenerateVideo(regenerateModalScene)}
                  disabled={regenerateTranslating || regenerateSaving}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {regenerateSaving ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      保存中...
                    </span>
                  ) : (
                    <>
                      <Sparkles className="mr-1 inline h-4 w-4" />
                      {isPromptModified ? '保存して再生成' : '再生成'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Download Modal */}
        {showDownloadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  ダウンロード
                </h3>
                <button
                  onClick={() => {
                    if (!isUpscaling && !isConvertingProRes && proResConversionPhase === 'idle') {
                      setShowDownloadModal(false);
                    }
                  }}
                  disabled={isUpscaling || isConvertingProRes || proResConversionPhase !== 'idle'}
                  className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!isUpscaling && !isConvertingProRes && proResConversionPhase === 'idle' ? (
                <>
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    出力解像度を選択してください
                  </p>

                  <div className="space-y-3">
                    {/* Original */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        selectedResolution === 'original'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
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
                        <div className="font-medium text-zinc-900 dark:text-white">
                          オリジナル (720p)
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          そのままダウンロード（即時）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'original'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
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
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
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
                        <div className="font-medium text-zinc-900 dark:text-white">
                          フルHD (1080p)
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          高解像度化（約1〜2分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'hd'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
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
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
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
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          4K (2160p)
                          <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                            最高画質
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          最高解像度（約1〜2分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === '4k'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
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
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
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
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          ProRes 422 HQ
                          <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                            編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          10bit・デバンド処理済み（約30秒〜1分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'prores'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
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
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
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
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          ProRes 422 HQ (フルHD)
                          <span className="rounded bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-xs text-white">
                            高解像度編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          1080p・10bit・デバンド処理（約2〜3分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'prores_hd'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
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
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
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
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          ProRes 422 HQ (4K)
                          <span className="rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 text-xs text-white">
                            最高品質編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          2160p・10bit・デバンド処理（約3〜5分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        selectedResolution === 'prores_4k'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {selectedResolution === 'prores_4k' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>
                  </div>

                  {/* 60fps スムーズ化オプション */}
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={enable60fps}
                        onChange={(e) => setEnable60fps(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 bg-white text-cyan-500 focus:ring-cyan-500 dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          60fps スムーズ化
                          <span className="rounded bg-gradient-to-r from-cyan-500 to-teal-500 px-1.5 py-0.5 text-xs text-white">
                            Topaz AI
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          AIフレーム補間で滑らかな動きに（追加で約2〜5分）
                        </div>
                      </div>
                    </label>
                  </div>

                  {upscaleError && (
                    <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                      {upscaleError}
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowDownloadModal(false)}
                      disabled={is60fpsProcessing}
                    >
                      キャンセル
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                      onClick={handleDownload}
                      disabled={is60fpsProcessing}
                    >
                      {is60fpsProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          60fps変換中... {fps60Progress}%
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
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
                  <p className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
                    {is60fpsProcessing
                      ? '60fps変換中...'
                      : proResConversionPhase === 'upscaling'
                      ? 'アップスケール中...'
                      : proResConversionPhase === 'converting'
                      ? 'ProRes変換中...'
                      : isConvertingProRes
                      ? 'ProRes変換中...'
                      : `${selectedResolution === 'hd' ? 'フルHD' : '4K'} にアップスケール中...`}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {proResConversionPhase === 'upscaling'
                      ? `ステップ 1/2: 高解像度化 (${upscaleForProResProgress}%)`
                      : proResConversionPhase === 'converting'
                      ? 'ステップ 2/2: ProRes変換中...'
                      : isConvertingProRes
                      ? 'しばらくお待ちください（約30秒〜1分）'
                      : 'しばらくお待ちください（約1〜2分）'}
                  </p>

                  {/* Progress bar for ProRes+Upscale */}
                  {proResConversionPhase === 'upscaling' && (
                    <div className="mx-auto mt-6 w-full max-w-xs">
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                          style={{ width: `${upscaleForProResProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Progress bar for regular upscale */}
                  {!isConvertingProRes && proResConversionPhase === 'idle' && (
                    <div className="mx-auto mt-6 w-full max-w-xs">
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                          style={{ width: `${upscaleProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                        {upscaleProgress}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scene Download Modal */}
        {showSceneDownloadModal && downloadingSceneNumber !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  シーン {downloadingSceneNumber} ダウンロード
                </h3>
                <button
                  onClick={() => {
                    if (!isSceneUpscaling && !isSceneConvertingProRes && sceneProResConversionPhase === 'idle') {
                      setShowSceneDownloadModal(false);
                      setDownloadingSceneNumber(null);
                    }
                  }}
                  disabled={isSceneUpscaling || isSceneConvertingProRes || sceneProResConversionPhase !== 'idle'}
                  className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!isSceneUpscaling && !isSceneConvertingProRes && sceneProResConversionPhase === 'idle' ? (
                <>
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    出力解像度を選択してください
                  </p>

                  <div className="space-y-3">
                    {/* Original */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        sceneSelectedResolution === 'original'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sceneResolution"
                        value="original"
                        checked={sceneSelectedResolution === 'original'}
                        onChange={() => setSceneSelectedResolution('original')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-zinc-900 dark:text-white">
                          オリジナル (720p)
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          そのままダウンロード（即時）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        sceneSelectedResolution === 'original'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {sceneSelectedResolution === 'original' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* HD */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        sceneSelectedResolution === 'hd'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sceneResolution"
                        value="hd"
                        checked={sceneSelectedResolution === 'hd'}
                        onChange={() => setSceneSelectedResolution('hd')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-zinc-900 dark:text-white">
                          フルHD (1080p)
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          高解像度化（約1〜2分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        sceneSelectedResolution === 'hd'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {sceneSelectedResolution === 'hd' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* 4K */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        sceneSelectedResolution === '4k'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sceneResolution"
                        value="4k"
                        checked={sceneSelectedResolution === '4k'}
                        onChange={() => setSceneSelectedResolution('4k')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          4K (2160p)
                          <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                            最高画質
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          最高解像度（約1〜2分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        sceneSelectedResolution === '4k'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {sceneSelectedResolution === '4k' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* ProRes */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        sceneSelectedResolution === 'prores'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sceneResolution"
                        value="prores"
                        checked={sceneSelectedResolution === 'prores'}
                        onChange={() => setSceneSelectedResolution('prores')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          ProRes 422 HQ
                          <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                            編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          10bit・デバンド処理済み（約30秒〜1分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        sceneSelectedResolution === 'prores'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {sceneSelectedResolution === 'prores' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* ProRes (フルHD) */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        sceneSelectedResolution === 'prores_hd'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sceneResolution"
                        value="prores_hd"
                        checked={sceneSelectedResolution === 'prores_hd'}
                        onChange={() => setSceneSelectedResolution('prores_hd')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          ProRes 422 HQ (フルHD)
                          <span className="rounded bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-xs text-white">
                            高解像度編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          1080p・10bit・デバンド処理（約2〜3分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        sceneSelectedResolution === 'prores_hd'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {sceneSelectedResolution === 'prores_hd' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>

                    {/* ProRes (4K) */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                        sceneSelectedResolution === 'prores_4k'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sceneResolution"
                        value="prores_4k"
                        checked={sceneSelectedResolution === 'prores_4k'}
                        onChange={() => setSceneSelectedResolution('prores_4k')}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          ProRes 422 HQ (4K)
                          <span className="rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 text-xs text-white">
                            最高品質編集用
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          2160p・10bit・デバンド処理（約3〜5分）
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${
                        sceneSelectedResolution === 'prores_4k'
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {sceneSelectedResolution === 'prores_4k' && (
                          <Check className="h-full w-full p-0.5 text-white" />
                        )}
                      </div>
                    </label>
                  </div>

                  {sceneUpscaleError && (
                    <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                      {sceneUpscaleError}
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowSceneDownloadModal(false);
                        setDownloadingSceneNumber(null);
                      }}
                    >
                      キャンセル
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                      onClick={handleSceneDownload}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      ダウンロード
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
                  <p className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
                    {sceneProResConversionPhase === 'upscaling'
                      ? 'アップスケール中...'
                      : sceneProResConversionPhase === 'converting'
                      ? 'ProRes変換中...'
                      : isSceneConvertingProRes
                      ? 'ProRes変換中...'
                      : `${sceneSelectedResolution === 'hd' ? 'フルHD' : '4K'} にアップスケール中...`}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {sceneProResConversionPhase === 'upscaling'
                      ? `ステップ 1/2: 高解像度化 (${sceneUpscaleForProResProgress}%)`
                      : sceneProResConversionPhase === 'converting'
                      ? 'ステップ 2/2: ProRes変換中...'
                      : isSceneConvertingProRes
                      ? 'しばらくお待ちください（約30秒〜1分）'
                      : 'しばらくお待ちください（約1〜2分）'}
                  </p>

                  {/* Progress bar for ProRes+Upscale */}
                  {sceneProResConversionPhase === 'upscaling' && (
                    <div className="mx-auto mt-6 w-full max-w-xs">
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                          style={{ width: `${sceneUpscaleForProResProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Progress bar for regular upscale */}
                  {!isSceneConvertingProRes && sceneProResConversionPhase === 'idle' && (
                    <div className="mx-auto mt-6 w-full max-w-xs">
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                          style={{ width: `${sceneUpscaleProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                        {sceneUpscaleProgress}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* シーン追加モーダル */}
        {showAddSceneModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  シーンを追加
                </h3>
                <button
                  onClick={() => {
                    setShowAddSceneModal(false);
                    setAddSceneDescription("");
                    setAddSceneRunwayPrompt("");
                    setAddSceneImageFile(null);
                    setAddSceneImagePreview(null);
                    setAddSceneImageUrl(null);
                    setAddSceneImageSourceMode('upload');
                    setAddSceneVideoMode('i2v');
                    setAddSceneSourceSceneId(null);
                    setAddSceneAutoGenerate(false);
                  }}
                  className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 動画生成モード選択 */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  動画生成モード
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="videoMode"
                      value="i2v"
                      checked={addSceneVideoMode === 'i2v'}
                      onChange={() => {
                        setAddSceneVideoMode('i2v');
                        setAddSceneSourceSceneId(null);
                      }}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      I2V（画像から動画生成）
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="videoMode"
                      value="v2v"
                      checked={addSceneVideoMode === 'v2v'}
                      onChange={() => setAddSceneVideoMode('v2v')}
                      disabled={!storyboard?.scenes.some(s => s.video_url)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                    />
                    <span className={`text-sm ${!storyboard?.scenes.some(s => s.video_url) ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      V2V（既存動画から継続生成）
                    </span>
                  </label>
                </div>
                {!storyboard?.scenes.some(s => s.video_url) && (
                  <p className="mt-1 text-xs text-zinc-500">
                    V2Vを使用するには、動画が生成されたシーンが必要です
                  </p>
                )}
              </div>

              {/* V2V: 参照シーン選択 */}
              {addSceneVideoMode === 'v2v' && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    参照する動画を選択
                  </label>
                  <select
                    value={addSceneSourceSceneId || ''}
                    onChange={(e) => setAddSceneSourceSceneId(e.target.value || null)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="">シーンを選択...</option>
                    {storyboard?.scenes
                      .filter(s => s.video_url)
                      .map(scene => (
                        <option key={scene.id} value={scene.id}>
                          シーン{scene.display_order}（{scene.act}）- {scene.description_ja?.slice(0, 20)}...
                        </option>
                      ))
                    }
                  </select>
                  {/* 選択シーンのプレビュー */}
                  {addSceneSourceSceneId && (() => {
                    const sourceScene = storyboard?.scenes.find(s => s.id === addSceneSourceSceneId);
                    return sourceScene ? (
                      <div className="mt-2 flex gap-3 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        <video
                          src={sourceScene.video_url || undefined}
                          poster={sourceScene.scene_image_url || undefined}
                          preload="none"
                          className="w-20 h-20 object-cover rounded"
                          muted
                          playsInline
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white">
                            シーン{sourceScene.display_order}（{sourceScene.act}）
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                            {sourceScene.description_ja}
                          </p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* 日本語説明 */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    シーンの説明（日本語）
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddSceneTranslate}
                    disabled={addSceneTranslating || !addSceneDescription.trim()}
                    className="text-xs h-7"
                  >
                    {addSceneTranslating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Languages className="h-3 w-3" />
                    )}
                    英語に翻訳
                  </Button>
                </div>
                <textarea
                  value={addSceneDescription}
                  onChange={(e) => setAddSceneDescription(e.target.value)}
                  placeholder="例: 主人公が夕日を見つめながら静かに立っている"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  rows={3}
                />
              </div>

              {/* 英語プロンプト */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  英語プロンプト（動画生成に使用）
                </label>
                <textarea
                  value={addSceneRunwayPrompt}
                  onChange={(e) => setAddSceneRunwayPrompt(e.target.value)}
                  placeholder="動画生成用プロンプト（英語）- 空欄の場合は自動翻訳されます"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  rows={4}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  日本語を入力後「英語に翻訳」ボタンで変換するか、直接編集できます。空欄の場合は追加時に自動翻訳されます。
                </p>
              </div>

              {/* カスタム画像選択（I2Vモード時のみ） */}
              {addSceneVideoMode === 'i2v' && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    素材画像（任意）
                  </label>

                  {/* 画像プレビュー表示中 */}
                  {addSceneImagePreview ? (
                    <div className="relative">
                      <img
                        src={addSceneImagePreview}
                        alt="プレビュー"
                        className="w-full h-40 object-cover rounded-lg border border-zinc-300 dark:border-zinc-600"
                      />
                      <button
                        onClick={() => {
                          setAddSceneImageFile(null);
                          setAddSceneImagePreview(null);
                          setAddSceneImageUrl(null);
                        }}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* タブ切り替え */}
                      <div className="mb-3 flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                        <button
                          onClick={() => setAddSceneImageSourceMode('upload')}
                          className={`flex-1 rounded-md py-1.5 px-3 text-xs font-medium transition-all ${
                            addSceneImageSourceMode === 'upload'
                              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                              : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white'
                          }`}
                        >
                          <Upload className="inline-block w-3 h-3 mr-1" />
                          アップロード
                        </button>
                        <button
                          onClick={() => setAddSceneImageSourceMode('gallery')}
                          className={`flex-1 rounded-md py-1.5 px-3 text-xs font-medium transition-all ${
                            addSceneImageSourceMode === 'gallery'
                              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                              : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white'
                          }`}
                        >
                          <Camera className="inline-block w-3 h-3 mr-1" />
                          スクリーンショット
                        </button>
                      </div>

                      {/* アップロードモード */}
                      {addSceneImageSourceMode === 'upload' && (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-300 rounded-lg cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 dark:border-zinc-600 dark:hover:border-purple-500 dark:hover:bg-purple-900/10 transition-colors">
                          <div className="flex flex-col items-center justify-center py-4">
                            <ImageIcon className="h-8 w-8 text-zinc-400 mb-2" />
                            <span className="text-sm text-zinc-500 dark:text-zinc-400">
                              画像をアップロード
                            </span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setAddSceneImageFile(file);
                                setAddSceneImagePreview(URL.createObjectURL(file));
                                setAddSceneImageUrl(null);
                              }
                            }}
                          />
                        </label>
                      )}

                      {/* ギャラリーモード */}
                      {addSceneImageSourceMode === 'gallery' && (
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                          <ScreenshotGallery
                            onSelectForGeneration={(imageUrl) => {
                              setAddSceneImageUrl(imageUrl);
                              setAddSceneImagePreview(imageUrl);
                              setAddSceneImageFile(null);
                            }}
                            onError={(err) => alert(err)}
                            refreshTrigger={galleryRefreshTrigger}
                          />
                        </div>
                      )}
                    </>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    指定しない場合はAIが画像を生成します
                  </p>
                </div>
              )}

              {/* 自動動画生成チェックボックス */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addSceneAutoGenerate}
                    onChange={(e) => setAddSceneAutoGenerate(e.target.checked)}
                    className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    追加と同時に動画生成を開始
                  </span>
                </label>
                <p className="mt-1 text-xs text-zinc-500 ml-6">
                  {addSceneVideoMode === 'v2v'
                    ? 'チェックすると、選択した動画を参照して即座に動画生成が始まります'
                    : 'チェックすると、画像生成後に自動で動画生成が始まります'
                  }
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddSceneModal(false);
                    setAddSceneDescription("");
                    setAddSceneRunwayPrompt("");
                    setAddSceneImageFile(null);
                    setAddSceneImagePreview(null);
                    setAddSceneImageUrl(null);
                    setAddSceneImageSourceMode('upload');
                    setAddSceneVideoMode('i2v');
                    setAddSceneSourceSceneId(null);
                    setAddSceneAutoGenerate(false);
                  }}
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAddScene}
                  disabled={
                    !addSceneDescription.trim() ||
                    addingScene ||
                    addSceneTranslating ||
                    (addSceneVideoMode === 'v2v' && !addSceneSourceSceneId)
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {addingScene ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      追加中...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      追加
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function StoryboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    }>
      <StoryboardPageContent />
    </Suspense>
  );
}
