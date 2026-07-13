-- TTS（テキスト読み上げ）生成テーブル
-- 実行日: 2026-03-15
-- 目的: TTS音声生成のジョブ管理

CREATE TABLE tts_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ステータス管理
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    -- 入力パラメータ
    text TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'ja',
    speed FLOAT NOT NULL DEFAULT 1.0,

    -- プロバイダー情報
    provider TEXT NOT NULL DEFAULT 'elevenlabs',
    provider_task_id TEXT,

    -- 出力
    audio_url TEXT,
    duration_seconds FLOAT,
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_tts_generations_user_id ON tts_generations(user_id);
CREATE INDEX idx_tts_generations_status ON tts_generations(status);
CREATE INDEX idx_tts_generations_created_at ON tts_generations(created_at DESC);

-- RLSポリシー
ALTER TABLE tts_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tts generations"
    ON tts_generations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tts generations"
    ON tts_generations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tts generations"
    ON tts_generations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tts generations"
    ON tts_generations FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all tts generations"
    ON tts_generations FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_tts_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tts_generations_updated_at
    BEFORE UPDATE ON tts_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_tts_generations_updated_at();
