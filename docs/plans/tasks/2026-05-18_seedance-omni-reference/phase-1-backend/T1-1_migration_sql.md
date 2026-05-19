---
id: T1-1
phase: 1
title: Migration SQL 作成 + Supabase 適用 (omni_reference_assets + video_generations 拡張)
depends_on: []
parallel_with: [T1-2, T1-9]
estimated_effort: S
files_touched:
  - docs/migrations/20260518_add_omni_reference_assets.sql
wave: 1
agent: backend
---

## 目的

v3 計画書 §6.6 に従い、`omni_reference_assets` 新規テーブル (RLS SELECT only + CHECK r2_key prefix) と `video_generations` への 3 つの JSONB snapshot カラム追加マイグレーションを作成し、Supabase に適用する。

## 前提

- 依存タスク: なし (Wave 1 起点)
- 並列実行可: T1-2 (r2.py)、T1-9 (FE 型) — DB と独立
- 参照箇所: v3 計画書 §6.6, §15.4 (Migration テスト)
- Supabase MCP 経由で適用 (CLAUDE.md ルール準拠)

## 変更内容

### 新規ファイル: `docs/migrations/20260518_add_omni_reference_assets.sql`

```sql
-- 1. 新規テーブル omni_reference_assets
CREATE TABLE IF NOT EXISTS omni_reference_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  r2_key text NOT NULL,
  public_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('video', 'audio', 'image')),
  content_type text NOT NULL,
  duration_seconds numeric,
  file_size_bytes bigint NOT NULL,
  consent_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  -- v3: 外部 URL 注入の構造防止
  CONSTRAINT r2_key_prefix CHECK (r2_key LIKE 'omni-references/%'),
  CONSTRAINT public_url_https CHECK (public_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS idx_omni_ref_user ON omni_reference_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_omni_ref_expires ON omni_reference_assets(expires_at);

-- 2. RLS (v3: SELECT only)
ALTER TABLE omni_reference_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON omni_reference_assets
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE policy は意図的に作成しない (全 client 拒否)
-- service-role キーは RLS bypass で問題なし

-- 3. video_generations に URL snapshot カラム追加
ALTER TABLE video_generations
  ADD COLUMN IF NOT EXISTS image_reference_urls JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS video_reference_urls JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audio_reference_urls JSONB DEFAULT NULL;

ALTER TABLE video_generations
  ADD CONSTRAINT image_reference_urls_max_9 CHECK (
    image_reference_urls IS NULL OR jsonb_array_length(image_reference_urls) <= 9
  ),
  ADD CONSTRAINT video_reference_urls_max_3 CHECK (
    video_reference_urls IS NULL OR jsonb_array_length(video_reference_urls) <= 3
  ),
  ADD CONSTRAINT audio_reference_urls_max_3 CHECK (
    audio_reference_urls IS NULL OR jsonb_array_length(audio_reference_urls) <= 3
  );
```

### Supabase 適用

`mcp__supabase__apply_migration` で適用、tool 戻り値の成功確認。

## 完了条件 (AC)

- [ ] `docs/migrations/20260518_add_omni_reference_assets.sql` が作成されている
- [ ] Supabase に migration 適用済 (mcp__supabase__apply_migration 成功)
- [ ] `omni_reference_assets` テーブルが作成されている (mcp__supabase__list_tables で確認)
- [ ] `video_generations` に 3 つの新カラムが追加されている (NULL default)
- [ ] RLS policy `select_own` が存在し、INSERT/UPDATE/DELETE policy は存在しない
- [ ] CHECK 制約 `r2_key_prefix` / `public_url_https` が存在する
- [ ] 既存 `video_generations` 行は新カラム NULL のまま影響なし (AC-11)

## ロールバック

```sql
DROP TABLE IF EXISTS omni_reference_assets CASCADE;
ALTER TABLE video_generations
  DROP COLUMN IF EXISTS image_reference_urls,
  DROP COLUMN IF EXISTS video_reference_urls,
  DROP COLUMN IF EXISTS audio_reference_urls;
```

## 参照

- v3 計画書 §6.6 (Migration 仕様)
- v3 計画書 §15.4 (Migration テスト)
- v3 計画書 AC-11 / AC-19 / AC-22
- CLAUDE.md "Supabase Migrations" セクション
