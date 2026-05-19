# Seedance 2.0 omni_reference 機能

## 1. 機能概要

PiAPI Seedance 2.0 が公式サポートする **omni_reference モード** に対応した機能です。
ユーザーは動画 / 音声 / 画像をミックスして参照素材としてモデルに与え、
モーション・スタイル・BGM/環境音などを参照させた新しい動画を生成できます。

| モード | 入力素材 | 用途 |
|--------|---------|------|
| `text_to_video` | prompt のみ | 純テキストからの生成 |
| `first_last_frames` | start (+ end) フレーム画像 | 始終フレーム指定 |
| **omni_reference** | **image_urls / video_urls / audio_urls の mix** | スタイル / モーション / 音声を mix |

本機能は **Seedance Provider 専用** であり、Provider Node で `seedance` を選択しないと
OmniReferenceNode は接続できません。

---

## 2. UI 操作手順 (Node Editor)

1. ノードパレットから **OmniReferenceNode** をキャンバスにドラッグ＆ドロップする
2. ノード内の **著作権同意 checkbox を ON** にする (これが OFF だと upload ボタンが無効)
3. 各 slot にファイルを drop / 選択:
   - **image slot**: 最大 8 個 (base image_url と合算で PiAPI 上限 9)
   - **video slot**: 最大 3 個 (合計 ≤ 15.4 秒)
   - **audio slot**: 最大 3 個 (合計 ≤ 15.0 秒)
4. 合計プログレスバーで上限内に収まっていることを確認
5. ProviderNode (Seedance) の `OMNI_REFERENCE_INPUT` handle に OmniReferenceNode を接続
6. プロンプト欄で `@image1` / `@video1` / `@audio1` 構文を使い、必要に応じて参照位置を指定
7. Generate を実行

---

## 3. 対応形式と制約

| 種別 | 最大個数 | 合計上限 | ファイルサイズ上限 | 備考 |
|------|---------|---------|------------------|------|
| image | 8 個 (追加) | base + 追加 ≤ 9 | 10 MB / 1 ファイル | jpg / png / webp |
| video | 3 個 | 合計 ≤ 15.4 秒 | 50 MB / 1 ファイル | mp4 / mov |
| audio | 3 個 | **合計 ≤ 15.0 秒** | 10 MB / 1 ファイル | mp3 / wav / m4a (PiAPI 公式 spec 準拠) |

- duration は frontend で解析後に backend validator でも再検証されます
- 各個別上限 (image≤9, video≤3, audio≤3) 以外の「合計 1-12」制約は OpenAPI 仕様に存在しないため適用しません

---

## 4. 著作権同意の意味

OmniReferenceNode の "著作権同意" checkbox は、アップロードする素材について
以下のいずれかを満たすことをユーザーが確認するためのものです:

- ユーザー自身が著作権を保有している
- 著作権者から利用許諾を得ている (商用利用を含む)
- パブリックドメイン / クリエイティブ・コモンズ (利用条件を遵守すること)

サーバー (`/api/v1/videos/upload-omni-*-reference`) は `consent_accepted=true` の場合のみ
upload を受け付けます。 `false` または欠落時は 422 エラーを返却します。

---

## 5. プロンプト @構文

プロンプト本文内で参照素材の位置を指定できます。N は **1-indexed**:

| 構文 | 参照対象 | 例 |
|------|---------|----|
| `@image1`, `@image2`, ... | `image_urls` 配列 N 番目 (base 含む) | "The character in @image1 dances" |
| `@video1`, `@video2`, ... | `video_urls` 配列 N 番目 | "Follow the motion of @video1" |
| `@audio1`, `@audio2`, ... | `audio_urls` 配列 N 番目 | "Sync with @audio1's beat" |

N が対応 asset 数を超える場合は backend validator が **422** を返します。

---

## 6. VIP モデル必須要件

omni_reference は **preview 系統で VIP モデル必須** です:

- `seedance-2-preview-vip` (720p / 1080p)
- `seedance-2-fast-preview-vip`

非 VIP モデル選択時に omni_reference を含めると provider 側で拒否されます。
`.env` の `PIAPI_SEEDANCE_TASK_TYPE` を `seedance-2-preview-vip` に設定してください。

---

## 7. アセットの自動削除 (72h TTL)

`/api/v1/videos/upload-omni-*-reference` でアップロードされた素材は
`omni_reference_assets` テーブルに `expires_at = now() + 72h` で記録されます。

- **目的**: 生成タスクが消費した後のストレージコスト抑制、未生成データの自動 GC
- **削除対象**: `expires_at < now()` のレコードと、対応する R2 オブジェクト
- **削除頻度**: 日次バッチ (`app.tasks.gc_omni_assets.gc_expired_omni_assets`)
- **ユーザー影響**: 72h を超えて未使用の参照素材は再アップロードが必要

詳細な GC 運用は `docs/runbooks/omni-reference-operations.md` を参照してください。

---

## 8. セキュリティ 3 重防御

外部 URL 注入 / 他ユーザー素材の参照を防ぐため、3 層の防御を実装しています:

### 8.1 API 型 UUID
リクエストでは `image_reference_asset_ids` / `video_reference_asset_ids` /
`audio_reference_asset_ids` に **asset_id (UUID)** のみを受け付けます。
外部 URL を直接渡すことは Pydantic schema レベルで不可能です。

### 8.2 RLS SELECT only ポリシー
`omni_reference_assets` テーブルには **SELECT policy のみ** を作成しており、
クライアント (anon / authenticated key) からの直接 INSERT / UPDATE / DELETE は
RLS により拒否されます。書き込みは backend の service-role キー経由のみ可能です。

### 8.3 CHECK 制約 (r2_key prefix)
DB スキーマレベルで `CHECK (r2_key LIKE 'omni-references/%')` 制約を設置し、
万一 service-role 経由でも `external/x.mp4` のような不正な key の INSERT は
構造的に弾かれます。

---

## 9. 本番運用時の TODO

本番リリース時には以下を実施してください。詳細手順は
`docs/runbooks/omni-reference-operations.md` を参照:

- **R2 Custom Domain 設定**: `r2.dev` は開発専用、本番は `assets.example.com` 形式の独自ドメイン必須
- **GC バッチ cron 登録**: Railway scheduled jobs または Supabase pg_cron で
  `gc_expired_omni_assets` を日次実行 (推奨: 03:00 JST = 18:00 UTC)

---

## 10. 関連ドキュメント

- 設計 Doc: `docs/plans/2026-05-18_seedance-omni-reference-v3.md`
- 運用ランブック: `docs/runbooks/omni-reference-operations.md`
- Migration: `docs/migrations/20260518_add_omni_reference_assets.sql`
- Backend API: `movie-maker-api/app/videos/router.py` (`upload-omni-*-reference`)
- Frontend Node: `movie-maker/components/node-editor/nodes/OmniReferenceNode.tsx`
