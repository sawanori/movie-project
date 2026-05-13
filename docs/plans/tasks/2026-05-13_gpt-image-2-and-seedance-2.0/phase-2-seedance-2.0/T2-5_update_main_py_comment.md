---
id: T2-5
phase: 2
title: main.py の video-provider 有効値コメント更新
depends_on:
  - T2-3
estimated_effort: S
files_touched:
  - movie-maker-api/app/main.py
---

## 目的

`/api/v1/config/video-provider` エンドポイントの説明コメントに `"seedance"` を追記し、有効なプロバイダー値の列挙を最新化する。

## 前提

- T2-3 完了 (`get_video_provider()` に `seedance` 分岐が追加済み)
- `movie-maker-api/app/main.py` の `/api/v1/config/video-provider` エンドポイント実装箇所を確認すること
- コメント/docstring の更新のみ。ロジック変更なし

## 変更内容

### `movie-maker-api/app/main.py`

`/api/v1/config/video-provider` エンドポイントのコメントまたは description 文字列を検索し、既存のプロバイダー列挙 (`"runway"`, `"veo"`, `"domoai"`, `"piapi_kling"`, `"hailuo"`) に `"seedance"` を追記する。

具体的な変更箇所は実装者が `main.py` を参照して特定すること。変更量は 1〜3 行程度。

## 完了条件 (AC)

- [ ] `main.py` の `/api/v1/config/video-provider` 関連コメントに `"seedance"` が含まれる
- [ ] FastAPI を起動し、`GET /api/v1/config/video-provider` を呼ぶと `"seedance"` が有効値に含まれる (実装によっては自動反映)
- [ ] `pytest` 既存テストが全て PASS する

## テスト

新規テスト不要。コメント変更のみ。

```bash
uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/api/v1/config/video-provider
```

## ロールバック

コメントへの `"seedance"` 追記を削除する。

## 参照

- Design Doc §3 変更ファイル一覧 (`app/main.py` コメント更新)
