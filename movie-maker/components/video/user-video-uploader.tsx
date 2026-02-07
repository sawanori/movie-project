"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, CheckCircle, AlertCircle, Loader2, Video } from "lucide-react";
import { userVideosApi, UserVideo } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface UserVideoUploaderProps {
  onUploadComplete?: (video: UserVideo) => void;
  onError?: (error: string) => void;
  className?: string;
  maxSizeMB?: number;
  acceptedFormats?: string[];
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function UserVideoUploader({
  onUploadComplete,
  onError,
  className,
  maxSizeMB = 50,
  acceptedFormats = ["video/mp4", "video/quicktime"],
}: UserVideoUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<UserVideo | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // クライアント側バリデーション
      if (!acceptedFormats.includes(file.type)) {
        const error = "対応していないファイル形式です。MP4またはMOVをアップロードしてください。";
        setErrorMessage(error);
        setStatus("error");
        onError?.(error);
        return;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        const error = `ファイルサイズが大きすぎます。最大${maxSizeMB}MBまでアップロード可能です。`;
        setErrorMessage(error);
        setStatus("error");
        onError?.(error);
        return;
      }

      setStatus("uploading");
      setProgress(0);
      setErrorMessage(null);

      // プログレスシミュレーション（実際のアップロードは単一リクエスト）
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      try {
        const result = await userVideosApi.upload(file);
        clearInterval(progressInterval);
        setProgress(100);
        setStatus("success");
        setUploadedVideo(result);
        onUploadComplete?.(result);
      } catch (err) {
        clearInterval(progressInterval);
        const message = err instanceof Error ? err.message : "アップロードに失敗しました";
        setErrorMessage(message);
        setStatus("error");
        onError?.(message);
      }
    },
    [acceptedFormats, maxSizeMB, onError, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
    },
    maxFiles: 1,
    disabled: status === "uploading",
  });

  const reset = () => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
    setUploadedVideo(null);
  };

  return (
    <div className={cn("w-full", className)}>
      {status === "success" && uploadedVideo ? (
        <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4">
          <div className="flex items-start gap-4">
            {uploadedVideo.thumbnail_url ? (
              <img
                src={uploadedVideo.thumbnail_url}
                alt={uploadedVideo.title}
                className="w-24 h-24 object-cover rounded"
              />
            ) : (
              <div className="w-24 h-24 bg-gray-800 rounded flex items-center justify-center">
                <Video className="w-8 h-8 text-gray-500" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 text-green-400 mb-1">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">アップロード完了</span>
              </div>
              <p className="text-white font-medium">{uploadedVideo.title}</p>
              <p className="text-gray-400 text-sm">
                {uploadedVideo.duration_seconds.toFixed(1)}秒 · {uploadedVideo.width}x{uploadedVideo.height}
              </p>
            </div>
            <button
              onClick={reset}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="別の動画をアップロード"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : status === "error" ? (
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-400 font-medium">アップロードエラー</p>
              <p className="text-gray-400 text-sm mt-1">{errorMessage}</p>
            </div>
            <button
              onClick={reset}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="再試行"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
            isDragActive
              ? "border-blue-500 bg-blue-500/10"
              : "border-gray-600 hover:border-gray-500 hover:bg-gray-800/50",
            status === "uploading" && "pointer-events-none opacity-70"
          )}
        >
          <input {...getInputProps()} />

          {status === "uploading" ? (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
              <div>
                <p className="text-white font-medium">アップロード中...</p>
                <p className="text-gray-400 text-sm mt-1">{progress}%</p>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload
                className={cn(
                  "w-12 h-12 mx-auto transition-colors",
                  isDragActive ? "text-blue-500" : "text-gray-500"
                )}
              />
              <div>
                <p className="text-white font-medium">
                  {isDragActive ? "ドロップしてアップロード" : "動画をドラッグ&ドロップ"}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  またはクリックしてファイルを選択
                </p>
              </div>
              <div className="text-gray-500 text-xs space-y-1">
                <p>対応形式: MP4, MOV</p>
                <p>最大サイズ: {maxSizeMB}MB / 最大尺: 10秒 / 最大解像度: 4K</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
