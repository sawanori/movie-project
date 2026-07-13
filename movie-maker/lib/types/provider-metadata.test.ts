import { describe, it, expect } from 'vitest'
import {
  PRIORITY_OPTIONS,
  getBestProvider,
  type ProviderMetadata,
} from './provider-metadata'

describe('ProviderMetadata', () => {
  it('should accept valid ProviderMetadata object', () => {
    const provider: ProviderMetadata = {
      name: 'runway-gen3',
      provider: 'runway',
      capabilities: ['text-to-video', 'image-to-video'],
      quality_score: 90,
      speed_score: 60,
      cost_per_second: 70,
      max_duration: 10,
      supported_aspect_ratios: ['16:9', '9:16'],
    }

    expect(provider.name).toBe('runway-gen3')
    expect(provider.provider).toBe('runway')
    expect(provider.capabilities).toEqual(['text-to-video', 'image-to-video'])
    expect(provider.quality_score).toBe(90)
    expect(provider.speed_score).toBe(60)
    expect(provider.cost_per_second).toBe(70)
    expect(provider.max_duration).toBe(10)
    expect(provider.supported_aspect_ratios).toEqual(['16:9', '9:16'])
  })
})

describe('PRIORITY_OPTIONS', () => {
  it('should have exactly 3 options with correct values', () => {
    expect(PRIORITY_OPTIONS).toHaveLength(3)

    const values = PRIORITY_OPTIONS.map((opt) => opt.value)
    expect(values).toContain('quality')
    expect(values).toContain('speed')
    expect(values).toContain('cost')
  })
})

describe('getBestProvider', () => {
  const providers: ProviderMetadata[] = [
    {
      name: 'provider-a',
      provider: 'a',
      capabilities: [],
      quality_score: 90,
      speed_score: 40,
      cost_per_second: 80,
      max_duration: 5,
      supported_aspect_ratios: ['16:9'],
    },
    {
      name: 'provider-b',
      provider: 'b',
      capabilities: [],
      quality_score: 60,
      speed_score: 90,
      cost_per_second: 30,
      max_duration: 5,
      supported_aspect_ratios: ['16:9'],
    },
    {
      name: 'provider-c',
      provider: 'c',
      capabilities: [],
      quality_score: 75,
      speed_score: 70,
      cost_per_second: 50,
      max_duration: 5,
      supported_aspect_ratios: ['16:9'],
    },
  ]

  it('should return null when providers array is empty', () => {
    const result = getBestProvider([], 'quality')
    expect(result).toBeNull()
  })

  it('should return provider with highest quality when priority is quality', () => {
    const result = getBestProvider(providers, 'quality')
    expect(result?.name).toBe('provider-a')
  })

  it('should return provider with highest speed when priority is speed', () => {
    const result = getBestProvider(providers, 'speed')
    expect(result?.name).toBe('provider-b')
  })

  it('should return provider with lowest cost when priority is cost', () => {
    const result = getBestProvider(providers, 'cost')
    expect(result?.name).toBe('provider-b')
  })
})
