---
id: T1-6
phase: 1
title: "BE 単体テスト追加 — use_lip_sync 分岐 5 ケース"
depends_on:
  - T1-5
estimated_effort: M
files_touched:
  - movie-maker-api/tests/dialogue/test_lip_sync_branch.py
---

## 目的

`dialogue_processor.py` の `use_lip_sync` 分岐ロジックをモックテストで網羅する。5 ケースを `tests/dialogue/test_lip_sync_branch.py` として新規作成し、リグレッションを防ぐ。

## 前提

- T1-5 (processor リファクタ + 分岐ロジック) 完了済
- `movie-maker-api/tests/dialogue/` ディレクトリが存在すること (元 dialogue-node タスクで作成済)
- `conftest.py` のフィクスチャ構成を把握していること

## 変更内容

### `tests/dialogue/test_lip_sync_branch.py` 新規作成

Design Doc §8-1 のテストケース表を実装する。

#### ケース 1: `use_lip_sync=False` で ffmpeg 経路 (regression)

- モック: TTS 成功、`_run_ffmpeg_mix` をモック
- 検証: `_run_lip_sync_and_get_video_url` が呼ばれない、`mix_audio_to_video` 等の ffmpeg 経路が呼ばれる

#### ケース 2: `use_lip_sync=True` で Hedra 経路 (正常系)

- モック: TTS 成功、`create_lip_sync_generation` 成功、`process_lip_sync_generation` 成功 (await で返る)、`get_lip_sync_status` → `{status: "completed", output_video_url: "https://r2.example/out.mp4"}`
- 検証: `_run_lip_sync_and_get_video_url` が呼ばれる、`update_dialogue_status` に `lip_sync_generation_id` が渡される

#### ケース 3: `use_lip_sync=True` で Hedra 失敗 → 日本語エラー

- モック: `process_lip_sync_generation` 正常 return、`get_lip_sync_status` → `{status: "failed", error_message: "face_detection_failed"}`
- 検証: `dialogue_generations.status="failed"`, `error_message` に「動画から顔を検出できませんでした」が含まれる

#### ケース 4: `use_lip_sync=True` で `create_lip_sync_generation` が例外

- モック: `create_lip_sync_generation` が `Exception("Supabase error")` を raise
- 検証: `dialogue_generations.status="failed"`, `error_message` に例外メッセージが記録される

#### ケース 5: `use_lip_sync` カラム欠如の既存レコード (フォールバック)

- モック: DB record に `use_lip_sync` キーが存在しない (`record.get("use_lip_sync", False)` フォールバック)
- 検証: ffmpeg 経路が選択される (リップシンク経路は呼ばれない)

#### `_translate_hedra_error` の直接テスト (追加推奨)

```python
def test_translate_hedra_error_face_detection():
    from app.tasks.dialogue_processor import _translate_hedra_error
    result = _translate_hedra_error("face_detection_failed")
    assert "顔を検出できませんでした" in result

def test_translate_hedra_error_duration():
    from app.tasks.dialogue_processor import _translate_hedra_error
    result = _translate_hedra_error("video duration too long")
    assert "長すぎます" in result

def test_translate_hedra_error_unknown():
    from app.tasks.dialogue_processor import _translate_hedra_error
    result = _translate_hedra_error(None)
    assert "リップシンク生成に失敗しました" in result
```

## 完了条件 (AC)

- [x] `tests/dialogue/test_lip_sync_branch.py` が存在する
- [x] 以下のコマンドで全テストが pass すること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
  pytest tests/dialogue/test_lip_sync_branch.py -v
  ```
- [x] ケース 1 (use_lip_sync=False 回帰): `_run_lip_sync_and_get_video_url` が呼ばれないことを assert する
- [x] ケース 2 (use_lip_sync=True 正常): `update_dialogue_status` が `lip_sync_generation_id` 付きで呼ばれることを assert する
- [x] ケース 3 (Hedra 失敗): `error_message` に「顔を検出できませんでした」が含まれることを assert する
- [x] ケース 4 (create_lip_sync_generation 例外): dialogue status が "failed" になることを assert する
- [x] ケース 5 (カラム欠如フォールバック): ffmpeg 経路が選択されることを assert する
- [x] 既存 dialogue テスト (`pytest tests/dialogue/ -v`) が引き続き全件 pass すること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
  pytest tests/dialogue/ -v
  ```
- [x] `_translate_hedra_error` の 3 パターン (face, duration, None) が pass すること

## テスト

本タスク自体がテスト追加タスクである。実行コマンド:

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
pytest tests/dialogue/ -v --tb=short 2>&1 | tail -20
```

## ロールバック

`tests/dialogue/test_lip_sync_branch.py` を削除する。

## 参照

- Design Doc §8-1 バックエンドテスト (テストケース表、モック対象、検証内容)
- Design Doc §7-2 エラー伝播フロー (ケース 3 のアサート根拠)
- Design Doc §7-3 `_translate_hedra_error` (キーワードリスト)
- `movie-maker-api/tests/dialogue/` (既存テスト構造参照)
