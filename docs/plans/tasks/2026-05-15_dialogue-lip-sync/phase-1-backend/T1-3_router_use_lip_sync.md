---
id: T1-3
phase: 1
title: "router.py 拡張 — use_lip_sync を create_dialogue_generation に渡す"
depends_on:
  - T1-1
  - T1-2
estimated_effort: S
files_touched:
  - movie-maker-api/app/dialogue/router.py
---

## 目的

`POST /api/v1/dialogue` エンドポイントが受け取った `request.use_lip_sync` を `create_dialogue_generation` サービス関数に渡す。T1-4 で `create_dialogue_generation` のシグネチャが拡張された後、この呼び出しが有効になる。

## 前提

- T1-1 (DB マイグレーション) 適用済であること
- T1-2 (`schemas.py` に `use_lip_sync` 追加) 完了済であること
- `movie-maker-api/app/dialogue/router.py` の `POST /` ハンドラ現状構造を把握していること (Design Doc §5-2 参照、`router.py:38-45`)

## 変更内容

### `app/dialogue/router.py`

`create_dialogue_generation` 呼び出しに `use_lip_sync=request.use_lip_sync` を追加する:

**変更前** (`router.py:38-45`):
```python
record = await create_dialogue_generation(
    user_id=user_id,
    video_url=request.video_url,
    text=request.text,
    voice_id=request.voice_id,
    language=request.language,
    speed=request.speed,
)
```

**変更後**:
```python
record = await create_dialogue_generation(
    user_id=user_id,
    video_url=request.video_url,
    text=request.text,
    voice_id=request.voice_id,
    language=request.language,
    speed=request.speed,
    use_lip_sync=request.use_lip_sync,  # 追加
)
```

他の箇所 (import, レスポンス生成, エラーハンドリング) は変更しない。

## 完了条件 (AC)

- [x] `router.py` の `create_dialogue_generation` 呼び出しに `use_lip_sync=request.use_lip_sync` が含まれる
- [x] 他の引数 (`user_id`, `video_url`, `text`, `voice_id`, `language`, `speed`) に変更がない
- [x] T1-4 完了後に以下の cURL で HTTP 200 が返ること (統合確認、T1-4 AC と連動):
  ```bash
  curl -X POST http://localhost:8000/api/v1/dialogue \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"video_url":"https://example.com/v.mp4","text":"test","voice_id":"v1","use_lip_sync":true}'
  # 期待: HTTP 200, { "id": "<uuid>", "status": "pending" }
  ```
- [x] `use_lip_sync` を省略したリクエスト (既存クライアント想定) でも HTTP 200 が返ること

## テスト

T1-3 単体では router の統合テストが必要だが、T1-4 (service 拡張) 完了後に実行可能。本タスクの確認は静的チェックで行う:

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
python -c "
import ast, sys
with open('app/dialogue/router.py') as f:
    src = f.read()
assert 'use_lip_sync=request.use_lip_sync' in src, 'use_lip_sync not passed to service'
print('OK: use_lip_sync found in router.py')
"
```

T1-4 完了後に `pytest tests/dialogue/ -v` で統合確認。

## ロールバック

`create_dialogue_generation` 呼び出しから `use_lip_sync=request.use_lip_sync` の行を削除する。

## 参照

- Design Doc §5-2 `router.py` 変更内容 (before/after コード)
- `movie-maker-api/app/dialogue/router.py:38-45` (既存 create_dialogue_generation 呼び出し)
