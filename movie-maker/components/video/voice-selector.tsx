"use client"

import type { VoiceInfo } from "@/lib/api/client"

interface VoiceSelectorProps {
  voices: VoiceInfo[]
  selectedVoiceId: string
  onSelect: (voiceId: string) => void
  loading?: boolean
}

export function VoiceSelector({ voices, selectedVoiceId, onSelect, loading }: VoiceSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {voices.map((voice) => {
        const isSelected = voice.voice_id === selectedVoiceId
        return (
          <button
            key={voice.voice_id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(voice.voice_id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
              isSelected
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            <span className="font-medium">{voice.name}</span>
            {voice.language && (
              <span className="text-xs opacity-70 ml-auto">{voice.language}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
