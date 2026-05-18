-- Seedance 2.0 のモードを Pro/Fast から UI で動的に選択できるようにする
-- ('pro' or 'fast' を保存、NULL なら env の PIAPI_SEEDANCE_TASK_TYPE デフォルトに従う)

ALTER TABLE video_generations ADD COLUMN IF NOT EXISTS seedance_mode TEXT;
