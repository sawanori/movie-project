---
id: T2-2
phase: 2
title: piapi_seedance_provider.py 新規実装
depends_on:
  - T2-1
estimated_effort: M
files_touched:
  - movie-maker-api/app/external/piapi_seedance_provider.py
---

## 目的

`PiAPISeedanceProvider` クラスを新規作成する。`VideoProviderInterface` を実装し、PiAPI 経由で Seedance 2.0 の動画生成タスク作成・ステータス確認を行う。

## 前提

- T2-1 完了 (`PIAPI_SEEDANCE_TASK_TYPE`, `PIAPI_SEEDANCE_RESOLUTION` が settings に存在する)
- `movie-maker-api/app/external/video_provider.py` の `VideoProviderInterface`, `VideoStatus`, `VideoGenerationStatus`, `VideoProviderError` の定義を確認すること
- `movie-maker-api/app/external/piapi_kling_provider.py` を参照パターンとして確認すること
- `httpx` が `requirements.txt` に含まれること

## 変更内容

新規ファイル `movie-maker-api/app/external/piapi_seedance_provider.py` を作成する。

Design Doc §3.2 のクラス骨子を実装する。

### `generate_video()` メソッド本体

```python
async with httpx.AsyncClient() as client:
    payload = {
        "model": "seedance",
        "task_type": self.task_type,
        "input": {
            "prompt": prompt[:4000],
            "duration": min(VALID_DURATIONS, key=lambda d: abs(d - duration)),
            "aspect_ratio": aspect_ratio,
            "image_urls": [image_url],
            "resolution": self.resolution,
        },
        "config": {"service_mode": "public"},
    }
    # audio フィールドは Phase 1 では送信しない
    if camera_work:
        logger.warning(f"Seedance: camera_work '{camera_work}' ignored (prompt-only)")

    response = await client.post(
        f"{PIAPI_BASE_URL}/task",
        headers=self._get_headers(),
        json=payload,
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    return data["data"]["task_id"]
```

`VideoProviderError` を raise する on `HTTPStatusError` (Design Doc §6.2 エラーマッピング適用)。

### `generate_video_from_text()` メソッド本体

`generate_video()` と同構造だが `image_urls` キーを payload の `input` に**含めない**:

```python
"input": {
    "prompt": prompt[:4000],
    "duration": min(VALID_DURATIONS, key=lambda d: abs(d - duration)),
    "aspect_ratio": aspect_ratio,
    "resolution": self.resolution,
    # image_urls を省略 = T2V
},
```

### `check_status()` メソッド本体

`piapi_kling_provider.py` の `check_status` と同パターン:

```python
async with httpx.AsyncClient() as client:
    response = await client.get(
        f"{PIAPI_BASE_URL}/task/{task_id}",
        headers=self._get_headers(),
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()["data"]
    status = data.get("status", "")

    if status in ("Pending", "Staged"):
        return VideoStatus(status=VideoGenerationStatus.PENDING, progress=0)
    elif status == "Processing":
        return VideoStatus(status=VideoGenerationStatus.PROCESSING, progress=50)
    elif status == "Completed":
        video_url = data.get("output", {}).get("video")
        return VideoStatus(status=VideoGenerationStatus.COMPLETED, progress=100, video_url=video_url)
    elif status == "Failed":
        error_msg = data.get("error", {}).get("message", "Unknown error")
        mapped_msg = _map_error_message(error_msg)
        return VideoStatus(status=VideoGenerationStatus.FAILED, progress=0, error_message=mapped_msg)
```

### `_map_error_message()` ヘルパー関数 (モジュールレベル)

Design Doc §3.2 エラーマッピングテーブルを実装:

```python
def _map_error_message(error: str) -> str:
    error_lower = error.lower()
    if "credit" in error_lower or "balance" in error_lower:
        return "PiAPI のクレジットが不足しています。"
    if "rate" in error_lower or "limit" in error_lower:
        return "API レート制限に達しました。しばらく待ってから再試行してください。"
    if "queue" in error_lower:
        return "サーバーが混雑しています（09:00–15:00 GMT はピーク時間帯）。しばらく後に再試行してください。"
    if "nsfw" in error_lower or "content" in error_lower:
        return "コンテンツポリシーに違反する可能性があります。プロンプトや画像を確認してください。"
    return error
```

### `get_video_url()` メソッド本体

```python
status = await self.check_status(task_id)
return status.video_url if status.status == VideoGenerationStatus.COMPLETED else None
```

### `VALID_DURATIONS` 定数

```python
VALID_DURATIONS = [5, 10, 15]
```

## 完了条件 (AC)

- [ ] `movie-maker-api/app/external/piapi_seedance_provider.py` が存在する
- [ ] `PiAPISeedanceProvider` が `VideoProviderInterface` を実装している (`isinstance` チェック通過)
- [ ] `provider_name` プロパティが `"seedance"` を返す
- [ ] `supports_t2v` プロパティが `True` を返す
- [ ] `generate_video()` の payload に `audio` フィールドが含まれない
- [ ] `camera_work` 引数を渡しても request body に `camera_control` が含まれない
- [ ] `duration=7` を渡すと payload の `duration` が `5` になる (最近傍クランプ)
- [ ] `duration=12` を渡すと payload の `duration` が `10` になる
- [ ] `pytest` 既存テストが全て PASS する (既知 2 件失敗を除く)

## テスト

テストは T2-6 で追加。このタスクでは T2-6 のテストが PASS できる実装を完成させる。

## ロールバック

`movie-maker-api/app/external/piapi_seedance_provider.py` を削除する。他ファイルへの変更なし。

## 参照

- Design Doc §3.2 (クラス骨子、リクエストボディ仕様、エラーマッピング、duration 変換)
- Design Doc §6.2 (Seedance エラーパターン)
- `movie-maker-api/app/external/piapi_kling_provider.py` (参照パターン)
- `movie-maker-api/app/external/video_provider.py` (`VideoProviderInterface` 定義確認)
