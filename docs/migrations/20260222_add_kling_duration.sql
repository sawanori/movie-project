-- Kling 3.0 Duration 選択機能追加
-- video_generations テーブルに kling_duration カラムを追加
-- PiAPI APIが5秒と10秒のみサポート（15秒は非対応）

ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS kling_duration INTEGER DEFAULT NULL
CONSTRAINT kling_duration_check CHECK (kling_duration IN (5, 10) OR kling_duration IS NULL);
