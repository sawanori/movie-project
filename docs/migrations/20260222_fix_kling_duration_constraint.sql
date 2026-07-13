-- Kling Duration の CHECK制約を修正
-- PiAPI が duration=15 をサポートしていないため、5, 10 のみに制限
-- 既存の kling_duration=15 のレコードは 10 に更新

UPDATE video_generations SET kling_duration = 10 WHERE kling_duration = 15;

ALTER TABLE video_generations DROP CONSTRAINT IF EXISTS kling_duration_check;

ALTER TABLE video_generations ADD CONSTRAINT kling_duration_check CHECK (kling_duration IN (5, 10) OR kling_duration IS NULL);
