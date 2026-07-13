-- タイムライントランジション機能
-- 実行日: 2026-03-15
-- 目的: ストーリーボードシーンにトランジション設定を追加

ALTER TABLE storyboard_scenes
    ADD COLUMN IF NOT EXISTS transition_type TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS transition_duration FLOAT DEFAULT 0.5;
