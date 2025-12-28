"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/ui/image-cropper";
import { videosApi, storyboardApi, Storyboard, StoryboardScene } from "@/lib/api/client";
import { CameraWorkModal } from "@/components/camera";
import { CameraWorkSelection } from "@/lib/camera/types";
import { CAMERA_PRESETS } from "@/lib/camera/presets";
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
} from "lucide-react";

type Step = "upload" | "mood" | "edit" | "generating" | "review" | "concatenating" | "completed";

// ムード/テーマの選択肢
const MOOD_OPTIONS = [
  { id: "happy", label: "楽しい・ポップ", icon: Smile, color: "bg-yellow-500", description: "明るく楽しい雰囲気の動画" },
  { id: "sad", label: "感動・切ない", icon: Frown, color: "bg-blue-500", description: "しっとりとした感動的な動画" },
  { id: "romantic", label: "ロマンチック", icon: Heart, color: "bg-pink-500", description: "愛や優しさをテーマにした動画" },
  { id: "energetic", label: "エネルギッシュ", icon: Zap, color: "bg-orange-500", description: "躍動感あふれるダイナミックな動画" },
  { id: "calm", label: "穏やか・癒し", icon: Moon, color: "bg-teal-500", description: "リラックスできる穏やかな動画" },
  { id: "custom", label: "カスタム", icon: MessageSquare, color: "bg-purple-500", description: "自分でテーマを入力" },
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

function StoryboardPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storyboardIdFromUrl = searchParams.get("id");

  // State
  const [step, setStep] = useState<Step>("upload");
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

  // Mood selection state
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [customMoodText, setCustomMoodText] = useState("");
  const [uploadingSceneImage, setUploadingSceneImage] = useState<number | null>(null);

  // Video review state
  const [retryingSceneVideo, setRetryingSceneVideo] = useState<number | null>(null);
  const [concatenating, setConcatenating] = useState(false);

  // Regenerate modal state
  const [regenerateModalScene, setRegenerateModalScene] = useState<number | null>(null);
  const [regenerateDescriptionJa, setRegenerateDescriptionJa] = useState("");
  const [regeneratePrompt, setRegeneratePrompt] = useState("");
  const [regenerateTranslating, setRegenerateTranslating] = useState(false);
  const [regenerateSaving, setRegenerateSaving] = useState(false);
  const [regeneratePromptSaved, setRegeneratePromptSaved] = useState(false);
  const [originalPrompt, setOriginalPrompt] = useState("");

  // Scene image generation state
  const [generatingImages, setGeneratingImages] = useState(false);

  // Video provider selection
  const [videoProvider, setVideoProvider] = useState<'runway' | 'veo'>('runway');

  // Look adjustment settings (for concatenation)
  const [filmGrain, setFilmGrain] = useState<'none' | 'light' | 'medium' | 'heavy'>('light');
  const [useLut, setUseLut] = useState(false);
  const [lutIntensity, setLutIntensity] = useState(0.3);

  // Camera work modal state
  const [cameraWorkModalScene, setCameraWorkModalScene] = useState<number | null>(null);
  const [cameraWorkSelections, setCameraWorkSelections] = useState<Record<number, CameraWorkSelection>>({});

  // Sub-scene state
  const [addingSubScene, setAddingSubScene] = useState<number | null>(null);
  const [deletingSubScene, setDeletingSubScene] = useState<number | null>(null);

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
  }, [user, storyboardIdFromUrl, storyboard]);

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

  // Process file (shared between click and drag) - shows cropper
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageForCrop(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
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

  // Step 2: Generate storyboard with selected mood
  const handleGenerateStoryboard = async () => {
    if (!uploadedImageUrl || !selectedMood) return;

    // カスタムの場合はテキストが必要
    if (selectedMood === "custom" && !customMoodText.trim()) {
      alert("テーマを入力してください");
      return;
    }

    const moodText = selectedMood === "custom"
      ? customMoodText
      : MOOD_OPTIONS.find(m => m.id === selectedMood)?.label || "";

    try {
      setGeneratingStoryboard(true);

      // Generate storyboard with mood and video provider (template switching)
      const sb = await storyboardApi.create(uploadedImageUrl, moodText, videoProvider);
      setStoryboard(sb);
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

  // Check if all scenes have images
  const allScenesHaveImages = storyboard?.scenes?.every(
    (scene) => scene.scene_image_url !== null
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

  // Regenerate scene video (review step) - uses saved prompt from DB
  const handleRegenerateVideo = async (sceneNumber: number) => {
    console.log('[DEBUG] handleRegenerateVideo called for scene:', sceneNumber);
    console.log('[DEBUG] Will use saved prompt from database (not passing prompt in request)');
    if (!storyboard) return;

    // Check if prompt was modified but not saved
    if (isPromptModified) {
      const confirmed = window.confirm('プロンプトが変更されていますが保存されていません。保存せずに再生成しますか？\n\n保存されたプロンプト（DB）を使用して再生成されます。');
      if (!confirmed) return;
    }

    try {
      setRegenerateModalScene(null); // Close modal
      setRetryingSceneVideo(sceneNumber);

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

      console.log('[DEBUG] Calling regenerateVideo (without custom prompt - using DB value):', {
        storyboardId: storyboard.id,
        sceneNumber,
        videoProvider,
      });
      // プロンプトを渡さない - DBに保存済みのプロンプトを使用
      await storyboardApi.regenerateVideo(storyboard.id, sceneNumber, {
        video_provider: videoProvider,
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
          return;
        }

        if (targetScene?.status === "failed") {
          alert(`シーン${sceneNumber}の再生成に失敗しました: ${targetScene.error_message || "不明なエラー"}`);
          setRetryingSceneVideo(null);
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
      await storyboardApi.concatenate(storyboard.id, {
        film_grain: filmGrain,
        use_lut: useLut,
        lut_intensity: lutIntensity,
      });
      setStep("concatenating");
      pollConcatenationStatus();
    } catch (error) {
      console.error("Failed to start concatenation:", error);
      alert("結合の開始に失敗しました");
      setConcatenating(false);
    }
  };

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

  // Start video generation
  const handleStartGeneration = async () => {
    if (!storyboard) return;

    try {
      await storyboardApi.generate(storyboard.id, {
        film_grain: "medium",
        use_lut: true,
        video_provider: videoProvider,
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
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      {/* Image Cropper Modal */}
      {showCropper && rawImageForCrop && (
        <ImageCropper
          imageSrc={rawImageForCrop}
          aspectRatio={9 / 16}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
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
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mx-auto max-w-md">
              <div className="mb-6 text-center">
                <Clapperboard className="mx-auto h-12 w-12 text-purple-500" />
                <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-white">
                  画像をアップロード
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  AIが画像を分析し、起承転結4シーンの構成を提案します
                </p>
              </div>

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

              {/* Video Provider Selection */}
              {imagePreview && (
                <div className="mt-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
                  <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    動画生成エンジン
                  </h4>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setVideoProvider('runway')}
                      className={`flex-1 rounded-lg border-2 p-3 text-left transition-all ${
                        videoProvider === 'runway'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <div className="font-medium text-zinc-900 dark:text-white">
                        Runway
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        高速・低コスト（5秒）
                      </div>
                    </button>
                    <button
                      onClick={() => setVideoProvider('veo')}
                      className={`flex-1 rounded-lg border-2 p-3 text-left transition-all ${
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
                </div>
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
          </div>
        )}

        {/* Step: Mood Selection */}
        {step === "mood" && uploadedImageUrl && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <div className="mx-auto max-w-2xl">
              <div className="mb-8 flex items-start gap-6">
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded"
                  className="h-32 w-32 rounded-lg object-cover"
                />
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                    どんな動画を作りますか？
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    テーマに合わせてAIが起承転結4シーンの構成と画像を生成します
                  </p>
                </div>
              </div>

              {/* Mood Options Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MOOD_OPTIONS.map((mood) => {
                  const Icon = mood.icon;
                  const isSelected = selectedMood === mood.id;
                  return (
                    <button
                      key={mood.id}
                      onClick={() => setSelectedMood(mood.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        isSelected
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                      }`}
                    >
                      <div className={`rounded-full p-3 ${mood.color}`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">
                        {mood.label}
                      </span>
                      <span className="text-xs text-zinc-500 text-center">
                        {mood.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Input */}
              {selectedMood === "custom" && (
                <div className="mt-4">
                  <textarea
                    className="w-full rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    rows={3}
                    placeholder="例：「夏の終わりを感じる切ない青春ムービー」「かっこいいスポーツ動画」など"
                    value={customMoodText}
                    onChange={(e) => setCustomMoodText(e.target.value)}
                  />
                </div>
              )}

              <div className="mt-6 flex gap-3">
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
                  disabled={!selectedMood || generatingStoryboard || (selectedMood === "custom" && !customMoodText.trim())}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {storyboard.scenes.map((scene) => (
                <div
                  key={scene.id}
                  className={`rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900 ${
                    scene.parent_scene_id ? "border-l-4 border-purple-300 dark:border-purple-700" : ""
                  }`}
                >
                  {/* Act Badge */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium text-white ${
                          actLabels[scene.act]?.color || "bg-zinc-500"
                        }`}
                      >
                        {actLabels[scene.act]?.label || scene.act}
                      </span>
                      {/* サブシーンの場合はラベル表示 */}
                      {scene.parent_scene_id && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          +{scene.sub_scene_order}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">5秒</span>
                      {/* サブシーン削除ボタン */}
                      {scene.parent_scene_id && (
                        <button
                          onClick={() => handleDeleteSubScene(scene.scene_number)}
                          disabled={deletingSubScene !== null}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                          title="このカットを削除"
                        >
                          {deletingSubScene === scene.scene_number ? (
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

                      {/* サブシーン追加ボタン（親シーンかつ画像生成済みの場合に表示） */}
                      {!scene.parent_scene_id && allScenesHaveImages && scene.scene_image_url && (
                        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                          <button
                            onClick={() => handleAddSubScene(scene.scene_number)}
                            disabled={addingSubScene !== null || getSubSceneCount(scene) >= 3}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 py-2 text-xs text-zinc-500 transition-colors hover:border-purple-400 hover:text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-600 dark:hover:border-purple-500"
                            title={getSubSceneCount(scene) >= 3 ? "最大3カットまで追加可能" : "追加カットを生成"}
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
              ))}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {storyboard.scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900"
                >
                  {/* Act Badge */}
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium text-white ${
                        actLabels[scene.act]?.color || "bg-zinc-500"
                      }`}
                    >
                      {actLabels[scene.act]?.label || scene.act}
                    </span>
                    <span className="text-xs text-zinc-500">5秒</span>
                  </div>

                  {/* Video Preview */}
                  <div className="relative mb-3 aspect-[9/16] overflow-hidden rounded-lg bg-black">
                    {scene.video_url ? (
                      <video
                        key={scene.video_url}
                        src={getVideoCacheBustedUrl(scene.video_url)}
                        className="h-full w-full object-contain"
                        controls
                        muted
                        loop
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-500">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    )}

                    {/* Action Buttons: Download & Retry */}
                    {scene.video_url && retryingSceneVideo !== scene.scene_number && (
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        {/* Download Button */}
                        <a
                          href={scene.video_url}
                          download={`scene_${scene.scene_number}.mp4`}
                          className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white transition-colors hover:bg-black/90"
                          title="ダウンロード"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                        {/* Retry Button */}
                        <button
                          onClick={() => openRegenerateModal(scene.scene_number)}
                          disabled={retryingSceneVideo !== null}
                          className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white transition-colors hover:bg-black/90 disabled:opacity-50"
                          title="動画を再生成"
                        >
                          <RotateCcw className="h-3 w-3" />
                          再生成
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

                  {/* Scene description */}
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                    {scene.description_ja}
                  </p>
                </div>
              ))}
            </div>

            {/* Look Adjustment Settings */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <h3 className="mb-4 text-lg font-medium text-zinc-900 dark:text-white">
                ルック調整
              </h3>

              {/* Film Grain Selection */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  フィルムグレイン
                </label>
                <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                  アナログフィルムのような粒状感を追加し、AI生成感を軽減します
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'none', label: 'なし', desc: '0%' },
                    { value: 'light', label: '軽め', desc: '15%' },
                    { value: 'medium', label: '標準', desc: '30%' },
                    { value: 'heavy', label: '強め', desc: '45%' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFilmGrain(option.value as typeof filmGrain)}
                      className={`rounded-lg border-2 p-3 text-center transition-all ${
                        filmGrain === option.value
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-sm font-medium text-zinc-900 dark:text-white">
                        {option.label}
                      </div>
                      <div className="text-xs text-zinc-500">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* LUT (Color Grading) Settings */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      カラーグレーディング（LUT）
                    </label>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      映画のような色調を適用します
                    </p>
                  </div>
                  <button
                    onClick={() => setUseLut(!useLut)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      useLut ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${
                        useLut ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {useLut && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">強度</span>
                      <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                        {Math.round(lutIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={lutIntensity * 100}
                      onChange={(e) => setLutIntensity(Number(e.target.value) / 100)}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 dark:bg-zinc-700 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                    />
                    <div className="mt-1 flex justify-between text-xs text-zinc-400">
                      <span>弱い</span>
                      <span>強い</span>
                    </div>
                  </div>
                )}
              </div>
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
                <video
                  key={storyboard.final_video_url}
                  src={getVideoCacheBustedUrl(storyboard.final_video_url)}
                  className="h-full w-full object-contain"
                  controls
                  autoPlay
                />
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {/* ダウンロードボタン */}
                <a
                  href={storyboard.final_video_url}
                  download
                  className="w-full"
                >
                  <Button className="w-full" variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    ダウンロード
                  </Button>
                </a>

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
                  英語プロンプト
                  {isPromptModified && (
                    <span className="ml-2 text-xs text-orange-500">（未保存の変更あり）</span>
                  )}
                  {regeneratePromptSaved && !isPromptModified && (
                    <span className="ml-2 text-xs text-green-500">（保存済み ✓）</span>
                  )}
                </label>
                <textarea
                  className={`w-full rounded-lg border p-3 text-sm font-mono dark:bg-zinc-800 dark:text-white ${
                    isPromptModified
                      ? 'border-orange-400 dark:border-orange-500'
                      : regeneratePromptSaved
                        ? 'border-green-400 dark:border-green-500'
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
                  ① まず「保存」でプロンプトをDBに保存 → ② 内容を確認 → ③「再生成」で動画生成
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRegenerateModalScene(null)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSavePrompt}
                  disabled={regenerateSaving || regenerateTranslating || !isPromptModified}
                  className="rounded-lg border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                >
                  {regenerateSaving ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      保存中...
                    </span>
                  ) : (
                    '保存'
                  )}
                </button>
                <button
                  onClick={() => handleRegenerateVideo(regenerateModalScene)}
                  disabled={regenerateTranslating || regenerateSaving || isPromptModified}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                  title={isPromptModified ? 'まずプロンプトを保存してください' : ''}
                >
                  再生成
                </button>
              </div>
              {isPromptModified && (
                <p className="mt-2 text-center text-xs text-orange-500">
                  ※ 再生成するには、まず「保存」ボタンでプロンプトを保存してください
                </p>
              )}
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
