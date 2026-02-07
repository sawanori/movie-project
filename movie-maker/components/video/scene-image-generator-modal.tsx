"use client";

import { useState, useCallback, useEffect } from "react";
import { sceneImageApi, GenerateSceneImageResponse, libraryApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageProviderSelector } from "@/components/ui/image-provider-selector";
import type { ImageProvider } from "@/lib/constants/image-generation";
import {
  X,
  Loader2,
  RefreshCw,
  Check,
  Sparkles,
  AlertCircle,
  Save,
} from "lucide-react";

interface SceneImageGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** カットの脚本（日本語） - 必須入力 */
  descriptionJa: string;
  /** カットのセリフ（オプション） */
  dialogue?: string;
  /** アスペクト比 */
  aspectRatio: "9:16" | "16:9";
  /** 画像確認後のコールバック */
  onImageConfirmed: (imageUrl: string, promptJa: string, promptEn: string) => void;
  /** 初期画像（既に生成済みの画像がある場合） */
  initialImage?: {
    imageUrl: string;
    promptJa: string;
    promptEn: string;
  };
  /** 画像プロバイダー（オプション、指定しない場合はモーダル内で選択可能） */
  imageProvider?: ImageProvider;
  /** プロバイダー変更時のコールバック */
  onProviderChange?: (provider: ImageProvider) => void;
}

