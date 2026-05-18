-- ========================================================
-- 2026-05-18: TTS instructions カラム追加
-- dialogue_generations: ユーザーが UI から指定した instructions を保存
-- tts_generations: dialogue_processor が伝播した instructions を保存
-- ========================================================

-- dialogue_generations に tts_instructions カラムを追加
ALTER TABLE dialogue_generations
  ADD COLUMN IF NOT EXISTS tts_instructions TEXT;

-- tts_generations に instructions カラムを追加
ALTER TABLE tts_generations
  ADD COLUMN IF NOT EXISTS instructions TEXT;

-- 後方互換: 両カラムとも NULL 許容、DEFAULT なし
-- 既存レコードは NULL のまま。新規 INSERT 時に省略すれば NULL。
-- RLS ポリシーは既存テーブルポリシーをそのまま継承するため変更不要。

-- コメント追記
COMMENT ON COLUMN dialogue_generations.tts_instructions IS
  '感情/トーン指定 (gpt-4o-mini-tts のみ適用). UI から指定された instructions 文字列。NULL = デフォルト適用。';
COMMENT ON COLUMN tts_generations.instructions IS
  'dialogue_processor から伝播された TTS instructions。NULL = デフォルト適用。';
