-- user_video_upscales テーブル作成
CREATE TABLE user_video_upscales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_video_id UUID NOT NULL REFERENCES user_videos(id) ON DELETE CASCADE,

    -- 動画URL
    original_video_url TEXT NOT NULL,
    upscaled_video_url TEXT,
    thumbnail_url TEXT,

    -- Topaz設定
    model TEXT NOT NULL DEFAULT 'prob-4',
    target_width INT NOT NULL,
    target_height INT NOT NULL,
    topaz_request_id TEXT,

    -- ステータス管理
    status TEXT NOT NULL DEFAULT 'pending',
    progress INT DEFAULT 0,
    error_message TEXT,
    estimated_credits_min INT,
    estimated_credits_max INT,
    estimated_time_min INT,
    estimated_time_max INT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_video_upscales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_video_upscales_updated_at
    BEFORE UPDATE ON user_video_upscales
    FOR EACH ROW
    EXECUTE FUNCTION update_user_video_upscales_updated_at();

-- RLSポリシー
ALTER TABLE user_video_upscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own upscales"
    ON user_video_upscales FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own upscales"
    ON user_video_upscales FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own upscales"
    ON user_video_upscales FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_video_upscales"
    ON user_video_upscales FOR ALL
    USING (auth.role() = 'service_role');

-- インデックス
CREATE INDEX idx_user_video_upscales_user_id ON user_video_upscales(user_id);
CREATE INDEX idx_user_video_upscales_user_video_id ON user_video_upscales(user_video_id);
CREATE INDEX idx_user_video_upscales_status ON user_video_upscales(status);

-- テーブル・カラムコメント
COMMENT ON TABLE user_video_upscales IS 'ユーザーアップロード動画のTopaz Enhancementアップスケールタスク管理テーブル';
COMMENT ON COLUMN user_video_upscales.model IS 'Topaz Enhancementモデル (prob-4, ahq-12, alq-13, ghq-5, gcg-5, nyk-3, rhea-1, iris-3, thd-3, thf-4)';
COMMENT ON COLUMN user_video_upscales.topaz_request_id IS 'Topaz API requestId (キャンセル用)';

-- user_videos テーブルに upscaled_video_url カラム追加
ALTER TABLE user_videos ADD COLUMN IF NOT EXISTS upscaled_video_url TEXT;
