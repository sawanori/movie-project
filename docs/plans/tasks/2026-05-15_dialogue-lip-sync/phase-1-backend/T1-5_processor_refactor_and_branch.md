---
id: T1-5
phase: 1
title: "dialogue_processor.py リファクタ + use_lip_sync 分岐ロジック実装"
depends_on:
  - T1-4
estimated_effort: L
files_touched:
  - movie-maker-api/app/tasks/dialogue_processor.py
---

## 目的

`dialogue_processor.py` の `_process_core` に `use_lip_sync` 分岐を追加し、ON 時に Hedra リップシンクを実行する。既存の ffmpeg ミックスロジックを `_run_ffmpeg_mix` として関数化し、新規で `_run_lip_sync_and_get_video_url` と `_translate_hedra_error` を追加する。これが本タスク群の最重要実装タスク。

## 前提

- T1-4 (service.py 拡張) 完了済
- `app/tasks/lip_sync_processor.py` の `process_lip_sync_generation` が既に実装済であること (Design Doc §4 参照)
- `app/lip_sync/service.py` の `create_lip_sync_generation` と `get_lip_sync_status` が既に実装済であること
- `dialogue_processor.py:36-180` の現状コードを熟読していること (Design Doc §5-4-1 参照)

## 変更内容

### 1. import 追加

`dialogue_processor.py` 先頭の import に追加:

```python
from app.lip_sync.service import create_lip_sync_generation, get_lip_sync_status
from app.tasks.lip_sync_processor import process_lip_sync_generation
```

### 2. `use_lip_sync` 取り出し (`process_dialogue_generation` 内)

DB レコード取得部分 (`dialogue_processor.py:36-119` の record 読み込み箇所) に追加:

```python
use_lip_sync = record.get("use_lip_sync", False)  # 追加 (default False で後方互換)
```

`_process_core` 呼び出しに `use_lip_sync=use_lip_sync` を渡す。

### 3. `_process_core` シグネチャ拡張

```python
async def _process_core(
    generation_id: str,
    user_id: str,
    video_url: str,
    text: str,
    voice_id: str,
    language: str,
    speed: float,
    use_lip_sync: bool,  # 追加
) -> None:
```

TTS 完了後の分岐挿入:

```python
audio_url = await _run_tts_and_get_audio_url(...)

if use_lip_sync:
    output_video_url = await _run_lip_sync_and_get_video_url(
        video_url=video_url,
        audio_url=audio_url,
        user_id=user_id,
        generation_id=generation_id,
    )
else:
    output_video_url = await _run_ffmpeg_mix(
        video_url=video_url,
        audio_url=audio_url,
        generation_id=generation_id,
    )

await update_dialogue_status(generation_id, "completed", output_video_url=output_video_url)
```

### 4. `_run_ffmpeg_mix` 関数化

既存 `_process_core` の ffmpeg ミックス部分 (`L132-173` 相当) をそのまま抽出。**ロジックの変更はゼロ**。

```python
async def _run_ffmpeg_mix(
    video_url: str,
    audio_url: str,
    generation_id: str,
) -> str:
    """既存の ffmpeg ミックス処理 (Design Doc §5-4-4)"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # 既存ロジックをそのまま移植
        ...
    return output_video_url
```

### 5. `_run_lip_sync_and_get_video_url` 新規実装

B3 解決パターン踏襲: `process_lip_sync_generation` を直 await。

```python
async def _run_lip_sync_and_get_video_url(
    video_url: str,
    audio_url: str,
    user_id: str,
    generation_id: str,
) -> str:
    """Hedra リップシンク実行 (Design Doc §5-4-3 全 TODO 実装)"""
    # 1. lip_sync レコード作成
    lip_sync_record = await create_lip_sync_generation(
        user_id=user_id,
        source_type="video",
        source_url=video_url,
        audio_url=audio_url,
    )
    lip_sync_id = lip_sync_record["id"]

    # 2. dialogue に lip_sync_generation_id を記録 (デバッグ用)
    await update_dialogue_status(
        generation_id, "processing",
        lip_sync_generation_id=lip_sync_id,
    )

    # 3. Hedra ポーリング (直 await、最大 6 分)
    await process_lip_sync_generation(lip_sync_id)

    # 4. status 再 fetch (process_lip_sync_generation は例外を握り潰す設計)
    lip_sync_status = await get_lip_sync_status(user_id, lip_sync_id)
    if lip_sync_status is None:
        raise ValueError("リップシンク生成が見つかりません")

    if lip_sync_status["status"] == "completed":
        return lip_sync_status["output_video_url"]

    # 5. failed → 日本語エラーを raise
    raise ValueError(_translate_hedra_error(lip_sync_status.get("error_message")))
```

