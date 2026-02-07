"use client";

import { useState, useCallback, useEffect } from "react";
import { sceneImageApi, libraryApi, fluxPromptApi, type GenerateSceneImageResponse, type FluxJsonPreview } from "@/lib/api/client";
import type { ImageProvider } from "@/lib/constants/image-generation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageProviderSelector } from "@/components/ui/image-provider-selector";
import { ReferenceImageSelector } from "@/components/ui/reference-image-selector";
import type { ReferenceImage } from "@/lib/constants/image-generation";
import {
  X,
  Loader2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Check,
  Languages,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface LibraryImageGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageSaved: () => void; // callback to refresh library list
}

type LibraryCategory = "character" | "background" | "product" | "general";

const CATEGORY_OPTIONS: { value: LibraryCategory; label: string }[] = [
  { value: "general", label: "一般" },
  { value: "character", label: "キャラクター" },
  { value: "background", label: "背景" },
  { value: "product", label: "商品" },
];

export function LibraryImageGeneratorModal({
  isOpen,
  onClose,
  onImageSaved,
}: LibraryImageGeneratorModalProps) {
  const [description, setDescription] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageName, setImageName] = useState("");
  const [category, setCategory] = useState<LibraryCategory>("general");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [imageProvider, setImageProvider] = useState<ImageProvider>("nanobanana");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GenerateSceneImageResponse | null>(null);

  // FLUX.2 JSON変換用のstate
  const [convertedJsonPrompt, setConvertedJsonPrompt] = useState<string | null>(null);
  const [convertedNegativePrompt, setConvertedNegativePrompt] = useState<string | null>(null);
  const [convertedPreview, setConvertedPreview] = useState<FluxJsonPreview | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  // FLUX.2の場合は変換が必要
  const needsConversion = imageProvider === "bfl_flux2_pro";
  const isConverted = needsConversion ? (convertedJsonPrompt !== null) : true;

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDescription("");
      setNegativePrompt("");
      setImageName("");
      setCategory("general");
      setAspectRatio("9:16");
      setImageProvider("nanobanana");
      setReferenceImages([]);
      setGeneratedImage(null);
      setError(null);
      setIsGenerating(false);
      setIsSaving(false);
      setIsConverting(false);
      setConvertedJsonPrompt(null);
      setConvertedNegativePrompt(null);
      setConvertedPreview(null);
      setIsPromptExpanded(false);
    }
  }, [isOpen]);

  // プロバイダー変更時に変換結果をリセット
  useEffect(() => {
    setConvertedJsonPrompt(null);
    setConvertedNegativePrompt(null);
    setConvertedPreview(null);
  }, [imageProvider]);

  // 説明文やネガティブプロンプト変更時に変換結果をリセット（FLUX.2のみ）
  useEffect(() => {
    if (needsConversion) {
      setConvertedJsonPrompt(null);
      setConvertedNegativePrompt(null);
      setConvertedPreview(null);
    }
  }, [description, negativePrompt, needsConversion]);

  // プロンプト変換（FLUX.2用）
  const handleConvertPrompt = useCallback(async () => {
    if (!description.trim()) {
      setError("画像の説明を入力してください");
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const response = await fluxPromptApi.convert({
        description_ja: description,
        negative_prompt_ja: negativePrompt.trim() || undefined,
        aspect_ratio: aspectRatio,
      });

      setConvertedJsonPrompt(response.json_prompt);
      setConvertedNegativePrompt(response.negative_prompt_en);
      setConvertedPreview(response.preview);
      setIsPromptExpanded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "プロンプト変換に失敗しました";
      setError(message);
      console.error("Prompt conversion error:", err);
    } finally {
      setIsConverting(false);
    }
  }, [description, negativePrompt, aspectRatio]);

  // Generate image
  const handleGenerateImage = useCallback(async () => {
    if (!description.trim()) {
      setError("画像の説明を入力してください");
      return;
    }

    // FLUX.2の場合は変換が必要
    if (needsConversion && !isConverted) {
      setError("先にプロンプトを変換してください");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await sceneImageApi.generate({
        description_ja: description,
        aspect_ratio: aspectRatio,
        image_provider: imageProvider,
        reference_images: referenceImages.length > 0 ? referenceImages : undefined,
        negative_prompt: imageProvider === "bfl_flux2_pro" && convertedNegativePrompt ? convertedNegativePrompt : undefined,
      });
      setGeneratedImage(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "画像生成に失敗しました";
      setError(message);
      console.error("Image generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [description, aspectRatio, imageProvider, referenceImages, needsConversion, isConverted, convertedNegativePrompt]);

  // Save to library
  const handleSaveToLibrary = useCallback(async () => {
    console.log("[DEBUG] handleSaveToLibrary called");
    console.log("[DEBUG] generatedImage:", generatedImage);

    if (!generatedImage || !generatedImage.r2_key) {
      console.log("[DEBUG] No generated image or r2_key");
      setError("保存する画像がありません");
      return;
    }

    const finalName = imageName.trim() || `生成画像_${new Date().toLocaleDateString("ja-JP")}`;
    console.log("[DEBUG] finalName:", finalName);
    console.log("[DEBUG] category:", category);

    setIsSaving(true);
    setError(null);

    try {
      console.log("[DEBUG] Calling libraryApi.saveFromGeneration...");
      const saveData = {
        image_url: generatedImage.image_url,
        r2_key: generatedImage.r2_key,
        width: generatedImage.width,
        height: generatedImage.height,
        aspect_ratio: generatedImage.aspect_ratio,
        image_provider: generatedImage.image_provider,
        generated_prompt_ja: generatedImage.generated_prompt_ja,
        generated_prompt_en: generatedImage.generated_prompt_en,
        name: finalName,
        category,
      };
      console.log("[DEBUG] Save data:", saveData);

      const result = await libraryApi.saveFromGeneration(saveData);
      console.log("[DEBUG] Save result:", result);

      // Notify parent to refresh list
      console.log("[DEBUG] Calling onImageSaved...");
      onImageSaved();

      // Close modal
      console.log("[DEBUG] Calling onClose...");
      onClose();
    } catch (err) {
      console.error("[DEBUG] Save error:", err);
      const message = err instanceof Error ? err.message : "ライブラリへの保存に失敗しました";
      setError(message);
      console.error("Library save error:", err);
    } finally {
      setIsSaving(false);
    }
  }, [generatedImage, imageName, category, onImageSaved, onClose]);

  // Close modal
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

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
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              画像を生成してライブラリに保存
            </h2>
            <p className="text-sm text-zinc-400">
              説明文から画像を生成し、ライブラリに保存します
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
          {/* Image Provider Selection */}
          <ImageProviderSelector
            value={imageProvider}
            onChange={setImageProvider}
            disabled={isGenerating || isConverting}
          />

          {/* Description Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              画像の説明（日本語）<span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例: 青空の下でコーヒーカップを持つ笑顔の女性"
              disabled={isGenerating || isConverting}
              className="w-full h-24 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* Negative Prompt (BFL FLUX.2 only) */}
          {imageProvider === "bfl_flux2_pro" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">
                ネガティブプロンプト（日本語・オプション）
              </label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="例: ぼやけた、低品質、透かし、テキスト、醜い、変形"
                disabled={isGenerating || isConverting}
                maxLength={1000}
                className="w-full h-20 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              />
              <p className="text-xs text-zinc-500">
                生成画像から除外したい要素を日本語で記述（変換時に英語に翻訳されます）
              </p>
            </div>
          )}

          {/* Prompt Convert Button (FLUX.2 only) */}
          {imageProvider === "bfl_flux2_pro" && (
            <div className="space-y-3">
              <Button
                onClick={handleConvertPrompt}
                disabled={isGenerating || isConverting || !description.trim()}
                className={cn(
                  "w-full",
                  isConverted
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-purple-600 hover:bg-purple-700"
                )}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    変換中...
                  </>
                ) : isConverted ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    変換済み（再変換する）
                  </>
                ) : (
                  <>
                    <Languages className="mr-2 h-4 w-4" />
                    プロンプトを変換（JSON + 英語）
                  </>
                )}
              </Button>

              {/* Converted Prompts Display */}
              {isConverted && convertedJsonPrompt && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden">
                  <button
                    onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    <span className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      変換されたプロンプト
                    </span>
                    {isPromptExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {isPromptExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* JSON Preview */}
                      {convertedPreview && (
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-emerald-400">
                            JSON構造プレビュー
                          </label>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {convertedPreview.scene && (
                              <div className="bg-zinc-900 rounded p-2">
                                <span className="text-zinc-500">scene:</span>
                                <p className="text-zinc-300 mt-1">{convertedPreview.scene}</p>
                              </div>
                            )}
                            {convertedPreview.subject && (
                              <div className="bg-zinc-900 rounded p-2">
                                <span className="text-zinc-500">subject:</span>
                                <p className="text-zinc-300 mt-1">{convertedPreview.subject}</p>
                              </div>
                            )}
                            {convertedPreview.style && (
                              <div className="bg-zinc-900 rounded p-2">
                                <span className="text-zinc-500">style:</span>
                                <p className="text-zinc-300 mt-1">{convertedPreview.style}</p>
                              </div>
                            )}
                            {convertedPreview.camera && (
                              <div className="bg-zinc-900 rounded p-2">
                                <span className="text-zinc-500">camera:</span>
                                <p className="text-zinc-300 mt-1">{convertedPreview.camera}</p>
                              </div>
                            )}
                            {convertedPreview.lighting && (
                              <div className="bg-zinc-900 rounded p-2">
                                <span className="text-zinc-500">lighting:</span>
                                <p className="text-zinc-300 mt-1">{convertedPreview.lighting}</p>
                              </div>
                            )}
                            {convertedPreview.mood && (
                              <div className="bg-zinc-900 rounded p-2">
                                <span className="text-zinc-500">mood:</span>
                                <p className="text-zinc-300 mt-1">{convertedPreview.mood}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Full JSON */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-blue-400">
                          JSON Prompt (English)
                        </label>
                        <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                          {convertedJsonPrompt}
                        </pre>
                      </div>

                      {/* Negative Prompt */}
                      {convertedNegativePrompt && (
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-amber-400">
                            Negative Prompt (English)
                          </label>
                          <p className="text-xs text-zinc-400 bg-zinc-900 rounded p-3">
                            {convertedNegativePrompt}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reference Images */}
          <ReferenceImageSelector
            imageProvider={imageProvider}
            value={referenceImages}
            onChange={setReferenceImages}
            disabled={isGenerating || isConverting}
          />

          {/* Aspect Ratio Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              アスペクト比
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setAspectRatio("9:16")}
                disabled={isGenerating || isConverting}
                className={cn(
                  "flex-1 px-4 py-3 rounded-lg border-2 font-medium transition",
                  aspectRatio === "9:16"
                    ? "border-[#fce300] bg-[#fce300]/10 text-white"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500",
                  (isGenerating || isConverting) && "opacity-50 cursor-not-allowed"
                )}
              >
                9:16 (縦長)
              </button>
              <button
                onClick={() => setAspectRatio("16:9")}
                disabled={isGenerating || isConverting}
                className={cn(
                  "flex-1 px-4 py-3 rounded-lg border-2 font-medium transition",
                  aspectRatio === "16:9"
                    ? "border-[#fce300] bg-[#fce300]/10 text-white"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500",
                  (isGenerating || isConverting) && "opacity-50 cursor-not-allowed"
                )}
              >
                16:9 (横長)
              </button>
            </div>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              カテゴリ
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setCategory(option.value)}
                  disabled={isGenerating || isConverting}
                  className={cn(
                    "px-4 py-2 rounded-lg border-2 font-medium transition text-sm",
                    category === option.value
                      ? "border-[#fce300] bg-[#fce300]/10 text-white"
                      : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500",
                    (isGenerating || isConverting) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              画像の名前（オプション）
            </label>
            <input
              type="text"
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              placeholder="未入力の場合は自動で名前が付けられます"
              disabled={isGenerating || isConverting}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Generating State */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
              <p className="text-sm text-zinc-400">画像を生成中...</p>
              <p className="text-xs text-zinc-500 mt-1">
                {imageProvider === "bfl_flux2_pro" ? "約30〜60秒かかります" : "約10〜20秒かかります"}
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium">エラーが発生しました</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Generated Image Preview */}
          {generatedImage && !isGenerating && (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="flex justify-center">
                <div
                  className={cn(
                    "overflow-hidden rounded-xl border border-zinc-700 shadow-lg",
                    aspectRatio === "9:16" ? "aspect-[9/16] w-64" : "aspect-[16/9] w-full max-w-md"
                  )}
                >
                  <img
                    src={generatedImage.image_url}
                    alt="Generated image"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* Generated Prompts (Collapsible) */}
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

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            <div className="flex gap-3">
              {/* Generate/Regenerate Button */}
              {generatedImage ? (
                <Button
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={isGenerating || isSaving || isConverting || (needsConversion && !isConverted)}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", isGenerating && "animate-spin")} />
                  再生成
                </Button>
              ) : error ? (
                <Button
                  variant="outline"
                  onClick={handleGenerateImage}
                  disabled={isGenerating || isSaving || isConverting || (needsConversion && !isConverted)}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  再試行
                </Button>
              ) : !isGenerating ? (
                <Button
                  onClick={handleGenerateImage}
                  disabled={isGenerating || isSaving || isConverting || !description.trim() || (needsConversion && !isConverted)}
                  className={cn(
                    "flex-1",
                    needsConversion && !isConverted
                      ? "bg-zinc-600 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {needsConversion && !isConverted ? "先にプロンプトを変換" : "画像を生成"}
                </Button>
              ) : null}

              {/* Save to Library Button */}
              {generatedImage && (
                <Button
                  onClick={() => {
                    console.log("[DEBUG] Save button clicked!");
                    handleSaveToLibrary();
                  }}
                  disabled={isGenerating || isSaving || isConverting}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {isSaving ? "保存中..." : "ライブラリに保存"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
