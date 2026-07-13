"use client"

interface T2VModeToggleProps {
  mode: 'i2v' | 't2v'
  onChange: (mode: 'i2v' | 't2v') => void
  disabled?: boolean
}

export function T2VModeToggle({ mode, onChange, disabled }: T2VModeToggleProps) {
  const handleClick = (selectedMode: 'i2v' | 't2v') => {
    if (disabled) return
    onChange(selectedMode)
  }

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        role="button"
        data-active={mode === 'i2v' ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => handleClick('i2v')}
        className={[
          'flex-1 px-4 py-2 text-sm font-medium transition-colors',
          mode === 'i2v'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        画像から生成
      </button>
      <button
        type="button"
        role="button"
        data-active={mode === 't2v' ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => handleClick('t2v')}
        className={[
          'flex-1 px-4 py-2 text-sm font-medium transition-colors',
          mode === 't2v'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        テキストから生成
      </button>
    </div>
  )
}
