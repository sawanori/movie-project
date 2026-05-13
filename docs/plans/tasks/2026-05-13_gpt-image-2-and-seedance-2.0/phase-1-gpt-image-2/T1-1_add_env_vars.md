---
id: T1-1
phase: 1
title: 環境変数追加 (GPT Image 2)
depends_on: []
estimated_effort: S
files_touched:
  - movie-maker-api/app/core/config.py
  - movie-maker-api/.env.example
---

## 目的

`config.py` に GPT Image 2 用の設定値 `OPENAI_IMAGE_MODEL` を追加し、`.env.example` にコメント付きの環境変数テンプレートを追記する。

## 前提

- 依存タスク: なし
- `movie-maker-api/app/core/config.py` と `.env.example` が存在すること
- `OPENAI_API_KEY` は既存設定として存在するため変更不要

## 変更内容

### `movie-maker-api/app/core/config.py`

`PIAPI_KLING_*` ブロック直下 (現在 line 45 付近) に以下を追記:

```python
# OpenAI Image Generation
OPENAI_IMAGE_MODEL: str = "gpt-image-2"
```

### `movie-maker-api/.env.example`

既存の `OPENAI_API_KEY` 行の下に追記:

```dotenv
# OpenAI Image Generation (GPT Image 2)
# 注意: OpenAI Org Verification が完了していることが必要
OPENAI_IMAGE_MODEL=gpt-image-2
```

## 完了条件 (AC)

- [ ] `config.py` の `Settings` クラスに `OPENAI_IMAGE_MODEL: str = "gpt-image-2"` が存在する
- [ ] `settings.OPENAI_IMAGE_MODEL` が Python REPL / pytest で `"gpt-image-2"` を返す
- [ ] `.env.example` に `OPENAI_IMAGE_MODEL=gpt-image-2` の行が存在する
- [ ] `.env.example` にコメント (Org Verification 必要) が記載されている
- [ ] `pytest` 既存テストが全て PASS する (既知の 2 件失敗を除く)

## テスト

新規ユニットテスト不要 (設定値のみの変更)。

既存 `pytest` で config がロードできることを副作用として確認:
```
pytest tests/test_health.py -v
```

## ロールバック

`config.py` と `.env.example` への追記行を削除する。Supabase 等の外部状態変更なし。

## 参照

- Design Doc §3.3 (`app/core/config.py` 追記する設定値)
- Design Doc §5 (設定 / 環境変数)
