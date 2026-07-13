-- Migration: workflow_runs table + atomic video-quota reserve/release functions
-- Feature: workflow_automation_and_unified_gateway
-- Plan: docs/implementation-plan.md §10
-- Task: task_001
--
-- Non-destructive: only CREATE TABLE / INDEX / POLICY / FUNCTION (IF NOT EXISTS / OR REPLACE).
-- No existing table is altered.

-- 1. workflow_runs: durable state for server-side workflow execution
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES user_workflows(id) ON DELETE SET NULL,
  batch_id uuid NOT NULL,
  batch_index int NOT NULL DEFAULT 0,
  graph_snapshot jsonb NOT NULL,
  compiled_steps jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','canceled')),
  current_step int NOT NULL DEFAULT 0,
  video_provider text,
  selection_priority text
    CHECK (selection_priority IS NULL OR selection_priority IN ('quality','speed','cost')),
  reserved_generations int NOT NULL DEFAULT 0,
  final_output_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_created
  ON workflow_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_active
  ON workflow_runs(status)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_workflow_runs_batch
  ON workflow_runs(batch_id);

-- 2. RLS (SELECT only — INSERT/UPDATE/DELETE intentionally restricted to service-role,
--    following the omni_reference_assets v3 pattern)
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_runs_select_own" ON workflow_runs
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE policies are intentionally NOT created (all client writes denied).
-- The service-role key bypasses RLS, so backend tasks remain unaffected.

-- 3. Atomic quota reservation (TOCTOU-safe).
--    Increments users.video_count_this_month by p_count only if it stays within p_limit.
--    Returns true when reserved, false when it would exceed the limit.
--    SECURITY DEFINER + fixed search_path so it runs with owner privileges regardless of caller.
CREATE OR REPLACE FUNCTION reserve_video_quota(p_user_id uuid, p_count int, p_limit int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ok boolean;
BEGIN
  UPDATE users
     SET video_count_this_month = video_count_this_month + p_count
   WHERE id = p_user_id
     AND video_count_this_month + p_count <= p_limit
  RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

-- 4. Quota release (refund). Decrements with a floor of 0.
CREATE OR REPLACE FUNCTION release_video_quota(p_user_id uuid, p_count int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE users
     SET video_count_this_month = GREATEST(video_count_this_month - p_count, 0)
   WHERE id = p_user_id;
END;
$$;
