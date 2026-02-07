-- ストーリーボードにアスペクト比列を追加
-- 実行日: 2024-12-28
-- 目的: ストーリーボード生成で横型(16:9)アスペクト比を選択可能にする

-- storyboardsテーブルにaspect_ratio列を追加
ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16';

-- コメント: 既存レコードはデフォルト値（9:16 縦長）が適用される
