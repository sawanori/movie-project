"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Upload,
  Loader2,
  AlertCircle,
  Download,
  Scissors,
  X,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import {
  backgroundRemovalApi,
  lipSyncApi,
  videosApi,
  type BackgroundRemovalJob,
  type BackgroundRemovalStatus,
} from "@/lib/api/client";
import { getVideoDuration } from "./get-video-duration";

type SourceType = "video" | "image";
type OutputFormat = "webm" | "prores";

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_VIDEO_SIZE_MB = 500;
const MAX_IMAGE_SIZE_MB = 20;
const MAX_VIDEO_DURATION_SEC = 60;
const POLL_INTERVAL_MS = 3000;
// fal 最大2試行 × 数分 + 60秒クリップのサーバー側ProResトランスコードを考慮して20分
const POLL_TIMEOUT_MS = 20 * 60 * 1000; // 20分
// 処理開始から3分超えたら「時間がかかることがあります」の案内を表示
const LONG_PROCESSING_NOTE_MS = 3 * 60 * 1000; // 3分

const UNSUPPORTED_TYPE_ERROR =
  "対応していないファイル形式です。動画（MP4/MOV/WebM）または画像（PNG/JPEG/WebP）をアップロードしてください。";

// 拡張子 → 標準MIMEタイプ。file.type が空・非標準のときの種別判別と、
// アップロード前のMIME正規化（バックエンドのcontent_type検証対策）に使う
const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const getExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
};

// MIME優先で判別し、空・非標準MIMEの場合は拡張子でフォールバック判別する
const detectSourceType = (file: File): SourceType | null => {
  if (VIDEO_TYPES.includes(file.type)) return "video";
  if (IMAGE_TYPES.includes(file.type)) return "image";
  const ext = getExtension(file.name);
  if (ext in VIDEO_MIME_BY_EXT) return "video";
  if (ext in IMAGE_MIME_BY_EXT) return "image";
  return null;
};

// file.type が空・非標準のままだとバックエンドのcontent_type検証で弾かれるため、
// 拡張子から標準MIMEに正規化したFileに包み直す
const normalizeFileMimeType = (file: File, sourceType: SourceType): File => {
  const ext = getExtension(file.name);
  const normalized =
    sourceType === "video" ? VIDEO_MIME_BY_EXT[ext] : IMAGE_MIME_BY_EXT[ext];
  if (!normalized || file.type === normalized) return file;
  return new File([file], file.name, { type: normalized });
};

// 透過プレビュー用チェッカーボード背景
const CHECKERBOARD_STYLE: React.CSSProperties = {
  background:
    "repeating-conic-gradient(#404040 0% 25%, #2a2a2a 0% 50%) 50% / 24px 24px",
};

const EXT_MAP: Record<BackgroundRemovalJob["output_format"], string> = {
  webm: "webm",
  prores: "mov",
  png: "png",
};

