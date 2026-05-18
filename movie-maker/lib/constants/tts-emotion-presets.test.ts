import { describe, it, expect } from 'vitest'
import { TTS_EMOTION_PRESETS } from './tts-emotion-presets'

describe('TTS_EMOTION_PRESETS', () => {
  it('should have exactly 7 presets', () => {
    expect(TTS_EMOTION_PRESETS).toHaveLength(7)
  })

  it('should contain all expected emotion keys', () => {
    const keys = TTS_EMOTION_PRESETS.map((p) => p.key)
    expect(keys).toContain('joy')
    expect(keys).toContain('sadness')
    expect(keys).toContain('anger')
    expect(keys).toContain('surprise')
    expect(keys).toContain('calm')
    expect(keys).toContain('confusion')
  })

  it('each preset should have non-empty English instructions', () => {
    for (const preset of TTS_EMOTION_PRESETS) {
      expect(preset.instructions).toBeTruthy()
      // instructions は英語固定 (ASCII 文字が主体)
      expect(/[a-zA-Z]/.test(preset.instructions)).toBe(true)
    }
  })

  it('each preset should have an emoji', () => {
    for (const preset of TTS_EMOTION_PRESETS) {
      expect(preset.emoji).toBeTruthy()
    }
  })

  it('each preset should have a Japanese label', () => {
    for (const preset of TTS_EMOTION_PRESETS) {
      expect(preset.labelJa).toBeTruthy()
    }
  })

  it('pro_intonation preset exists with correct key, emoji, and label', () => {
    const preset = TTS_EMOTION_PRESETS.find((p) => p.key === 'pro_intonation')
    expect(preset).toBeDefined()
    expect(preset?.emoji).toBe('🎭')
    expect(preset?.labelJa).toBe('プロ抑揚')
  })

  it('pro_intonation instructions contains theatrical or voice actor', () => {
    const preset = TTS_EMOTION_PRESETS.find((p) => p.key === 'pro_intonation')
    expect(preset).toBeDefined()
    const instructions = preset?.instructions ?? ''
    const containsKeyword =
      instructions.toLowerCase().includes('theatrical') ||
      instructions.toLowerCase().includes('voice actor')
    expect(containsKeyword).toBe(true)
  })

  it('all presets have instructions within 150-220 characters', () => {
    for (const preset of TTS_EMOTION_PRESETS) {
      const len = preset.instructions.length
      expect(len).toBeGreaterThanOrEqual(150)
      expect(len).toBeLessThanOrEqual(220)
    }
  })

  it('all presets contain at least 2 intonation axis keywords', () => {
    const keywords = [
      'intonation',
      'pitch',
      'pause',
      'pace',
      'emphasis',
      'rhythm',
      'stress',
      'peak',
      'low',
      'high',
    ]
    for (const preset of TTS_EMOTION_PRESETS) {
      const text = preset.instructions.toLowerCase()
      const matchCount = keywords.filter((kw) => text.includes(kw)).length
      expect(matchCount).toBeGreaterThanOrEqual(2)
    }
  })
})
