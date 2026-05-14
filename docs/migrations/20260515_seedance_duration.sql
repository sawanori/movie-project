-- Seedance 2.0 duration カラム追加
-- 実行日: 2026-05-15
-- 目的: ノードエディタの ProviderNode から Seedance の動画長 (5/10/15秒) を選べるようにする

ALTER TABLE video_generations
    ADD COLUMN IF NOT EXISTS seedance_duration INTEGER
        CHECK (seedance_duration IN (5, 10, 15));

COMMENT ON COLUMN video_generations.seedance_duration IS
    'Seedance 2.0 動画の duration（秒）。5/10/15 のいずれか。Seedance プロバイダー使用時のみ意味を持つ。';
