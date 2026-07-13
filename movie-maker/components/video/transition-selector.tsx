'use client'

export type TransitionType = 'none' | 'crossfade' | 'fade_black' | 'fade_white' | 'wipe_left'

interface TransitionSelectorProps {
  selectedType: TransitionType
  duration: number
  onChange: (type: TransitionType, duration: number) => void
}

const TRANSITION_OPTIONS: { type: TransitionType; label: string; icon: string }[] = [
  { type: 'none', label: 'カット', icon: '/' },
  { type: 'crossfade', label: 'クロスフェード', icon: '◑' },
  { type: 'fade_black', label: 'フェードブラック', icon: '◼' },
  { type: 'fade_white', label: 'フェードホワイト', icon: '◻' },
  { type: 'wipe_left', label: 'ワイプ左', icon: '◁' },
]

export function TransitionSelector({
  selectedType,
  duration,
  onChange,
}: TransitionSelectorProps) {
  return (
    <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {TRANSITION_OPTIONS.map(({ type, label, icon }) => (
          <button
            key={type}
            data-selected={selectedType === type}
            className={[
              'flex flex-col items-center gap-1 p-2 rounded border text-xs',
              selectedType === type
                ? 'border-blue-500 bg-blue-900/40 text-white'
                : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700',
            ].join(' ')}
            onClick={() => onChange(type, duration)}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {selectedType !== 'none' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-400">
            デュレーション: {duration.toFixed(1)}s
          </label>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            value={duration}
            onChange={(e) => onChange(selectedType, parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
