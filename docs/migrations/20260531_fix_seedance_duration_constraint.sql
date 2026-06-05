-- Fix seedance_duration check constraint
--
-- 背景:
--   20260515_seedance_duration.sql で seedance_duration に
--   CHECK (seedance_duration IN (5, 10, 15)) を設定したが、
--   その後 Seedance 2.0 プロバイダー (PiAPISeedanceProvider) と
--   StoryVideoCreate スキーマ (ge=4, le=15) が 4-15秒・1秒刻みに対応した。
--   DB 制約だけが離散値 (5/10/15) のまま取り残され、
--   例: duration=4 を選択すると insert が
--   "video_generations_seedance_duration_check" 違反で 500 を返していた。
--
-- 対応:
--   旧制約を破棄し、4-15 の範囲制約 (NULL 許容) に置き換える。
--   PiAPI 仕様 DURATION_MIN=4 / DURATION_MAX=15 と一致させる。

ALTER TABLE video_generations
    DROP CONSTRAINT IF EXISTS video_generations_seedance_duration_check;

ALTER TABLE video_generations
    ADD CONSTRAINT video_generations_seedance_duration_check
        CHECK (seedance_duration IS NULL OR (seedance_duration >= 4 AND seedance_duration <= 15));

COMMENT ON COLUMN video_generations.seedance_duration IS
    'Seedance 2.0 動画の長さ（秒）。4-15 の整数（1秒刻み）。10秒超・1080p は VIP tier のみ。';