### 6. `_translate_hedra_error` ヘルパー新規実装

```python
def _translate_hedra_error(error_message: Optional[str]) -> str:
    """Hedra 英文エラー → 日本語ユーザーメッセージ (Design Doc §7-3 全 TODO 実装)"""
    msg = (error_message or "").lower()
    if "face" in msg or "detect" in msg:
        return "動画から顔を検出できませんでした。キャラの顔がはっきり映る動画を使ってください"
    if "duration" in msg or "length" in msg:
        return "動画が長すぎます。1 分以内の動画を使ってください"
    if "quota" in msg or "credit" in msg:
        return "リップシンク サービスの利用上限に達しました。しばらくしてから再試行してください"
    if "timeout" in msg:
        return "リップシンク生成がタイムアウトしました (6 分)。再試行してください"
    if "401" in msg or "403" in msg or "unauthorized" in msg or "forbidden" in msg:
        return "リップシンク サービスに接続できません。管理者にお問い合わせください"
    return "リップシンク生成に失敗しました。動画とセリフを確認して再試行してください"
```

## 完了条件 (AC)

- [x] `dialogue_processor.py` に `from app.lip_sync.service import create_lip_sync_generation, get_lip_sync_status` が追加されている
- [x] `dialogue_processor.py` に `from app.tasks.lip_sync_processor import process_lip_sync_generation` が追加されている
- [x] `process_dialogue_generation` 内で `use_lip_sync = record.get("use_lip_sync", False)` が存在する
- [x] `_process_core` のシグネチャに `use_lip_sync: bool` が追加されている
- [x] `_process_core` 内に `if use_lip_sync:` 分岐が存在する (`_run_lip_sync_and_get_video_url` と `_run_ffmpeg_mix` の呼び分け)
- [x] `_run_ffmpeg_mix` 関数が存在し、既存ロジック (`tempfile`, ffmpeg ミックス, R2 アップロード) を含む
- [x] `_run_lip_sync_and_get_video_url` 関数が存在し、`process_lip_sync_generation` を直 await している (asyncio.create_task を使っていない)
- [x] `_run_lip_sync_and_get_video_url` 内で `await process_lip_sync_generation(lip_sync_id)` 後に `get_lip_sync_status` を呼んで status 再 fetch している
- [x] `_translate_hedra_error` が "face" / "detect" キーワードで「動画から顔を検出できませんでした...」を返す:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
  python -c "
  from app.tasks.dialogue_processor import _translate_hedra_error
  result = _translate_hedra_error('face_detection_failed')
  assert '顔を検出できませんでした' in result, f'Got: {result}'
  print('OK:', result)
  "
  ```
- [x] `use_lip_sync` カラム欠如の既存レコード (`record.get("use_lip_sync", False)`) で False にフォールバックすることを grep で確認:
  ```bash
  grep -n 'use_lip_sync.*False' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api/app/tasks/dialogue_processor.py
  ```
- [x] `asyncio.create_task` が `_run_lip_sync_and_get_video_url` 内で使われていないこと:
  ```bash
  grep -n 'create_task' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api/app/tasks/dialogue_processor.py
  # 出力が空 (ゼロ行) であること
  ```

## テスト

T1-6 で別ファイルとして詳細テストを追加する。本タスクでは import 確認と translate ヘルパーの動作確認のみ行う:

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
python -c "
from app.tasks.dialogue_processor import _translate_hedra_error, _run_ffmpeg_mix, _run_lip_sync_and_get_video_url
print('All functions importable')
"
```

## ロールバック

1. import 追加行を削除
2. `_process_core` から `use_lip_sync` 引数と `if use_lip_sync:` 分岐を削除し、元の ffmpeg ロジックをインラインに戻す
3. `_run_ffmpeg_mix`, `_run_lip_sync_and_get_video_url`, `_translate_hedra_error` 関数を削除

## 参照

- Design Doc §5-4 (プロセッサ変更 全セクション)
- Design Doc §5-4-2 変更後フロー (コード全文)
- Design Doc §5-4-3 `_run_lip_sync_and_get_video_url` シグネチャ + TODO リスト
- Design Doc §5-4-4 `_run_ffmpeg_mix` シグネチャ
- Design Doc §5-4-5 `use_lip_sync` 取り出し
- Design Doc §7-2 エラー伝播フロー (post-await re-fetch の理由)
- Design Doc §7-3 `_translate_hedra_error` TODO リスト
- Design Doc §13 リスク「status 同期」(process_lip_sync_generation が例外を握り潰す理由)
- `movie-maker-api/app/tasks/lip_sync_processor.py:25-119` (直 await 対象)
- `movie-maker-api/app/lip_sync/service.py:15-85` (create / get 関数)
