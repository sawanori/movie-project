-- 動画アップスケールテーブルを作成
-- 実行日: 2024-12-29
-- 目的: Runway Upscale v1による動画アップスケール機能のサポート

-- video_upscalesテーブルを作成
CREATE TABLE IF NOT EXISTS video_upscales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storyboard_id UUID NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
    scene_number INTEGER DEFAULT NULL,  -- シーン単位アップスケール時のシーン番号（NULLは結合動画全体）
    original_video_url TEXT NOT NULL,
    upscaled_video_url TEXT,
    resolution TEXT NOT NULL DEFAULT '4k',  -- 'hd' or '4k'
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    progress INTEGER NOT NULL DEFAULT 0,
    runway_task_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_video_upscales_user_id ON video_upscales(user_id);
CREATE INDEX IF NOT EXISTS idx_video_upscales_storyboard_id ON video_upscales(storyboard_id);
CREATE INDEX IF NOT EXISTS idx_video_upscales_status ON video_upscales(status);
CREATE INDEX IF NOT EXISTS idx_video_upscales_scene_number ON video_upscales(scene_number);

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_video_upscales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_video_upscales_updated_at ON video_upscales;
CREATE TRIGGER trigger_video_upscales_updated_at
    BEFORE UPDATE ON video_upscales
    FOR EACH ROW
    EXECUTE FUNCTION update_video_upscales_updated_at();

-- RLSポリシーを設定
ALTER TABLE video_upscales ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のレコードのみアクセス可能
CREATE POLICY video_upscales_select_policy ON video_upscales
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY video_upscales_insert_policy ON video_upscales
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY video_upscales_update_policy ON video_upscales
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY video_upscales_delete_policy ON video_upscales
    FOR DELETE USING (auth.uid() = user_id);
