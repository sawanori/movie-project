/**
 * TTS 感情プリセット定義
 *
 * gpt-4o-mini-tts の instructions パラメータで使用する 7 プリセット。
 * instructions は英語固定 (英語の方が gpt-4o-mini-tts の解釈精度が高い)。
 * 各プリセットは pitch / pauses / pacing / emphasis の 4 軸を明示。
 */

export interface TTSEmotionPreset {
  key: 'joy' | 'sadness' | 'anger' | 'surprise' | 'calm' | 'confusion' | 'pro_intonation';
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
      'Speak with bright cheerful enthusiasm and rising intonation. Let pitch peak on key words. Use upbeat pacing with light rhythm. Insert a brief pause before the happiest phrase. Convey genuine happiness, never neutral.',
  },
  {
    key: 'sadness',
    emoji: '😢',
    labelJa: '悲しみ',
    instructions:
      'Speak softly, slowly, with downward falling intonation. Use long deliberate pauses (1-2 seconds) between sentences. Drop pitch low at each line end. Convey quiet grief and melancholy without becoming melodramatic.',
  },
  {
    key: 'anger',
    emoji: '😠',
    labelJa: '怒り',
    instructions:
      'Speak with firm sharp delivery and emphatic pauses. Use staccato pacing. Emphasize key words with vocal stress. Hold pitch low but tense. Convey controlled anger and frustration, never shouting.',
  },
  {
    key: 'surprise',
    emoji: '😲',
    labelJa: '驚き',
    instructions:
      'Speak with sudden rising intonation on emphatic words. Use quick bursts of pace, then sharp pauses. Pitch jumps high suddenly on key surprise moments. Convey genuine astonishment and excited disbelief.',
  },
  {
    key: 'calm',
    emoji: '😌',
    labelJa: '落ち着き',
    instructions:
      'Speak with calm even tone and steady pace. Use gentle pitch variation, never abrupt. Insert smooth natural pauses. Subtle emphasis only on important words. Convey serene composure and reassurance.',
  },
  {
    key: 'confusion',
    emoji: '😕',
    labelJa: '困惑',
    instructions:
      'Speak with hesitant uncertain intonation. Insert thinking pauses (1-2s) between words. Lower pitch when puzzled, raise when questioning. Vary pacing - slow on confusing parts. Sound genuinely bewildered.',
  },
  {
    key: 'pro_intonation',
    emoji: '🎭',
    labelJa: 'プロ抑揚',
    instructions:
      'Speak like a professional voice actor with theatrical intonation. Use dramatic pitch swings from low whispers to high peaks. Insert deliberate pauses before key phrases. Emphasize emotional words. Vary pacing.',
  },
]
