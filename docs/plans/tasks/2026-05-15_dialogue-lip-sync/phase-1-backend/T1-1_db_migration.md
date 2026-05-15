---
id: T1-1
phase: 1
title: "dialogue_generations DB マイグレーション SQL 作成 + Supabase 適用"
depends_on: []
estimated_effort: S
files_touched:
  - docs/migrations/20260515_dialogue_use_lip_sync.sql
---

## 目的

`dialogue_generations` テーブルに `use_lip_sync` (BOOLEAN NOT NULL DEFAULT false) と `lip_sync_generation_id` (UUID FK → `lip_sync_generations.id`) の 2 カラムを追加する。後続の BE 拡張タスク (T1-2〜T1-5) はこのカラムの存在を前提とするため、最初に適用する。

## 前提

- Supabase MCP ツール (`mcp__supabase__apply_migration`) が利用可能であること
- `dialogue_generations` テーブルが既に存在すること (元 Design Doc T1-1 で作成済)
- `lip_sync_generations` テーブルが既に存在すること (FK 参照先)

## 変更内容

### 1. SQL ファイル作成

`docs/migrations/20260515_dialogue_use_lip_sync.sql` を Design Doc §9 の内容そのままで作成する。

主な要素:
- `ALTER TABLE dialogue_generations ADD COLUMN IF NOT EXISTS use_lip_sync BOOLEAN NOT NULL DEFAULT false`
- `ALTER TABLE dialogue_generations ADD COLUMN IF NOT EXISTS lip_sync_generation_id UUID REFERENCES lip_sync_generations(id) ON DELETE SET NULL`
- `COMMENT ON COLUMN` で両カラムの説明を付与
- インデックスはコメントアウト状態のまま (逆引き頻度低のため)

### 2. Supabase MCP で適用

`mcp__supabase__apply_migration` を使って SQL を実行する。

### 3. 適用確認

`mcp__supabase__list_tables` または以下の SQL でカラムの存在を確認する。

## 完了条件 (AC)

- [ ] `docs/migrations/20260515_dialogue_use_lip_sync.sql` が存在する
- [ ] SQL が Design Doc §9 の内容と一致する (ADD COLUMN IF NOT EXISTS 構文、DEFAULT false、FK ON DELETE SET NULL)
- [ ] Supabase 上で `dialogue_generations.use_lip_sync` カラムが存在し、型が `boolean`、デフォルト値が `false`
- [ ] Supabase 上で `dialogue_generations.lip_sync_generation_id` カラムが存在し、型が `uuid`、NULL 許容
- [ ] 既存レコードの `use_lip_sync` が `false` になっている (DEFAULT 適用確認)
- [ ] FK 制約が `lip_sync_generations(id)` を参照していること

## テスト

Supabase MCP または psql で以下を確認:

```sql
-- カラム存在確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'dialogue_generations'
  AND column_name IN ('use_lip_sync', 'lip_sync_generation_id')
ORDER BY column_name;

-- FK 制約確認
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'dialogue_generations'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'lip_sync_generation_id';
```

単体テストなし (DDL のみ)。

## ロールバック

```sql
ALTER TABLE dialogue_generations DROP COLUMN IF EXISTS lip_sync_generation_id;
ALTER TABLE dialogue_generations DROP COLUMN IF EXISTS use_lip_sync;
```

## 参照

- Design Doc §9 (DB マイグレーション全文)
- Design Doc §2 合意チェックリスト「中間データ参照」項目
- Design Doc §13 リスク「既存 record の use_lip_sync カラム欠如時の挙動」
- `docs/migrations/20260514_dialogue_generations.sql` (元テーブル定義)
