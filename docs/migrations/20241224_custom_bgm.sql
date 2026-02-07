-- =====================================================
-- カスタムBGMアップロード機能追加
-- 実行日: 2024-12-24
-- =====================================================

-- 1. video_generationsにカスタムBGMフィールドを追加
-- custom_bgm_urlが設定されている場合、bgm_track_idより優先される
ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS custom_bgm_url TEXT;

-- コメント追加
COMMENT ON COLUMN video_generations.custom_bgm_url IS 'ユーザーがアップロードしたカスタムBGMのURL（R2）。設定時はbgm_track_idより優先';

-- 2. ユーザーアップロードBGMライブラリ（オプション：将来の再利用用）
CREATE TABLE IF NOT EXISTS user_bgm_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  duration_seconds FLOAT,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_bgm_tracks_user_id ON user_bgm_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bgm_tracks_created_at ON user_bgm_tracks(created_at DESC);

-- RLS設定
ALTER TABLE user_bgm_tracks ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のBGMのみアクセス可能
CREATE POLICY "Users can view own BGM tracks" ON user_bgm_tracks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own BGM tracks" ON user_bgm_tracks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own BGM tracks" ON user_bgm_tracks
  FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- 実行方法:
-- Supabase Dashboard > SQL Editor で実行
-- =====================================================
