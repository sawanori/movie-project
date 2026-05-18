-- AquesTalk カナ表記 (is_kana モード) サポートのためのカラム追加
-- Voicevox の is_kana=true パラメータでアクセント核を指定するために使用する

ALTER TABLE dialogue_generations ADD COLUMN IF NOT EXISTS kana_text TEXT;
ALTER TABLE tts_generations ADD COLUMN IF NOT EXISTS kana_text TEXT;
