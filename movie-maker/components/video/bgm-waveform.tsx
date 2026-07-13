'use client'

interface BGMWaveformProps {
  audioUrl?: string
  duration: number
  pixelsPerSecond?: number
  isPlaying?: boolean
  onPlayPause?: () => void
}

export function BGMWaveform({
  audioUrl,
  duration,
  pixelsPerSecond = 50,
  isPlaying,
  onPlayPause,
}: BGMWaveformProps) {
  const width = duration * pixelsPerSecond

  return (
    <div
      data-testid="bgm-waveform"
      style={{ width: `${width}px` }}
      className="relative h-12 bg-gray-800 border border-gray-700 rounded flex items-center px-2 gap-2 shrink-0"
    >
      {!audioUrl ? (
        <span className="text-xs text-gray-500">BGMなし</span>
      ) : (
        <>
          <button
            aria-label={isPlaying ? '停止' : '再生'}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs"
            onClick={onPlayPause}
          >
            {isPlaying ? '■' : '▶'}
          </button>

          <div className="flex-1 flex items-center gap-px overflow-hidden h-8">
            {Array.from({ length: Math.max(1, Math.floor(width / 4)) }).map((_, i) => (
              <div
                key={i}
                className="w-px bg-blue-400 shrink-0"
                style={{ height: `${20 + Math.sin(i * 0.5) * 12}px` }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
