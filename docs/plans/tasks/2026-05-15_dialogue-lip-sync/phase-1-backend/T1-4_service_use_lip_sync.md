---
id: T1-4
phase: 1
title: "service.py 拡張 — create/update シグネチャに lip-sync パラメータ追加"
depends_on:
  - T1-2
  - T1-3
estimated_effort: S
files_touched:
  - movie-maker-api/app/dialogue/service.py
---

## 目的

`create_dialogue_generation` に `use_lip_sync: bool = False` 引数を追加し DB に保存する。また `update_dialogue_status` に `lip_sync_generation_id: Optional[str] = None` 引数を追加し、リップシンク中間状態を記録できるようにする。

## 前提

- T1-1 (DB マイグレーション) 適用済 — `dialogue_generations` に `use_lip_sync` / `lip_sync_generation_id` カラムが存在すること
- T1-2 (schemas) / T1-3 (router) 完了済であること
- `movie-maker-api/app/dialogue/service.py` の現状構造を把握していること (Design Doc §5-3 参照)

## 変更内容

### `app/dialogue/service.py`

#### 変更 1: `create_dialogue_generation` シグネチャ拡張 (`service.py:16-23`)

```python
async def create_dialogue_generation(
    user_id: str,
    video_url: str,
    text: str,
    voice_id: str,
    language: str = "ja",
    speed: float = 1.0,
    use_lip_sync: bool = False,  # 追加
) -> dict:
```

`record_data` に `"use_lip_sync": use_lip_sync` を追加する。他のフィールドは変更しない。

#### 変更 2: `update_dialogue_status` シグネチャ拡張 (`service.py:91-97`)

```python
async def update_dialogue_status(
    generation_id: str,
    status: str,
    output_video_url: Optional[str] = None,
    error_message: Optional[str] = None,
    tts_generation_id: Optional[str] = None,
    lip_sync_generation_id: Optional[str] = None,  # 追加
) -> None:
```

`lip_sync_generation_id is not None` の場合のみ `update_data` に `"lip_sync_generation_id": lip_sync_generation_id` を追加する。

#### 変更 3 (任意・推奨): `get_dialogue_status` の SELECT 列追加

`get_dialogue_status` の SELECT 文 (存在する場合) に `use_lip_sync, lip_sync_generation_id` を追加しておく。フロントのレスポンス型には今回露出しないが、デバッグ用に役立つ。

## 完了条件 (AC)

- [x] `create_dialogue_generation` のシグネチャに `use_lip_sync: bool = False` が追加されている
- [x] `create_dialogue_generation` 内の `record_data` (または insert 用辞書) に `"use_lip_sync": use_lip_sync` が含まれている
- [x] `update_dialogue_status` のシグネチャに `lip_sync_generation_id: Optional[str] = None` が追加されている
- [x] `update_dialogue_status` 内で `lip_sync_generation_id is not None` の場合のみ update_data に追加されること (None を DB に書かない)
- [x] 既存のシグネチャ引数 (`user_id`, `video_url`, `text`, `voice_id`, `language`, `speed`, `output_video_url`, `error_message`, `tts_generation_id`) に変更がない
- [x] python -c で import できること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
  python -c "from app.dialogue.service import create_dialogue_generation, update_dialogue_status; print('OK')"
  ```

## テスト

TDD: 以下の failing test を先に追加してから実装する。

```python
# movie-maker-api/tests/dialogue/test_service.py (既存 or 新規)
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_create_dialogue_generation_includes_use_lip_sync():
    """use_lip_sync=True が DB insert データに含まれること"""
    with patch("app.dialogue.service.supabase") as mock_sb:
        mock_sb.table.return_value.insert.return_value.execute = AsyncMock(
            return_value=type("R", (), {"data": [{"id": "uuid-1", "use_lip_sync": True}]})()
        )
        from app.dialogue.service import create_dialogue_generation
        result = await create_dialogue_generation(
            user_id="u1", video_url="https://example.com/v.mp4",
            text="test", voice_id="v1", use_lip_sync=True
        )
        # insert に use_lip_sync が渡されていること
        call_args = mock_sb.table.return_value.insert.call_args
        assert call_args[0][0]["use_lip_sync"] is True

@pytest.mark.asyncio
async def test_update_dialogue_status_includes_lip_sync_generation_id():
    """lip_sync_generation_id が指定された場合のみ update_data に含まれること"""
    with patch("app.dialogue.service.supabase") as mock_sb:
        mock_sb.table.return_value.update.return_value.eq.return_value.execute = AsyncMock(
            return_value=type("R", (), {"data": []})()
        )
        from app.dialogue.service import update_dialogue_status
        await update_dialogue_status(
            "gen-id", "processing", lip_sync_generation_id="lip-id-1"
        )
        update_data = mock_sb.table.return_value.update.call_args[0][0]
        assert update_data.get("lip_sync_generation_id") == "lip-id-1"
```

実行:
```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
pytest tests/dialogue/ -v
```

## ロールバック

`create_dialogue_generation` から `use_lip_sync` 引数と `record_data` への追加を削除。`update_dialogue_status` から `lip_sync_generation_id` 引数と条件付き追加を削除。

## 参照

- Design Doc §5-3 `service.py` 変更内容 (シグネチャ全文)
- `movie-maker-api/app/dialogue/service.py:16-53` (`create_dialogue_generation`)
- `movie-maker-api/app/dialogue/service.py:91-118` (`update_dialogue_status`)
