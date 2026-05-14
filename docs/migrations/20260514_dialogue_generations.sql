-- Dialogue (TTS ミックス) 生成テーブル
-- 実行日: 2026-05-14
-- 目的: Dialogue ノードの音声ミックス生成ジョブ管理
-- 設計: docs/plans/2026-05-14_dialogue-node.md §12

CREATE TABLE dialogue_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ステータス管理 (tts_generations と統一)
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    -- 入力パラメータ
    video_url TEXT NOT NULL,         -- 元動画の URL
    text TEXT NOT NULL,              -- セリフテキスト
    voice_id TEXT NOT NULL,          -- TTS 音声 ID
    language TEXT NOT NULL DEFAULT 'ja',
    speed FLOAT NOT NULL DEFAULT 1.0,

    -- プロバイダー情報
    -- TTS_PROVIDER の値を記録。service 層で settings.TTS_PROVIDER を必ず明示的に渡すこと
    -- (DEFAULT は付けない — env が openai_tts の場合に 'elevenlabs' で誤記録される事故防止)
    provider TEXT NOT NULL,

    -- TTS 中間成果物への参照 (デバッグ・リトライ用)
    tts_generation_id UUID REFERENCES tts_generations(id) ON DELETE SET NULL,

    -- 出力
    output_video_url TEXT,
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_dialogue_generations_user_id ON dialogue_generations(user_id);
CREATE INDEX idx_dialogue_generations_status ON dialogue_generations(status);
CREATE INDEX idx_dialogue_generations_created_at ON dialogue_generations(created_at DESC);

-- RLS ポリシー
ALTER TABLE dialogue_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dialogue generations"
    ON dialogue_generations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own dialogue generations"
    ON dialogue_generations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dialogue generations"
    ON dialogue_generations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dialogue generations"
    ON dialogue_generations FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all dialogue generations"
    ON dialogue_generations FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_dialogue_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dialogue_generations_updated_at
    BEFORE UPDATE ON dialogue_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_dialogue_generations_updated_at();
