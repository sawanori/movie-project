"use client";

import { useState, useCallback } from "react";
import { X, Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ElementImagesUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
  onUpload: (file: File) => Promise<string>;
  videoProvider?: string;
}

/**
 * Kling Elements用の追加画像アップローダー
 *
 * カメラワーク時の被写体一貫性を向上させるため、
 * 同じ被写体の異なる角度の画像を最大3枚までアップロードできる。
 * Klingプロバイダー選択時のみ表示される。
 */
export function ElementImagesUploader({
  value,
  onChange,
  maxImages = 3,
  disabled,
  onUpload,
  videoProvider,
}: ElementImagesUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isKling = videoProvider === "piapi_kling" || !videoProvider;
  const canAddMore = value.length < maxImages && !disabled && isKling;

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (value.length >= maxImages) return;

    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange([...value, url]);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  }, [value, onChange, onUpload, maxImages]);

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  // ドラッグ&ドロップハンドラー
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && canAddMore) {
      setIsDragging(true);
    }
  }, [disabled, canAddMore]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || !canAddMore) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith("image/"));

    // 追加可能な枚数分だけ処理
    const remainingSlots = maxImages - value.length;
    const filesToUpload = imageFiles.slice(0, remainingSlots);

    for (const file of filesToUpload) {
      await handleFileSelect(file);
    }
  }, [disabled, canAddMore, maxImages, value.length, handleFileSelect]);

  // Kling以外は非表示
  if (!isKling) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">
          一貫性向上用の追加画像（任意）
        </label>
        <span className="text-xs text-zinc-500">
          {value.length} / {maxImages} 枚
        </span>
      </div>

      <p className="text-xs text-zinc-500">
        同じ被写体の異なる角度の画像を追加すると、カメラワーク時の一貫性が向上します。
      </p>

      <div
        className={cn(
          "flex flex-wrap gap-2 p-2 rounded-lg transition-colors",
          isDragging && "bg-zinc-800 ring-2 ring-[#fce300]/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 既存画像 */}
        {value.map((url, index) => (
          <div
            key={index}
            className="relative group w-16 h-16 rounded-lg overflow-hidden border border-zinc-700"
          >
            <img
              src={url}
              alt={`追加画像 ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => handleRemove(index)}
              disabled={disabled}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/80
                         flex items-center justify-center opacity-0 group-hover:opacity-100
                         transition-opacity"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {/* 追加ボタン（ドラッグ&ドロップエリア兼用） */}
        {canAddMore && (
          <label
            className={cn(
              "w-16 h-16 rounded-lg border-2 border-dashed border-zinc-600",
              "flex items-center justify-center cursor-pointer",
              "hover:border-zinc-500 transition-colors",
              uploading && "opacity-50 cursor-wait",
              isDragging && "border-[#fce300] bg-[#fce300]/10"
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              disabled={uploading || disabled}
            />
            {uploading ? (
              <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-5 h-5 text-zinc-500" />
            )}
          </label>
        )}
      </div>

      {value.length > 0 && (
        <p className="text-xs text-amber-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Klingプロバイダー選択時のみ有効
        </p>
      )}
    </div>
  );
}
