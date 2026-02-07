-- 動画結合ジョブテーブル
-- 複数の動画を繋ぎ合わせて1本の動画を生成するジョブを管理

CREATE TABLE video_concatenations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 結合する動画（順番通り）
    source_video_ids UUID[] NOT NULL,

    -- 生成状態
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    progress INTEGER DEFAULT 0,               -- 0-100

    -- トランジション設定
    transition TEXT DEFAULT 'none',           -- 'none', 'fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown'
    transition_duration FLOAT DEFAULT 0.5,    -- 秒

    -- 出力動画
    final_video_url TEXT,
    total_duration FLOAT,                     -- 結合後の動画長（秒）

    -- エラー情報
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_video_concatenations_user_id ON video_concatenations(user_id);
CREATE INDEX idx_video_concatenations_status ON video_concatenations(status);
CREATE INDEX idx_video_concatenations_created_at ON video_concatenations(created_at DESC);

-- RLSポリシー
ALTER TABLE video_concatenations ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の結合ジョブのみ参照可能
CREATE POLICY "Users can view own concatenations"
    ON video_concatenations FOR SELECT
    USING (auth.uid() = user_id);

-- ユーザーは自分の結合ジョブのみ作成可能
CREATE POLICY "Users can create own concatenations"
    ON video_concatenations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分の結合ジョブのみ更新可能
CREATE POLICY "Users can update own concatenations"
    ON video_concatenations FOR UPDATE
    USING (auth.uid() = user_id);

-- ユーザーは自分の結合ジョブのみ削除可能
CREATE POLICY "Users can delete own concatenations"
    ON video_concatenations FOR DELETE
    USING (auth.uid() = user_id);

-- サービスロール用ポリシー（バックグラウンド処理用）
CREATE POLICY "Service role can manage all concatenations"
    ON video_concatenations FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_video_concatenations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_video_concatenations_updated_at
    BEFORE UPDATE ON video_concatenations
    FOR EACH ROW
    EXECUTE FUNCTION update_video_concatenations_updated_at();
