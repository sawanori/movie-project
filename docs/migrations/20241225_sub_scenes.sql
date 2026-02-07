-- =====================================================
-- サブシーン（追加カット）機能のDBスキーマ拡張
-- 作成日: 2024-12-25
-- 関連ドキュメント: docs/sub-scene-implementation-plan.md
-- =====================================================

-- =====================================================
-- 1. 親シーン参照カラムを追加
-- =====================================================
-- NULLの場合は親シーン（基本4シーン）
-- 値がある場合はサブシーン（追加カット）

ALTER TABLE storyboard_scenes
  ADD COLUMN IF NOT EXISTS parent_scene_id UUID REFERENCES storyboard_scenes(id) ON DELETE CASCADE;

COMMENT ON COLUMN storyboard_scenes.parent_scene_id IS '親シーンID（NULLの場合は基本シーン、値がある場合は追加カット）';


-- =====================================================
-- 2. シーン番号制約を緩和（最大16シーン）
-- =====================================================
-- 既存: CHECK (scene_number BETWEEN 1 AND 4)
-- 変更: CHECK (scene_number BETWEEN 1 AND 16)

-- 既存の制約を削除
ALTER TABLE storyboard_scenes
  DROP CONSTRAINT IF EXISTS storyboard_scenes_scene_number_check;

-- 新しい制約を追加（最大16シーン = 4親 + 12サブ）
ALTER TABLE storyboard_scenes
  ADD CONSTRAINT storyboard_scenes_scene_number_check
  CHECK (scene_number BETWEEN 1 AND 16);


-- =====================================================
-- 3. 生成シード値を保存（スタイル一貫性のため）
-- =====================================================
-- 動画生成時のシード値を保存し、サブシーン生成時に近いシード値を使用

ALTER TABLE storyboard_scenes
  ADD COLUMN IF NOT EXISTS generation_seed INTEGER;

COMMENT ON COLUMN storyboard_scenes.generation_seed IS '動画生成時のシード値（スタイル継承用）';


-- =====================================================
-- 4. サブシーン順序カラム
-- =====================================================
-- 同一親シーン内での順序を管理
-- 0 = 親シーン自身
-- 1, 2, 3 = サブシーン（追加カット）

ALTER TABLE storyboard_scenes
  ADD COLUMN IF NOT EXISTS sub_scene_order INTEGER DEFAULT 0;

COMMENT ON COLUMN storyboard_scenes.sub_scene_order IS '同一親シーン内での順序（0=親自身、1〜3=サブシーン）';


-- =====================================================
-- 5. インデックス追加
-- =====================================================
-- 親シーンによる検索を高速化

CREATE INDEX IF NOT EXISTS idx_storyboard_scenes_parent
  ON storyboard_scenes(parent_scene_id);

CREATE INDEX IF NOT EXISTS idx_storyboard_scenes_order
  ON storyboard_scenes(storyboard_id, act, sub_scene_order);


-- =====================================================
-- 6. 既存データのマイグレーション
-- =====================================================
-- 既存シーンはすべて親シーン（parent_scene_id = NULL, sub_scene_order = 0）

UPDATE storyboard_scenes
SET
  parent_scene_id = NULL,
  sub_scene_order = 0,
  generation_seed = NULL
WHERE parent_scene_id IS NULL;  -- 冪等性のため


-- =====================================================
-- 7. ストーリーボードに最大シーン数カラム追加（オプション）
-- =====================================================
-- ユーザーの課金プランによって最大シーン数を制限する場合に使用

ALTER TABLE storyboards
  ADD COLUMN IF NOT EXISTS max_scenes INTEGER DEFAULT 16;

COMMENT ON COLUMN storyboards.max_scenes IS '最大シーン数（課金プランによる制限）';


-- =====================================================
-- 検証クエリ
-- =====================================================
-- 以下のクエリで変更を確認

-- カラム確認
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'storyboard_scenes'
-- ORDER BY ordinal_position;

-- 制約確認
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name LIKE '%storyboard_scenes%';
