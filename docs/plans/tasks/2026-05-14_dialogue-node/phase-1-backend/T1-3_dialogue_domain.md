---
id: T1-3
phase: 1
title: "app/dialogue/ ドメイン雛形 — schemas + service + router (CRUD のみ)"
depends_on:
  - T1-1
estimated_effort: M
files_touched:
  - movie-maker-api/app/dialogue/__init__.py
  - movie-maker-api/app/dialogue/schemas.py
  - movie-maker-api/app/dialogue/service.py
  - movie-maker-api/app/dialogue/router.py
  - movie-maker-api/tests/dialogue/__init__.py
  - movie-maker-api/tests/dialogue/test_router.py
---

## 目的

`app/dialogue/` ドメインを新規作成し、Pydantic スキーマ・CRUD サービス・ルーターの骨格を実装する。
実際の処理ロジック (TTS → ffmpeg → R2) は T1-4 で実装するため、このタスクではルーターは **薄く** し、サービスは **Supabase CRUD のみ** に留める。

## 前提

- T1-1 (DB マイグレーション) が完了し `dialogue_generations` テーブルが存在すること
- T1-2 は並行実行可能だが、このタスクでは ffmpeg は使わないため未完了でも可
- `app/tts/service.py` と `app/core/dependencies.py` の実装パターンを確認しておくこと
- `app/tts/schemas.py` の Pydantic モデル構造を参照すること

## 変更内容

### 1. `app/dialogue/__init__.py`

空ファイルを作成する。

### 2. `app/dialogue/schemas.py`

Design Doc §5-2 の Pydantic スキーマを実装:

```python
from typing import Optional, Literal
from pydantic import BaseModel, Field

DialogueStatus = Literal["pending", "processing", "completed", "failed"]

class DialogueCreateRequest(BaseModel): ...
class DialogueCreateResponse(BaseModel): ...
class DialogueStatusResponse(BaseModel): ...
```

`DialogueCreateRequest` フィールド:
- `video_url: str`
- `text: str` (min_length=1, max_length=5000)
- `voice_id: str`
- `language: str` (default="ja")
- `speed: float` (default=1.0, ge=0.25, le=4.0)

### 3. `app/dialogue/service.py`

Design Doc §5-4 のシグネチャを実装 (Supabase CRUD のみ):

```python
async def create_dialogue_generation(
    user_id: str,
    video_url: str,
    text: str,
    voice_id: str,
    language: str = "ja",
    speed: float = 1.0,
) -> dict:
    """
    dialogue_generations テーブルにレコードを作成して返す

    実装要点:
    - status = "pending"
    - provider = settings.TTS_PROVIDER を明示的に記録 (DEFAULT なし)
    - supabase.table("dialogue_generations").insert(...).execute()
    - 返り値: data[0] (dict)
    """

async def get_dialogue_status(user_id: str, generation_id: str) -> dict | None:
    """
    dialogue_generations からステータスを取得する
    - user_id でフィルタリング (RLS に加えてアプリ層でも保護)
    - 存在しない場合は None を返す
    """

async def update_dialogue_status(
    generation_id: str,
    status: str,
    output_video_url: str | None = None,
    error_message: str | None = None,
) -> None:
    """
    ステータスを更新する (バックグラウンドタスクから呼ぶ)
    """
```

### 4. `app/dialogue/router.py`

Design Doc §5-3 のルーターを実装。このタスクでは `start_dialogue_processing` は **`pass` または stub** にする。T1-4 で差し替える:

```python
@router.post("/dialogue", response_model=DialogueCreateResponse)
async def create_dialogue(request, current_user):
    user_id = current_user["user_id"]
    record = await create_dialogue_generation(
        user_id=user_id,
        video_url=request.video_url,
        text=request.text,
        voice_id=request.voice_id,
        language=request.language,
        speed=request.speed,
    )
    # TODO T1-4: await start_dialogue_processing(record["id"])
    return DialogueCreateResponse(
        id=record["id"],
        status=record["status"],
        created_at=record["created_at"],
    )

@router.get("/dialogue/{generation_id}/status", response_model=DialogueStatusResponse)
async def get_status(generation_id, current_user):
    user_id = current_user["user_id"]
    record = await get_dialogue_status(user_id, generation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Not found")
    return DialogueStatusResponse(**record)
```

### 5. テスト作成 (TDD: Red → Green)

ファイル: `movie-maker-api/tests/dialogue/__init__.py` (空)
ファイル: `movie-maker-api/tests/dialogue/test_router.py`

Design Doc §11 の `test_router.py` ケースを実装:

| テストケース | 検証内容 |
|------------|---------|
| `test_create_dialogue_success` | POST → status=pending, id が UUID 形式 |
| `test_get_status_pending` | GET → status=pending |
| `test_get_status_completed` | GET → output_video_url が含まれる |
| `test_get_status_not_found_other_user` | 他ユーザーのレコード → 404 |
| `test_create_dialogue_text_too_long` | 5001 文字超 → 422 |

テスト実装方針:
- `unittest.mock.patch('app.dialogue.service.create_dialogue_generation')` でモック
- `unittest.mock.patch('app.dialogue.service.get_dialogue_status')` でモック
- `TestClient` (FastAPI) を使用
- 認証 `current_user` は `Depends` をオーバーライドして固定値を返す

## 完了条件 (AC)

- [ ] `app/dialogue/` ディレクトリに `__init__.py`, `schemas.py`, `service.py`, `router.py` が作成されている
- [ ] `DialogueCreateRequest` で `text` が 5001 文字のとき 422 が返る (バリデーション確認)
- [ ] `DialogueCreateRequest` で `speed` が 0.24 のとき 422 が返る
- [ ] `create_dialogue_generation` が `provider = settings.TTS_PROVIDER` を挿入している
- [ ] GET /dialogue/{id}/status で存在しないレコードなら 404 が返る
- [ ] `pytest movie-maker-api/tests/dialogue/test_router.py -v` が全件 pass

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project
pytest movie-maker-api/tests/dialogue/test_router.py -v
```

## ロールバック

`app/dialogue/` ディレクトリ全体を削除する。
`tests/dialogue/test_router.py` を削除する。
`app/main.py` にはまだ登録していないため、他への影響なし。

## 参照

- Design Doc §5-2 (Pydantic スキーマ)
- Design Doc §5-3 (ルーター シグネチャ)
- Design Doc §5-4 (サービス シグネチャ)
- Design Doc §11 (テスト計画 — test_router.py ケース)
- `movie-maker-api/app/tts/service.py` L15-49 (create_tts_generation 参考)
- `movie-maker-api/app/tts/router.py` (ルーター構造参考)
