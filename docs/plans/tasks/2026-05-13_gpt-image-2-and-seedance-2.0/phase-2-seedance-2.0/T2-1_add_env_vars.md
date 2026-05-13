---
id: T2-1
phase: 2
title: 環境変数追加 (Seedance 2.0)
depends_on: []
estimated_effort: S
files_touched:
  - movie-maker-api/app/core/config.py
  - movie-maker-api/.env.example
---

## 目的

`config.py` に Seedance 用の設定値 `PIAPI_SEEDANCE_TASK_TYPE` と `PIAPI_SEEDANCE_RESOLUTION` を追加し、`.env.example` にコメント付きのテンプレートを追記する。

## 前提

- 依存タスク: なし (Phase 2 の起点タスク。T1-1 と並行実行可能)
- `movie-maker-api/app/core/config.py` の `PIAPI_KLING_*` ブロックが参照箇所
- `PIAPI_API_KEY` は既存設定として存在するため変更不要

## 変更内容

### `movie-maker-api/app/core/config.py`

`PIAPI_KLING_ENABLE_AUDIO` 行の直後 (line 46 付近) に追記:

```python
# PiAPI Seedance Settings
PIAPI_SEEDANCE_TASK_TYPE: str = "seedance-2-preview-vip"  # or "seedance-2-preview"
PIAPI_SEEDANCE_RESOLUTION: str = "720p"  # "720p" or "1080p" (VIP tier)
```

### `movie-maker-api/.env.example`

既存の `PIAPI_KLING_*` ブロックの下に追記:

```dotenv
# PiAPI Seedance 2.0 Settings
# task_type: "seedance-2-preview" (480p/standard) or "seedance-2-preview-vip" (720p/1080p)
PIAPI_SEEDANCE_TASK_TYPE=seedance-2-preview-vip
# resolution: "720p" (VIP) or "1080p" (VIP, 高コスト $0.50/s)
PIAPI_SEEDANCE_RESOLUTION=720p
```

## 完了条件 (AC)

- [ ] `settings.PIAPI_SEEDANCE_TASK_TYPE` が `"seedance-2-preview-vip"` を返す
- [ ] `settings.PIAPI_SEEDANCE_RESOLUTION` が `"720p"` を返す
- [ ] `.env.example` に両変数と説明コメントが存在する
- [ ] `pytest tests/test_health.py -v` が PASS する

## テスト

新規ユニットテスト不要 (設定値のみの変更)。

## ロールバック

`config.py` と `.env.example` への追記行 (3 行ずつ) を削除する。

## 参照

- Design Doc §3.3 (`app/core/config.py` 追記する設定値)
- Design Doc §5 (設定 / 環境変数)
- Design Doc §11 (リスク: Seedance task_type 名称変更)
