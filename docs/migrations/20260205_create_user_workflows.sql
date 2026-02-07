-- Migration: create_user_workflows
-- Date: 2026-02-05
-- Description: ノードエディタのワークフロー保存テーブル

-- ユーザーワークフローテーブル
CREATE TABLE user_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  thumbnail_url TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 制約
  CONSTRAINT name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT description_length CHECK (description IS NULL OR char_length(description) <= 500)
);

-- インデックス
CREATE INDEX idx_user_workflows_user_id ON user_workflows(user_id);
CREATE INDEX idx_user_workflows_is_public ON user_workflows(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_user_workflows_updated_at ON user_workflows(updated_at DESC);

-- RLS有効化
ALTER TABLE user_workflows ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（明確な命名）
CREATE POLICY "users_select_own_workflows" ON user_workflows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_workflows" ON user_workflows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_workflows" ON user_workflows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_workflows" ON user_workflows
  FOR DELETE USING (auth.uid() = user_id);

-- 公開ワークフローは誰でも閲覧可能
CREATE POLICY "anon_select_public_workflows" ON user_workflows
  FOR SELECT USING (is_public = TRUE);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_user_workflows_updated_at
  BEFORE UPDATE ON user_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_user_workflows_updated_at();

-- コメント追加
COMMENT ON TABLE user_workflows IS 'ノードエディタのワークフロー保存テーブル';
COMMENT ON COLUMN user_workflows.nodes IS 'React Flowノードデータ（JSONB）';
COMMENT ON COLUMN user_workflows.edges IS 'React Flowエッジデータ（JSONB）';
COMMENT ON COLUMN user_workflows.is_public IS '公開フラグ（他ユーザーが閲覧・複製可能）';
