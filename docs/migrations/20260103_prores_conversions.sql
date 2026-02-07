-- ProRes変換ジョブテーブル
-- 実行日: 2026-01-03
-- 目的: デバンド処理 + ProRes (10bit) への変換ジョブを管理
-- ステータス: 適用済み

CREATE TABLE prores_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ソース動画（storyboard または concat のいずれか）
    storyboard_id UUID REFERENCES storyboards(id) ON DELETE CASCADE,
    concat_id UUID REFERENCES video_concatenations(id) ON DELETE CASCADE,

    -- 変換元と変換先
    original_video_url TEXT NOT NULL,
    prores_video_url TEXT,

    -- 変換パラメータ
    deband_strength FLOAT NOT NULL DEFAULT 1.1,
    deband_radius INTEGER NOT NULL DEFAULT 20,
    apply_flat_look BOOLEAN NOT NULL DEFAULT TRUE,
    contrast FLOAT NOT NULL DEFAULT 0.9,
    saturation FLOAT NOT NULL DEFAULT 0.85,
    brightness FLOAT NOT NULL DEFAULT 0.03,

    -- ステータス
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    progress INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,

    -- タイムスタンプ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- storyboard_id または concat_id のいずれかが必要
    CONSTRAINT prores_conversions_source_check
        CHECK (storyboard_id IS NOT NULL OR concat_id IS NOT NULL)
);

-- インデックス
CREATE INDEX idx_prores_conversions_user_id ON prores_conversions(user_id);
CREATE INDEX idx_prores_conversions_storyboard_id ON prores_conversions(storyboard_id);
CREATE INDEX idx_prores_conversions_concat_id ON prores_conversions(concat_id);
CREATE INDEX idx_prores_conversions_status ON prores_conversions(status);

-- RLSポリシー
ALTER TABLE prores_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY prores_conversions_select_policy ON prores_conversions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY prores_conversions_insert_policy ON prores_conversions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY prores_conversions_update_policy ON prores_conversions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY prores_conversions_delete_policy ON prores_conversions
    FOR DELETE USING (auth.uid() = user_id);

-- サービスロール用ポリシー
CREATE POLICY prores_conversions_service_role_policy ON prores_conversions
    FOR ALL USING (auth.role() = 'service_role');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_prores_conversions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prores_conversions_updated_at
    BEFORE UPDATE ON prores_conversions
    FOR EACH ROW
    EXECUTE FUNCTION update_prores_conversions_updated_at();

-- コメント
COMMENT ON TABLE prores_conversions IS 'ProRes変換ジョブ管理テーブル（デバンド + 10bit変換）';
COMMENT ON COLUMN prores_conversions.deband_strength IS 'gradfunフィルターの強度（0.5-2.0）';
COMMENT ON COLUMN prores_conversions.deband_radius IS 'gradfunフィルターの半径（8-64）';
COMMENT ON COLUMN prores_conversions.apply_flat_look IS 'フラットルック適用（編集しやすい色調）';
