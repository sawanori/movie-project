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
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = async (file: File) => {
    // ドラッグ&ドロップは accept 属性のフィルタを通らないため、種別をクライアント側で検証する
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"]
    if (!allowedTypes.includes(file.type)) {
      setError("動画ファイル（MP4 / WebM / MOV）を選択してください。画像を使う場合は上部で「画像」を選んでください。")
      return
    }

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
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
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging ? "border-blue-500 bg-blue-500/10" : "border-gray-600 hover:border-blue-500"
        }`}
      >
        <p className="text-sm text-gray-300">動画ファイルをドラッグ&ドロップ / クリックして選択</p>
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
