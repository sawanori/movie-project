'use client'

import {
  PRIORITY_OPTIONS,
  getBestProvider,
  type ProviderMetadata,
  type RoutingPriority,
} from '@/lib/types/provider-metadata'

interface ModelSelectorProps {
  providers: ProviderMetadata[]
  selectedProvider?: string
  priority: RoutingPriority
  onProviderSelect: (name: string) => void
  onPriorityChange: (priority: RoutingPriority) => void
  loading?: boolean
}

export function ModelSelector({
  providers,
  selectedProvider,
  priority,
  onProviderSelect,
  onPriorityChange,
  loading,
}: ModelSelectorProps) {
  if (loading) {
    return (
      <div data-testid="model-selector-loading" className="space-y-3">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      </div>
    )
  }

  const bestProvider = getBestProvider(providers, priority)
  const autoSelectName = bestProvider?.name

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PRIORITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPriorityChange(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              priority === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div
          data-testid="provider-item-auto"
          data-selected={selectedProvider === undefined ? 'true' : 'false'}
          onClick={() => {
            if (autoSelectName) {
              onProviderSelect(autoSelectName)
            }
          }}
          className={`cursor-pointer rounded border p-3 transition-colors ${
            selectedProvider === undefined
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && autoSelectName) {
              onProviderSelect(autoSelectName)
            }
          }}
        >
          <div className="font-medium">自動選択</div>
          {autoSelectName && (
            <div className="mt-0.5 text-xs text-gray-500">
              {priority === 'quality' ? '品質' : priority === 'speed' ? '速度' : 'コスト'}優先:{' '}
              {autoSelectName}
            </div>
          )}
        </div>

        {providers.map((provider) => {
          const isSelected = selectedProvider === provider.name
          return (
            <div
              key={provider.name}
              data-testid={`provider-item-${provider.name}`}
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => onProviderSelect(provider.name)}
              className={`cursor-pointer rounded border p-3 transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onProviderSelect(provider.name)
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{provider.name}</span>
                <span className="text-xs text-gray-500">{provider.provider}</span>
              </div>
              <div className="mt-1.5 flex gap-4 text-xs text-gray-600">
                <span>品質: {provider.quality_score}</span>
                <span>速度: {provider.speed_score}</span>
                <span>コスト: {provider.cost_per_second}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
