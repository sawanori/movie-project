"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Upload, Loader2, ImageIcon, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  libraryApi,
  screenshotsApi,
  videosApi,
  type LibraryImage,
  type Screenshot,
} from "@/lib/api/client";

interface UnifiedImagePickerProps {
  onSelect: (
    imageUrl: string,
    metadata?: {
      source: "library" | "screenshot" | "upload";
      id?: string;
      name?: string;
    }
  ) => void;
  selectedImageUrl?: string;
  aspectRatio?: "9:16" | "16:9";
  className?: string;
}

type TabType = "upload" | "library" | "screenshot";

export function UnifiedImagePicker({
  onSelect,
  selectedImageUrl,
  aspectRatio = "9:16",
  className,
}: UnifiedImagePickerProps) {
  const [activeTab, setActiveTab] = useState<TabType>("upload");

  // Upload tab state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  // Library tab state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryHasNext, setLibraryHasNext] = useState(false);

  // Screenshot tab state
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);
  const [screenshotsPage, setScreenshotsPage] = useState(1);
  const [screenshotsTotal, setScreenshotsTotal] = useState(0);

  const loadLibraryImages = useCallback(async (page = 1) => {
    setLibraryLoading(true);
    try {
      const response = await libraryApi.list({
        page,
        per_page: 20,
      });

      if (page === 1) {
        setLibraryImages(response.images);
      } else {
        setLibraryImages((prev) => [...prev, ...response.images]);
      }
      setLibraryPage(page);
      setLibraryHasNext(response.has_next);
    } catch (error) {
      console.error("Failed to load library images:", error);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadScreenshots = useCallback(async (page = 1) => {
    setScreenshotsLoading(true);
    try {
      const response = await screenshotsApi.list(page, 20);
      if (page === 1) {
        setScreenshots(response.screenshots);
      } else {
        setScreenshots((prev) => [...prev, ...response.screenshots]);
      }
      setScreenshotsPage(page);
      setScreenshotsTotal(response.total);
    } catch (error) {
      console.error("Failed to load screenshots:", error);
    } finally {
      setScreenshotsLoading(false);
    }
  }, []);

  // Load library images when library tab is activated
  useEffect(() => {
    if (activeTab === "library" && libraryImages.length === 0) {
      loadLibraryImages();
    }
  }, [activeTab, libraryImages.length, loadLibraryImages]);

  // Load screenshots when screenshot tab is activated
  useEffect(() => {
    if (activeTab === "screenshot" && screenshots.length === 0) {
      loadScreenshots();
    }
  }, [activeTab, screenshots.length, loadScreenshots]);

  const handleFileSelect = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("ファイルサイズが10MBを超えています");
      return;
    }

    setUploadingFile(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const uploadRes = await videosApi.uploadImage(file);
      onSelect(uploadRes.image_url, {
        source: "upload",
        name: file.name,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`画像のアップロードに失敗しました: ${message}`);
      setUploadPreview(null);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleLibraryImageSelect = useCallback(
    (image: LibraryImage) => {
      onSelect(image.image_url, {
        source: "library",
        id: image.id,
        name: image.name,
      });
    },
    [onSelect]
  );

  const handleScreenshotSelect = useCallback(
    (screenshot: Screenshot) => {
      onSelect(screenshot.image_url, {
        source: "screenshot",
        id: screenshot.id,
        name: screenshot.title || undefined,
      });
    },
    [onSelect]
  );

  const aspectClass =
    aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]";

  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Tab Navigation */}
      <div className="flex rounded-lg bg-zinc-800 p-1">
        <button
          onClick={() => setActiveTab("upload")}
          className={cn(
            "flex-1 rounded-md py-2 px-4 text-sm font-medium transition-all",
            activeTab === "upload"
              ? "bg-zinc-700 text-white shadow-sm"
              : "text-zinc-400 hover:text-white"
          )}
          aria-label="アップロードタブ"
        >
          <Upload className="inline-block w-4 h-4 mr-2" />
          アップロード
        </button>
        <button
          onClick={() => setActiveTab("library")}
          className={cn(
            "flex-1 rounded-md py-2 px-4 text-sm font-medium transition-all",
            activeTab === "library"
              ? "bg-zinc-700 text-white shadow-sm"
              : "text-zinc-400 hover:text-white"
          )}
          aria-label="ライブラリタブ"
        >
          <ImageIcon className="inline-block w-4 h-4 mr-2" />
          ライブラリ
        </button>
        <button
          onClick={() => setActiveTab("screenshot")}
          className={cn(
            "flex-1 rounded-md py-2 px-4 text-sm font-medium transition-all",
            activeTab === "screenshot"
              ? "bg-zinc-700 text-white shadow-sm"
              : "text-zinc-400 hover:text-white"
          )}
          aria-label="スクリーンショットタブ"
        >
          <Camera className="inline-block w-4 h-4 mr-2" />
          スクリーンショット
        </button>
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {/* Upload Tab */}
        {activeTab === "upload" && (
          <div className="space-y-4">
            {uploadPreview ? (
              <div className="relative mx-auto max-w-md">
                <div
                  className={cn(
                    "relative overflow-hidden rounded-xl border border-zinc-700",
                    aspectClass
                  )}
                >
                  <img
                    src={uploadPreview}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                  {uploadingFile && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <label
                className="mx-auto flex max-w-md cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-600 py-16 transition-colors hover:border-blue-500"
                aria-label="ドラッグ&ドロップ または クリックでファイルを選択"
              >
                <Upload className="h-12 w-12 text-zinc-500" />
                <p className="mt-4 text-sm font-medium text-zinc-400">
                  ドラッグ&ドロップ または クリックでファイルを選択
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  JPEG, PNG, WebP (最大10MB)
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* Library Tab */}
        {activeTab === "library" && (
          <div className="space-y-4">
            {libraryLoading && libraryImages.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-zinc-400">読み込み中...</span>
              </div>
            ) : libraryImages.length === 0 ? (
              <div className="text-center py-12 text-zinc-400">
                <p>ライブラリに画像がありません</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {libraryImages.map((image) => (
                    <div
                      key={image.id}
                      onClick={() => handleLibraryImageSelect(image)}
                      className={cn(
                        "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                        selectedImageUrl === image.image_url
                          ? "border-blue-500 ring-2 ring-blue-500"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <div className={cn("relative", aspectClass)}>
                        <Image
                          src={image.thumbnail_url || image.image_url}
                          alt={image.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 25vw"
                          unoptimized
                        />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <p className="text-xs text-white truncate">
                          {image.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {libraryHasNext && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => loadLibraryImages(libraryPage + 1)}
                      disabled={libraryLoading}
                      className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                    >
                      {libraryLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          読み込み中...
                        </>
                      ) : (
                        "さらに読み込む"
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Screenshot Tab */}
        {activeTab === "screenshot" && (
          <div className="space-y-4">
            {screenshotsLoading && screenshots.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-zinc-400">読み込み中...</span>
              </div>
            ) : screenshots.length === 0 ? (
              <div className="text-center py-12 text-zinc-400">
                <p>スクリーンショットがありません</p>
                <p className="text-xs mt-1 text-zinc-500">
                  動画再生中に「スクリーンショット」ボタンを押すと保存できます
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {screenshots.map((screenshot) => (
                    <div
                      key={screenshot.id}
                      onClick={() => handleScreenshotSelect(screenshot)}
                      className={cn(
                        "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                        selectedImageUrl === screenshot.image_url
                          ? "border-blue-500 ring-2 ring-blue-500"
                          : "border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <div className={cn("relative", aspectClass)}>
                        <Image
                          src={screenshot.image_url}
                          alt={screenshot.title || "Screenshot"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 25vw"
                          unoptimized
                        />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <p className="text-xs text-white truncate">
                          {screenshot.title || "Screenshot"}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {Math.floor(screenshot.timestamp_seconds / 60)}:
                          {(screenshot.timestamp_seconds % 60)
                            .toFixed(1)
                            .padStart(4, "0")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {screenshotsPage * 20 < screenshotsTotal && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => loadScreenshots(screenshotsPage + 1)}
                      disabled={screenshotsLoading}
                      className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                    >
                      {screenshotsLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          読み込み中...
                        </>
                      ) : (
                        "さらに読み込む"
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
