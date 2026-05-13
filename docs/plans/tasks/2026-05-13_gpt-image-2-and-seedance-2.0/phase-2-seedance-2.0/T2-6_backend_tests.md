---
id: T2-6
phase: 2
title: backend テスト追加 (Seedance 2.0)
depends_on:
  - T2-2
  - T2-3
estimated_effort: M
files_touched:
  - movie-maker-api/tests/videos/test_piapi_seedance_provider.py
---

## 目的

`PiAPISeedanceProvider` の全ユニットテストを追加し、CI で全ケース PASS させる。

## 前提

- T2-2 完了 (`PiAPISeedanceProvider` 実装済み)
- T2-3 完了 (`get_video_provider("seedance")` 動作確認)
- `pytest-asyncio` が利用可能
- `respx` または `unittest.mock.AsyncMock` + `httpx` モックが利用可能
- 実 API コール禁止

## 変更内容

新規ファイル `movie-maker-api/tests/videos/test_piapi_seedance_provider.py` を作成する。

参照パターン: `tests/videos/test_text_to_image.py`

### 実装するテストケース (Design Doc §7 仕様通り)

**`test_generate_video_success`**
- `httpx.AsyncClient.post` をモック → `{"data": {"task_id": "seed_123"}}` を返す
- `provider.generate_video(image_url="https://example.com/img.png", prompt="test", duration=5, aspect_ratio="9:16")` を呼ぶ
- 戻り値が `"seed_123"` であることを assert
- リクエスト body に `audio` フィールドが含まれないことを assert

**`test_check_status_completed`**
- `httpx.AsyncClient.get` をモック → `{"data": {"status": "Completed", "output": {"video": "https://mp4.example/out.mp4"}}}` を返す
- `VideoStatus.status == VideoGenerationStatus.COMPLETED` を assert
- `VideoStatus.progress == 100` を assert
- `VideoStatus.video_url == "https://mp4.example/out.mp4"` を assert

**`test_check_status_failed_credit`**
- GET → `{"data": {"status": "Failed", "error": {"message": "insufficient credit balance"}}}` を返す
- `VideoStatus.status == VideoGenerationStatus.FAILED` を assert
- `VideoStatus.error_message` に `"クレジット"` が含まれることを assert

**`test_duration_clamping`**
- `duration=7` を渡したとき、POST リクエスト body の `input.duration` が `5` であることを assert
- `duration=12` を渡したとき、`input.duration` が `10` であることを assert

**`test_camera_work_ignored`**
- `camera_work="zoom_in"` を渡したとき、POST リクエスト body に `camera_control` キーが含まれないことを assert

## 完了条件 (AC)

- [ ] `pytest tests/videos/test_piapi_seedance_provider.py -v` で全テスト PASS
- [ ] 5 テストケース全て実装済み
- [ ] 実 API コールが発生していない
- [ ] `pytest tests/videos/ -v` で既存テスト含め失敗増加なし (既知 2 件除く)

## テスト

このタスク自体がテストの追加。

TDD サイクル: 理想的には T2-2 実装前に RED で書き、T2-2 実装で GREEN にする。本タスクが T2-2 後でも、各テストが GREEN であることを確認する。

## ロールバック

`tests/videos/test_piapi_seedance_provider.py` を削除する。

## 参照

- Design Doc §7 (`test_piapi_seedance_provider.py` テストケース仕様)
- Design Doc §3.2 (リクエストボディ仕様、duration 変換、エラーマッピング)
- `movie-maker-api/tests/videos/test_text_to_image.py` (参照パターン)
