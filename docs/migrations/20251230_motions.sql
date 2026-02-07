-- モーションテーブル（Act-Two用パフォーマンス動画）
-- アップロードされたモーション動画のメタデータを保存

CREATE TABLE IF NOT EXISTS motions (
    id TEXT PRIMARY KEY,  -- motion_id（例: "smile_gentle", "custom_wave"）
    category TEXT NOT NULL CHECK (category IN ('expression', 'gesture', 'action', 'speaking')),
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 5,
    r2_key TEXT NOT NULL,  -- R2のファイルパス（例: "motions/actions/custom_wave.mp4"）
    motion_url TEXT NOT NULL,  -- 完全なURL
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- アップロードしたユーザー（NULLならシステム）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_motions_category ON motions(category);
CREATE INDEX IF NOT EXISTS idx_motions_user_id ON motions(user_id);

-- RLS（Row Level Security）を有効化
ALTER TABLE motions ENABLE ROW LEVEL SECURITY;

-- ポリシー: 全ユーザーが読み取り可能
CREATE POLICY "motions_select_all" ON motions
    FOR SELECT
    USING (true);

-- ポリシー: 認証済みユーザーのみ挿入可能
CREATE POLICY "motions_insert_authenticated" ON motions
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- ポリシー: 自分がアップロードしたものは更新・削除可能
CREATE POLICY "motions_update_own" ON motions
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "motions_delete_own" ON motions
    FOR DELETE
    USING (auth.uid() = user_id);

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_motions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_motions_updated_at
    BEFORE UPDATE ON motions
    FOR EACH ROW
    EXECUTE FUNCTION update_motions_updated_at();