export default function BackgroundRemovalPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // 入力ファイル
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webm");

  // ジョブ
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [job, setJob] = useState<BackgroundRemovalJob | null>(null);
  const [jobStatus, setJobStatus] = useState<BackgroundRemovalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // 処理が3分を超えたときに表示する案内フラグ
  const [showLongProcessingNote, setShowLongProcessingNote] = useState(false);
  // 同じファイルでのリトライ時に再アップロードを省くためのキャッシュ
  const uploadedUrlRef = useRef<string | null>(null);

  // 未ログインはログインページへ
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setValidationError(null);
      setError(null);
      setJob(null);
      setJobStatus(null);
      setVideoDuration(null);
      uploadedUrlRef.current = null;

      if (fileRejections.length > 0) {
        setFile(null);
        setSourceType(null);
        setValidationError(UNSUPPORTED_TYPE_ERROR);
        return;
      }

      const dropped = acceptedFiles[0];
      if (!dropped) return;

      // MIMEタイプ（フォールバック: 拡張子）からソース種別を自動判別
      const detected: SourceType | null = detectSourceType(dropped);

      if (!detected) {
        setFile(null);
        setSourceType(null);
        setValidationError(UNSUPPORTED_TYPE_ERROR);
        return;
      }

      // サイズ検証（動画500MB / 画像20MB）
      const maxSizeMB = detected === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
      if (dropped.size > maxSizeMB * 1024 * 1024) {
        setFile(null);
        setSourceType(null);
        setValidationError(
          detected === "video"
            ? `動画ファイルが大きすぎます。最大${MAX_VIDEO_SIZE_MB}MBまでアップロード可能です。`
            : `画像ファイルが大きすぎます。最大${MAX_IMAGE_SIZE_MB}MBまでアップロード可能です。`
        );
        return;
      }

      // 動画は60秒以内（クライアント側でメタデータから尺を検証）
      if (detected === "video") {
        try {
          const duration = await getVideoDuration(dropped);
          if (!Number.isFinite(duration)) {
            setFile(null);
            setSourceType(null);
            setValidationError(
              "動画の長さを取得できませんでした。別のファイルをお試しください"
            );
            return;
          }
          if (duration > MAX_VIDEO_DURATION_SEC) {
            setFile(null);
            setSourceType(null);
            setValidationError(
              `動画は60秒以内にしてください（現在: ${duration.toFixed(1)}秒）`
            );
            return;
          }
          setVideoDuration(duration);
        } catch (err) {
          setFile(null);
          setSourceType(null);
          setValidationError(
            err instanceof Error
              ? err.message
              : "動画の読み込みに失敗しました。別のファイルをお試しください。"
          );
          return;
        }
      }

      setFile(dropped);
      setSourceType(detected);
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/mp4": [".mp4"],
      "video/webm": [".webm"],
      "video/quicktime": [".mov"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    multiple: false,
    disabled: uploading || processing,
  });

  const clearFile = () => {
    setFile(null);
    setSourceType(null);
    setVideoDuration(null);
    setValidationError(null);
    setError(null);
    setJob(null);
    setJobStatus(null);
    setShowLongProcessingNote(false);
    uploadedUrlRef.current = null;
  };

  // 実行: アップロード → ジョブ作成
  const handleSubmit = async () => {
    if (!file || !sourceType) return;

    setError(null);
    setJob(null);
    setJobStatus(null);
    setShowLongProcessingNote(false);

    try {
      // 1. 既存アップロードAPIでR2へ（リトライ時はキャッシュ済みURLを再利用）
      let sourceUrl = uploadedUrlRef.current;
      if (!sourceUrl) {
        setUploading(true);
        // MIMEが空・非標準のファイルはバックエンドで弾かれるため、標準MIMEに正規化して送る
        const uploadFile = normalizeFileMimeType(file, sourceType);
        if (sourceType === "video") {
          const formData = new FormData();
          formData.append("file", uploadFile);
          const res = await lipSyncApi.uploadVideo(formData);
          sourceUrl = res.video_url;
        } else {
          const res = await videosApi.uploadImage(uploadFile);
          sourceUrl = res.image_url;
        }
        uploadedUrlRef.current = sourceUrl;
        setUploading(false);
      }

      // 2. 背景削除ジョブ作成（画像は output_format 指定不可・常に透過PNG）
      setProcessing(true);
      const created = await backgroundRemovalApi.create({
        source_type: sourceType,
        source_url: sourceUrl,
        ...(sourceType === "video" ? { output_format: outputFormat } : {}),
      });
      setJob(created);
      setJobStatus({
        id: created.id,
        status: created.status,
        progress: created.progress,
        output_url: created.output_url,
      });
      if (created.status === "completed" || created.status === "failed") {
        setProcessing(false);
      }
    } catch (err) {
      setUploading(false);
      setProcessing(false);
      setError(err instanceof Error ? err.message : "背景削除の開始に失敗しました");
    }
  };

  // ステータスポーリング（3秒間隔・最大20分）
  useEffect(() => {
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") return;

    const startedAt = Date.now();

    const pollStatus = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setProcessing(false);
        setError("処理がタイムアウトしました。時間をおいて再度お試しください。");
        return;
      }
      if (elapsed > LONG_PROCESSING_NOTE_MS) {
        setShowLongProcessingNote(true);
      }
      try {
        const status = await backgroundRemovalApi.getStatus(job.id);
        setJobStatus(status);
        if (status.status === "completed" || status.status === "failed") {
          clearInterval(interval);
          setProcessing(false);
        }
      } catch (err) {
        // 一時的なネットワークエラーの可能性があるためポーリングは継続
        console.error("Failed to poll background removal status:", err);
      }
    };

    const interval = setInterval(pollStatus, POLL_INTERVAL_MS);
    pollStatus(); // 初回実行

    return () => clearInterval(interval);
  }, [job]);

  // ダウンロード（fetch → Blob → a[download]）
  const handleDownload = async () => {
    if (!job || !jobStatus?.output_url) return;

    setDownloading(true);
    try {
      const response = await fetch(jobStatus.output_url);
      if (!response.ok) {
        throw new Error(`ダウンロードに失敗しました（HTTP ${response.status}）`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bg-removed-${job.id}.${EXT_MAP[job.output_format]}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      setError("ダウンロードに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setDownloading(false);
    }
  };

  const isCompleted = jobStatus?.status === "completed" && !!jobStatus.output_url;
  const isFailed = jobStatus?.status === "failed";
  const progress = jobStatus?.progress ?? 0;
  const submitDisabled = !file || !sourceType || uploading || processing;

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* ページヘッダー */}
        <div className="mb-8">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Scissors className="h-6 w-6 text-[#fce300]" />
            背景削除
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            動画・画像の背景をAIで削除して、透過素材を作成します
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* アップロード */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-300">素材ファイル</h2>

            {file && sourceType ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-white">{file.name}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {sourceType === "video" ? "動画" : "画像"} ·{" "}
                      {(file.size / (1024 * 1024)).toFixed(1)}MB
                      {sourceType === "video" && videoDuration !== null && (
                        <> · {videoDuration.toFixed(1)}秒</>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={uploading || processing}
                    className="text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                    aria-label="ファイルをクリア"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all ${
                  isDragActive
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-zinc-600 hover:border-zinc-500 hover:bg-zinc-800/50"
                }`}
              >
                <input {...getInputProps()} data-testid="bg-removal-file-input" />
                <div className="space-y-4">
                  <Upload
                    className={`mx-auto h-12 w-12 transition-colors ${
                      isDragActive ? "text-blue-500" : "text-zinc-500"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-white">
                      {isDragActive
                        ? "ドロップしてアップロード"
                        : "動画または画像をドラッグ&ドロップ"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      またはクリックしてファイルを選択
                    </p>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-500">
                    <p>動画: MP4 / MOV / WebM（ProRes・10bit素材対応）最大{MAX_VIDEO_SIZE_MB}MB・{MAX_VIDEO_DURATION_SEC}秒以内</p>
                    <p>画像: PNG / JPEG / WebP（最大{MAX_IMAGE_SIZE_MB}MB）</p>
                  </div>
                </div>
              </div>
            )}

            {validationError && (
              <div className="flex items-start gap-2 rounded-md bg-red-900/20 px-3 py-2">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                <p className="text-sm text-red-400">{validationError}</p>
              </div>
            )}
          </section>

          {/* 出力形式（動画のみ） */}
          {sourceType === "video" && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-zinc-300">出力形式</h2>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 transition-colors has-[:checked]:border-blue-500">
                  <input
                    type="radio"
                    name="output_format"
                    value="webm"
                    checked={outputFormat === "webm"}
                    onChange={() => setOutputFormat("webm")}
                    disabled={uploading || processing}
                    className="accent-blue-500"
                  />
                  <span className="text-sm text-white">WebM（透過・Web用）</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 transition-colors has-[:checked]:border-blue-500">
                  <input
                    type="radio"
                    name="output_format"
                    value="prores"
                    checked={outputFormat === "prores"}
                    onChange={() => setOutputFormat("prores")}
                    disabled={uploading || processing}
                    className="accent-blue-500"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm text-white">ProRes 4444（編集ソフト用）</span>
                    <span className="text-xs text-zinc-500">
                      元素材の色情報（10bit以上含む）を保持して合成します
                    </span>
                  </span>
                </label>
              </div>
            </section>
          )}

          {/* 実行ボタン */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="w-full rounded-md bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading
              ? "アップロード中..."
              : processing
                ? "処理中..."
                : "背景を削除"}
          </button>

          {/* エラー */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-900/20 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 進捗バー */}
          {processing && job && !isCompleted && !isFailed && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>
                  {jobStatus?.status === "processing" ? "背景を削除しています..." : "処理を待機中..."}
                </span>
                <span>{progress}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full rounded-full bg-zinc-700"
              >
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {showLongProcessingNote && (
                <p className="text-xs text-zinc-500">
                  大きな動画やProRes出力は数分〜10分以上かかることがあります。このままお待ちください。
                </p>
              )}
            </div>
          )}

          {/* 失敗 */}
          {isFailed && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
                <div className="flex-1">
                  <p className="font-medium text-red-400">背景削除に失敗しました</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {jobStatus?.error_message || "エラーが発生しました。時間をおいて再度お試しください。"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={uploading || processing}
                className="mt-3 rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                リトライ
              </button>
            </div>
          )}

          {/* 結果 */}
          {isCompleted && job && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-zinc-300">処理結果</h2>

              {job.output_format === "prores" ? (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-6 text-center">
                  <p className="text-sm text-zinc-300">
                    ProResはブラウザでプレビューできません。ダウンロードして編集ソフトでご確認ください
                  </p>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center overflow-hidden rounded-lg"
                  style={CHECKERBOARD_STYLE}
                >
                  {job.output_format === "webm" ? (
                    <video
                      data-testid="result-video"
                      src={jobStatus!.output_url!}
                      autoPlay
                      loop
                      muted
                      playsInline
                      controls
                      className="max-h-[480px] w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      data-testid="result-image"
                      src={jobStatus!.output_url!}
                      alt="背景削除結果（透過PNG）"
                      className="max-h-[480px] w-full object-contain"
                    />
                  )}
                </div>
              )}

              {job.output_format === "webm" && (
                <p className="text-xs text-zinc-500">
                  透過プレビューはChrome/Firefox推奨（SafariはWebM透過非対応）
                </p>
              )}

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 py-3 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ダウンロード中...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    ダウンロード
                  </>
                )}
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
