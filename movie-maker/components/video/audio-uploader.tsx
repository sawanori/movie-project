"use client"

import { useState, useRef } from "react"
import { lipSyncApi } from "@/lib/api/client"

interface AudioUploaderProps {
  onAudioUploaded: (audioUrl: string, durationSeconds?: number) => void
  accept?: string
  maxSizeMB?: number
}

export function AudioUploader({
  onAudioUploaded,
  accept = "audio/*",
  maxSizeMB = 50,
}: AudioUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = async (file: File) => {
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

      const result = await lipSyncApi.uploadAudio(formData)
      setUploadedUrl(result.audio_url)
      onAudioUploaded(result.audio_url, result.duration_seconds)
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
        <p className="text-sm text-gray-300">音声ファイルをドラッグ&ドロップ / クリックして選択</p>
        <p className="text-xs text-gray-500">{accept} · 最大 {maxSizeMB}MB</p>
        <input
          ref={fileInputRef}
          data-testid="audio-file-input"
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
          <audio src={uploadedUrl} controls className="w-full" />
        </div>
      )}
    </div>
  )
}
