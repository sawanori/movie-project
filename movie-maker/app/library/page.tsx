"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { libraryApi, LibraryImage, Screenshot } from "@/lib/api/client";
import { LibraryImageGeneratorModal } from "@/components/library/library-image-generator-modal";
import { LibraryImageDetailModal } from "@/components/library/library-image-detail-modal";
import { Loader2, ImagePlus, ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";

type ImageCategory = "character" | "background" | "product" | "general";
type UnifiedImage = LibraryImage | (Screenshot & { source: "screenshot" });

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [images, setImages] = useState<UnifiedImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<ImageCategory | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<"all" | "library" | "screenshot">("all");
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<UnifiedImage | null>(null);

  const perPage = 20;
  const totalPages = Math.ceil(total / perPage);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await libraryApi.listAll({
        page,
        per_page: perPage,
        source_filter: sourceFilter,
        category: categoryFilter,
      });

      // ライブラリ画像とスクリーンショットを統合
      const libraryImages: UnifiedImage[] = res.library_images || [];
      const screenshots: UnifiedImage[] = (res.screenshots || []).map(s => ({ ...s, source: "screenshot" as const }));

      let allImages: UnifiedImage[] = [];
      if (sourceFilter === "all") {
        allImages = [...libraryImages, ...screenshots];
      } else if (sourceFilter === "library") {
        allImages = libraryImages;
      } else {
        allImages = screenshots;
      }

      setImages(allImages);
      const totalLib = res.total_library || 0;
      const totalScreenshots = res.total_screenshots || 0;
      setTotal(sourceFilter === "all" ? totalLib + totalScreenshots :
               sourceFilter === "library" ? totalLib : totalScreenshots);
    } catch (error) {
      console.error("Failed to load images:", error);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter, categoryFilter]);

  const handleImageSaved = useCallback(() => {
    // Refresh the list after saving
    loadImages();
    // Reset to first page and show library items
    setPage(1);
    setSourceFilter("library");
  }, [loadImages]);

  useEffect(() => {
    if (user) {
      loadImages();
    }
  }, [user, loadImages]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const categoryOptions: Array<{ value: ImageCategory | undefined; label: string }> = [
    { value: undefined, label: "全て" },
    { value: "character", label: "キャラ" },
    { value: "background", label: "背景" },
    { value: "product", label: "商品" },
    { value: "general", label: "その他" },
  ];

  const sourceOptions: Array<{ value: "all" | "library" | "screenshot"; label: string }> = [
    { value: "all", label: "全て" },
    { value: "library", label: "生成・アップロード" },
    { value: "screenshot", label: "スクショ" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              画像ライブラリ
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              全{total}件の画像
            </p>
          </div>
          <Button onClick={() => setShowGeneratorModal(true)}>
            <ImagePlus className="h-4 w-4 mr-2" />
            画像を生成
          </Button>
        </div>

        {/* フィルタ */}
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 self-center">
              カテゴリ:
            </span>
            {categoryOptions.map((option) => (
              <button
                key={option.label}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  categoryFilter === option.value
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                }`}
                onClick={() => {
                  setCategoryFilter(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 self-center">
              ソース:
            </span>
            {sourceOptions.map((option) => (
              <button
                key={option.value}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  sourceFilter === option.value
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                }`}
                onClick={() => {
                  setSourceFilter(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 画像グリッド */}
        {loading ? (
          <div className="mt-12 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : images.length === 0 ? (
          <div className="mt-12 rounded-xl border-2 border-dashed border-zinc-200 p-12 text-center dark:border-zinc-800">
            <ImageIcon className="mx-auto h-12 w-12 text-zinc-400" />
            <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
              画像がありません
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              画像を生成またはアップロードしてください
            </p>
            <Button className="mt-4" onClick={() => setShowGeneratorModal(true)}>
              <ImagePlus className="h-4 w-4 mr-2" />
              画像を生成
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {images.map((image) => {
                const isScreenshot = "source_video_url" in image;
                const imageName = isScreenshot
                  ? (image.title || "スクリーンショット")
                  : image.name;
                const imageSource = isScreenshot
                  ? "スクショ"
                  : image.source === "generated" ? "生成" : "アップロード";

                const handleImageClick = () => {
                  setSelectedImage(image);
                  setShowDetailModal(true);
                };

                return (
                  <div
                    key={image.id}
                    onClick={handleImageClick}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900 cursor-pointer card-hover"
                  >
                    <img
                      src={image.image_url}
                      alt={imageName}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-sm font-medium text-white truncate">
                          {imageName}
                        </p>
                        <p className="text-xs text-zinc-300">
                          {imageSource}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ページネーション */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Image Generator Modal */}
      <LibraryImageGeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        onImageSaved={handleImageSaved}
      />

      {/* Image Detail Modal */}
      <LibraryImageDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedImage(null);
        }}
        image={selectedImage}
        onImageUpdated={loadImages}
        onImageDeleted={loadImages}
      />
    </div>
  );
}
