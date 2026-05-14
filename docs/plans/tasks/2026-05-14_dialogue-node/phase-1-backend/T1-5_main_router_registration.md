---
id: T1-5
phase: 1
title: "app/main.py に dialogue_router を登録"
depends_on:
  - T1-4
estimated_effort: S
files_touched:
  - movie-maker-api/app/main.py
---

## 目的

`app/main.py` に `dialogue_router` を登録し、`/api/v1/dialogue` エンドポイントをアプリに公開する。
Phase 1 の最終タスク。これが完了すると Phase 1 の L1 検証が可能になる。

## 前提

- T1-4 完了: `app/dialogue/router.py` が実装済みであること
- `app/main.py` の既存 router 登録パターンを確認しておくこと (例: `tts_router` の登録方法)

## 変更内容

### `app/main.py` への追加

Design Doc §5-1 の指示通り:

```python
from app.dialogue.router import router as dialogue_router

# 既存の include_router の末尾に追加
app.include_router(dialogue_router, prefix="/api/v1")
```

追加位置: 既存の TTS ルーター登録の直後が推奨。

## 完了条件 (AC)

- [ ] `app/main.py` に `from app.dialogue.router import router as dialogue_router` が追加されている
- [ ] `app.include_router(dialogue_router, prefix="/api/v1")` が追加されている
- [ ] `uvicorn` を起動して `GET /openapi.json` の `paths` に `/api/v1/dialogue` が含まれる
- [ ] `curl -X POST http://localhost:8000/api/v1/dialogue` が 401 (未認証) を返す (存在は確認)

## テスト

ローカルサーバー起動後の疎通確認:

```bash
# サーバー起動
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
uvicorn app.main:app --reload &

# OpenAPI で確認
curl http://localhost:8000/openapi.json | python3 -c "import sys,json; paths=json.load(sys.stdin)['paths']; print([p for p in paths if 'dialogue' in p])"
# 期待: ['/api/v1/dialogue', '/api/v1/dialogue/{generation_id}/status']
```

既存テストへの影響確認:
```bash
pytest movie-maker-api/tests/dialogue/ -v
```

## ロールバック

`app/main.py` から追加した 2 行を削除する。

## 参照

- Design Doc §5-1 (main.py への追加指示)
- Design Doc §13 Phase 1 完了条件 L2/L3
