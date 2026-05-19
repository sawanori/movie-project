---
id: T1-8b
phase: 1
title: Backend code-reviewer (v3 計画書との整合性チェック)
depends_on: [T1-6, T1-17b, T1-storyboard_smoke]
parallel_with: [T1-8a]
estimated_effort: S
files_touched: []
wave: 6
agent: ops
---

## 目的

Wave 1-5 の Backend 実装を v3 計画書とつき合わせ、設計通りに実装されているかをレビュー。特に v3 で追加されたセキュリティ事項 (RLS SELECT only、CHECK 制約、3 重防御、r2_key 一致、audio 合計検証) が完全実装されているか確認する。

## 前提

- 依存タスク: T1-6, T1-17b, T1-storyboard_smoke
- 並列実行可: T1-8a
- 参照: v3 計画書全文

## レビュー項目

### 1. v3 主要変更点の実装確認

| v3 指摘 | 確認箇所 | チェック |
|--------|---------|---------|
| NEW-C-1: RLS SELECT only | `docs/migrations/20260518_*.sql` | INSERT/UPDATE/DELETE policy が **存在しない** |
| NEW-C-1: CHECK r2_key prefix | 同上 | `r2_key LIKE 'omni-references/%'` 存在 |
| NEW-C-2: upload_with_key 新規 | `r2.py` | 関数存在 + 二重 prefix なし |
| NEW-C-2: 動画は upload_user_video 使用 | `videos/router.py` upload-omni-video | 関数選定正しい |
| NEW-C-3: MAX_AUDIO_TOTAL=15s | `piapi_seedance_provider.py` + `router.py` | 定数一致 + Router で合計検証 |
| NEW-C-4: image_reference max=8 | `schemas.py` | Pydantic Field max_length=8 |
| NEW-S-1: 「合計 1-12」撤去 | `piapi_seedance_provider.py` + `schemas.py` | MAX_TOTAL_REFERENCES 不在 |
| H-A: audio 単独は防御コードのみ | `piapi_seedance_provider.py` | コメントで明示 |
| H-B: 201 Created | `router.py` /videos/story | status_code=201 維持 |

### 2. 3 重防御の確認

| 防御層 | 実装箇所 | 動作確認 |
|--------|---------|---------|
| (1) Pydantic UUID 型 | schemas.py | B-32 test |
| (2) RLS INSERT 拒否 | migration RLS | (T3 で anon key 実証) |
| (3) CHECK r2_key prefix | migration | (T3 で SQL 試行) |

### 3. テストカバレッジ確認

v3 §15.1 の Backend テスト一覧と新規テストファイルを照合:

| ID | 期待 | 配置 |
|----|------|------|
| B-1〜B-12 | provider | test_piapi_seedance_omni_reference.py |
| B-13〜B-20, B-32, B-16b, B-17a-c | schema | test_omni_reference_schema.py |
| B-21〜B-26, B-33, B-34, B-41 | upload API | test_upload_omni_reference_api.py |
| B-27, B-28, B-28b | story_processor | test_story_processor.py |
| B-29〜B-31 | 契約 | test_piapi_seedance_omni_reference.py |
| B-35, B-36, B-36b, B-43, B-43b, B-43c | asset 解決 | test_asset_id_resolution.py |
| B-37, B-38, B-42 | GC | test_omni_reference_gc.py |

### 4. AC マッピング

| AC | 確認 |
|----|------|
| AC-2 | upload-omni-video-reference + r2_key 一致 |
| AC-5 | provider payload に image_urls/video_urls/audio_urls キー、mode キー無し |
| AC-8 | VIP 違反で BG failed |
| AC-9 | @構文 422 |
| AC-13 | UUID 型で外部 URL 拒否 |
| AC-14, 15 | cross-user / TTL |
| AC-17 | GC バッチ |
| AC-20 | audio 合計 > 15s で 422 |
| AC-21 | r2_key 一致 (二重 prefix 不在) |
| AC-22 | r2_key CHECK 違反 |
| AC-23 | image 合計 (base+ref) ≤ 9 |

### 5. 設計逸脱チェック

- [ ] `input.mode` を送信していないこと (B-30)
- [ ] task_type に既存値以外を使っていないこと (B-31)
- [ ] 外部 URL を直接 schema で受領していないこと (UUID 型限定)

## 完了条件 (AC)

- [ ] 全レビュー項目 OK
- [ ] 設計逸脱なし
- [ ] AC 全件のテストカバー状況確認済
- [ ] 問題発見時はコメント + 該当タスク差し戻し

## ロールバック

不要 (read-only レビュー)。

## 参照

- v3 計画書全文 (特に §0 改訂履歴、§15, §16)
- code-reviewer agent
