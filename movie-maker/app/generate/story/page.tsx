"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { videosApi, templatesApi } from "@/lib/api/client";
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
  Eye,
  Check,
} from "lucide-react";

interface BGM {
  id: string;
  name: string;
  description: string;
  mood: string;
}

interface FramePrompt {
  frame: number;
  scene: string;
  element: string;
  action: string;
  style: string;
  full_prompt: string;
}

interface PreviewData {
  preview_id: string;
  original_image_url: string;
  story_text: string;
  base_prompt: string;
  frame_prompts: FramePrompt[];
  generated_image_urls: string[];
}

export default function StoryGeneratePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [bgmList, setBgmList] = useState<BGM[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [suggestingStories, setSuggestingStories] = useState(false);

  // Form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [storyText, setStoryText] = useState("");
  const [storySuggestions, setStorySuggestions] = useState<string[]>([]);
  const [selectedBgm, setSelectedBgm] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [filmGrain, setFilmGrain] = useState<'none' | 'light' | 'medium' | 'heavy'>('medium');
  const [useLut, setUseLut] = useState(true);

  // Preview data
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

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

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) {
      handleImageSelect(files[0]);
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
    setStoryText("");
    setPreviewData(null);
  };

  const handleSuggestStories = async () => {
    if (!imageUrl) return;

    setSuggestingStories(true);
    try {
      const res = await videosApi.suggestStories(imageUrl);
      setStorySuggestions(res.suggestions);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`ストーリー提案の取得に失敗しました: ${message}`);
    } finally {
      setSuggestingStories(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!imageUrl || !storyText) return;

    setGeneratingPreview(true);
    try {
      const res = await videosApi.createStoryPreview({
        image_url: imageUrl,
        story_text: storyText,
      });
      setPreviewData(res);
      setStep(3); // プレビュー確認画面へ
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`プレビュー生成に失敗しました: ${message}`);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleConfirmGenerate = async () => {
    if (!previewData) return;

    setConfirming(true);
    try {
      const videoRes = await videosApi.confirmStoryVideo({
        preview_id: previewData.preview_id,
        bgm_track_id: selectedBgm || undefined,
        overlay: overlayText ? { text: overlayText } : undefined,
        film_grain: filmGrain,
        use_lut: useLut,
      });

      router.push(`/generate/${videoRes.id}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`動画生成に失敗しました: ${message}`);
      setConfirming(false);
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* タイトル */}
        <div className="mb-8 text-center">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-zinc-900 dark:text-white">
            <Wand2 className="h-6 w-6 text-purple-500" />
            ストーリー動画を作成
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            1枚の画像とストーリーから、AIが自動で動画を生成します
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[
            { num: 1, label: "画像" },
            { num: 2, label: "ストーリー" },
            { num: 3, label: "確認" },
            { num: 4, label: "オプション" },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                    step >= s.num
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  )}
                >
                  {step > s.num ? <Check className="h-4 w-4" /> : s.num}
                </div>
                <span className="mt-1 text-xs text-zinc-500">{s.label}</span>
              </div>
              {idx < 3 && (
                <ChevronRight className="mx-2 h-4 w-4 text-zinc-400" />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Image Upload */}
        {step === 1 && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              1. 物語の始まりとなる画像をアップロード
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              この画像を基に、AIが物語の続きを生成します
            </p>

            <div
              onDrop={handleImageDrop}
              onDragOver={(e) => e.preventDefault()}
              className="mt-6"
            >
              {imagePreview ? (
                <div className="relative mx-auto max-w-xs">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
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
                <label className="mx-auto flex max-w-xs cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 transition-colors hover:border-purple-400 dark:border-zinc-700">
                  <Upload className="h-12 w-12 text-zinc-400" />
                  <p className="mt-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    画像をドラッグ&ドロップ
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
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
            </div>

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

        {/* Step 2: Story Selection */}
        {step === 2 && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              2. ストーリーを選択
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              AIが提案するストーリーから選ぶか、自分で入力してください
            </p>

            {/* AI提案ストーリー */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  AIからの提案
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestStories}
                  disabled={suggestingStories || !imageUrl}
                >
                  {suggestingStories ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  再提案
                </Button>
              </div>

              {suggestingStories ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                  <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">
                    AIがストーリーを考えています...
                  </span>
                </div>
              ) : storySuggestions.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {storySuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => setStoryText(suggestion)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        storyText === suggestion
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
                      )}
                    >
                      <p className="text-sm text-zinc-900 dark:text-white">
                        {suggestion}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-zinc-50 py-8 text-center dark:bg-zinc-800">
                  <p className="text-sm text-zinc-500">
                    「再提案」ボタンをクリックしてAIからの提案を取得
                  </p>
                </div>
              )}
            </div>

            {/* カスタムストーリー入力 */}
            <div className="mt-6">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                または、自分でストーリーを入力
              </label>
              <textarea
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                placeholder="例: この女性がゆっくりと振り返り、驚いた表情になる"
                rows={3}
                maxLength={200}
                className="mt-2 w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="mt-1 text-right text-xs text-zinc-400">
                {storyText.length}/200
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={handleGeneratePreview}
                disabled={!storyText || generatingPreview}
              >
                {generatingPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    プレビュー生成中...
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    プレビューを生成
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview Confirmation */}
        {step === 3 && previewData && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              3. 生成内容を確認
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              AIが生成した画像とプロンプトを確認してください
            </p>

            {/* 画像プレビュー */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                フレーム画像（3枚 → 動画生成）
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {/* フレーム1: オリジナル画像 */}
                <div className="relative">
                  <div className="aspect-[9/16] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <img
                      src={previewData.original_image_url}
                      alt="Frame 1"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="absolute bottom-2 left-2 rounded-full bg-purple-600 px-2 py-0.5 text-xs text-white">
                    フレーム1（オリジナル）
                  </div>
                </div>

                {/* フレーム2, 3: AI生成画像 */}
                {previewData.generated_image_urls.map((url, idx) => (
                  <div key={idx} className="relative">
                    <div className="aspect-[9/16] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <img
                        src={url}
                        alt={`Frame ${idx + 2}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="absolute bottom-2 left-2 rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
                      フレーム{idx + 2}（AI生成）
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* プロンプト詳細 */}
            <div className="mt-8">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                生成プロンプト（KlingAI形式）
              </h3>
              <div className="space-y-4">
                {previewData.frame_prompts.map((fp, idx) => (
                  <div key={idx} className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs text-white",
                        idx === 0 ? "bg-purple-600" : "bg-green-600"
                      )}>
                        フレーム {fp.frame}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium text-purple-600">[Scene]</span>
                        <span className="ml-2 text-zinc-700 dark:text-zinc-300">{fp.scene}</span>
                      </div>
                      <div>
                        <span className="font-medium text-blue-600">[Element]</span>
                        <span className="ml-2 text-zinc-700 dark:text-zinc-300">{fp.element}</span>
                      </div>
                      <div>
                        <span className="font-medium text-green-600">[Action]</span>
                        <span className="ml-2 text-zinc-700 dark:text-zinc-300">{fp.action}</span>
                      </div>
                      <div>
                        <span className="font-medium text-orange-600">[Style]</span>
                        <span className="ml-2 text-zinc-700 dark:text-zinc-300">{fp.style}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                ストーリーを変更
              </Button>
              <Button onClick={() => setStep(4)}>
                確認OK、オプション設定へ
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Options & Generate */}
        {step === 4 && previewData && (
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              4. オプション設定
            </h2>

            {/* BGM */}
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  BGM（任意）
                </label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {bgmList.map((bgm) => (
                  <button
                    key={bgm.id}
                    onClick={() =>
                      setSelectedBgm(selectedBgm === bgm.id ? null : bgm.id)
                    }
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      selectedBgm === bgm.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
                    )}
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {bgm.name}
                    </p>
                    <p className="text-xs text-zinc-500">{bgm.mood}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Overlay Text */}
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <Type className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  テキストオーバーレイ（任意）
                </label>
              </div>
              <input
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                placeholder="動画に表示するテキスト"
                maxLength={100}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            {/* Film Grain */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                フィルムグレイン（粒状感）
              </label>
              <select
                value={filmGrain}
                onChange={(e) => setFilmGrain(e.target.value as 'none' | 'light' | 'medium' | 'heavy')}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="none">なし - クリアな映像</option>
                <option value="light">軽め - 料理・風景向け</option>
                <option value="medium">標準</option>
                <option value="heavy">強め - 人物・ポートレート向け</option>
              </select>
            </div>

            {/* LUT (Color Grading) */}
            <div className="mt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useLut}
                  onChange={(e) => setUseLut(e.target.checked)}
                  className="h-5 w-5 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 dark:border-zinc-600 dark:bg-zinc-800"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    LUT（カラーグレーディング）
                  </span>
                  <p className="text-xs text-zinc-500">
                    シネマティックな色調補正を適用します
                  </p>
                </div>
              </label>
            </div>

            {/* Summary */}
            <div className="mt-8 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                生成内容の最終確認
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <li>・ ストーリー: {previewData.story_text}</li>
                <li>・ フレーム数: 3枚（オリジナル1枚 + AI生成2枚）</li>
                <li>
                  ・ BGM:{" "}
                  {selectedBgm
                    ? bgmList.find((b) => b.id === selectedBgm)?.name
                    : "なし"}
                </li>
                <li>・ テキスト: {overlayText || "なし"}</li>
                <li>・ フィルムグレイン: {
                  filmGrain === 'none' ? 'なし' :
                  filmGrain === 'light' ? '軽め' :
                  filmGrain === 'medium' ? '標準' : '強め'
                }</li>
                <li>・ LUT: {useLut ? 'オン' : 'オフ'}</li>
              </ul>
            </div>

            <div className="mt-8 flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={handleConfirmGenerate}
                disabled={confirming}
                className="min-w-[160px]"
              >
                {confirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    動画生成中...
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
      </main>
    </div>
  );
}
