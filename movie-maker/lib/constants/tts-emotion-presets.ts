/**
 * TTS 感情プリセット定義
 *
 * gpt-4o-mini-tts の instructions パラメータで使用する 6 プリセット。
 * instructions は英語固定 (英語の方が gpt-4o-mini-tts の解釈精度が高い)。
 */

export interface TTSEmotionPreset {
  key: 'joy' | 'sadness' | 'anger' | 'surprise' | 'calm' | 'confusion';
  emoji: string;
  labelJa: string;
  instructions: string;
}

export const TTS_EMOTION_PRESETS: TTSEmotionPreset[] = [
  {
    key: 'joy',
    emoji: '😊',
    labelJa: '喜び',
    instructions:
      'Speak with bright, cheerful enthusiasm. Use rising intonation and convey happiness and warmth.',
  },
  {
    key: 'sadness',
    emoji: '😢',
    labelJa: '悲しみ',
    instructions:
      'Speak softly with a slower pace and downward intonation. Convey sadness and melancholy without being melodramatic.',
  },
  {
    key: 'anger',
    emoji: '😠',
    labelJa: '怒り',
    instructions:
      'Speak with firm, sharp delivery and emphatic pauses. Convey controlled anger and frustration.',
  },
  {
    key: 'surprise',
    emoji: '😲',
    labelJa: '驚き',
    instructions:
      'Speak with sudden rising intonation and emphatic stress. Convey genuine surprise and astonishment.',
  },
  {
    key: 'calm',
    emoji: '😌',
    labelJa: '落ち着き',
    instructions:
      'Speak with calm, even tone and steady pace. Convey serene composure and gentle reassurance.',
  },
  {
    key: 'confusion',
    emoji: '😕',
    labelJa: '困惑',
    instructions:
      'Speak with hesitant pauses and uncertain intonation. Convey confusion and bewilderment, as if thinking aloud.',
  },
]
