-- Act-Two機能用カラムをvideo_generationsに追加
-- motion_typeは動的にSupabaseから取得するためCHECK制約なし

ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS use_act_two boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motion_type text,
ADD COLUMN IF NOT EXISTS expression_intensity integer DEFAULT 5 CHECK (expression_intensity >= 1 AND expression_intensity <= 5),
ADD COLUMN IF NOT EXISTS body_control boolean DEFAULT true;

COMMENT ON COLUMN video_generations.use_act_two IS 'Act-Twoモードを使用するか';
COMMENT ON COLUMN video_generations.motion_type IS 'Act-Two用モーションID（Supabase motionsテーブルから動的取得）';
COMMENT ON COLUMN video_generations.expression_intensity IS 'Act-Two表情強度（1-5、デフォルト5）';
COMMENT ON COLUMN video_generations.body_control IS 'Act-Twoボディモーション転写（デフォルトtrue）';
