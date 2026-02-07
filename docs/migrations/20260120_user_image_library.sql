-- ユーザー画像ライブラリテーブル
-- 実行日: 2026-01-20
-- 目的: ユーザーがアップロードまたは生成した画像を管理するライブラリ機能

CREATE TABLE user_image_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- メタデータ
    name TEXT NOT NULL,
    description TEXT,

    -- 画像情報
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    r2_key TEXT NOT NULL,

    -- 寸法（必須）
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    aspect_ratio TEXT NOT NULL CHECK (aspect_ratio IN ('9:16', '16:9', '1:1')),
    file_size_bytes BIGINT,

    -- ソース区分（スクリーンショット除外）
    source TEXT NOT NULL CHECK (source IN ('generated', 'uploaded')),

    -- 生成情報
    image_provider TEXT,  -- "nanobanana", "bfl_flux2_pro"
    generated_prompt_ja TEXT,
    generated_prompt_en TEXT,

    -- カテゴリ
    category TEXT NOT NULL DEFAULT 'general'
        CHECK (category IN ('character', 'background', 'product', 'general')),

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_user_image_library_user_id ON user_image_library(user_id);
CREATE INDEX idx_user_image_library_created_at ON user_image_library(created_at DESC);
CREATE INDEX idx_user_image_library_category ON user_image_library(category);
CREATE INDEX idx_user_image_library_source ON user_image_library(source);

-- RLSポリシー
ALTER TABLE user_image_library ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の画像のみ参照可能
CREATE POLICY "Users can view own images"
    ON user_image_library FOR SELECT
    USING (auth.uid() = user_id);

-- ユーザーは自分の画像のみ作成可能
CREATE POLICY "Users can create own images"
    ON user_image_library FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分の画像のみ更新可能
CREATE POLICY "Users can update own images"
    ON user_image_library FOR UPDATE
    USING (auth.uid() = user_id);

-- ユーザーは自分の画像のみ削除可能
CREATE POLICY "Users can delete own images"
    ON user_image_library FOR DELETE
    USING (auth.uid() = user_id);

-- サービスロール用ポリシー（バックグラウンド処理用）
CREATE POLICY "Service role can manage all images"
    ON user_image_library FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_image_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_image_library_updated_at
    BEFORE UPDATE ON user_image_library
    FOR EACH ROW
    EXECUTE FUNCTION update_user_image_library_updated_at();
