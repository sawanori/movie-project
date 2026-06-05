-- リップシンク生成テーブル
-- 実行日: 2026-03-15
-- 目的: リップシンク（音声同期）動画生成のジョブ管理

CREATE TABLE lip_sync_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ステータス管理
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress INT NOT NULL DEFAULT 0,

    -- ソース情報
    source_type TEXT NOT NULL CHECK (source_type IN ('image', 'video')),
    source_url TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    audio_duration_seconds FLOAT,

    -- プロバイダー情報
    provider TEXT NOT NULL DEFAULT 'hedra',
    provider_task_id TEXT,

    -- 出力
    output_video_url TEXT,
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_lip_sync_generations_user_id ON lip_sync_generations(user_id);
CREATE INDEX idx_lip_sync_generations_status ON lip_sync_generations(status);
CREATE INDEX idx_lip_sync_generations_created_at ON lip_sync_generations(created_at DESC);

-- RLSポリシー
ALTER TABLE lip_sync_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lip sync generations"
    ON lip_sync_generations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lip sync generations"
    ON lip_sync_generations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lip sync generations"
    ON lip_sync_generations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own lip sync generations"
    ON lip_sync_generations FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all lip sync generations"
    ON lip_sync_generations FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_lip_sync_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_lip_sync_generations_updated_at
    BEFORE UPDATE ON lip_sync_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_lip_sync_generations_updated_at();
