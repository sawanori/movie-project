---
id: T1-4
phase: 1
title: "dialogue_processor.py 実装 — TTS 直列 await + ffmpeg + R2 アップロード + 単体テスト"
depends_on:
  - T1-2
  - T1-3
estimated_effort: L
files_touched:
  - movie-maker-api/app/tasks/dialogue_processor.py
  - movie-maker-api/app/dialogue/router.py
  - movie-maker-api/tests/dialogue/test_dialogue_processor.py
---

## 目的

Dialogue ジョブの実処理ロジック (`dialogue_processor.py`) を実装する。
TTS 生成を `await` で直列実行し、ffmpeg で音声ミックスし、R2 にアップロードする。
T1-3 でスタブになっていた `router.py` の `start_dialogue_processing` 呼び出しも有効化する。

## 前提

- T1-2 完了: `mix_audio_to_video` と `_has_audio_track` が実装済みであること
- T1-3 完了: `app/dialogue/service.py` の CRUD が実装済みであること
- `app/tasks/tts_processor.py` の `process_tts_generation` を確認しておくこと
- `app/tts/service.py` の `create_tts_generation` シグネチャを確認しておくこと
- R2 アップロードの既存パターンを `app/tasks/tts_processor.py` から確認しておくこと

## 変更内容

### 1. `app/tasks/dialogue_processor.py` 実装

Design Doc §5-5 の骨格を元に完全実装:

#### `process_dialogue_generation(generation_id: str) -> None`

処理フロー:
1. `get_supabase()` でレコード取得 (user_id, video_url, text, voice_id, language, speed を取得)
2. `update_dialogue_status(generation_id, "processing")` でステータス更新
3. `asyncio.wait_for(実処理, timeout=PROCESSING_TIMEOUT_SECONDS)` でラップ
4. `_run_tts_and_get_audio_url(text, voice_id, language, speed, user_id)` → `audio_url`
5. `_download_file(video_url)` → `local_video_path` (一時ファイル)
6. `_download_file(audio_url)` → `local_audio_path` (一時ファイル)
7. `ffmpeg_service.mix_audio_to_video(local_video_path, local_audio_path, output_path)` → ミックス
8. R2 に合成動画をアップロード → `output_video_url`
9. `update_dialogue_status(generation_id, "completed", output_video_url=output_video_url)`
10. `try/except` で全例外をキャッチ → `update_dialogue_status(generation_id, "failed", error_message=str(e))`

一時ファイル管理:
- `tempfile.TemporaryDirectory()` を使い、処理後に必ずクリーンアップ (`finally` ブロック)

#### `_run_tts_and_get_audio_url(...) -> str`

Design Doc §5-5 の注記通り:
1. `create_tts_generation(user_id, TTSCreateRequest(text, voice_id, language, speed))` → `tts_record`
2. `await process_tts_generation(tts_record["id"])` (直列実行 — ポーリングループ不要)
3. `status_response = await get_tts_status(user_id, tts_record["id"])`
4. `status == "completed"` → `status_response["output_url"]` を返す
5. `status == "failed"` → `ValueError(status_response.get("error_message", "TTS failed"))` を raise

**禁止パターン**: `start_tts_processing` (`asyncio.create_task` 経由) と `get_tts_status` ポーリングを組み合わせる方法は採用しない。

#### `_download_file(url: str) -> str`

- `httpx.AsyncClient` で URL をダウンロード
- `tempfile.NamedTemporaryFile` に書き込む
- `httpx.HTTPStatusError` 発生時は `raise` して呼び出し元でハンドリング

#### `start_dialogue_processing(generation_id: str) -> None`

```python
async def start_dialogue_processing(generation_id: str) -> None:
    asyncio.create_task(process_dialogue_generation(generation_id))
```

### 2. `app/dialogue/router.py` 更新

T1-3 でスタブになっていた箇所を有効化:

```python
from app.tasks.dialogue_processor import start_dialogue_processing

# create_dialogue エンドポイント内:
await start_dialogue_processing(record["id"])
```

### 3. 単体テスト作成 (TDD: Red → Green)

ファイル: `movie-maker-api/tests/dialogue/test_dialogue_processor.py`

Design Doc §11 の `test_dialogue_processor.py` ケースを実装:

| テスト名 | モック対象 | 検証内容 |
|---------|---------|---------|
| `test_process_dialogue_success` | TTS (完了済み), httpx, ffmpeg subprocess (成功), R2 upload | `update_dialogue_status` が `"completed"` と output_video_url で呼ばれる |
| `test_process_dialogue_tts_failed` | TTS (failed) | `update_dialogue_status` が `"failed"` で呼ばれる、エラーメッセージ確認 |
| `test_process_dialogue_download_failed` | httpx → HTTPStatusError (404) | `update_dialogue_status` が `"failed"` で呼ばれる |
| `test_process_dialogue_ffmpeg_failed` | subprocess → returncode=1 | `FFmpegError` → `update_dialogue_status` が `"failed"` で呼ばれる |
| `test_process_dialogue_no_audio_track` | ffprobe → 音声なし | フォールバックの ffmpeg コマンド (`-map 1:a`) が呼ばれる |
| `test_run_tts_and_get_audio_url_success` | TTS サービス + processor | `audio_url` が返る |
| `test_run_tts_and_get_audio_url_failed` | TTS → status=failed | `ValueError` が raise される |

テスト実装方針:
- `unittest.mock.AsyncMock` / `unittest.mock.patch` を使用
- `asyncio.run()` または `pytest-asyncio` の `@pytest.mark.asyncio` でテスト
- 実際の TTS API / ffmpeg / R2 は呼び出さない

## 完了条件 (AC)

- [ ] `app/tasks/dialogue_processor.py` が存在し、`process_dialogue_generation`, `_run_tts_and_get_audio_url`, `_download_file`, `start_dialogue_processing` が実装されている
- [ ] 全例外が `try/except` でキャッチされ、`update_dialogue_status(generation_id, "failed", ...)` が呼ばれる
- [ ] TTS は `process_tts_generation` を `await` で直列呼び出しし、`start_tts_processing` は使わない
- [ ] 一時ファイルが `finally` ブロックで確実にクリーンアップされる
- [ ] `app/dialogue/router.py` が `start_dialogue_processing` を呼び出している
- [ ] `pytest movie-maker-api/tests/dialogue/test_dialogue_processor.py -v` が全件 pass
- [ ] `pytest movie-maker-api/tests/dialogue/ -v` が全件 pass (T1-3 のテストも含む)

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project
pytest movie-maker-api/tests/dialogue/ -v
```

## ロールバック

`app/tasks/dialogue_processor.py` を削除する。
`app/dialogue/router.py` の `start_dialogue_processing` 呼び出しを削除 (T1-3 のスタブ状態に戻す)。
`tests/dialogue/test_dialogue_processor.py` を削除する。

## 参照

- Design Doc §5-5 (dialogue_processor.py 骨格と TTS 呼び出し方針)
- Design Doc §10 (エラーハンドリング — 全ケース)
- Design Doc §11 (テスト計画 — test_dialogue_processor.py ケース)
- Design Doc §3 (シーケンス図 — 処理フロー)
- `movie-maker-api/app/tasks/tts_processor.py` L20-123 (バックグラウンドタスクパターン)
- `movie-maker-api/app/tts/service.py` L15-49 (create_tts_generation)
