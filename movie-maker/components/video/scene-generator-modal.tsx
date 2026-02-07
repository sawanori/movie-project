"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { videosApi, libraryApi, LibraryImage } from "@/lib/api/client";
import { AspectRatio, VideoProvider } from "@/lib/types/video";
import { CameraWorkSelector } from "@/components/camera";
import { CameraWorkSelection } from "@/lib/camera/types";
import { CAMERA_PRESETS } from "@/lib/camera/presets";
import { MotionSelector } from "@/components/ui/motion-selector";
import { Button } from "@/components/ui/button";
import { ScreenshotGallery } from "@/components/video/screenshot-gallery";
import {
  ANIMATION_TEMPLATES,
  ANIMATION_CATEGORY_LABELS,
  type AnimationCategory,
  type AnimationTemplateId,
} from "@/lib/constants/animation-templates";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  X,
  Loader2,
  Upload,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Wand2,
  RefreshCw,
  Check,
  User,
  Package,
  Palette,
  Camera,
  Library,
} from "lucide-react";

interface SceneGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  aspectRatio: AspectRatio;
  onVideoGenerated: () => void;
  /** 初期画像URL（カット画像生成モーダルから渡される場合） */
  initialImageUrl?: string;
  /** 初期プロンプト（カットの脚本） */
  initialPrompt?: string;
  /** 外部からの初期プロバイダー */
  initialVideoProvider?: VideoProvider;
  /** 外部からの初期カメラワーク */
  initialCameraWork?: CameraWorkSelection;
  /** 外部からの初期Klingモード */
  initialKlingMode?: 'std' | 'pro';
}

