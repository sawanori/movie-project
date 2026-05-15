-- DialogueNode リップシンク拡張: dialogue_generations にカラム追加
-- 実行日: 2026-05-15
-- 設計: docs/plans/2026-05-15_dialogue-lip-sync.md §9

ALTER TABLE dialogue_generations
    ADD COLUMN IF NOT EXISTS use_lip_sync BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE dialogue_generations
    ADD COLUMN IF NOT EXISTS lip_sync_generation_id UUID
        REFERENCES lip_sync_generations(id) ON DELETE SET NULL;

COMMENT ON COLUMN dialogue_generations.use_lip_sync IS
    'リップシンク有効化フラグ。true の場合 Hedra でリップシンク合成、false の場合 ffmpeg で音声ミックスのみ。';

COMMENT ON COLUMN dialogue_generations.lip_sync_generation_id IS
    'リップシンク有効時に作成される lip_sync_generations.id への FK。デバッグ・トレース用 (frontend には露出しない)。';
