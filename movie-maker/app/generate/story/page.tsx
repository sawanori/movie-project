"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { CameraWorkSelector } from "@/components/camera";
import { CameraWorkSelection } from "@/lib/camera/types";
import type { VideoProvider } from "@/lib/types/video";
import { CAMERA_PRESETS } from "@/lib/camera/presets";
import { videosApi, templatesApi, textToImageApi, libraryApi, LibraryImage, Screenshot, BGMTrack } from "@/lib/api/client";
import { StructuredImageForm, createEmptyStructuredInput, hasStructuredInputData } from "@/components/ui/structured-image-form";
import type { StructuredImageInput, ImageInputMode, ImageProvider } from "@/lib/constants/image-generation";
import { supportsStructuredInput, supportsReferenceImage, getProviderMaxLength } from "@/lib/constants/image-generation";
import { ImageProviderSelector } from "@/components/ui/image-provider-selector";
import { ReferenceImageSelector } from "@/components/ui/reference-image-selector";
import type { ReferenceImage } from "@/lib/constants/image-generation";
import { ElementImagesUploader } from "@/components/video/element-images-uploader";
import { cn } from "@/lib/utils";
import {
  Upload,
  X,
  Loader2,
  Sparkles,
  Music,
  Type,
  ChevronRight,
  ChevronLeft,
  Wand2,
  RefreshCw,
  Check,
  User,
  Package,
  Palette,
  ImageIcon,
  FolderOpen,
  Plus,
  GitBranch,
  List,
} from "lucide-react";
import {
  ANIMATION_TEMPLATES,
  ANIMATION_CATEGORY_LABELS,
  type AnimationCategory,
  type AnimationTemplateId,
} from "@/lib/constants/animation-templates";
import { MotionSelector } from "@/components/ui/motion-selector";
import { NodeEditor } from "@/components/node-editor";

// エディタモードの型定義
type EditorMode = 'guide' | 'node';