export function SceneGeneratorModal({
  isOpen,
  onClose,
  aspectRatio,
  onVideoGenerated,
  initialImageUrl,
  initialPrompt,
  initialVideoProvider,
  initialCameraWork,
  initialKlingMode,
}: SceneGeneratorModalProps) {
  // Step管理
  const [modalStep, setModalStep] = useState<1 | 2 | 3>(1);

  // Step 1: 画像 + 設定
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageSourceMode, setImageSourceMode] = useState<'upload' | 'gallery' | 'library'>('upload');
  const [galleryRefreshTrigger, setGalleryRefreshTrigger] = useState(0);
  const [subjectType, setSubjectType] = useState<"person" | "object" | "animation">("person");
  const [videoProvider, setVideoProvider] = useState<VideoProvider>("runway");
  const [klingMode, setKlingMode] = useState<"std" | "pro">("std");
  const [cameraWork, setCameraWork] = useState<CameraWorkSelection>(() => {
    const defaultPreset = CAMERA_PRESETS.find((p) => p.id === "simple");
    return {
      preset: "simple",
      customCameraWork: undefined,
      promptText: defaultPreset?.promptText || "",
    };
  });
  // アニメーション用
  const [animationCategory, setAnimationCategory] = useState<AnimationCategory | null>(null);
  const [animationTemplate, setAnimationTemplate] = useState<AnimationTemplateId | null>(null);
  // Act-Two用
  const [useActTwo, setUseActTwo] = useState(false);
  const [motionType, setMotionType] = useState<string | null>(null);
  const [expressionIntensity, setExpressionIntensity] = useState(3);
  const [bodyControl, setBodyControl] = useState(true);

  // Step 2: プロンプト
  const [japanesePrompt, setJapanesePrompt] = useState("");
  const [englishPrompt, setEnglishPrompt] = useState("");
  const [storySuggestions, setStorySuggestions] = useState<string[]>([]);
  const [suggestingStories, setSuggestingStories] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Step 3: 生成
  const [generating, setGenerating] = useState(false);
  const [generatingVideoId, setGeneratingVideoId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState<string>("");

  // ポーリング用ref
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 状態リセット関数
  const resetModal = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setModalStep(1);
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setUploadingImage(false);
    setImageSourceMode('upload');
    setSubjectType("person");
    setVideoProvider("runway");
    setCameraWork(() => {
      const defaultPreset = CAMERA_PRESETS.find((p) => p.id === "simple");
      return {
        preset: "simple",
        customCameraWork: undefined,
        promptText: defaultPreset?.promptText || "",
      };
    });
    setAnimationCategory(null);
    setAnimationTemplate(null);
    setUseActTwo(false);
    setMotionType(null);
    setExpressionIntensity(3);
    setBodyControl(true);
    setJapanesePrompt("");
    setEnglishPrompt("");
    setStorySuggestions([]);
    setSuggestingStories(false);
    setTranslating(false);
    setGenerating(false);
    setGeneratingVideoId(null);
    setGenerationProgress(0);
    setGenerationStatus("");
  }, []);

  // モーダルを閉じる
  const handleClose = useCallback(() => {
    if (generating) {
      if (window.confirm("動画生成中です。閉じると進捗が失われます。閉じますか？")) {
        resetModal();
        onClose();
      }
    } else {
      resetModal();
      onClose();
    }
  }, [generating, resetModal, onClose]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // 初期画像URLが渡された場合の処理
  useEffect(() => {
    if (isOpen && initialImageUrl) {
      // 初期画像をセットしてStep 2から開始
      setImageUrl(initialImageUrl);
      setImagePreview(initialImageUrl);
      setModalStep(2);

      // 外部から初期プロバイダーが渡された場合は適用
      if (initialVideoProvider) {
        setVideoProvider(initialVideoProvider);
      }

      // 外部から初期Klingモードが渡された場合は適用
      if (initialKlingMode) {
        setKlingMode(initialKlingMode);
      }

      // 外部から初期カメラワークが渡された場合は適用
      if (initialCameraWork) {
        setCameraWork(initialCameraWork);
      }

      // 初期プロンプトが渡された場合はそれを使用
      if (initialPrompt) {
        setJapanesePrompt(initialPrompt);
        // AIストーリー提案はスキップ（既にプロンプトがある）
      } else {
        // AIストーリー提案を自動実行
        setSuggestingStories(true);
        videosApi.suggestStories(initialImageUrl)
          .then((res) => {
            setStorySuggestions(res.suggestions);
            if (res.suggestions.length > 0) {
              setJapanesePrompt(res.suggestions[0]);
            }
          })
          .catch((error) => {
            console.error("Failed to suggest stories:", error);
          })
          .finally(() => {
            setSuggestingStories(false);
          });
      }
    }
  }, [isOpen, initialImageUrl, initialPrompt, initialVideoProvider, initialCameraWork, initialKlingMode]);

  // 画像アップロード
  const handleImageSelect = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("ファイルサイズが10MBを超えています");
      return;
    }

    setImageFile(file);
    setUploadingImage(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const uploadRes = await videosApi.uploadImage(file);
      setImageUrl(uploadRes.image_url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`画像のアップロードに失敗しました: ${message}`);
      setImageFile(null);
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  };

  // 画像削除
  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setStorySuggestions([]);
    setJapanesePrompt("");
    setEnglishPrompt("");
  };

  // AIストーリー提案
  const handleSuggestStories = async () => {
    if (!imageUrl) return;

    setSuggestingStories(true);
    try {
      const res = await videosApi.suggestStories(imageUrl);
      setStorySuggestions(res.suggestions);
      if (res.suggestions.length > 0) {
        setJapanesePrompt(res.suggestions[0]);
        setEnglishPrompt("");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`ストーリー提案の取得に失敗しました: ${message}`);
    } finally {
      setSuggestingStories(false);
    }
  };

  // 日本語→英語翻訳
  const handleTranslate = async () => {
    if (!japanesePrompt) return;

    setTranslating(true);
    try {
      const cameraPromptText = cameraWork.promptText || undefined;
      const res = await videosApi.translateStoryPrompt({
        description_ja: japanesePrompt,
        video_provider: videoProvider,
        subject_type: subjectType,
        camera_work: cameraPromptText,
        animation_category: subjectType === "animation" ? animationCategory : undefined,
        animation_template: subjectType === "animation" ? animationTemplate : undefined,
        use_act_two: (subjectType === "person" || subjectType === "animation") ? useActTwo : undefined,
        motion_type: (subjectType === "person" || subjectType === "animation") && useActTwo ? (motionType ?? undefined) : undefined,
        expression_intensity: (subjectType === "person" || subjectType === "animation") && useActTwo ? expressionIntensity : undefined,
        body_control: (subjectType === "person" || subjectType === "animation") && useActTwo ? bodyControl : undefined,
      });
      setEnglishPrompt(res.english_prompt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`翻訳に失敗しました: ${message}`);
    } finally {
      setTranslating(false);
    }
  };

  // ポーリング処理
  const pollGenerationStatus = useCallback(
    (videoId: string) => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      const poll = async () => {
        try {
          const status = await videosApi.getStatus(videoId);
          setGenerationProgress(status.progress || 0);
          setGenerationStatus(status.status);

          if (status.status === "completed") {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setGenerating(false);
            onVideoGenerated();
            resetModal();
            onClose();
            return;
          }

          if (status.status === "failed") {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            alert(`生成に失敗しました: ${status.message || "Unknown error"}`);
            setGenerating(false);
            return;
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      };

      poll();
      pollingIntervalRef.current = setInterval(poll, 3000);

      // タイムアウト（5分）
      timeoutRef.current = setTimeout(() => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        alert("生成がタイムアウトしました。もう一度お試しください。");
        setGenerating(false);
      }, 5 * 60 * 1000);
    },
    [onVideoGenerated, resetModal, onClose]
  );

  // 動画生成
  const handleGenerate = async () => {
    if (!imageUrl || !englishPrompt) return;

    setGenerating(true);
    setModalStep(3);

    try {
      const cameraPromptText = cameraWork.promptText || undefined;
      const videoRes = await videosApi.createStoryVideo({
        image_url: imageUrl,
        story_text: englishPrompt,
        aspect_ratio: aspectRatio as "9:16" | "16:9",
        video_provider: videoProvider,
        camera_work: cameraPromptText,
        use_act_two: (subjectType === "person" || subjectType === "animation") ? useActTwo : undefined,
        motion_type: (subjectType === "person" || subjectType === "animation") && useActTwo ? (motionType ?? undefined) : undefined,
        expression_intensity: (subjectType === "person" || subjectType === "animation") && useActTwo ? expressionIntensity : undefined,
        body_control: (subjectType === "person" || subjectType === "animation") && useActTwo ? bodyControl : undefined,
        kling_mode: videoProvider === "piapi_kling" ? klingMode : undefined,
      });

      setGeneratingVideoId(videoRes.id);
      pollGenerationStatus(videoRes.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`動画生成に失敗しました: ${message}`);
      setGenerating(false);
      setModalStep(2);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-white">新規シーンを生成</h2>
            <p className="text-sm text-zinc-400">
              アスペクト比: {aspectRatio}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-center gap-2">
            {[
              { num: 1, label: "画像" },
              { num: 2, label: "プロンプト" },
              { num: 3, label: "生成" },
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                      modalStep >= s.num
                        ? "bg-blue-500 text-white"
                        : "bg-zinc-700 text-zinc-400"
                    )}
                  >
                    {modalStep > s.num ? <Check className="h-4 w-4" /> : s.num}
                  </div>
                  <span className="mt-1 text-xs text-zinc-500">{s.label}</span>
                </div>
                {idx < 2 && (
                  <ChevronRight className="mx-2 h-4 w-4 text-zinc-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: 画像アップロード + 設定 */}
          {modalStep === 1 && (
            <div className="space-y-6">
              {/* 画像選択 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  素材画像
                </label>
                {imagePreview ? (
                  <div className="relative mx-auto max-w-xs">
                    <div
                      className={cn(
                        "relative overflow-hidden rounded-xl border border-zinc-700",
                        aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]"
                      )}
                    >
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                      {uploadingImage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Loader2 className="h-8 w-8 animate-spin text-white" />
                        </div>
                      )}
                      <button
                        onClick={removeImage}
                        disabled={uploadingImage}
                        className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* タブ切り替え */}
                    <div className="mb-3 flex rounded-lg bg-zinc-800 p-1 max-w-md mx-auto">
                      <button
                        onClick={() => setImageSourceMode('upload')}
                        className={cn(
                          "flex-1 rounded-md py-1.5 px-3 text-xs font-medium transition-all",
                          imageSourceMode === 'upload'
                            ? 'bg-zinc-700 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        )}
                      >
                        <Upload className="inline-block w-3 h-3 mr-1" />
                        アップロード
                      </button>
                      <button
                        onClick={() => setImageSourceMode('library')}
                        className={cn(
                          "flex-1 rounded-md py-1.5 px-3 text-xs font-medium transition-all",
                          imageSourceMode === 'library'
                            ? 'bg-zinc-700 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        )}
                      >
                        <Library className="inline-block w-3 h-3 mr-1" />
                        ライブラリ
                      </button>
                      <button
                        onClick={() => setImageSourceMode('gallery')}
                        className={cn(
                          "flex-1 rounded-md py-1.5 px-3 text-xs font-medium transition-all",
                          imageSourceMode === 'gallery'
                            ? 'bg-zinc-700 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        )}
                      >
                        <Camera className="inline-block w-3 h-3 mr-1" />
                        スクリーンショット
                      </button>
                    </div>

                    {/* アップロードモード */}
                    {imageSourceMode === 'upload' && (
                      <label className="mx-auto flex max-w-xs cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-600 py-12 transition-colors hover:border-blue-500">
                        <Upload className="h-10 w-10 text-zinc-500" />
                        <p className="mt-3 text-sm font-medium text-zinc-400">
                          画像をドラッグ&ドロップ
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          または クリックして選択
                        </p>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageSelect(file);
                          }}
                        />
                      </label>
                    )}

                    {/* ライブラリモード */}
                    {imageSourceMode === 'library' && (
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50">
                        <LibraryImageGrid
                          onSelect={(selectedImageUrl) => {
                            setImageUrl(selectedImageUrl);
                            setImagePreview(selectedImageUrl);
                            setImageFile(null);
                          }}
                          aspectRatio={aspectRatio}
                        />
                      </div>
                    )}

                    {/* ギャラリーモード */}
                    {imageSourceMode === 'gallery' && (
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50">
                        <ScreenshotGallery
                          onSelectForGeneration={(selectedImageUrl) => {
                            setImageUrl(selectedImageUrl);
                            setImagePreview(selectedImageUrl);
                            setImageFile(null);
                          }}
                          onError={(err) => alert(err)}
                          refreshTrigger={galleryRefreshTrigger}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 被写体タイプ選択 */}
              {imageUrl && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    被写体タイプ
                  </label>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSubjectType("person");
                        setAnimationCategory(null);
                        setAnimationTemplate(null);
                        if (videoProvider === "domoai") {
                          setVideoProvider("runway");
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors min-w-[100px]",
                        subjectType === "person"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <User className="h-5 w-5 text-zinc-300" />
                      <span className="text-sm text-zinc-300">人物</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSubjectType("object");
                        setAnimationCategory(null);
                        setAnimationTemplate(null);
                        if (videoProvider === "domoai") {
                          setVideoProvider("runway");
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors min-w-[100px]",
                        subjectType === "object"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <Package className="h-5 w-5 text-zinc-300" />
                      <span className="text-sm text-zinc-300">物体</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubjectType("animation")}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors min-w-[100px]",
                        subjectType === "animation"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <Palette className="h-5 w-5 text-zinc-300" />
                      <span className="text-sm text-zinc-300">アニメ</span>
                    </button>
                  </div>

                  {/* アニメーションカテゴリ選択 */}
                  {subjectType === "animation" && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-zinc-400 mb-2 text-center">
                        カテゴリ
                      </label>
                      <div className="flex gap-3 justify-center">
                        {(Object.keys(ANIMATION_CATEGORY_LABELS) as AnimationCategory[]).map(
                          (category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => {
                                setAnimationCategory(category);
                                setAnimationTemplate(null);
                              }}
                              className={cn(
                                "px-4 py-2 rounded-lg border-2 transition-colors text-sm",
                                animationCategory === category
                                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                  : "border-zinc-700 hover:border-zinc-600 text-zinc-300"
                              )}
                            >
                              {ANIMATION_CATEGORY_LABELS[category]}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* アニメーションテンプレート選択 */}
                  {subjectType === "animation" && animationCategory && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-zinc-400 mb-2 text-center">
                        スタイル
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                        {ANIMATION_TEMPLATES[animationCategory].map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => setAnimationTemplate(template.id)}
                            className={cn(
                              "flex flex-col items-start gap-1 rounded-lg border-2 p-2 transition-colors text-left",
                              animationTemplate === template.id
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-zinc-700 hover:border-zinc-600"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{template.icon}</span>
                              <span className="text-xs text-zinc-500">{template.id}</span>
                            </div>
                            <p className="text-xs text-zinc-300">{template.nameJa}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 動画プロバイダー選択 */}
              {imageUrl && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    動画生成エンジン
                  </label>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => setVideoProvider("runway")}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors min-w-[90px]",
                        videoProvider === "runway"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <span className="text-sm text-zinc-300">Runway</span>
                      <span className="text-xs text-zinc-500">推奨</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoProvider("piapi_kling")}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors min-w-[90px]",
                        videoProvider === "piapi_kling"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <span className="text-sm text-zinc-300">Kling</span>
                      <span className="text-xs text-zinc-500">低コスト</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoProvider("veo")}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors min-w-[90px]",
                        videoProvider === "veo"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <span className="text-sm text-zinc-300">Veo</span>
                      <span className="text-xs text-zinc-500">高品質</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoProvider("domoai");
                        setSubjectType("animation");
                      }}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors min-w-[90px]",
                        videoProvider === "domoai"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <span className="text-sm text-zinc-300">DomoAI</span>
                      <span className="text-xs text-zinc-500">アニメ特化</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoProvider("hailuo")}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors min-w-[90px]",
                        videoProvider === "hailuo"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <span className="text-sm text-zinc-300">Hailuo</span>
                      <span className="text-xs text-zinc-500">高速生成</span>
                    </button>
                  </div>

                  {/* Klingモード選択 */}
                  {videoProvider === "piapi_kling" && (
                    <div className="flex gap-2 justify-center mt-3">
                      <button
                        type="button"
                        onClick={() => setKlingMode("std")}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm transition-colors",
                          klingMode === "std"
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setKlingMode("pro")}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm transition-colors",
                          klingMode === "pro"
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        Professional
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Act-Twoモード */}
              {imageUrl &&
                (subjectType === "person" ||
                  (subjectType === "animation" && animationCategory)) &&
                videoProvider === "runway" && (
                  <div className="border-t border-zinc-800 pt-4">
                    <label className="flex items-center gap-3 cursor-pointer justify-center">
                      <input
                        type="checkbox"
                        checked={useActTwo}
                        onChange={(e) => {
                          setUseActTwo(e.target.checked);
                          if (!e.target.checked) {
                            setMotionType(null);
                          }
                        }}
                        className="h-4 w-4 rounded border-zinc-600 text-blue-500 focus:ring-blue-500 bg-zinc-800"
                      />
                      <div className="text-center">
                        <span className="text-sm font-medium text-zinc-300">
                          Act-Twoモード
                        </span>
                        <p className="text-xs text-zinc-500">
                          精密な動作制御
                        </p>
                      </div>
                    </label>

                    {useActTwo && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-2 text-center">
                            モーション
                          </label>
                          <MotionSelector value={motionType} onChange={setMotionType} />
                        </div>
                        <div className="max-w-xs mx-auto">
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            表情強度: {expressionIntensity}
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={expressionIntensity}
                            onChange={(e) => setExpressionIntensity(parseInt(e.target.value))}
                            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* カメラワーク選択 */}
              {imageUrl && (
                <div className="border-t border-zinc-800 pt-4">
                  <CameraWorkSelector
                    value={cameraWork}
                    onChange={setCameraWork}
                    videoProvider={videoProvider}
                  />
                </div>
              )}

              {/* 次へボタン */}
              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => {
                    setModalStep(2);
                    if (imageUrl && storySuggestions.length === 0) {
                      handleSuggestStories();
                    }
                  }}
                  disabled={!imageUrl || uploadingImage}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  次へ
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: プロンプト */}
          {modalStep === 2 && (
            <div className="space-y-6">
              {/* 画像プレビュー */}
              <div className="flex gap-4">
                {imagePreview && (
                  <div className="w-24 shrink-0">
                    <div
                      className={cn(
                        "overflow-hidden rounded-lg border border-zinc-700",
                        aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]"
                      )}
                    >
                      <img
                        src={imagePreview}
                        alt="Selected"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                )}
                <div className="flex-1 space-y-4">
                  {/* 日本語プロンプト */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                        日本語プロンプト
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSuggestStories}
                        disabled={suggestingStories || !imageUrl}
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                      >
                        {suggestingStories ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3 w-3" />
                        )}
                        再生成
                      </Button>
                    </div>
                    {suggestingStories ? (
                      <div className="flex items-center justify-center py-8 rounded-lg bg-zinc-800">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        <span className="ml-2 text-sm text-zinc-400">
                          AIがプロンプトを生成中...
                        </span>
                      </div>
                    ) : (
                      <textarea
                        value={japanesePrompt}
                        onChange={(e) => {
                          setJapanesePrompt(e.target.value);
                          setEnglishPrompt("");
                        }}
                        placeholder="AIがプロンプトを生成します"
                        rows={3}
                        maxLength={500}
                        className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                      />
                    )}
                  </div>

                  {/* 動画生成設定（Step 2用コンパクト版） */}
                  <div className="border-t border-zinc-700 pt-4 space-y-3">
                    {/* プロバイダー選択 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-400 shrink-0">AI:</span>
                      <div className="flex gap-1 flex-wrap">
                        {[
                          { id: "runway" as VideoProvider, label: "Runway" },
                          { id: "piapi_kling" as VideoProvider, label: "Kling" },
                          { id: "veo" as VideoProvider, label: "VEO" },
                          { id: "domoai" as VideoProvider, label: "DomoAI" },
                          { id: "hailuo" as VideoProvider, label: "Hailuo" },
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setVideoProvider(p.id)}
                            className={cn(
                              "px-2 py-1 rounded text-xs transition-colors",
                              videoProvider === p.id
                                ? "bg-blue-500 text-white"
                                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {/* Klingモード */}
                      {videoProvider === "piapi_kling" && (
                        <div className="flex gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => setKlingMode("std")}
                            className={cn(
                              "px-2 py-1 rounded text-xs transition-colors",
                              klingMode === "std"
                                ? "bg-green-500 text-white"
                                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            )}
                          >
                            Std
                          </button>
                          <button
                            type="button"
                            onClick={() => setKlingMode("pro")}
                            className={cn(
                              "px-2 py-1 rounded text-xs transition-colors",
                              klingMode === "pro"
                                ? "bg-green-500 text-white"
                                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            )}
                          >
                            Pro
                          </button>
                        </div>
                      )}
                    </div>

                    {/* カメラワーク選択 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-400 shrink-0">カメラ:</span>
                      <div className="flex gap-1 flex-wrap">
                        {CAMERA_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setCameraWork({
                                preset: preset.id,
                                promptText: preset.promptText,
                              });
                            }}
                            className={cn(
                              "px-2 py-1 rounded text-xs transition-colors",
                              cameraWork.preset === preset.id
                                ? "bg-blue-500 text-white"
                                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            )}
                          >
                            {preset.icon} {preset.label}
                          </button>
                        ))}
                      </div>
                      {cameraWork.preset === "custom" && cameraWork.customCameraWork && (
                        <span className="text-xs text-blue-400">
                          ({cameraWork.customCameraWork.label})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 翻訳ボタン */}
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={handleTranslate}
                      disabled={!japanesePrompt || translating}
                      className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                    >
                      {translating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          翻訳中...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-4 w-4" />
                          英語に翻訳
                        </>
                      )}
                    </Button>
                  </div>

                  {/* 英語プロンプト */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 block mb-2">
                      英語プロンプト
                    </label>
                    <textarea
                      value={englishPrompt}
                      onChange={(e) => setEnglishPrompt(e.target.value)}
                      placeholder="翻訳ボタンで生成されます"
                      rows={4}
                      className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                    />
                    {englishPrompt && (
                      <p className="mt-1 text-xs text-green-500 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        テンプレート適用済み
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 他の提案 */}
              {storySuggestions.length > 1 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-zinc-400 hover:text-blue-400">
                    他のAI提案を見る ({storySuggestions.length - 1}件)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {storySuggestions
                      .filter((s) => s !== japanesePrompt)
                      .map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setJapanesePrompt(suggestion);
                            setEnglishPrompt("");
                          }}
                          className="w-full rounded-lg border border-zinc-700 p-2 text-left transition-colors hover:border-blue-500 hover:bg-blue-500/10"
                        >
                          <p className="text-xs text-zinc-300">{suggestion}</p>
                        </button>
                      ))}
                  </div>
                </details>
              )}

              {/* ボタン */}
              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setModalStep(1)}
                  className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  戻る
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!englishPrompt || generating}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  動画を生成
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: 生成中 */}
          {modalStep === 3 && (
            <div className="py-8 text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">
                      {generationProgress}%
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white">動画を生成中...</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  約1〜2分かかります
                </p>
              </div>

              {/* 進捗バー */}
              <div className="max-w-xs mx-auto">
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500 capitalize">
                  ステータス: {generationStatus || "starting"}
                </p>
              </div>

              <p className="text-xs text-zinc-500">
                このウィンドウを閉じると生成が中断されます
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== LibraryImageGrid コンポーネント =====

interface LibraryImageGridProps {
  onSelect: (imageUrl: string) => void;
  aspectRatio?: AspectRatio;
}

function LibraryImageGrid({ onSelect, aspectRatio }: LibraryImageGridProps) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const perPage = 12;

  const loadImages = useCallback(async (pageNum: number) => {
    try {
      setIsLoading(true);
      const response = await libraryApi.list({
        page: pageNum,
        per_page: perPage,
      });

      if (pageNum === 1) {
        setImages(response.images);
      } else {
        setImages((prev) => [...prev, ...response.images]);
      }

      setTotal(response.total);
      setHasMore(response.has_next);
    } catch (error) {
      console.error("Failed to load library images:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages(1);
  }, [loadImages]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadImages(nextPage);
  };

  if (isLoading && images.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400">
        <p>ライブラリに画像がありません</p>
        <p className="text-sm mt-1 text-zinc-500">
          画像を生成すると自動的にライブラリに保存されます
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {total}件の画像
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {images.map((image) => (
          <button
            key={image.id}
            onClick={() => onSelect(image.image_url)}
            className="relative group aspect-square overflow-hidden rounded-lg border border-zinc-700 hover:border-blue-500 transition-colors"
          >
            <Image
              src={image.thumbnail_url || image.image_url}
              alt={image.name || "Library image"}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 25vw, 15vw"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Check className="w-6 h-6 text-white" />
            </div>
            {image.name && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                <p className="text-xs text-white truncate">{image.name}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                読み込み中...
              </>
            ) : (
              "もっと見る"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
