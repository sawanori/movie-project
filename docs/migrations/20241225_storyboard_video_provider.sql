-- Add video_provider column to storyboards table
-- This column stores the selected video provider (runway/veo) for prompt template switching

ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS video_provider TEXT DEFAULT 'runway';

-- Add comment for documentation
COMMENT ON COLUMN storyboards.video_provider IS 'Video generation provider (runway or veo) - determines prompt template used';
