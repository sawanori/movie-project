-- =============================================
-- Migration: Add display_order column to storyboard_scenes
-- Purpose: Enable free-form scene reordering (delete/reorder/add)
-- Date: 2026-01-01
-- =============================================

-- Step 1: Add display_order column (nullable initially)
ALTER TABLE storyboard_scenes
ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Step 2: Migrate existing data
-- Preserve current ordering: act -> sub_scene_order -> scene_number
WITH ordered_scenes AS (
  SELECT
    id,
    storyboard_id,
    ROW_NUMBER() OVER (
      PARTITION BY storyboard_id
      ORDER BY
        CASE act
          WHEN '起' THEN 1
          WHEN '承' THEN 2
          WHEN '転' THEN 3
          WHEN '結' THEN 4
          ELSE 5
        END,
        COALESCE(sub_scene_order, 0),
        scene_number
    ) as new_order
  FROM storyboard_scenes
)
UPDATE storyboard_scenes s
SET display_order = o.new_order
FROM ordered_scenes o
WHERE s.id = o.id;

-- Step 3: Add NOT NULL constraint
ALTER TABLE storyboard_scenes
ALTER COLUMN display_order SET NOT NULL;

-- Step 4: Set default value for new records
ALTER TABLE storyboard_scenes
ALTER COLUMN display_order SET DEFAULT 1;

-- Step 5: Create index for performance
CREATE INDEX IF NOT EXISTS idx_storyboard_scenes_display_order
ON storyboard_scenes(storyboard_id, display_order);

-- Verification query (run manually to check):
-- SELECT id, storyboard_id, scene_number, display_order, act, sub_scene_order
-- FROM storyboard_scenes
-- ORDER BY storyboard_id, display_order
-- LIMIT 20;
