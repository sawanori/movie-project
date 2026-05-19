# Omni Reference 運用ランブック

Seedance 2.0 omni_reference 機能の本番運用手順をまとめます。
機能仕様は `docs/features/seedance-omni-reference.md` を参照。

---

## 1. GC バッチ実行手順

### 1.1 概要

`omni_reference_assets` テーブルの `expires_at < now()` レコードを R2 オブジェクトと
DB 行の両方から削除するバッチ。

- **関数**: `app.tasks.gc_omni_assets.gc_expired_omni_assets`
- **TTL**: 72 時間 (insert 時に `expires_at = now() + 72h`)
- **推奨実行頻度**: 日次

### 1.2 手動実行 (debug / 緊急時)

```bash
cd movie-maker-api
source venv/bin/activate
python -c "import asyncio; from app.tasks.gc_omni_assets import gc_expired_omni_assets; asyncio.run(gc_expired_omni_assets())"
```

実行ログは標準出力 + `logs/app.log` に出力されます。
削除件数と失敗件数は INFO ログで確認可能。

### 1.3 定期実行登録

**推奨**: Railway scheduled jobs (cron syntax)

| cron | 説明 |
|------|------|
| `0 18 * * *` | UTC 18:00 = JST 03:00 に毎日実行 |

Railway ダッシュボード → Project → Settings → Cron Jobs から以下を設定:

```
Command: python -c "import asyncio; from app.tasks.gc_omni_assets import gc_expired_omni_assets; asyncio.run(gc_expired_omni_assets())"
Schedule: 0 18 * * *
```

**代替案**: Supabase `pg_cron` でも可。ただし R2 削除は backend 側 SDK 経由のため、
Supabase 上では DB 行削除のみ → R2 オブジェクトが孤児化するため非推奨。

---

## 2. R2 Custom Domain 設定手順 (本番リリース時)

`r2.dev` ドメインは Cloudflare により dev 用途のレート制限が課されるため、
本番では Custom Domain 必須です。

### 2.1 設定手順

1. Cloudflare ダッシュボードにログイン
2. R2 → `movie-maker` バケットを選択
3. Settings → Public Access → **Custom Domain** をクリック
4. 任意のドメイン (例: `assets.example.com`) を入力
5. DNS が Cloudflare 管理ドメインの場合 → CNAME が自動追加される
   外部 DNS の場合 → 表示される CNAME を手動で追加
6. SSL 証明書が自動発行されるまで数分待機 (Active 表示確認)

### 2.2 環境変数更新

`.env` (本番、Railway 環境変数) の `R2_PUBLIC_URL` を更新:

```bash
# Before (dev)
R2_PUBLIC_URL=https://your-bucket.r2.dev

# After (production)
R2_PUBLIC_URL=https://assets.example.com
```

更新後、backend を再起動して反映を確認 (新規 upload の `public_url` が新ドメインになっていること)。

---

## 3. オブジェクト孤児化のリカバリ (H-NEW-1 対応)

R2 にあるが DB に存在しないオブジェクト (孤児) の検出と削除手順。

### 3.1 検出 (定期確認 SQL)

Supabase SQL Editor で以下を実行し、過去 7 日以内に upload された筈の
DB 行があるか確認:

```sql
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS asset_count,
  count(*) FILTER (WHERE expires_at < now()) AS expired_count
FROM omni_reference_assets
WHERE created_at > now() - interval '7 days'
GROUP BY day
ORDER BY day DESC;
```

R2 側のオブジェクト一覧と差分を取りたい場合:

```bash
# R2 上の omni-references/ 配下を一覧
aws s3 ls s3://movie-maker/omni-references/ --recursive --endpoint-url=$R2_ENDPOINT
```

### 3.2 リカバリ手順

孤児オブジェクトを発見した場合:

1. オブジェクト key を控える (例: `omni-references/{user_id}/{uuid}.mp4`)
2. DB に該当行が無いことを再確認
3. `aws s3 rm s3://movie-maker/{key} --endpoint-url=$R2_ENDPOINT` で個別削除
4. または `gc_expired_omni_assets` の拡張版を用意し、R2-only オブジェクトを一括削除

---

## 4. 既知の制約

| 項目 | 内容 | 対応状況 |
|------|------|---------|
| audio 合計 15s 検証 | upload 単体では合計不可知 → Router 側で asset 解決後に再検証 (>15s で 422) | 実装済 |
| Storyboard 経路 | `storyboard_processor.py` 経由の生成は omni_reference 非対応 | v3 §17 #7 で非スコープ宣言 |
| consent_accepted リロード | ページリロード時の state 保持挙動は M-1 で未確定 (現状は再チェック必要) | 既知 |
| usage カウント refund | 422 で生成キャンセル時の refund ロジック未実装 | v3 §17 #2 で非スコープ宣言 |
| anon key 直接 INSERT | RLS で拒否 (SELECT only policy) | テスト B-39 で検証済 |
| 外部 URL 注入 | CHECK 制約 `r2_key LIKE 'omni-references/%'` で拒否 | テスト B-40 で検証済 |

---

## 5. 参照

- 設計 Doc: `docs/plans/2026-05-18_seedance-omni-reference-v3.md`
- 機能説明: `docs/features/seedance-omni-reference.md`
- GC 実装: `movie-maker-api/app/tasks/gc_omni_assets.py`
- Migration: `docs/migrations/20260518_add_omni_reference_assets.sql`
