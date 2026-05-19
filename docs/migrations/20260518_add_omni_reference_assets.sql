-- Migration: Add omni_reference_assets table + video_generations URL snapshot columns
-- Reference: docs/plans/2026-05-18_seedance-omni-reference-v3.md §6.6
-- Task: T1-1

-- 1. New table: omni_reference_assets
CREATE TABLE IF NOT EXISTS omni_reference_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  r2_key text NOT NULL,
  public_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('video', 'audio', 'image')),
  content_type text NOT NULL,
  duration_seconds numeric,
  file_size_bytes bigint NOT NULL,
  consent_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  -- v3: Prevent external URL injection at the structural level
  CONSTRAINT r2_key_prefix CHECK (r2_key LIKE 'omni-references/%'),
  CONSTRAINT public_url_https CHECK (public_url LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS idx_omni_ref_user ON omni_reference_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_omni_ref_expires ON omni_reference_assets(expires_at);

-- 2. RLS (v3: SELECT only — INSERT/UPDATE/DELETE intentionally restricted to service-role)
ALTER TABLE omni_reference_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON omni_reference_assets
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE policies are intentionally NOT created (all client writes denied).
-- service-role key bypasses RLS so backend tasks remain unaffected.

-- 3. video_generations: URL snapshot columns
ALTER TABLE video_generations
  ADD COLUMN IF NOT EXISTS image_reference_urls JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS video_reference_urls JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audio_reference_urls JSONB DEFAULT NULL;

ALTER TABLE video_generations
  ADD CONSTRAINT image_reference_urls_max_9 CHECK (
    image_reference_urls IS NULL OR jsonb_array_length(image_reference_urls) <= 9
  ),
  ADD CONSTRAINT video_reference_urls_max_3 CHECK (
    video_reference_urls IS NULL OR jsonb_array_length(video_reference_urls) <= 3
  ),
  ADD CONSTRAINT audio_reference_urls_max_3 CHECK (
    audio_reference_urls IS NULL OR jsonb_array_length(audio_reference_urls) <= 3
  );
