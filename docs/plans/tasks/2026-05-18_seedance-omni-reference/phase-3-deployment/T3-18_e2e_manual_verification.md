---
id: T3-18
phase: 3
title: E2E 手動検証 (Node Editor → omni 動画生成 → PiAPI payload 確認 → 完成)
depends_on: [T2-15a, T2-15b, T3-16]
parallel_with: [T3-17c]
estimated_effort: M
files_touched:
  - docs/plans/tasks/2026-05-18_seedance-omni-reference/_e2e_results.md (新規)
wave: 12
agent: mixed
---

## 目的

v3 計画書 §15.5 のとおり、Phase 1 + 2 + R2 Custom Domain (T3-16) 完了状態で E2E 手動検証を実施。Node Editor から OmniReferenceNode を使った Seedance 動画生成が end-to-end で成功すること、PiAPI に送信される payload が契約通りであることを確認する。

## 前提

- 依存タスク:
  - T2-15a (Frontend QF pass)
  - T2-15b (Frontend CR pass)
  - T3-16 (R2 Custom Domain 設定完了)
- 並列実行可: T3-17c (cron 登録と独立)

## 実施手順 (v3 §15.5 から)

### A. Backend curl 検証 (再実施)

```bash
# 1. video reference upload
curl -X POST http://localhost:8000/api/v1/videos/upload-omni-video-reference \
  -H "Authorization: Bearer $JWT" \
  -F "file=@sample.mp4" \
  -F "consent_accepted=true"
# 期待: 200 + {id, url, duration_seconds, expires_at, ...}
# 確認: URL path 部 = "omni-references/{user_id}/{uuid}.mp4"
#      psql で SELECT r2_key FROM omni_reference_assets WHERE id='<id>' → 一致

# 2. cross-user 試行
# 別ユーザー JWT で他人 asset_id を POST /videos/story → 422

# 3. audio 合計超過試行
# audio_reference_asset_ids 3 本 (各 6s) → POST /videos/story → 422

# 4. RLS 直接 INSERT 試行 (anon key)
psql "postgresql://anon:..." -c \
  "INSERT INTO omni_reference_assets(user_id, r2_key, ...) VALUES(...);"
# 期待: 拒否 (42501)
```

### B. Frontend E2E

1. `npm run dev`
2. Node Editor を開く
3. Provider Node 配置 → Seedance 選択
4. ImageInputNode 配置 → base 画像 upload
5. OmniReferenceNode 配置 → 著作権同意 ON
6. video slot 1 に MP4 (5s) drop → upload 完了確認、合計 "5.0 / 15.4s"
7. audio slot 1 に MP3 (10s) drop → 合計 "10.0 / 15.0s"
8. audio slot 2 に MP3 (10s) drop → **合計 "20.0 / 15.0s" 赤色警告** 確認 (F-17)
9. slot 2 をクリア → 合計 "10.0" に戻る
10. ProviderNode の OMNI_REFERENCE_INPUT handle に接続
11. Generate ボタン押下 → POST /videos/story が **201 Created** で video_id 返却
12. Network tab で送信 payload 確認: `image_reference_asset_ids` / `video_reference_asset_ids` / `audio_reference_asset_ids` 含まれる
13. Backend log で PiAPI payload 確認:
    - `task_type: "seedance-2-preview-vip"`
    - `input.image_urls` / `input.video_urls` / `input.audio_urls` 含まれる
    - `input.mode` 含まれない (B-30 契約)
14. 動画完成 (ポーリング完了、status=completed)

### C. R2 / GC 検証

1. 過去日付 asset を service-role で手動 INSERT
2. `python scripts/run_omni_gc.py` 実行
3. R2 オブジェクト + DB 行 削除確認

### D. 結果記録

`docs/plans/tasks/2026-05-18_seedance-omni-reference/_e2e_results.md` に各検証項目の pass/fail と評価日時、検証者を記録。失敗があれば該当タスクへ差し戻し。

## 完了条件 (AC)

- [ ] A. curl 検証 4 種全 pass (upload / cross-user 422 / audio 合計 422 / RLS 拒否)
- [ ] B. Frontend E2E 14 ステップ全成功、特に:
  - [ ] audio 合計 > 15s で赤警告表示 (AC-4b)
  - [ ] POST /videos/story が 201 (H-B)
  - [ ] PiAPI payload に `image_urls` / `video_urls` / `audio_urls` 含む、`mode` 含まない (AC-5)
  - [ ] 動画完成
- [ ] C. GC: 期限切れ asset の R2 + DB 削除確認 (AC-17, AC-21)
- [ ] `_e2e_results.md` に結果記録
- [ ] AC-1〜AC-23 全 pass (該当する範囲で)

## ロールバック

E2E 失敗の根本原因タスクへ差し戻し。

## 参照

- v3 計画書 §15.5 (E2E 手動検証手順表)
- v3 計画書 §15.6 (R 検証)
- v3 計画書 AC 全般
