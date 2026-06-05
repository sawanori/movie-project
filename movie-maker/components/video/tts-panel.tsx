"use client"

import { useState, useEffect } from "react"
import { ttsApi } from "@/lib/api/client"
import type { VoiceInfo } from "@/lib/api/client"
import { VoiceSelector } from "./voice-selector"

interface TTSPanelProps {
  onAudioGenerated?: (audioUrl: string, durationSeconds: number) => void
}

export function TTSPanel({ onAudioGenerated }: TTSPanelProps) {
  const [text, setText] = useState("")
  const [selectedVoiceId, setSelectedVoiceId] = useState("")
  const [speed, setSpeed] = useState(1.0)
  const [language, setLanguage] = useState<"ja" | "en">("ja")
  const [loading, setLoading] = useState(false)
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadVoices = async () => {
      try {
        setVoicesLoading(true)
        const result = await ttsApi.listVoices()
        setVoices(result)
        if (result.length > 0) {
          setSelectedVoiceId((prev) => prev || result[0].voice_id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "ボイス一覧の取得に失敗しました")
      } finally {
        setVoicesLoading(false)
      }
    }

    loadVoices()
  }, [])

  const handleGenerate = async () => {
    if (!text.trim()) return

    setLoading(true)
    setError(null)
    setAudioUrl(null)

    try {
      const response = await ttsApi.generate({
        text: text.trim(),
        voice_id: selectedVoiceId,
        language,
        speed,
      })

      if (response.audio_url && response.duration_seconds != null) {
        setAudioUrl(response.audio_url)
        onAudioGenerated?.(response.audio_url, response.duration_seconds)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "音声生成に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  const isGenerateDisabled = !text.trim() || loading

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-900 rounded-lg">
      <div className="flex flex-col gap-2">
        <label htmlFor="tts-text" className="text-sm text-gray-300 font-medium">
          ナレーションテキスト
        </label>
        <textarea
          id="tts-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="音声に変換するテキストを入力してください"
          rows={4}
          className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-gray-300 font-medium">言語</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLanguage("ja")}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              language === "ja"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            日本語
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              language === "en"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            英語
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="tts-speed" className="text-sm text-gray-300 font-medium">
          速度: {speed.toFixed(1)}x
        </label>
        <input
          id="tts-speed"
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>0.5x</span>
          <span>2.0x</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-gray-300 font-medium">ボイス</span>
        <VoiceSelector
          voices={voices}
          selectedVoiceId={selectedVoiceId}
          onSelect={setSelectedVoiceId}
          loading={voicesLoading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerateDisabled}
        className="w-full py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-500"
      >
        {loading ? "生成中..." : "音声を生成"}
      </button>

      {audioUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-300 font-medium">プレビュー</span>
          <audio
            src={audioUrl}
            controls
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
