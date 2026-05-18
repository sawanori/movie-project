import { describe, it, expect } from 'vitest'
import { TTS_EMOTION_PRESETS } from './tts-emotion-presets'

describe('TTS_EMOTION_PRESETS', () => {
  it('should have exactly 6 presets', () => {
    expect(TTS_EMOTION_PRESETS).toHaveLength(6)
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
})
