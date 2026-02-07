"use client";

import { useState, useEffect } from "react";
import { X, Plus, User, Palette, Package, Sparkles, Shirt, Loader2, ImageIcon, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ReferenceImage,
  ReferenceImagePurpose,
  REFERENCE_IMAGE_PURPOSES,
  ImageProvider,
  getProviderMaxReferenceImages,
  supportsReferenceImage,
} from "@/lib/constants/image-generation";
import { libraryApi, LibraryImage, Screenshot } from "@/lib/api/client";

interface ReferenceImageSelectorProps {
  value: ReferenceImage[];
  onChange: (images: ReferenceImage[]) => void;
  imageProvider: ImageProvider;
  availableImages?: { url: string; label: string }[];  // 既存カットから選択可能な画像
  disabled?: boolean;
  className?: string;
}

type TabType = "library" | "url";

// 用途に対応するアイコン
const purposeIcons: Record<ReferenceImagePurpose, React.ReactNode> = {
  character: <User className="w-3 h-3" />,
  style: <Palette className="w-3 h-3" />,
  product: <Package className="w-3 h-3" />,
  clothing: <Shirt className="w-3 h-3" />,
  general: <Sparkles className="w-3 h-3" />,
};

export function ReferenceImageSelector({
  value,
  onChange,
  imageProvider,
  availableImages = [],
  disabled,
  className,
}: ReferenceImageSelectorProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState<ReferenceImagePurpose>("general");
  const [imageUrl, setImageUrl] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("library");

  // Library images and screenshots state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const maxImages = getProviderMaxReferenceImages(imageProvider);
  const canAddMore = value.length < maxImages;
  const providerSupportsRef = supportsReferenceImage(imageProvider);

  // Load library images when modal opens
  useEffect(() => {
    if (showAddModal) {
      loadLibraryImages();
    }
  }, [showAddModal]);

  const loadLibraryImages = async () => {
    setIsLoadingLibrary(true);
    setLibraryError(null);
    try {
      const response = await libraryApi.listAll({ page: 1, per_page: 50, source_filter: "all" });
      setLibraryImages(response.library_images || []);
      setScreenshots(response.screenshots || []);
    } catch (err) {
      console.error("Failed to load library images:", err);
      setLibraryError("ライブラリの読み込みに失敗しました");
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleAddImage = () => {
    if (!imageUrl.trim()) return;

    const newImage: ReferenceImage = {
      url: imageUrl.trim(),
      purpose: selectedPurpose,
    };

    onChange([...value, newImage]);
    setImageUrl("");
    setShowAddModal(false);
  };

  const handleSelectExisting = (url: string) => {
    if (value.length >= maxImages) return;

    const newImage: ReferenceImage = {
      url,
      purpose: selectedPurpose,
    };

    onChange([...value, newImage]);
    setShowAddModal(false);
  };

  const handleSelectLibraryImage = (image: LibraryImage) => {
    if (value.length >= maxImages) return;

    const newImage: ReferenceImage = {
      url: image.image_url,
      purpose: selectedPurpose,
    };

    onChange([...value, newImage]);
    setShowAddModal(false);
  };

  const handleSelectScreenshot = (screenshot: Screenshot) => {
    if (value.length >= maxImages) return;

    const newImage: ReferenceImage = {
      url: screenshot.image_url,
      purpose: selectedPurpose,
    };

    onChange([...value, newImage]);
    setShowAddModal(false);
  };

  const handleRemoveImage = (index: number) => {
    const newImages = value.filter((_, i) => i !== index);
    onChange(newImages);
  };

  const handleChangePurpose = (index: number, purpose: ReferenceImagePurpose) => {
    const newImages = [...value];
    newImages[index] = { ...newImages[index], purpose };
    onChange(newImages);
  };

  // プロバイダーが参照画像をサポートしていない場合は非表示
  if (!providerSupportsRef) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          参照画像（オプション）
        </label>
        <span className="text-xs text-zinc-500">
          {value.length} / {maxImages} 枚
        </span>
      </div>

      {/* 選択済み参照画像 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((img, index) => (
            <div
              key={index}
              className="relative group w-20 h-20 rounded-lg overflow-hidden border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <img
                src={img.url}
                alt={`参照画像 ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder-image.png";
                }}
              />
              {/* 用途バッジ */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                <select
                  value={img.purpose}
                  onChange={(e) => handleChangePurpose(index, e.target.value as ReferenceImagePurpose)}
                  disabled={disabled}
                  className="w-full text-[10px] bg-transparent text-zinc-300 border-none outline-none cursor-pointer"
                >
                  {REFERENCE_IMAGE_PURPOSES.map((p) => (
                    <option key={p.value} value={p.value} className="bg-zinc-800">
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* 削除ボタン */}
              <button
                onClick={() => handleRemoveImage(index)}
                disabled={disabled}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 追加ボタン */}
      {canAddMore && !disabled && (
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-400 hover:border-zinc-500 text-zinc-500 hover:text-zinc-600 dark:border-zinc-600 dark:hover:border-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          参照画像を追加
        </button>
      )}

      {/* 追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 w-full max-w-lg mx-4 space-y-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">参照画像を追加</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 用途選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">用途</label>
              <div className="grid grid-cols-2 gap-2">
                {REFERENCE_IMAGE_PURPOSES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setSelectedPurpose(p.value)}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-sm transition-all",
                      selectedPurpose === p.value
                        ? "border-[#fce300] bg-[#fce300]/10 text-white"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    )}
                  >
                    {purposeIcons[p.value]}
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                {REFERENCE_IMAGE_PURPOSES.find((p) => p.value === selectedPurpose)?.description}
              </p>
            </div>

            {/* タブ切り替え */}
            <div className="flex border-b border-zinc-700">
              <button
                onClick={() => setActiveTab("library")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "library"
                    ? "border-purple-500 text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-300"
                )}
              >
                <ImageIcon className="w-4 h-4" />
                ライブラリから選択
              </button>
              <button
                onClick={() => setActiveTab("url")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "url"
                    ? "border-purple-500 text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-300"
                )}
              >
                <Link className="w-4 h-4" />
                URLで指定
              </button>
            </div>

            {/* タブコンテンツ */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {activeTab === "library" && (
                <div className="space-y-3">
                  {isLoadingLibrary ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  ) : libraryError ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-red-400">{libraryError}</p>
                      <button
                        onClick={loadLibraryImages}
                        className="mt-2 text-sm text-purple-400 hover:text-purple-300"
                      >
                        再試行
                      </button>
                    </div>
                  ) : libraryImages.length === 0 && screenshots.length === 0 ? (
                    <div className="text-center py-8">
                      <ImageIcon className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                      <p className="text-sm text-zinc-500">ライブラリに画像がありません</p>
                    </div>
                  ) : (
                    <>
                      {/* ライブラリ画像 */}
                      {libraryImages.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-zinc-400">ライブラリ画像</label>
                          <div className="grid grid-cols-4 gap-2">
                            {libraryImages.map((img) => (
                              <button
                                key={img.id}
                                onClick={() => handleSelectLibraryImage(img)}
                                className="relative aspect-square rounded-lg overflow-hidden border-2 border-zinc-700 hover:border-purple-500 transition-colors group"
                              >
                                <img
                                  src={img.thumbnail_url || img.image_url}
                                  alt={img.name}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                  <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-0.5 px-1">
                                  <p className="text-[9px] text-zinc-300 truncate">{img.name}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* スクリーンショット（元画像） */}
                      {screenshots.length > 0 && (
                        <div className="space-y-2 pt-3 border-t border-zinc-700">
                          <label className="text-xs font-medium text-zinc-400">生成元画像</label>
                          <div className="grid grid-cols-4 gap-2">
                            {screenshots.map((shot) => (
                              <button
                                key={shot.id}
                                onClick={() => handleSelectScreenshot(shot)}
                                className="relative aspect-square rounded-lg overflow-hidden border-2 border-zinc-700 hover:border-purple-500 transition-colors group"
                              >
                                <img
                                  src={shot.image_url}
                                  alt={shot.title || "元画像"}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                  <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-0.5 px-1">
                                  <p className="text-[9px] text-zinc-300 truncate">{shot.title || "元画像"}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* 既存カットから選択（availableImagesがある場合） */}
                  {availableImages.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-zinc-700">
                      <label className="text-xs font-medium text-zinc-400">既存カットから選択</label>
                      <div className="flex flex-wrap gap-2">
                        {availableImages.map((img, index) => (
                          <button
                            key={index}
                            onClick={() => handleSelectExisting(img.url)}
                            className="relative w-14 h-14 rounded-lg overflow-hidden border border-zinc-700 hover:border-[#fce300] transition-colors"
                          >
                            <img
                              src={img.url}
                              alt={img.label}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "url" && (
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">画像URL</label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-[#fce300]"
                    />
                    <p className="text-xs text-zinc-500">
                      公開されている画像のURLを入力してください
                    </p>
                  </div>

                  {/* URLプレビュー */}
                  {imageUrl && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">プレビュー</label>
                      <div className="w-32 h-32 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800">
                        <img
                          src={imageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleAddImage}
                    disabled={!imageUrl.trim()}
                    className="w-full px-4 py-2 rounded-lg bg-[#fce300] text-black font-medium hover:bg-[#fce300]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    追加
                  </button>
                </div>
              )}
            </div>

            {/* フッターボタン */}
            <div className="pt-3 border-t border-zinc-700">
              <button
                onClick={() => setShowAddModal(false)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
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
