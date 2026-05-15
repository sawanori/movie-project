---
id: T1-2
phase: 1
title: "schemas.py 拡張 — DialogueCreateRequest に use_lip_sync 追加"
depends_on:
  - T1-1
estimated_effort: S
files_touched:
  - movie-maker-api/app/dialogue/schemas.py
---

## 目的

`DialogueCreateRequest` Pydantic モデルに `use_lip_sync: bool = Field(default=False, ...)` を追加する。後方互換フィールドのため、既存クライアントは変更不要で動く。

## 前提

- T1-1 (DB マイグレーション) 適用済であること
- `movie-maker-api/app/dialogue/schemas.py` の `DialogueCreateRequest` 現状構造を把握していること (Design Doc §5-1 参照)

## 変更内容

### `app/dialogue/schemas.py`

`DialogueCreateRequest` に以下のフィールドを追加する (既存フィールドは変更しない):

```python
use_lip_sync: bool = Field(
    default=False,
    description="True の場合 Hedra でリップシンクを行う。False は ffmpeg 単純ミックス",
)
```

追加位置: `speed` フィールドの直後。

既存フィールド (`video_url`, `text`, `voice_id`, `language`, `speed`) はそのまま維持する。

## 完了条件 (AC)

- [x] `DialogueCreateRequest` に `use_lip_sync: bool = Field(default=False, ...)` が追加されている
- [x] `use_lip_sync` の description が Design Doc §5-1 の説明文と一致する
- [x] 既存フィールド (`video_url`, `text`, `voice_id`, `language`, `speed`) に変更がない
- [x] `use_lip_sync` を省略したリクエスト (既存クライアント) が `False` として扱われること:
  ```bash
  cd movie-maker-api
  python -c "
  from app.dialogue.schemas import DialogueCreateRequest
  r = DialogueCreateRequest(video_url='https://example.com/v.mp4', text='test', voice_id='v1')
  assert r.use_lip_sync == False, f'Expected False, got {r.use_lip_sync}'
  print('OK: default use_lip_sync=False')
  "
  ```
- [x] `use_lip_sync=True` を明示したリクエストが `True` として扱われること:
  ```bash
  python -c "
  from app.dialogue.schemas import DialogueCreateRequest
  r = DialogueCreateRequest(video_url='https://example.com/v.mp4', text='test', voice_id='v1', use_lip_sync=True)
  assert r.use_lip_sync == True
  print('OK: explicit use_lip_sync=True')
  "
  ```

## テスト

TDD: まず以下の failing test を追加してから実装する。

```python
# movie-maker-api/tests/dialogue/test_schemas.py (既存 or 新規)
def test_dialogue_create_request_use_lip_sync_default_false():
    from app.dialogue.schemas import DialogueCreateRequest
    req = DialogueCreateRequest(video_url="https://example.com/v.mp4", text="hello", voice_id="v1")
    assert req.use_lip_sync is False

def test_dialogue_create_request_use_lip_sync_explicit_true():
    from app.dialogue.schemas import DialogueCreateRequest
    req = DialogueCreateRequest(
        video_url="https://example.com/v.mp4",
        text="hello",
        voice_id="v1",
        use_lip_sync=True,
    )
    assert req.use_lip_sync is True
```

実行:
```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
pytest tests/dialogue/ -v -k "schema"
```

## ロールバック

`use_lip_sync` フィールドを `DialogueCreateRequest` から削除する。

## 参照

- Design Doc §5-1 `schemas.py` 変更内容 (before/after コード)
- Design Doc §2 合意チェックリスト「後方互換性」項目
- `movie-maker-api/app/dialogue/schemas.py:12-20` (既存 DialogueCreateRequest)
