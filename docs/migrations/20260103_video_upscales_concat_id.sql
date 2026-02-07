-- video_upscalesテーブルにconcat_idカラムを追加
-- 実行日: 2026-01-03
-- 目的: 結合動画（concat）のアップスケール対応
-- ステータス: 適用済み

-- concat_idカラムを追加
ALTER TABLE video_upscales
    ADD COLUMN IF NOT EXISTS concat_id UUID REFERENCES video_concatenations(id) ON DELETE CASCADE;

-- concat_id用のインデックスを作成
CREATE INDEX IF NOT EXISTS idx_video_upscales_concat_id ON video_upscales(concat_id);

-- コメントを追加
COMMENT ON COLUMN video_upscales.concat_id IS '結合動画ID（video_concatenationsテーブル）。storyboard_id, video_idとは排他的に使用';