export default function StoryGeneratePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // エディタモード: guide（ガイドモード）または node（ノードモード）
  const [editorMode, setEditorMode] = useState<EditorMode>('guide');

  const [step, setStep] = useState(1);
  const [bgmList, setBgmList] = useState<BGMTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggestingStories, setSuggestingStories] = useState(false);

  // Form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [japanesePrompt, setJapanesePrompt] = useState("");  // 日本語プロンプト
  const [englishPrompt, setEnglishPrompt] = useState("");    // 英語プロンプト（API送信用）
  const [translating, setTranslating] = useState(false);     // 翻訳中フラグ
  const [storySuggestions, setStorySuggestions] = useState<string[]>([]);
  const [selectedBgm, setSelectedBgm] = useState<string | null>(null);
  const [customBgmFile, setCustomBgmFile] = useState<File | null>(null);
  const [customBgmUrl, setCustomBgmUrl] = useState<string | null>(null);
  const [uploadingBgm, setUploadingBgm] = useState(false);
  const [overlayText, setOverlayText] = useState("");
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [videoProvider, setVideoProvider] = useState<VideoProvider>('runway');
  const [klingMode, setKlingMode] = useState<'std' | 'pro'>('std');
  // Kling Elements: 一貫性向上用の追加画像
  const [elementImages, setElementImages] = useState<string[]>([]);
  // 終了フレーム画像（Kling専用）
  const [endFrameImageUrl, setEndFrameImageUrl] = useState<string | null>(null);
  const [endFrameImagePreview, setEndFrameImagePreview] = useState<string | null>(null);
  const [endFrameUploading, setEndFrameUploading] = useState(false);
  const [subjectType, setSubjectType] = useState<'person' | 'object' | 'animation'>('person');
  const [animationCategory, setAnimationCategory] = useState<AnimationCategory | null>(null);
  const [animationTemplate, setAnimationTemplate] = useState<AnimationTemplateId | null>(null);
  // Act-Two用state
  const [useActTwo, setUseActTwo] = useState(false);
  const [motionType, setMotionType] = useState<string | null>(null);
  const [expressionIntensity, setExpressionIntensity] = useState(3);
  const [bodyControl, setBodyControl] = useState(true);
  const [cameraWork, setCameraWork] = useState<CameraWorkSelection>(() => {
    const defaultPreset = CAMERA_PRESETS.find((p) => p.id === 'simple');
    return {
      preset: 'simple',
      customCameraWork: undefined,
      promptText: defaultPreset?.promptText || '',
    };
  });

  // Text-to-Image 構造化入力
  const [imageInputMode, setImageInputMode] = useState<ImageInputMode>("form");
  const [structuredInput, setStructuredInput] = useState<StructuredImageInput>(createEmptyStructuredInput());
  const [freeTextDescription, setFreeTextDescription] = useState("");
  const [generatingFromText, setGeneratingFromText] = useState(false);
  const [imageProvider, setImageProvider] = useState<ImageProvider>("nanobanana");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);  // BFL FLUX.2用複数参照画像

  // 画像ライブラリ選択モーダル
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [libraryScreenshots, setLibraryScreenshots] = useState<Screenshot[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const bgmRes = await templatesApi.listBgm();
      setBgmList(bgmRes);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  // 画像ライブラリを読み込む
  const loadLibraryImages = async () => {
    setLoadingLibrary(true);
    try {
      const response = await libraryApi.listAll({ page: 1, per_page: 50, source_filter: "all" });
      setLibraryImages(response.library_images || []);
      setLibraryScreenshots(response.screenshots || []);
    } catch (error) {
      console.error("Failed to load library images:", error);
    } finally {
      setLoadingLibrary(false);
    }
  };

  // ライブラリモーダルを開く
  const handleOpenLibraryModal = () => {
    setShowLibraryModal(true);
    loadLibraryImages();
  };

  // ライブラリから画像を選択
  const handleSelectFromLibrary = (imageUrl: string) => {
    setImageUrl(imageUrl);
    setImagePreview(imageUrl);
    setImageFile(null);
    setShowLibraryModal(false);
  };

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) {
      handleImageSelect(files[0]);
    }
  }, []);

  // 画像貼り付けハンドラ（Ctrl+V / Cmd+V）
  const handleImagePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleImageSelect(file);
          break;
        }
      }
    }
  }, []);

  const handleImageSelect = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("ファイルサイズが10MBを超えています");
      return;
    }

    setImageFile(file);

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
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setStorySuggestions([]);
    setJapanesePrompt("");
    setEnglishPrompt("");
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
      setImageUrl(null);
      setImagePreview(null);
      setImageFile(null);
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

  // テキストから画像を生成（参照画像がある場合はそれも考慮）
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
        reference_image_url: imageProvider === "nanobanana" ? (imageUrl || null) : null,
        // BFL FLUX.2用: reference_images（複数参照画像）
        reference_images: imageProvider === "bfl_flux2_pro" && referenceImages.length > 0 ? referenceImages : undefined,
        aspect_ratio: aspectRatio,
        image_provider: imageProvider,
      });

      // 生成された画像を設定
      setImageUrl(result.image_url);
      setImagePreview(result.image_url);
      setImageFile(null); // ファイルはなし（URL直接）
    } catch (error) {
      console.error("画像生成に失敗:", error);
      alert(error instanceof Error ? error.message : "画像生成に失敗しました");
    } finally {
      setGeneratingFromText(false);
    }
  };

  const handleSuggestStories = async () => {
    if (!imageUrl) return;

    setSuggestingStories(true);
    try {
      const res = await videosApi.suggestStories(imageUrl);
      setStorySuggestions(res.suggestions);
      // 最初の提案を自動的にセット（ユーザーはそのまま編集可能）
      if (res.suggestions.length > 0) {
        setJapanesePrompt(res.suggestions[0]);
        setEnglishPrompt("");  // 日本語が変わったので英語はクリア
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`ストーリー提案の取得に失敗しました: ${message}`);
    } finally {
      setSuggestingStories(false);
    }
  };

  // 日本語プロンプトを英語に翻訳（テンプレート適用）
  const handleTranslate = async () => {
    if (!japanesePrompt) return;

    setTranslating(true);
    try {
      // カメラワークのプロンプトテキストを取得
      const cameraPromptText = cameraWork.promptText || undefined;

      const res = await videosApi.translateStoryPrompt({
        description_ja: japanesePrompt,
        video_provider: videoProvider,
        subject_type: subjectType,
        camera_work: cameraPromptText,  // ユーザー選択のカメラワーク
        // アニメーション選択時のみカテゴリとテンプレートを送信
        animation_category: subjectType === 'animation' ? animationCategory : undefined,
        animation_template: subjectType === 'animation' ? animationTemplate : undefined,
        // Act-Two用パラメータ（人物・アニメーション共通）
        use_act_two: (subjectType === 'person' || subjectType === 'animation') ? useActTwo : undefined,
        motion_type: (subjectType === 'person' || subjectType === 'animation') && useActTwo ? (motionType ?? undefined) : undefined,
        expression_intensity: (subjectType === 'person' || subjectType === 'animation') && useActTwo ? expressionIntensity : undefined,
        body_control: (subjectType === 'person' || subjectType === 'animation') && useActTwo ? bodyControl : undefined,
      });
      setEnglishPrompt(res.english_prompt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`翻訳に失敗しました: ${message}`);
    } finally {
      setTranslating(false);
    }
  };

  // 終了フレーム画像のアップロード処理（Kling専用）
  const processEndFrameImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (event) => {
      setEndFrameImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // R2へアップロード
    setEndFrameUploading(true);
    try {
      const uploadRes = await videosApi.uploadImage(file);
      setEndFrameImageUrl(uploadRes.image_url);
    } catch (error) {
      console.error('Failed to upload end frame image:', error);
      alert('終了フレーム画像のアップロードに失敗しました');
      setEndFrameImagePreview(null);
    } finally {
      setEndFrameUploading(false);
    }
  };

  // 終了フレーム画像のファイル選択ハンドラ
  const handleEndFrameImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processEndFrameImage(file);
  };

  // 終了フレーム画像のドラッグ＆ドロップハンドラ
  const [endFrameDragging, setEndFrameDragging] = useState(false);

  const handleEndFrameDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEndFrameDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) {
      processEndFrameImage(files[0]);
    }
  }, []);

  // プロバイダー切り替えハンドラ（Kling以外に切り替えた場合、Kling専用オプションをクリア）
  const handleProviderChange = (newProvider: VideoProvider) => {
    setVideoProvider(newProvider);

    // Kling AI以外に切り替えた場合、Kling専用オプションをクリア
    if (newProvider !== 'piapi_kling') {
      setEndFrameImageUrl(null);
      setEndFrameImagePreview(null);
      setElementImages([]);  // Kling Elements画像もクリア
    }
  };

  const handleGenerate = async () => {
    if (!imageUrl || !englishPrompt) return;

    setGenerating(true);
    try {
      // カメラワークのプロンプトテキストを送信
      // - カスタム選択時: customCameraWork.promptText
      // - プリセット選択時: preset.promptText
      const cameraPromptText = cameraWork.promptText || undefined;

      const videoRes = await videosApi.createStoryVideo({
        image_url: imageUrl,
        story_text: englishPrompt,  // 英語プロンプトを送信
        aspect_ratio: aspectRatio,
        video_provider: videoProvider,
        bgm_track_id: selectedBgm || undefined,
        custom_bgm_url: customBgmUrl || undefined,  // カスタムBGM（プリセットより優先）
        overlay: overlayText ? { text: overlayText } : undefined,
        camera_work: cameraPromptText,
        // Act-Two用パラメータ（人物・アニメーション共通）
        use_act_two: (subjectType === 'person' || subjectType === 'animation') ? useActTwo : undefined,
        motion_type: (subjectType === 'person' || subjectType === 'animation') && useActTwo ? (motionType ?? undefined) : undefined,
        expression_intensity: (subjectType === 'person' || subjectType === 'animation') && useActTwo ? expressionIntensity : undefined,
        body_control: (subjectType === 'person' || subjectType === 'animation') && useActTwo ? bodyControl : undefined,
        // Kling AI用パラメータ
        kling_mode: videoProvider === 'piapi_kling' ? klingMode : undefined,
        end_frame_image_url: videoProvider === 'piapi_kling' ? (endFrameImageUrl || undefined) : undefined,
        // Kling Elements: 一貫性向上用の追加画像
        element_images: videoProvider === 'piapi_kling' && elementImages.length > 0
          ? elementImages.map(url => ({ image_url: url }))
          : undefined,
      });

      router.push(`/generate/${videoRes.id}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`動画生成に失敗しました: ${message}`);
      setGenerating(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#212121]">
        <Loader2 className="h-8 w-8 animate-spin text-[#fce300]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#212121]">
      <Header />

      <main className={cn(
        "mx-auto px-4 py-8 sm:px-6 lg:px-8",
        editorMode === 'node' ? "max-w-[95vw]" : "max-w-5xl"
      )}>
        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-white">
            <Wand2 className="h-6 w-6 text-[#fce300]" />
            ワンシーン生成
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            画像から短い動画クリップをAIが自動生成
          </p>
        </div>

        {/* エディタモード切り替えタブ */}
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-lg bg-[#1a1a1a] p-1 border border-[#404040]">
            <button
              onClick={() => setEditorMode('guide')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                editorMode === 'guide'
                  ? "bg-[#fce300] text-[#212121]"
                  : "text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
              )}
            >
              <List className="h-4 w-4" />
              ガイドモード
            </button>
            <button
              onClick={() => setEditorMode('node')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                editorMode === 'node'
                  ? "bg-[#fce300] text-[#212121]"
                  : "text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
              )}
            >
              <GitBranch className="h-4 w-4" />
              ノードモード
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-[#404040] text-gray-300">
                Beta
              </span>
            </button>
          </div>
        </div>

        {/* ノードモード */}
        {editorMode === 'node' && (
          <NodeEditor
            onVideoGenerated={(videoUrl) => {
              // 生成完了時の処理（必要に応じて結果ページへ遷移等）
              console.log('Video generated:', videoUrl);
            }}
          />
        )}

        {/* ガイドモード: Progress Steps */}
        {editorMode === 'guide' && (
          <>
        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[
            { num: 1, label: "画像" },
            { num: 2, label: "プロンプト" },
            { num: 3, label: "オプション" },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                    step >= s.num
                      ? "bg-[#fce300] text-[#212121]"
                      : "bg-[#404040] text-gray-400"
                  )}
                >
                  {step > s.num ? <Check className="h-4 w-4" /> : s.num}
                </div>
                <span className="mt-1 text-xs text-gray-500">{s.label}</span>
              </div>
              {idx < 2 && (
                <ChevronRight className="mx-2 h-4 w-4 text-gray-500" />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Image Upload + Text-to-Image */}
        {step === 1 && (
          <div className="rounded-xl bg-[#2a2a2a] border border-[#404040] p-8">
            <h2 className="text-xl font-semibold text-white">
              1. 素材を準備
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              画像をアップロード、またはテキストで画像を生成できます（両方の併用も可能）
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* 左カラム: 参照画像 + アスペクト比 */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-300">
                  参照画像（オプション）
                </h3>
                <div
                  onDrop={handleImageDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onPaste={handleImagePaste}
                  tabIndex={0}
                  className="outline-none focus:ring-2 focus:ring-[#fce300]/50 rounded-xl"
                >
                  {imagePreview ? (
                    <div className="relative mx-auto max-w-xs">
                      <div className={cn(
                        "relative overflow-hidden rounded-xl border border-[#404040]",
                        aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/9]'
                      )}>
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                        <button
                          onClick={removeImage}
                          className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#505050] py-12 transition-colors hover:border-[#fce300]">
                        <Upload className="h-10 w-10 text-gray-500" />
                        <p className="mt-3 text-sm font-medium text-gray-400">
                          画像をドラッグ&ドロップ / 貼り付け
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
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
                      {/* ライブラリから選択ボタン */}
                      <button
                        type="button"
                        onClick={handleOpenLibraryModal}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#505050] py-3 text-sm text-gray-400 transition-colors hover:border-[#fce300] hover:text-[#fce300]"
                      >
                        <FolderOpen className="h-4 w-4" />
                        ライブラリから選択
                      </button>
                    </div>
                  )}
                </div>

                {/* アスペクト比選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    アスペクト比
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setAspectRatio('9:16')}
                      disabled={generatingFromText}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors",
                        aspectRatio === '9:16'
                          ? "border-[#fce300] bg-[#fce300]/10"
                          : "border-[#404040] hover:border-[#505050]",
                        generatingFromText && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-5 h-8 border-2 border-current rounded-sm" />
                      <span className="text-xs text-white">9:16 縦</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspectRatio('16:9')}
                      disabled={generatingFromText}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors",
                        aspectRatio === '16:9'
                          ? "border-[#fce300] bg-[#fce300]/10"
                          : "border-[#404040] hover:border-[#505050]",
                        generatingFromText && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-8 h-5 border-2 border-current rounded-sm" />
                      <span className="text-xs text-white">16:9 横</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 右カラム: テキスト入力フォーム */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-300">
                  画像の詳細をテキストで指定（オプション）
                </h3>

                {/* 画像生成モデル選択 */}
                <ImageProviderSelector
                  value={imageProvider}
                  onChange={handleImageProviderChange}
                  disabled={generatingFromText}
                />

                {/* 参照画像選択（BFL FLUX.2のみ） */}
                <ReferenceImageSelector
                  value={referenceImages}
                  onChange={setReferenceImages}
                  imageProvider={imageProvider}
                  availableImages={
                    imageUrl
                      ? [{ url: imageUrl, label: "アップロード画像" }]
                      : []
                  }
                  disabled={generatingFromText}
                />

                {/* 入力モード切り替えタブ - Fluxの場合は非表示 */}
                {supportsStructuredInput(imageProvider) ? (
                  <div className="flex rounded-lg bg-[#1a1a1a] p-1">
                    <button
                      type="button"
                      onClick={() => setImageInputMode("form")}
                      disabled={generatingFromText}
                      className={cn(
                        "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                        imageInputMode === "form"
                          ? "bg-[#2a2a2a] text-white shadow-sm"
                          : "text-gray-400 hover:text-white"
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
                          ? "bg-[#2a2a2a] text-white shadow-sm"
                          : "text-gray-400 hover:text-white"
                      )}
                    >
                      テキスト入力
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-zinc-800 border border-zinc-600 p-3 text-sm text-zinc-300">
                    <span className="text-[#fce300]">Flux</span> はシンプルなテキスト入力で高速に画像を生成します
                  </div>
                )}

                {/* 条件付きレンダリング */}
                <div className="rounded-lg bg-[#1a1a1a] p-4">
                  {imageInputMode === "form" ? (
                    <StructuredImageForm
                      value={structuredInput}
                      onChange={setStructuredInput}
                      disabled={generatingFromText}
                      className="[&_label]:text-gray-300 [&_input]:bg-[#2a2a2a] [&_input]:border-[#404040] [&_input]:text-white [&_select]:bg-[#2a2a2a] [&_select]:border-[#404040] [&_select]:text-white [&_textarea]:bg-[#2a2a2a] [&_textarea]:border-[#404040] [&_textarea]:text-white"
                    />
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        画像の説明
                      </label>
                      <textarea
                        value={freeTextDescription}
                        onChange={(e) => setFreeTextDescription(e.target.value)}
                        placeholder={"生成したい画像の説明を自由に入力してください。\n\n例: 白い大理石のテーブルの上に置かれた高級感のあるコーヒーカップ。ゴールデンアワーの柔らかい光が左上から差し込み、暖かみのある色調で撮影。背景は軽くぼかしたモダンなカフェの内装。"}
                        disabled={generatingFromText}
                        rows={8}
                        maxLength={getProviderMaxLength(imageProvider)}
                        className="w-full rounded-lg border border-[#404040] bg-[#2a2a2a] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>被写体、背景、照明、色調などを詳しく記述すると精度が上がります</span>
                        <span>{freeTextDescription.length.toLocaleString()}/{getProviderMaxLength(imageProvider).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* アクションボタン */}
            <div className="mt-6 space-y-3">
              {/* 画像生成ボタン - テキスト入力がある場合のみ有効 */}
              {canGenerateImage() && (
                <Button
                  onClick={handleGenerateImageFromText}
                  disabled={generatingFromText}
                  className={cn(
                    "w-full",
                    imageUrl
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "bg-[#fce300] text-black hover:bg-[#fce300]/90"
                  )}
                >
                  {generatingFromText ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      画像を生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {imageUrl
                        ? "参照画像 + テキストで新しい画像を生成"
                        : "テキストから画像を生成"}
                    </>
                  )}
                </Button>
              )}

              {/* 入力状態の説明 */}
              <p className="text-center text-xs text-gray-500">
                {!imageUrl && !canGenerateImage() && (
                  "画像をアップロード、またはテキストを入力してください"
                )}
                {imageUrl && !canGenerateImage() && (
                  "この画像で次のステップへ進めます（テキストを入力すると新しい画像を生成できます）"
                )}
                {!imageUrl && canGenerateImage() && (
                  "テキストから画像を生成します"
                )}
                {imageUrl && canGenerateImage() && (
                  "参照画像を考慮してテキストから新しい画像を生成できます"
                )}
              </p>
            </div>

            {/* アスペクト比選択（元の位置に戻す - 画像がある場合のみ） */}
            {imageUrl && false && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  アスペクト比を選択
                </label>
                <div className="flex gap-4 justify-center">
                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
                      aspectRatio === '9:16'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="w-8 h-14 border-2 border-current rounded-sm flex items-center justify-center text-xs text-white">
                      9:16
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">縦長</p>
                      <p className="text-xs text-gray-500">ショート動画向け</p>
                    </div>
                    {aspectRatio === '9:16' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
                      aspectRatio === '16:9'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="w-14 h-8 border-2 border-current rounded-sm flex items-center justify-center text-xs text-white">
                      16:9
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">横長</p>
                      <p className="text-xs text-gray-500">YouTube等向け</p>
                    </div>
                    {aspectRatio === '16:9' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 被写体タイプ選択 */}
            {imageUrl && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  被写体タイプ
                </label>
                {/* 第1階層: person / object / animation */}
                <div className="flex gap-4 justify-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectType('person');
                      setAnimationCategory(null);
                      setAnimationTemplate(null);
                      // DomoAI選択中にpersonを選んだ場合はRunwayに切り替え
                      if (videoProvider === 'domoai') {
                        setVideoProvider('runway');
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      subjectType === 'person'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <User className="h-6 w-6 text-white" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">人物</p>
                      <p className="text-xs text-gray-500">ポートレート向け</p>
                    </div>
                    {subjectType === 'person' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectType('object');
                      setAnimationCategory(null);
                      setAnimationTemplate(null);
                      // DomoAI選択中にobjectを選んだ場合はRunwayに切り替え
                      if (videoProvider === 'domoai') {
                        setVideoProvider('runway');
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      subjectType === 'object'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <Package className="h-6 w-6 text-white" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">物体</p>
                      <p className="text-xs text-gray-500">料理・商品向け</p>
                    </div>
                    {subjectType === 'object' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubjectType('animation')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      subjectType === 'animation'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <Palette className="h-6 w-6 text-white" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">アニメーション</p>
                      <p className="text-xs text-gray-500">2D/3Dスタイル</p>
                    </div>
                    {subjectType === 'animation' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                </div>

                {/* 第2階層: 2D / 3D（animation選択時のみ表示） */}
                {subjectType === 'animation' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-400 mb-2 text-center">
                      カテゴリを選択
                    </label>
                    <div className="flex gap-3 justify-center">
                      {(Object.keys(ANIMATION_CATEGORY_LABELS) as AnimationCategory[]).map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => {
                            setAnimationCategory(category);
                            setAnimationTemplate(null);
                          }}
                          className={cn(
                            "px-6 py-3 rounded-lg border-2 transition-colors font-medium",
                            animationCategory === category
                              ? "border-[#fce300] bg-[#fce300]/10 text-[#fce300]"
                              : "border-[#404040] hover:border-[#505050] text-gray-300"
                          )}
                        >
                          {ANIMATION_CATEGORY_LABELS[category]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 第3階層: スタイルテンプレート選択 */}
                {subjectType === 'animation' && animationCategory && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-400 mb-2 text-center">
                      スタイルを選択
                    </label>
                    <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                      {ANIMATION_TEMPLATES[animationCategory].map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setAnimationTemplate(template.id)}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-lg border-2 p-3 transition-colors text-left",
                            animationTemplate === template.id
                              ? "border-[#fce300] bg-[#fce300]/10"
                              : "border-[#404040] hover:border-[#505050]"
                          )}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className="text-lg">{template.icon}</span>
                            <span className="text-xs text-gray-500">{template.id}</span>
                            {animationTemplate === template.id && (
                              <Check className="h-4 w-4 text-[#fce300] ml-auto" />
                            )}
                          </div>
                          <p className="text-sm font-medium text-white">{template.nameJa}</p>
                          <p className="text-xs text-gray-500 line-clamp-2">{template.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Act-Twoモード選択（人物/アニメーション + Runwayのみ） */}
                {(subjectType === 'person' || (subjectType === 'animation' && animationCategory)) && videoProvider === 'runway' && (
                  <div className="mt-6 border-t border-[#404040] pt-4">
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
                        className="h-5 w-5 rounded border-[#404040] text-[#fce300] focus:ring-[#fce300] bg-[#1a1a1a]"
                      />
                      <div className="text-center">
                        <span className="text-sm font-medium text-gray-300">
                          Act-Twoモード（精密動作制御）
                        </span>
                        <p className="text-xs text-gray-500">
                          パフォーマンス動画ベースで自然な動きを実現
                        </p>
                      </div>
                    </label>

                    {/* Act-Two有効時のモーション選択 */}
                    {useActTwo && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-2 text-center">
                            モーションを選択
                          </label>
                          <MotionSelector
                            value={motionType}
                            onChange={setMotionType}
                          />
                        </div>

                        {/* 表情強度スライダー */}
                        <div className="max-w-md mx-auto">
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            表情強度: {expressionIntensity}
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={expressionIntensity}
                            onChange={(e) => setExpressionIntensity(parseInt(e.target.value))}
                            className="w-full h-2 bg-[#404040] rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>控えめ</span>
                            <span>標準</span>
                            <span>強め</span>
                          </div>
                        </div>

                        {/* 体の動き制御 */}
                        <label className="flex items-center gap-3 cursor-pointer justify-center">
                          <input
                            type="checkbox"
                            checked={bodyControl}
                            onChange={(e) => setBodyControl(e.target.checked)}
                            className="h-5 w-5 rounded border-[#404040] text-[#fce300] focus:ring-[#fce300] bg-[#1a1a1a]"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-300">
                              体の動き制御
                            </span>
                            <p className="text-xs text-gray-500">
                              手・腕・胴体の動きを維持
                            </p>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 動画生成エンジン選択 */}
            {imageUrl && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  動画生成エンジン
                </label>
                <div className="flex flex-wrap gap-4 justify-center">
                  <button
                    type="button"
                    onClick={() => handleProviderChange('runway')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      videoProvider === 'runway'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Runway</p>
                      <p className="text-xs text-gray-500">推奨・安定品質</p>
                    </div>
                    {videoProvider === 'runway' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange('piapi_kling')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      videoProvider === 'piapi_kling'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Kling</p>
                      <p className="text-xs text-gray-500">低コスト・高品質</p>
                    </div>
                    {videoProvider === 'piapi_kling' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange('veo')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      videoProvider === 'veo'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Veo</p>
                      <p className="text-xs text-gray-500">高品質</p>
                    </div>
                    {videoProvider === 'veo' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleProviderChange('domoai');
                      // DomoAIはアニメ特化のため、自動的にanimationモードに切り替え
                      setSubjectType('animation');
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      videoProvider === 'domoai'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">DomoAI</p>
                      <p className="text-xs text-gray-500">アニメ特化</p>
                    </div>
                    {videoProvider === 'domoai' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange('hailuo')}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
                      videoProvider === 'hailuo'
                        ? "border-[#fce300] bg-[#fce300]/10"
                        : "border-[#404040] hover:border-[#505050]"
                    )}
                  >
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">HailuoAI</p>
                      <p className="text-xs text-gray-500">カメラワーク</p>
                    </div>
                    {videoProvider === 'hailuo' && (
                      <span className="text-xs text-[#fce300] font-medium">選択中</span>
                    )}
                  </button>
                </div>

                {/* Kling AI モード選択（Kling選択時のみ表示） */}
                {videoProvider === 'piapi_kling' && (
                  <div className="mt-4 flex gap-3 justify-center">
                    <button
                      type="button"
                      onClick={() => setKlingMode('std')}
                      className={cn(
                        "flex-1 max-w-[140px] rounded-md border px-3 py-2 text-sm transition-all",
                        klingMode === 'std'
                          ? "border-[#fce300] bg-[#fce300]/10 text-[#fce300]"
                          : "border-[#404040] text-gray-400 hover:border-[#505050]"
                      )}
                    >
                      <div className="font-medium">Standard</div>
                      <div className="text-xs opacity-70">低コスト</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKlingMode('pro')}
                      className={cn(
                        "flex-1 max-w-[140px] rounded-md border px-3 py-2 text-sm transition-all",
                        klingMode === 'pro'
                          ? "border-[#fce300] bg-[#fce300]/10 text-[#fce300]"
                          : "border-[#404040] text-gray-400 hover:border-[#505050]"
                      )}
                    >
                      <div className="font-medium">Pro</div>
                      <div className="text-xs opacity-70">高品質</div>
                    </button>
                  </div>
                )}

                {/* Kling Elements: 一貫性向上用の追加画像（Kling選択時のみ表示） */}
                {videoProvider === 'piapi_kling' && (
                  <div className="mt-4 rounded-lg border border-dashed border-[#505050] p-4">
                    <ElementImagesUploader
                      value={elementImages}
                      onChange={setElementImages}
                      maxImages={3}
                      videoProvider={videoProvider}
                      onUpload={async (file) => {
                        const result = await videosApi.uploadImage(file);
                        return result.image_url;
                      }}
                      disabled={generating}
                    />
                  </div>
                )}

                {/* 終了フレーム画像アップロード（Kling選択時のみ表示） */}
                {videoProvider === 'piapi_kling' && (
                  <div className="mt-4 rounded-lg border border-dashed border-[#505050] p-4">
                    <h5 className="mb-2 text-sm font-medium text-gray-300">
                      終了フレーム画像（オプション）
                    </h5>
                    <p className="mb-3 text-xs text-gray-500">
                      2枚目の画像を設定すると、1枚目から2枚目へ遷移する動画を生成します。
                    </p>

                    {endFrameImagePreview ? (
                      <div className="relative flex justify-center">
                        <img
                          src={endFrameImagePreview}
                          alt="終了フレーム"
                          className="max-h-48 max-w-full rounded-lg object-contain"
                        />
                        {endFrameUploading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                            <Loader2 className="h-6 w-6 animate-spin text-[#fce300]" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEndFrameImagePreview(null);
                            setEndFrameImageUrl(null);
                          }}
                          className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                          disabled={endFrameUploading}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-4 transition-colors",
                          endFrameDragging
                            ? "border-[#fce300] bg-[#fce300]/10"
                            : "border-[#404040] hover:border-[#fce300]"
                        )}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEndFrameDragging(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEndFrameDragging(false);
                        }}
                        onDrop={handleEndFrameDrop}
                      >
                        <ImageIcon className="mb-2 h-8 w-8 text-gray-500" />
                        <span className="text-sm text-gray-400">
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
            )}

            {/* カメラワーク選択 */}
            {imageUrl && (
              <div className="mt-8 border-t border-[#404040] pt-6">
                <CameraWorkSelector value={cameraWork} onChange={setCameraWork} videoProvider={videoProvider} />
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <Button
                onClick={() => {
                  setStep(2);
                  if (imageUrl && storySuggestions.length === 0) {
                    handleSuggestStories();
                  }
                }}
                disabled={!imageUrl}
              >
                次へ
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Prompt Preview & Edit */}
        {step === 2 && (
          <div className="rounded-xl bg-[#2a2a2a] border border-[#404040] p-8">
            <h2 className="text-xl font-semibold text-white">
              2. プロンプトをプレビュー・編集
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              日本語プロンプトを確認し、英語に翻訳してAPIに送信します
            </p>

            {/* 画像プレビュー */}
            <div className="mt-6 flex gap-6">
              {imagePreview && (
                <div className="w-32 shrink-0">
                  <div className="aspect-[9/16] overflow-hidden rounded-lg border border-[#404040]">
                    <img
                      src={imagePreview}
                      alt="Selected"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="mt-2 text-xs text-center text-gray-500">
                    {subjectType === 'person' ? '人物' : subjectType === 'object' ? '物体' : 'アニメーション'} / {videoProvider === 'runway' ? 'Runway' : videoProvider === 'piapi_kling' ? 'Kling' : videoProvider === 'veo' ? 'Veo' : videoProvider === 'hailuo' ? 'HailuoAI' : 'DomoAI'}
                  </p>
                </div>
              )}

              <div className="flex-1 space-y-6">
                {/* 日本語プロンプト */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#fce300]" />
                      日本語プロンプト
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSuggestStories}
                      disabled={suggestingStories || !imageUrl}
                      className="border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white"
                    >
                      {suggestingStories ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      再生成
                    </Button>
                  </div>

                  {suggestingStories ? (
                    <div className="flex items-center justify-center py-12 rounded-lg bg-[#1a1a1a]">
                      <Loader2 className="h-6 w-6 animate-spin text-[#fce300]" />
                      <span className="ml-2 text-sm text-gray-400">
                        AIがプロンプトを生成中...
                      </span>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={japanesePrompt}
                        onChange={(e) => {
                          setJapanesePrompt(e.target.value);
                          setEnglishPrompt("");  // 日本語が変わったら英語はクリア
                        }}
                        placeholder="AIがプロンプトを生成します。編集も可能です。"
                        rows={4}
                        maxLength={500}
                        className="w-full resize-none rounded-lg border border-[#404040] bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none focus:ring-1 focus:ring-[#fce300]"
                      />
                      <div className="mt-1 flex justify-between text-xs text-gray-500">
                        <span>自由に編集できます</span>
                        <span>{japanesePrompt.length}/500</span>
                      </div>
                    </>
                  )}
                </div>

                {/* 翻訳ボタン */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={handleTranslate}
                    disabled={!japanesePrompt || translating}
                    className="px-6 border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white"
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
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-2">
                    英語プロンプト（APIに送信）
                  </label>
                  <textarea
                    value={englishPrompt}
                    onChange={(e) => setEnglishPrompt(e.target.value)}
                    placeholder="上の「英語に翻訳」ボタンで翻訳されます"
                    rows={5}
                    className="w-full resize-none rounded-lg border border-[#404040] bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none focus:ring-1 focus:ring-[#fce300]"
                  />
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>翻訳後も編集可能です</span>
                    <span>{englishPrompt.length}文字</span>
                  </div>
                  {englishPrompt && (
                    <p className="mt-2 text-xs text-[#00bdb6] flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      {subjectType === 'animation' && animationTemplate
                        ? `${animationTemplate} アニメーションテンプレートが適用されています`
                        : `${subjectType === 'person' ? '人物' : '物体'}用 ${videoProvider === 'runway' ? 'Runway' : videoProvider === 'piapi_kling' ? 'Kling' : videoProvider === 'veo' ? 'Veo' : videoProvider === 'hailuo' ? 'HailuoAI' : 'DomoAI'}テンプレートが適用されています`
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 他の提案（折りたたみ） */}
            {storySuggestions.length > 1 && (
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-medium text-gray-400 hover:text-[#fce300]">
                  他のAI提案を見る ({storySuggestions.length - 1}件)
                </summary>
                <div className="mt-3 space-y-2">
                  {storySuggestions
                    .filter((s) => s !== japanesePrompt)
                    .map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setJapanesePrompt(suggestion);
                          setEnglishPrompt("");
                        }}
                        className="w-full rounded-lg border border-[#404040] p-3 text-left transition-colors hover:border-[#fce300] hover:bg-[#fce300]/10"
                      >
                        <p className="text-sm text-white">
                          {suggestion}
                        </p>
                      </button>
                    ))}
                </div>
              </details>
            )}

            <div className="mt-8 flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white">
                <ChevronLeft className="mr-2 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!englishPrompt}
                className="bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0"
              >
                次へ
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Options & Generate */}
        {step === 3 && (
          <div className="rounded-xl bg-[#2a2a2a] border border-[#404040] p-8">
            <h2 className="text-xl font-semibold text-white">
              3. オプション設定
            </h2>

            {/* 選択した画像とプロンプトのプレビュー */}
            <div className="mt-6 flex gap-6 rounded-lg bg-[#1a1a1a] p-4">
              {imagePreview && (
                <div className="w-24 shrink-0">
                  <div className="aspect-[9/16] overflow-hidden rounded-lg border border-[#404040]">
                    <img
                      src={imagePreview}
                      alt="Selected"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              )}
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-500">
                  英語プロンプト（{videoProvider === 'runway' ? 'Runway' : videoProvider === 'piapi_kling' ? 'Kling' : videoProvider === 'veo' ? 'Veo' : videoProvider === 'hailuo' ? 'HailuoAI' : 'DomoAI'}テンプレート適用済み）
                </p>
                <p className="mt-1 text-sm text-white line-clamp-4">{englishPrompt}</p>
              </div>
            </div>

            {/* BGM */}
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-gray-400" />
                <label className="text-sm font-medium text-gray-300">
                  BGM（任意）
                </label>
              </div>

              {/* カスタムBGMアップロード */}
              <div className="mt-3">
                <label
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 transition-colors",
                    customBgmUrl
                      ? "border-[#fce300] bg-[#fce300]/10"
                      : "border-[#505050] hover:border-[#606060]"
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!customBgmUrl && !uploadingBgm) {
                      e.currentTarget.classList.add("border-[#fce300]", "bg-[#fce300]/10");
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!customBgmUrl) {
                      e.currentTarget.classList.remove("border-[#fce300]", "bg-[#fce300]/10");
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!customBgmUrl) {
                      e.currentTarget.classList.remove("border-[#fce300]", "bg-[#fce300]/10");
                    }
                    const file = e.dataTransfer.files?.[0];
                    if (!file || uploadingBgm) return;

                    setCustomBgmFile(file);
                    setUploadingBgm(true);
                    setSelectedBgm(null);

                    try {
                      const result = await videosApi.uploadBgm(file);
                      setCustomBgmUrl(result.bgm_url);
                    } catch (error) {
                      console.error("BGM upload failed:", error);
                      alert("BGMのアップロードに失敗しました");
                      setCustomBgmFile(null);
                    } finally {
                      setUploadingBgm(false);
                    }
                  }}
                >
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      setCustomBgmFile(file);
                      setUploadingBgm(true);
                      setSelectedBgm(null); // プリセットの選択を解除

                      try {
                        const result = await videosApi.uploadBgm(file);
                        setCustomBgmUrl(result.bgm_url);
                      } catch (error) {
                        console.error("BGM upload failed:", error);
                        alert("BGMのアップロードに失敗しました");
                        setCustomBgmFile(null);
                      } finally {
                        setUploadingBgm(false);
                      }
                    }}
                    disabled={uploadingBgm}
                  />
                  {uploadingBgm ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-[#fce300]" />
                      <span className="text-sm text-gray-400">アップロード中...</span>
                    </>
                  ) : customBgmUrl ? (
                    <>
                      <Check className="h-5 w-5 text-[#fce300]" />
                      <span className="text-sm text-[#fce300]">
                        {customBgmFile?.name || "カスタムBGM"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setCustomBgmFile(null);
                          setCustomBgmUrl(null);
                        }}
                        className="ml-2 text-gray-500 hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-gray-500" />
                      <span className="text-sm text-gray-400">
                        クリックまたはドラッグ&ドロップ（MP3, WAV, M4A）
                      </span>
                    </>
                  )}
                </label>
              </div>

              {/* プリセットBGM */}
              {!customBgmUrl && bgmList.length > 0 && (
                <>
                  <p className="mt-4 text-xs text-gray-400">または、プリセットから選択</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {bgmList.map((bgm) => (
                      <button
                        key={bgm.id}
                        onClick={() =>
                          setSelectedBgm(selectedBgm === bgm.id ? null : bgm.id)
                        }
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          selectedBgm === bgm.id
                            ? "border-[#fce300] bg-[#fce300]/10"
                            : "border-[#404040] hover:border-[#505050]"
                        )}
                      >
                        <p className="text-sm font-medium text-white">
                          {bgm.name}
                        </p>
                        <p className="text-xs text-gray-400">{bgm.mood}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Overlay Text */}
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <Type className="h-5 w-5 text-gray-400" />
                <label className="text-sm font-medium text-gray-300">
                  テキストオーバーレイ（任意）
                </label>
              </div>
              <input
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                placeholder="動画に表示するテキスト"
                maxLength={100}
                className="mt-2 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-4 py-2 text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none focus:ring-1 focus:ring-[#fce300]"
              />
            </div>

            {/* Summary */}
            <div className="mt-8 rounded-lg bg-[#1a1a1a] border border-[#404040] p-4">
              <h3 className="text-sm font-medium text-white">
                生成内容の確認
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-400">
                <li>・ プロンプト: {englishPrompt.slice(0, 50)}{englishPrompt.length > 50 ? '...' : ''}</li>
                <li>・ 被写体タイプ: {
                  subjectType === 'person' ? '人物（ポートレート向け）' :
                  subjectType === 'object' ? '物体（料理・商品向け）' :
                  `アニメーション（${animationCategory === '2d' ? '2D' : '3D'} - ${animationTemplate}）`
                }</li>
                <li>・ アスペクト比: {aspectRatio === '9:16' ? '縦長 (9:16)' : '横長 (16:9)'}</li>
                <li>・ 動画生成エンジン: {videoProvider === 'runway' ? 'Runway' : videoProvider === 'piapi_kling' ? 'Kling' : videoProvider === 'veo' ? 'Veo' : videoProvider === 'hailuo' ? 'HailuoAI' : 'DomoAI'}</li>
                <li>
                  ・ BGM:{" "}
                  {customBgmUrl
                    ? customBgmFile?.name || "カスタムBGM"
                    : selectedBgm
                      ? bgmList.find((b) => b.id === selectedBgm)?.name
                      : "なし"}
                </li>
                <li>・ テキスト: {overlayText || "なし"}</li>
                <li>・ カメラワーク: {
                  cameraWork.preset === 'custom' && cameraWork.customCameraWork
                    ? cameraWork.customCameraWork.label
                    : CAMERA_PRESETS.find((p) => p.id === cameraWork.preset)?.label || cameraWork.preset
                }</li>
              </ul>
            </div>

            <div className="mt-8 flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white">
                <ChevronLeft className="mr-2 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="min-w-[160px] bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成開始中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    動画を生成
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
          </>
        )}
      </main>

      {/* 画像ライブラリ選択モーダル */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#2a2a2a] rounded-xl border border-[#404040] p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">ライブラリから画像を選択</h3>
              <button
                onClick={() => setShowLibraryModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingLibrary ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-[#fce300]" />
                </div>
              ) : libraryImages.length === 0 && libraryScreenshots.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                  <p className="text-gray-400">ライブラリに画像がありません</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* ライブラリ画像 */}
                  {libraryImages.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-3">ライブラリ画像</h4>
                      <div className="grid grid-cols-4 gap-3">
                        {libraryImages.map((img) => (
                          <button
                            key={img.id}
                            onClick={() => handleSelectFromLibrary(img.image_url)}
                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-[#404040] hover:border-[#fce300] transition-colors group"
                          >
                            <img
                              src={img.thumbnail_url || img.image_url}
                              alt={img.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                              <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-1 px-2">
                              <p className="text-[10px] text-gray-300 truncate">{img.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* スクリーンショット（生成元画像） */}
                  {libraryScreenshots.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-3">生成元画像</h4>
                      <div className="grid grid-cols-4 gap-3">
                        {libraryScreenshots.map((shot) => (
                          <button
                            key={shot.id}
                            onClick={() => handleSelectFromLibrary(shot.image_url)}
                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-[#404040] hover:border-[#fce300] transition-colors group"
                          >
                            <img
                              src={shot.image_url}
                              alt={shot.title || "生成元画像"}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                              <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-1 px-2">
                              <p className="text-[10px] text-gray-300 truncate">{shot.title || "元画像"}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#404040] mt-4">
              <button
                onClick={() => setShowLibraryModal(false)}
                className="w-full px-4 py-2 rounded-lg border border-[#404040] text-gray-300 hover:bg-[#333333] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
