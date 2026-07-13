-- T2V（Text-to-Video）サポート追加
-- 実行日: 2026-03-15
-- 目的: video_generationsテーブルにT2Vモード区分を追加

ALTER TABLE video_generations ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'i2v'
    CHECK (generation_mode IN ('i2v', 't2v'));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_video_generations_generation_mode ON video_generations(generation_mode);
