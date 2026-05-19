---
id: T3-16
phase: 3
title: R2 Custom Domain 設定 + 検証 (R-1〜R-3)
depends_on: [T1-4]
parallel_with: []
estimated_effort: M
files_touched:
  - movie-maker-api/.env.example
  - docs/ops/r2-custom-domain.md (新規)
wave: 11
agent: ops
---

## 目的

v3 計画書 §15.6 (R-1〜R-3) + §18 に従い、本番環境で R2 Public Bucket の Custom Domain (R2_PUBLIC_URL) を設定し、`omni-references/*` の URL が anonymous GET で 200 になることを検証する。

## 前提

- 依存タスク: T1-4 (Upload API が動作し、omni-references/ プレフィクスへの実 PUT が発生)
- 並列実行可: なし (Wave 11 単独)
- 参照箇所: v3 計画書 §15.6, §18 ADR (本番 Custom Domain 要件)

## 変更内容

### 1. Cloudflare R2 設定 (手動 / dashboard)

1. 本番 R2 バケットの Settings → Public access → Custom Domain
2. `media.example.com` (実ドメイン) を割当
3. DNS CNAME 設定 (Cloudflare 自動) 確認
4. SSL 証明書発行待機 (通常数分)

### 2. 環境変数更新

#### Railway (本番 backend)

```
R2_PUBLIC_URL=https://media.example.com
```

#### `movie-maker-api/.env.example` ドキュメント追記

```dotenv
# 本番では Cloudflare R2 Custom Domain を必須設定 (omni-references 公開 URL の安定化)
R2_PUBLIC_URL=https://media.example.com
# 開発環境 (.r2.dev) は disable 推奨
```

### 3. 新規 docs: `docs/ops/r2-custom-domain.md`

```markdown
# R2 Custom Domain 運用手順

## 本番要件
- omni-references/ への公開 URL は Custom Domain 必須 (R-2)
- .r2.dev ドメインは開発のみ

## 設定手順
1. Cloudflare dashboard → R2 → Bucket → Settings → Custom Domain
2. ドメイン入力 → DNS 自動設定確認
3. R2_PUBLIC_URL を環境変数に設定

## 検証
- curl -I https://media.example.com/omni-references/<user>/<id>.mp4 → 200
- Content-Type ヘッダが正しい (video/mp4 等)
```

### 4. 検証 (R-1〜R-3)

| # | 検証 | 方法 |
|---|------|------|
| R-1 | omni-references/* の公開 URL を anonymous GET で 200 | `curl -I <url>` |
| R-2 | 本番では `R2_PUBLIC_URL` が Custom Domain | `echo $R2_PUBLIC_URL` (Railway) |
| R-3 | omni_reference_assets RLS: 他ユーザー JWT で SELECT 0 件 | Supabase SQL Editor |

## 完了条件 (AC)

- [ ] Cloudflare R2 Custom Domain 設定完了
- [ ] `R2_PUBLIC_URL` 本番環境変数更新済
- [ ] `curl -I <omni-references URL>` で **200 OK** + 正しい Content-Type (R-1, AC-12)
- [ ] 環境変数が Custom Domain (R-2)
- [ ] 他ユーザー JWT で SELECT 0 件確認 (R-3)
- [ ] `.env.example` 追記済
- [ ] `docs/ops/r2-custom-domain.md` 作成済

## ロールバック

Cloudflare dashboard で Custom Domain 削除、`R2_PUBLIC_URL` を `.r2.dev` に revert。

## 参照

- v3 計画書 §15.6 (R-1〜R-3)
- v3 計画書 §18 (Custom Domain 要件は README 追記)
- v3 計画書 AC-12 (R2 公開 URL 有効性)
- [Cloudflare R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
