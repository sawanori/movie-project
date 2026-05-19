---
id: T3-19
phase: 3
title: README/Docs 追記 (運用手順 + UI 操作 + 著作権同意 + r2_key 規約)
depends_on: [T3-18]
parallel_with: []
estimated_effort: S
files_touched:
  - movie-maker-api/CLAUDE.md
  - movie-maker/CLAUDE.md
  - movie-maker-api/README.md (or docs/features/omni-reference.md 新規)
  - docs/plans/2026-05-18_seedance-omni-reference-v3.md (運用追記反映フラグ)
wave: 13
agent: mixed
---

## 目的

v3 計画書 §18 に従い、本番運用に必要なドキュメントを追記する:

1. R2 Custom Domain 要件 (本番)
2. 著作権同意要件 (ユーザー向け説明)
3. r2_key 規約 (`omni-references/{user_id}/{uuid}.{ext}`)
4. RLS パターン (SELECT only + service-role INSERT)
5. UI 操作手順 (OmniReferenceNode 使い方)
6. GC 運用 (TTL 72h, 日次バッチ)

## 前提

- 依存タスク: T3-18 (E2E pass で運用準備完了)
- 並列実行可: なし (最終タスク)

## 変更内容

### 1. `movie-maker-api/CLAUDE.md` 追記

```markdown
## Omni Reference (Seedance 2.0) 運用

### R2 Custom Domain 必須
本番では `R2_PUBLIC_URL` に Cloudflare R2 Custom Domain を設定必須
(omni-references/ への公開 URL 安定化のため)。

### r2_key 規約
- 形式: `omni-references/{user_id}/{uuid}.{ext}`
- 既存 `videos/` `bgm/` `images/` prefix と重複しない
- 動画は `r2.upload_user_video(key=...)`、audio/image は `r2.upload_with_key(...)` を使用
- `upload_video`/`upload_audio`/`upload_image` は内部で prefix 結合するため omni-references 用途では **使用禁止**

### RLS パターン
- `omni_reference_assets`: SELECT only policy のみ作成
- INSERT/UPDATE/DELETE は **service-role キー経由のみ** (RLS bypass)
- CHECK 制約 `r2_key LIKE 'omni-references/%'` で外部 URL 注入防止

### GC バッチ
- Railway scheduled job: `python scripts/run_omni_gc.py` 日次実行
- 72h TTL、`expires_at < now` を R2 + DB から削除
```

### 2. `movie-maker/CLAUDE.md` 追記

```markdown
## OmniReferenceNode (Seedance)

### UI 操作手順
1. NodePalette から "Omni Reference" をキャンバスにドロップ
2. 著作権同意 checkbox を ON にする (これが無いと upload 不可)
3. video / audio / image slot に該当ファイルを drop
4. video 合計 ≤ 15.4s, audio 合計 ≤ 15.0s 内に収める
5. ProviderNode (Seedance) の OMNI_REFERENCE_INPUT handle に接続
6. Generate 実行

### 制限事項
- Seedance Provider 専用
- image: 最大 8 個 (base image_url と合算で PiAPI 上限 9)
- video: 最大 3 個、合計 ≤ 15.4s
- audio: 最大 3 個、**合計** ≤ 15.0s (PiAPI 公式 spec)
- アップロード TTL: 72h
```

### 3. `docs/features/omni-reference.md` (新規) または `movie-maker-api/README.md` 追記

ユーザー向けの機能説明書:

```markdown
# Seedance 2.0 omni_reference 機能

## 概要
PiAPI Seedance 2.0 の参照素材 (image/video/audio mix) 対応。
動きやスタイル、BGM をモデルに参照させて動画を生成。

## 使い方
[UI スクショ + 操作手順]

## 著作権同意
アップロードする素材の権利を保有または利用許諾を得ている必要があります。
未チェックの場合 upload 不可。

## プロンプト @構文
- `@image1`, `@image2`, ...: image_urls 内の N 番目を参照
- `@video1`, ...: video_urls
- `@audio1`, ...: audio_urls
- 例: "The character in @image1 dances to @audio1"

## 制限
- VIP モデル必須 (`seedance-2-preview-vip`)
- 各上限と TTL は CLAUDE.md 参照
```

### 4. v3 計画書フラグ更新

`docs/plans/2026-05-18_seedance-omni-reference-v3.md` の冒頭 status 行を更新:

```diff
- **ステータス**: Draft (v2 ダブルレビュー指摘反映済)
+ **ステータス**: Implemented (実装完了、運用ドキュメント反映済)
```

## 完了条件 (AC)

- [x] `movie-maker-api/CLAUDE.md` 追記済
- [x] `movie-maker/CLAUDE.md` 追記済
- [x] 機能説明ドキュメント (README or features) 作成済
- [x] v3 計画書のステータス更新
- [ ] 追記内容のレビュー (1 名以上承認)

## ロールバック

追記分を revert。

## 参照

- v3 計画書 §18 (ADR / 運用追記要件)
- v3 計画書 §22 (改訂履歴)
- 本タスクで Phase 3 完了
