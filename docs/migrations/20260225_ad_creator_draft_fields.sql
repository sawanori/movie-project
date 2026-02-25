-- Add target_duration and image_look columns to ad_creator_drafts
ALTER TABLE ad_creator_drafts
  ADD COLUMN IF NOT EXISTS target_duration INTEGER,
  ADD COLUMN IF NOT EXISTS image_look TEXT;
