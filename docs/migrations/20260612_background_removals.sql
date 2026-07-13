-- 背景削除テーブル
-- 実行日: 2026-06-12
-- 目的: 動画・画像の背景削除（fal.ai）のジョブ管理

CREATE TABLE background_removals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ステータス管理
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','completed','failed')),
    progress INT NOT NULL DEFAULT 0,

    -- ソース情報
    source_type TEXT NOT NULL CHECK (source_type IN ('video','image')),
    source_url TEXT NOT NULL,
    output_format TEXT NOT NULL DEFAULT 'webm'
        CHECK (output_format IN ('webm','prores','png')),

    -- プロバイダー情報
    provider TEXT NOT NULL DEFAULT 'fal',
    model_id TEXT,
    provider_request_id TEXT,
    provider_status_url TEXT,
    provider_response_url TEXT,

    -- 出力
    output_url TEXT,
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_background_removals_user_id ON background_removals(user_id);
CREATE INDEX idx_background_removals_status ON background_removals(status);
CREATE INDEX idx_background_removals_created_at ON background_removals(created_at DESC);

-- RLSポリシー
-- 書き込みはバックエンド（service_role）経由のみ。本人は SELECT のみ可
ALTER TABLE background_removals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own background removals"
    ON background_removals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all background removals"
    ON background_removals FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_background_removals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_background_removals_updated_at
    BEFORE UPDATE ON background_removals
    FOR EACH ROW
    EXECUTE FUNCTION update_background_removals_updated_at();
