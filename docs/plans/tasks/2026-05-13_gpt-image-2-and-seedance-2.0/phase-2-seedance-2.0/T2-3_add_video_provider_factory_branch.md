---
id: T2-3
phase: 2
title: video_provider.py ファクトリに seedance 分岐追加
depends_on:
  - T2-2
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/video_provider.py
---

## 目的

`get_video_provider()` ファクトリ関数に `"seedance"` 分岐を追加し、`VIDEO_PROVIDER=seedance` 環境変数で `PiAPISeedanceProvider` が選択されるようにする。

## 前提

- T2-2 完了 (`PiAPISeedanceProvider` が存在する)
- `movie-maker-api/app/external/video_provider.py` の `get_video_provider()` 関数 (line 240 付近) を確認すること
- `elif provider_name == "piapi_kling":` ブロックが参照箇所

## 変更内容

### `movie-maker-api/app/external/video_provider.py`

`elif provider_name == "piapi_kling":` ブロックの直後に挿入 (Design Doc §3.3 コードそのまま):

```python
elif provider_name == "seedance":
    from app.external.piapi_seedance_provider import PiAPISeedanceProvider
    logger.info("Using PiAPI Seedance video provider")
    return PiAPISeedanceProvider()
```

`get_video_provider()` の docstring の provider_name 列挙に `"seedance"` を追記:
```
# 変更前: provider_name: "runway", "veo", "domoai", "piapi_kling", "hailuo"
# 変更後: provider_name: "runway", "veo", "domoai", "piapi_kling", "hailuo", "seedance"
```

## 完了条件 (AC)

- [ ] `get_video_provider("seedance")` が `PiAPISeedanceProvider` インスタンスを返す
- [ ] `get_video_provider("piapi_kling")` など既存分岐が引き続き正しく動作する
- [ ] `VIDEO_PROVIDER=seedance` を `.env` に設定して FastAPI を起動してもエラーが起きない
- [ ] `pytest tests/videos/ -v` が PASS する (既知 2 件失敗を除く)

## テスト

既存の `get_video_provider` 呼び出しテストが引き続き PASS することを確認する。

新規テストは T2-6 で追加する。

## ロールバック

追加した `elif provider_name == "seedance":` ブロックを削除し、docstring を元に戻す。

## 参照

- Design Doc §3.3 (`app/external/video_provider.py:240` 変更)
- Design Doc §2b (シーケンス図)
