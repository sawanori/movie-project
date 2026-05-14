---
id: T1-2
phase: 1
title: "ffmpeg ヘルパー mix_audio_to_video + _has_audio_track 追加 + 単体テスト"
depends_on: []
estimated_effort: M
files_touched:
  - movie-maker-api/app/services/ffmpeg_service.py
  - movie-maker-api/tests/dialogue/test_ffmpeg_mix.py
---

## 目的

既存 `FFmpegService` クラスに `mix_audio_to_video` メソッドと `_has_audio_track` ヘルパーを追加し、
TTS 音声を動画に合成する機能を提供する。T1-4 (dialogue_processor) がこのメソッドを呼び出す。

T1-1 (DB マイグレーション) と並行実行可能。

## 前提

- `movie-maker-api/app/services/ffmpeg_service.py` の `FFmpegService` クラスを確認済みであること
- 特に `add_text_overlay` メソッド (L78-185) のパターンを参照する
- `FFmpegError` 例外クラスが既存ファイルに定義されていること

## 変更内容

### 1. `_has_audio_track` メソッド追加 (同期)

```python
def _has_audio_track(self, video_path: str) -> bool:
    """
    動画ファイルに音声トラックが含まれるか確認 (ffprobe 使用)

    ffprobe コマンド:
        ffprobe -v quiet -select_streams a:0
                -show_entries stream=codec_type
                -of default=noprint_wrappers=1:nokey=1
                <video_path>

    Returns:
        bool: 音声ストリームが 1 件以上あれば True
    """
```

実装要点:
- `subprocess.run` で ffprobe を呼び出す
- stdout に `audio` が含まれていれば `True`
- ffprobe が失敗した場合は安全側に倒して `False` を返す (ログ出力)

### 2. `mix_audio_to_video` メソッド追加 (async)

Design Doc §5-6 の仕様通り実装:

```python
async def mix_audio_to_video(
    self,
    video_path: str,
    audio_path: str,
    output_path: str,
) -> str:
```

分岐ロジック:
- `_has_audio_track(video_path)` が `True` → amix フィルターで合成
  ```
  ffmpeg -y -i <video> -i <audio>
    -filter_complex "[0:a][1:a]amix=inputs=2:duration=first[aout]"
    -map 0:v -map "[aout]"
    -c:v copy -c:a aac
    -shortest
    <output>
  ```
- `_has_audio_track(video_path)` が `False` → 音声トラック追加のみ
  ```
  ffmpeg -y -i <video> -i <audio>
    -map 0:v -map 1:a
    -c:v copy -c:a aac
    -shortest
    <output>
  ```
- ffmpeg 終了コードが 0 以外の場合は `FFmpegError` を raise
- 成功時は `output_path` を返す

### 3. 単体テスト作成 (TDD: Red → Green)

ファイル: `movie-maker-api/tests/dialogue/test_ffmpeg_mix.py`

テストケース:

| テスト名 | モック | 検証内容 |
|---------|-------|---------|
| `test_mix_audio_video_with_audio_track` | `subprocess.run` → amix フィルター使用 | コマンド引数に `amix` が含まれる、戻り値が `output_path` |
| `test_mix_audio_video_without_audio_track` | ffprobe → 音声なし | コマンド引数に `-map 1:a` が含まれる、`amix` は含まれない |
| `test_mix_audio_video_ffmpeg_failure` | subprocess → returncode=1 | `FFmpegError` が raise される |
| `test_has_audio_track_true` | ffprobe stdout = "audio\n" | `True` が返る |
| `test_has_audio_track_false` | ffprobe stdout = "" | `False` が返る |
| `test_has_audio_track_ffprobe_error` | subprocess → CalledProcessError | `False` が返る (安全側フォールバック) |

テスト実装方針:
- `unittest.mock.patch('subprocess.run')` でモック
- `MagicMock(returncode=0, stdout=b"...", stderr=b"")` でプロセス結果を模擬
- 実際の ffmpeg/ffprobe は呼び出さない

## 完了条件 (AC)

- [ ] `mix_audio_to_video` メソッドが `FFmpegService` に追加されている
- [ ] `_has_audio_track` メソッドが `FFmpegService` に追加されている
- [ ] 音声トラックありの場合に amix フィルターが使われている
- [ ] 音声トラックなしの場合に `-map 1:a` フォールバックが使われている
- [ ] どちらも `-shortest` フラグが含まれている
- [ ] `tests/dialogue/test_ffmpeg_mix.py` が 6 件以上のテストを含む
- [ ] `pytest movie-maker-api/tests/dialogue/test_ffmpeg_mix.py -v` が全件 pass

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project
pytest movie-maker-api/tests/dialogue/test_ffmpeg_mix.py -v
```

## ロールバック

`ffmpeg_service.py` から `mix_audio_to_video` と `_has_audio_track` を削除する。
テストファイル `tests/dialogue/test_ffmpeg_mix.py` を削除する。
既存の他メソッドへの変更はないため影響なし。

## 参照

- Design Doc §5-6 (ffmpeg ヘルパー仕様)
- Design Doc §10 (エラーハンドリング — ffmpeg 失敗ケース)
- Design Doc §11 (テスト計画 — `test_dialogue_processor.py` の ffmpeg モックパターン参考)
- `movie-maker-api/app/services/ffmpeg_service.py` L78-185 (`add_text_overlay` 参考実装)
