"use client"

import { useState, useRef } from "react"
import { lipSyncApi } from "@/lib/api/client"

interface VideoUploaderProps {
  onVideoUploaded: (videoUrl: string, durationSeconds?: number) => void
  accept?: string
  maxSizeMB?: number
}

export function VideoUploader({
  onVideoUploaded,
  accept = "video/mp4,video/webm,video/quicktime",
  maxSizeMB = 500,
}: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const maxBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxBytes) {
      setError(`ファイルサイズが大きすぎます。${maxSizeMB}MB以下のファイルを選択してください。`)
      return
    }

    setError(null)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const result = await lipSyncApi.uploadVideo(formData)
      setUploadedUrl(result.video_url)
      onVideoUploaded(result.video_url, result.duration)
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました")
    } finally {
      setUploading(false)
    }
  }

  const handleClickUploadArea = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClickUploadArea}
        onKeyDown={(e) => e.key === "Enter" && handleClickUploadArea()}
        className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 transition-colors"
      >
        <p className="text-sm text-gray-300">動画ファイルをアップロード</p>
        <p className="text-xs text-gray-500">MP4 / WebM / MOV · 最大 {maxSizeMB}MB · 5分以内</p>
        <input
          ref={fileInputRef}
          data-testid="video-file-input"
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {uploading && (
        <p className="text-sm text-blue-400">アップロード中...</p>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-md">{error}</p>
      )}

      {uploadedUrl && !uploading && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">アップロード完了</span>
          <video src={uploadedUrl} controls className="w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
