-- Seedance 2.0 詳細パラメータ 4 種を video_generations に追加
-- (end_frame_url は別 PR のため本 migration に含まない)
-- 既存行は全カラム NULL (破壊なし、backward compatible)

ALTER TABLE video_generations
  ADD COLUMN IF NOT EXISTS seedance_generate_audio BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seedance_seed BIGINT DEFAULT NULL CHECK (
    seedance_seed IS NULL OR seedance_seed BETWEEN 0 AND 2147483647
  ),
  ADD COLUMN IF NOT EXISTS seedance_resolution TEXT DEFAULT NULL CHECK (
    seedance_resolution IS NULL OR seedance_resolution IN ('480p', '720p', '1080p')
  ),
  ADD COLUMN IF NOT EXISTS seedance_camera_fixed BOOLEAN DEFAULT NULL;

-- コメント (Supabase ダッシュボードで参照しやすく)
COMMENT ON COLUMN video_generations.seedance_generate_audio IS 'Seedance 2.0: BGM 自動生成 ON/OFF (default: False)';
COMMENT ON COLUMN video_generations.seedance_seed IS 'Seedance 2.0: 再現性シード値 (0-2147483647, 32-bit signed int)';
COMMENT ON COLUMN video_generations.seedance_resolution IS 'Seedance 2.0: 出力解像度 480p/720p/1080p (1080p は VIP プラン必須)';
COMMENT ON COLUMN video_generations.seedance_camera_fixed IS 'Seedance 2.0: カメラ固定モード';
