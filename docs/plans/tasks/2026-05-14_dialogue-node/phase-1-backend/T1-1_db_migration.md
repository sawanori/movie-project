---
id: T1-1
phase: 1
title: "dialogue_generations DB マイグレーション SQL 作成 + Supabase 適用"
depends_on: []
estimated_effort: S
files_touched:
  - docs/migrations/20260514_dialogue_generations.sql
---

## 目的

`dialogue_generations` テーブルを Supabase 上に作成し、Dialogue ノードのジョブ管理基盤を整える。
バックエンドの CRUD (T1-3) とプロセッサー (T1-4) はこのテーブルに依存するため、最初に適用する。

## 前提

- Supabase MCP ツール (`mcp__supabase__apply_migration`) が利用可能であること
- `tts_generations` テーブルが既に存在すること (FK 参照先)
- `docs/migrations/20260315_tts_generations.sql` を参照して構造を把握しておくこと

## 変更内容

### 1. SQL ファイル作成

`docs/migrations/20260514_dialogue_generations.sql` を Design Doc §12 の内容そのままで作成する。

主な要素:
- `dialogue_generations` テーブル (UUID PK、user_id FK、status CHECK 制約、入力パラメータカラム、provider カラム、tts_generation_id FK、出力カラム、タイムスタンプ)
- インデックス 3 件 (user_id, status, created_at DESC)
- RLS ポリシー 5 件 (SELECT/INSERT/UPDATE/DELETE ユーザー自身 + service_role 全権)
- `updated_at` 自動更新トリガー

**重要**: `provider` カラムには DEFAULT を付けない。`service` 層が `settings.TTS_PROVIDER` を必ず明示的に渡す。

### 2. Supabase MCP で適用

`mcp__supabase__apply_migration` を使って SQL を実行する。

### 3. 適用確認

`mcp__supabase__list_tables` で `dialogue_generations` テーブルが存在することを確認する。

## 完了条件 (AC)

- [ ] `docs/migrations/20260514_dialogue_generations.sql` ファイルが存在する
- [ ] SQL が Design Doc §12 の内容と一致する (`provider` カラムに DEFAULT なし)
- [ ] Supabase 上で `dialogue_generations` テーブルが作成されている
- [ ] 以下のカラムが存在する: `id, user_id, status, video_url, text, voice_id, language, speed, provider, tts_generation_id, output_video_url, error_message, created_at, updated_at`
- [ ] RLS が有効で 5 件のポリシーが登録されている
- [ ] `updated_at` トリガーが登録されている

## テスト

Supabase MCP で以下を確認:

```sql
-- テーブル存在確認
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'dialogue_generations';

-- RLS 確認
SELECT pol.polname FROM pg_policy pol
JOIN pg_class cls ON pol.polrelid = cls.oid
WHERE cls.relname = 'dialogue_generations';

-- カラム確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'dialogue_generations'
ORDER BY ordinal_position;
```

単体テストなし (DDL のみ)。

## ロールバック

```sql
DROP TABLE IF EXISTS dialogue_generations CASCADE;
DROP FUNCTION IF EXISTS update_dialogue_generations_updated_at CASCADE;
```

## 参照

- Design Doc §12 (DB マイグレーション)
- Design Doc §8 (接続 Handle 設計 — テーブル設計の背景)
- `docs/migrations/20260315_tts_generations.sql` (参考構造)
