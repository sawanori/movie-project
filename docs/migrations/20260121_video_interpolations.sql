-- 60fps補間タスク管理テーブル
-- Topaz Video APIを使用した動画のフレーム補間処理を管理

CREATE TABLE IF NOT EXISTS video_interpolations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 補間対象（いずれか1つ）
    video_id UUID REFERENCES video_generations(id) ON DELETE CASCADE,
    storyboard_id UUID REFERENCES storyboards(id) ON DELETE CASCADE,
    concat_id UUID REFERENCES video_concatenations(id) ON DELETE CASCADE,
    scene_number INTEGER,  -- シーン単位補間時のシーン番号

    -- URL
    original_video_url TEXT NOT NULL,
    interpolated_video_url TEXT,

    -- Topaz設定
    model TEXT NOT NULL DEFAULT 'apo-8',  -- apo-8, apf-2, chr-2, chf-3

    -- ステータス
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    progress INTEGER DEFAULT 0,
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 制約：少なくとも1つの対象が必要
    CONSTRAINT check_interpolation_target CHECK (
        video_id IS NOT NULL OR
        storyboard_id IS NOT NULL OR
        concat_id IS NOT NULL
    )
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_video_interpolations_user_id ON video_interpolations(user_id);
CREATE INDEX IF NOT EXISTS idx_video_interpolations_video_id ON video_interpolations(video_id);
CREATE INDEX IF NOT EXISTS idx_video_interpolations_storyboard_id ON video_interpolations(storyboard_id);
CREATE INDEX IF NOT EXISTS idx_video_interpolations_concat_id ON video_interpolations(concat_id);
CREATE INDEX IF NOT EXISTS idx_video_interpolations_status ON video_interpolations(status);
CREATE INDEX IF NOT EXISTS idx_video_interpolations_created_at ON video_interpolations(created_at DESC);

-- updated_atの自動更新トリガー
CREATE OR REPLACE FUNCTION update_video_interpolations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_video_interpolations_updated_at ON video_interpolations;
CREATE TRIGGER trigger_video_interpolations_updated_at
    BEFORE UPDATE ON video_interpolations
    FOR EACH ROW
    EXECUTE FUNCTION update_video_interpolations_updated_at();

-- RLS（Row Level Security）
ALTER TABLE video_interpolations ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のレコードのみ操作可能
CREATE POLICY video_interpolations_select_policy ON video_interpolations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY video_interpolations_insert_policy ON video_interpolations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY video_interpolations_update_policy ON video_interpolations
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY video_interpolations_delete_policy ON video_interpolations
    FOR DELETE USING (auth.uid() = user_id);

-- サービスロール用ポリシー（バックグラウンド処理用）
CREATE POLICY video_interpolations_service_role_policy ON video_interpolations
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- コメント
COMMENT ON TABLE video_interpolations IS '60fps補間タスク管理テーブル';
COMMENT ON COLUMN video_interpolations.model IS 'Topaz補間モデル (apo-8, apf-2, chr-2, chf-3)';
COMMENT ON COLUMN video_interpolations.status IS '処理状態 (pending, processing, completed, failed)';
