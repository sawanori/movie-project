-- Add kling_camera_control column to video_generations table
-- This column stores the 6-axis camera control parameters for Kling videos
-- Applied: 2026-02-06

ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS kling_camera_control JSONB;