export function SceneImageGeneratorModal({
  isOpen,
  onClose,
  descriptionJa,
  dialogue,
  aspectRatio,
  onImageConfirmed,
  initialImage,
  imageProvider: externalImageProvider,
  onProviderChange,
}: SceneImageGeneratorModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GenerateSceneImageResponse | null>(null);
  const [internalImageProvider, setInternalImageProvider] = useState<ImageProvider>("nanobanana");
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  // 外部から制御される場合はそちらを優先、そうでなければ内部State
  const imageProvider = externalImageProvider ?? internalImageProvider;
  const handleProviderChange = (provider: ImageProvider) => {
    setInternalImageProvider(provider);
    onProviderChange?.(provider);
  };

  // 初期画像がある場合はセット
  useEffect(() => {
    if (isOpen && initialImage && !generatedImage) {
      setGeneratedImage({
        image_url: initialImage.imageUrl,
        generated_prompt_ja: initialImage.promptJa,
        generated_prompt_en: initialImage.promptEn,
        // 初期画像の場合は以下の情報が不足しているため、デフォルト値を設定
        r2_key: '',
        width: 0,
        height: 0,
        aspect_ratio: aspectRatio,
        image_provider: imageProvider,
      });
    }
  }, [isOpen, initialImage, generatedImage, aspectRatio, imageProvider]);

  // 画像生成処理
  const handleGenerateImage = useCallback(async () => {
    if (!descriptionJa && !dialogue) {
      setError("脚本またはセリフが必要です");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await sceneImageApi.generate({
        description_ja: descriptionJa || undefined,
        dialogue: dialogue || undefined,
        aspect_ratio: aspectRatio,
        image_provider: imageProvider,
      });
      setGeneratedImage(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "画像生成に失敗しました";
      setError(message);
      console.error("Image generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [descriptionJa, dialogue, aspectRatio, imageProvider]);

  // 画像を確認して次へ進む
  const handleConfirm = useCallback(() => {
    if (!generatedImage) return;
    onImageConfirmed(
      generatedImage.image_url,
      generatedImage.generated_prompt_ja,
      generatedImage.generated_prompt_en
    );
    // 状態をリセット（onCloseは親で呼ばれる）
    setGeneratedImage(null);
    setError(null);
    setIsGenerating(false);
  }, [generatedImage, onImageConfirmed]);

  // ライブラリ保存処理
  const handleSaveToLibrary = useCallback(async () => {
    if (!generatedImage || !generatedImage.r2_key) {
      setError('この画像はライブラリに保存できません（r2_keyが不足しています）');
      return;
    }

    setIsSavingToLibrary(true);
    try {
      await libraryApi.saveFromGeneration({
        image_url: generatedImage.image_url,
        r2_key: generatedImage.r2_key,
        width: generatedImage.width,
        height: generatedImage.height,
        aspect_ratio: generatedImage.aspect_ratio,
        image_provider: generatedImage.image_provider,
        generated_prompt_ja: generatedImage.generated_prompt_ja,
        generated_prompt_en: generatedImage.generated_prompt_en,
        name: `生成画像_${new Date().toLocaleDateString('ja-JP')}`,
        category: 'general',
      });
      setSavedToLibrary(true);
    } catch (error) {
      console.error('Failed to save to library:', error);
      setError(error instanceof Error ? error.message : 'ライブラリへの保存に失敗しました');
    } finally {
      setIsSavingToLibrary(false);
    }
  }, [generatedImage]);

  // 閉じる処理（生成画像があれば自動保存）
  const handleClose = useCallback(() => {
    // 生成画像がある場合は自動保存してから閉じる
    if (generatedImage) {
      // onImageConfirmed内でモーダルも閉じられるため、onCloseは呼ばない
      onImageConfirmed(
        generatedImage.image_url,
        generatedImage.generated_prompt_ja,
        generatedImage.generated_prompt_en
      );
      // 状態リセット（コンポーネントはアンマウントされるが念のため）
      setGeneratedImage(null);
      setError(null);
      setIsGenerating(false);
      setSavedToLibrary(false);
    } else {
      // 画像がない場合は単純にクローズ
      setGeneratedImage(null);
      setError(null);
      setIsGenerating(false);
      setSavedToLibrary(false);
      onClose();
    }
  }, [generatedImage, onImageConfirmed, onClose]);

  // モーダルが閉じられたときに状態をリセット
  useEffect(() => {
    if (!isOpen) {
      setGeneratedImage(null);
      setError(null);
      setIsGenerating(false);
      setSavedToLibrary(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              画像を生成
            </h2>
            <p className="text-sm text-zinc-400">
              脚本から画像を生成します
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 画像生成モデル選択 */}
          <ImageProviderSelector
            value={imageProvider}
            onChange={handleProviderChange}
            disabled={isGenerating}
          />

          {/* 入力情報表示 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                脚本
              </label>
              <p className="text-sm text-zinc-300 bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap">
                {descriptionJa || <span className="text-zinc-500 italic">（なし）</span>}
              </p>
            </div>
            {dialogue && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  セリフ
                </label>
                <p className="text-sm text-zinc-300 bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap">
                  {dialogue}
                </p>
              </div>
            )}
          </div>

          {/* 生成中の表示 */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
              <p className="text-sm text-zinc-400">画像を生成中...</p>
              <p className="text-xs text-zinc-500 mt-1">約10〜20秒かかります</p>
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium">エラーが発生しました</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* 生成された画像のプレビュー */}
          {generatedImage && !isGenerating && (
            <div className="space-y-4">
              {/* 画像プレビュー */}
              <div className="flex justify-center">
                <div
                  className={cn(
                    "overflow-hidden rounded-xl border border-zinc-700 shadow-lg",
                    aspectRatio === "9:16" ? "aspect-[9/16] w-48" : "aspect-[16/9] w-full max-w-sm"
                  )}
                >
                  <img
                    src={generatedImage.image_url}
                    alt="Generated scene"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* 生成プロンプト（折りたたみ） */}
              <details className="text-sm">
                <summary className="cursor-pointer text-zinc-400 hover:text-blue-400">
                  生成プロンプトを表示
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">日本語</label>
                    <p className="text-xs text-zinc-400 bg-zinc-800 rounded p-2">
                      {generatedImage.generated_prompt_ja}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">英語</label>
                    <p className="text-xs text-zinc-400 bg-zinc-800 rounded p-2">
                      {generatedImage.generated_prompt_en}
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* アクションボタン */}
          <div className="space-y-3 pt-4">
            <div className="flex gap-3">
              {/* 生成/再生成/再試行 */}
              {generatedImage ? (
                <Button
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={isGenerating}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", isGenerating && "animate-spin")} />
                  再生成
                </Button>
              ) : error ? (
                <Button
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={isGenerating}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  再試行
                </Button>
              ) : !isGenerating ? (
                <Button
                  onClick={handleGenerateImage}
                  disabled={isGenerating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  画像を生成
                </Button>
              ) : null}

              {/* 確認ボタン */}
              {generatedImage && (
                <Button
                  onClick={handleConfirm}
                  disabled={isGenerating}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="mr-2 h-4 w-4" />
                  この画像を使用
                </Button>
              )}
            </div>

            {/* ライブラリ保存ボタン */}
            {generatedImage && generatedImage.r2_key && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveToLibrary}
                  disabled={isSavingToLibrary || savedToLibrary}
                  className="w-full border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSavingToLibrary ? '保存中...' : savedToLibrary ? 'ライブラリに保存済み' : 'ライブラリに保存'}
                </Button>
                {savedToLibrary && (
                  <p className="text-sm text-green-500 text-center">✓ ライブラリに保存しました</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
