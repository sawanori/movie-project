"use client";

import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Check, X, ZoomIn, ZoomOut } from "lucide-react";

interface ImageCropperProps {
  imageSrc: string;
  aspectRatio?: number;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
}

// Helper function to create cropped image
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  // Set canvas size to the cropped area
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas is empty"));
        }
      },
      "image/jpeg",
      0.95
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

export function ImageCropper({
  imageSrc,
  aspectRatio = 9 / 16,
  onCropComplete,
  onCancel,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropCompleteCallback = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedBlob);
    } catch (error) {
      console.error("Failed to crop image:", error);
      alert("画像のトリミングに失敗しました");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative flex h-[90vh] w-full max-w-lg flex-col rounded-xl bg-zinc-900 p-4">
        {/* Header */}
        <div className="mb-4 text-center">
          <h3 className="text-lg font-semibold text-white">
            画像をトリミング
          </h3>
          <p className="text-sm text-zinc-400">
            9:16の縦型動画用にトリミングしてください
          </p>
        </div>

        {/* Cropper */}
        <div className="relative flex-1 overflow-hidden rounded-lg">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteCallback}
            objectFit="contain"
            showGrid={true}
            style={{
              containerStyle: {
                backgroundColor: "#18181b",
              },
            }}
          />
        </div>

        {/* Zoom controls */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
            className="rounded-full bg-zinc-800 p-2 text-white hover:bg-zinc-700"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 w-32 cursor-pointer appearance-none rounded-lg bg-zinc-700"
          />
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            className="rounded-full bg-zinc-800 p-2 text-white hover:bg-zinc-700"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
            onClick={onCancel}
            disabled={isProcessing}
          >
            <X className="mr-2 h-4 w-4" />
            キャンセル
          </Button>
          <Button
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? (
              "処理中..."
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                トリミング確定
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
