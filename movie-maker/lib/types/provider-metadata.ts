export interface ProviderMetadata {
  name: string
  provider: string
  capabilities: string[]
  quality_score: number
  speed_score: number
  cost_per_second: number
  max_duration: number
  supported_aspect_ratios: string[]
}

export type RoutingPriority = 'quality' | 'speed' | 'cost'

export const PRIORITY_OPTIONS: { value: RoutingPriority; label: string; description: string }[] = [
  { value: 'quality', label: '高品質', description: '最も品質の高いモデルを使用' },
  { value: 'speed', label: '高速', description: '最も速いモデルを使用' },
  { value: 'cost', label: 'コスト優先', description: '最もコストの低いモデルを使用' },
]

export function getBestProvider(
  providers: ProviderMetadata[],
  priority: RoutingPriority,
): ProviderMetadata | null {
  if (providers.length === 0) return null
  const sorted = [...providers].sort((a, b) => {
    if (priority === 'quality') return b.quality_score - a.quality_score
    if (priority === 'speed') return b.speed_score - a.speed_score
    return a.cost_per_second - b.cost_per_second
  })
  return sorted[0]
}
