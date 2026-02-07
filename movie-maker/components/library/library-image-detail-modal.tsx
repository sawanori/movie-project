"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Save, Loader2, Calendar, Ruler, Tag, Image as ImageIcon, Sparkles, FileText, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { libraryApi, LibraryImage, Screenshot } from "@/lib/api/client";

type ImageCategory = "character" | "background" | "product" | "general";

// Union type for both library images and screenshots
type DetailImage = LibraryImage | (Screenshot & { source?: "screenshot" });

interface LibraryImageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: DetailImage | null;
  onImageUpdated: () => void;
  onImageDeleted: () => void;
}

const categoryOptions: Array<{ value: ImageCategory; label: string }> = [
  { value: "character", label: "キャラクター" },
  { value: "background", label: "背景" },
  { value: "product", label: "商品" },
  { value: "general", label: "その他" },
];

const sourceLabels: Record<string, string> = {
  generated: "AI生成",
  uploaded: "アップロード",
  screenshot: "スクリーンショット",
};

// Type guard to check if image is a LibraryImage
function isLibraryImage(image: DetailImage): image is LibraryImage {
  return "r2_key" in image;
}

export function LibraryImageDetailModal({
  isOpen,
  onClose,
  image,
  onImageUpdated,
  onImageDeleted,
}: LibraryImageDetailModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ImageCategory>("general");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLibrary = image ? isLibraryImage(image) : false;

  // Initialize form when image changes
  useEffect(() => {
    if (image) {
      if (isLibraryImage(image)) {
        setName(image.name || "");
        setDescription(image.description || "");
        setCategory(image.category || "general");
      } else {
        setName(image.title || "");
        setDescription("");
        setCategory("general");
      }
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [image]);

  if (!isOpen || !image) return null;

  const libraryImage = isLibrary ? (image as LibraryImage) : null;
  const screenshotImage = !isLibrary ? (image as Screenshot) : null;

  const hasChanges = isLibrary && libraryImage
    ? name !== (libraryImage.name || "") ||
      description !== (libraryImage.description || "") ||
      category !== (libraryImage.category || "general")
    : false;

  const handleSave = async () => {
    if (!hasChanges || !libraryImage) return;

    setIsSaving(true);
    setError(null);

    try {
      await libraryApi.update(libraryImage.id, {
        name: name || undefined,
        description: description || undefined,
        category,
      });
      onImageUpdated();
      onClose();
    } catch (err) {
      console.error("Failed to update image:", err);
      setError("画像の更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!image) return;

    setIsDeleting(true);
    setError(null);

    try {
      if (isLibrary && libraryImage) {
        await libraryApi.delete(libraryImage.id);
      } else {
        // スクリーンショット（video_generationsの元画像）を削除
        await libraryApi.deleteSourceImage(image.id);
      }
      onImageDeleted();
      onClose();
    } catch (err) {
      console.error("Failed to delete image:", err);
      setError("画像の削除に失敗しました");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "不明";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get display values based on image type
  const displayName = isLibrary ? libraryImage?.name : screenshotImage?.title || "スクリーンショット";
  const displaySource = isLibrary ? libraryImage?.source : "screenshot";
  const displayWidth = isLibrary ? libraryImage?.width : screenshotImage?.width;
  const displayHeight = isLibrary ? libraryImage?.height : screenshotImage?.height;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">画像の詳細</h2>
            {!isLibrary && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                スクリーンショット
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className={`grid gap-6 p-6 ${isLibrary ? "md:grid-cols-2" : ""}`}>
            {/* Image Preview */}
            <div className="space-y-4">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-800">
                <img
                  src={image.image_url}
                  alt={displayName || "画像"}
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Image Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {displayWidth && displayHeight && displayWidth > 0 && displayHeight > 0 && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Ruler className="h-4 w-4" />
                    <span>{displayWidth} × {displayHeight}px</span>
                  </div>
                )}
                {isLibrary && libraryImage?.aspect_ratio && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <ImageIcon className="h-4 w-4" />
                    <span>{libraryImage.aspect_ratio}</span>
                  </div>
                )}
                {isLibrary && libraryImage?.file_size_bytes && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <FileText className="h-4 w-4" />
                    <span>{formatFileSize(libraryImage.file_size_bytes)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-zinc-400">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(image.created_at)}</span>
                </div>
              </div>

              {/* Source & Provider */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {isLibrary ? (
                    <Tag className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <Camera className="h-4 w-4 text-zinc-500" />
                  )}
                  <span className="text-sm text-zinc-400">ソース:</span>
                  <span className="text-sm font-medium text-white">
                    {sourceLabels[displaySource || ""] || displaySource}
                  </span>
                </div>
                {isLibrary && libraryImage?.image_provider && (
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">プロバイダー:</span>
                    <span className="text-sm font-medium text-white">
                      {libraryImage.image_provider}
                    </span>
                  </div>
                )}
              </div>

              {/* Generated Prompts (Library images only) */}
              {isLibrary && (libraryImage?.generated_prompt_ja || libraryImage?.generated_prompt_en) && (
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-300">生成プロンプト</h4>
                  {libraryImage.generated_prompt_ja && (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">日本語</p>
                      <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3 leading-relaxed">
                        {libraryImage.generated_prompt_ja}
                      </p>
                    </div>
                  )}
                  {libraryImage.generated_prompt_en && (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">English</p>
                      <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3 leading-relaxed">
                        {libraryImage.generated_prompt_en}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Screenshot info */}
              {!isLibrary && screenshotImage?.source_video_url && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-300">元の動画</h4>
                  <a
                    href={screenshotImage.source_video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-400 hover:text-purple-300 underline"
                  >
                    動画を開く
                  </a>
                </div>
              )}

              {/* Delete Section for Screenshots */}
              {!isLibrary && (
                <div className="pt-4 border-t border-zinc-800">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      このスクリーンショットを削除
                    </button>
                  ) : (
                    <div className="space-y-3 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                      <p className="text-sm text-red-300">
                        本当にこのスクリーンショットを削除しますか？この操作は取り消せません。
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDelete}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              削除中...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-2" />
                              削除する
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={isDeleting}
                        >
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Edit Form (Library images only) */}
            {isLibrary && libraryImage && (
              <div className="space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    画像名
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="画像の名前を入力"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    説明
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="画像の説明を入力（任意）"
                    rows={3}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                  />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    カテゴリ
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {categoryOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setCategory(option.value)}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          category === option.value
                            ? "bg-purple-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* Delete Section */}
                <div className="pt-4 border-t border-zinc-800">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      この画像を削除
                    </button>
                  ) : (
                    <div className="space-y-3 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                      <p className="text-sm text-red-300">
                        本当にこの画像を削除しますか？この操作は取り消せません。
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDelete}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              削除中...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-2" />
                              削除する
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={isDeleting}
                        >
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            閉じる
          </Button>
          {isLibrary && (
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  変更を保存
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
