"use client"

import { useState, useEffect, useCallback } from "react"
import { lipSyncApi } from "@/lib/api/client"
import type { LipSyncResponse } from "@/lib/api/client"
import { AudioUploader } from "@/components/video/audio-uploader"
import { VideoUploader } from "@/components/video/video-uploader"
import { ImageUploader } from "@/components/video/image-uploader"
import { TTSPanel } from "@/components/video/tts-panel"

type SourceType = "image" | "video"
type SourceTab = "upload" | "url"
type AudioTab = "upload" | "tts"

export default function LipSyncStudioPage() {
  // 既定は「動画」: リップシンクの主目的は動画キャラクターの口を動かすことのため
  const [sourceType, setSourceType] = useState<SourceType>("video")
  const [sourceTab, setSourceTab] = useState<SourceTab>("upload")
  const [sourceUrl, setSourceUrl] = useState("")
  const [audioUrl, setAudioUrl] = useState("")
  const [audioTab, setAudioTab] = useState<AudioTab>("upload")
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<LipSyncResponse[]>([])

  useEffect(() => {
    lipSyncApi.list().then(setHistory).catch(() => {})
  }, [])

  const pollStatus = useCallback(async function poll(id: string): Promise<void> {
    try {
      const result = await lipSyncApi.getStatus(id)
      setProgress(result.progress)
      setStatus(result.status)

      if (result.status === "completed" && result.output_video_url) {
        setOutputVideoUrl(result.output_video_url)
        setGenerating(false)
        lipSyncApi.list().then(setHistory).catch(() => {})
      } else if (result.status === "failed") {
        setError(result.error_message || "生成に失敗しました")
        setGenerating(false)
      } else {
        setTimeout(() => poll(id), 3000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ステータスの取得に失敗しました")
      setGenerating(false)
    }
  }, [])

  const handleGenerate = async () => {
    if (!sourceUrl || !audioUrl) return

    setGenerating(true)
    setError(null)
    setOutputVideoUrl(null)
    setProgress(0)
    setStatus("processing")

    try {
      const result = await lipSyncApi.create({
        source_type: sourceType,
        source_url: sourceUrl,
        audio_url: audioUrl,
      })

      setGenerationId(result.id)

      if (result.status === "completed" && result.output_video_url) {
        setOutputVideoUrl(result.output_video_url)
        setGenerating(false)
      } else {
        pollStatus(result.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成に失敗しました")
      setGenerating(false)
    }
  }

  const handleSourceUploaded = (url: string) => {
    setSourceUrl(url)
  }

  const handleSourceTypeChange = (type: SourceType) => {
    setSourceType(type)
    // ソースタイプを切り替えたら、前のソースURLをクリア（画像URLを動画として送る等の混在を防ぐ）
    setSourceUrl("")
  }

  const handleAudioUploaded = (url: string) => {
    setAudioUrl(url)
  }

  const handleAudioGenerated = (url: string) => {
    setAudioUrl(url)
  }

  const isGenerateDisabled = !sourceUrl || !audioUrl || generating

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold">リップシンクスタジオ</h1>

        {/* Source type selector */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-300">ソースタイプ</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSourceTypeChange("image")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                sourceType === "image"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              画像
            </button>
            <button
              type="button"
              onClick={() => handleSourceTypeChange("video")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                sourceType === "video"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              動画
            </button>
          </div>

          {/* Source input mode: upload / url */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceTab("upload")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                sourceTab === "upload"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {sourceType === "image" ? "画像をアップロード" : "動画をアップロード"}
            </button>
            <button
              type="button"
              onClick={() => setSourceTab("url")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                sourceTab === "url"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              URLを入力
            </button>
          </div>

          {sourceTab === "upload" ? (
            sourceType === "video" ? (
              <VideoUploader onVideoUploaded={handleSourceUploaded} />
            ) : (
              <ImageUploader onImageUploaded={handleSourceUploaded} />
            )
          ) : (
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={sourceType === "image" ? "画像URLを入力してください" : "動画URLを入力してください"}
              className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500"
            />
          )}
        </section>

        {/* Audio section */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-300">音声</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAudioTab("upload")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                audioTab === "upload"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              音声をアップロード
            </button>
            <button
              type="button"
              onClick={() => setAudioTab("tts")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                audioTab === "tts"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              テキストから音声生成
            </button>
          </div>

          {audioTab === "upload" && (
            <AudioUploader onAudioUploaded={handleAudioUploaded} />
          )}
          {audioTab === "tts" && (
            <TTSPanel onAudioGenerated={handleAudioGenerated} />
          )}
        </section>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerateDisabled}
          className="w-full py-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-500"
        >
          {generating ? "生成中..." : "リップシンク生成"}
        </button>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-md">{error}</p>
        )}

        {/* Progress indicator */}
        {generating && generationId && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>生成中... {status}</span>
              <span>{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full bg-gray-700 rounded-full h-2"
            >
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Result video */}
        {outputVideoUrl && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-gray-300">生成結果</h2>
            <video
              data-testid="result-video"
              src={outputVideoUrl}
              controls
              className="w-full rounded-lg"
            />
          </div>
        )}

        {/* History section */}
        {history.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-gray-300">生成履歴</h2>
            <ul className="flex flex-col gap-2">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between bg-gray-800 rounded-md px-3 py-2 text-sm"
                >
                  <span className="text-gray-400 text-xs">{item.id.slice(0, 8)}...</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      item.status === "completed"
                        ? "bg-green-900/40 text-green-400"
                        : item.status === "failed"
                        ? "bg-red-900/40 text-red-400"
                        : "bg-yellow-900/40 text-yellow-400"
                    }`}
                  >
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
