---
id: T2-4
phase: 2
title: gateway_init.py に Seedance メタデータ登録
depends_on:
  - T2-2
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/gateway_init.py
---

## 目的

`gateway_init.py` の `init_gateway()` に Seedance のモデルメタデータを登録する。`GATEWAY_ENABLED=false` のまま維持するため、実際の動画生成には影響しない。将来の Gateway 有効化に備えた準備のみ。

## 前提

- T2-2 完了 (`PiAPISeedanceProvider` が存在する)
- `movie-maker-api/app/external/gateway_init.py` の hailuo 登録ブロック (line 86–101 付近) が参照箇所
- `ModelMetadata` クラスの定義を確認すること (`app/external/model_registry.py` 等)
- `GATEWAY_ENABLED=false` が `.env` に設定されていること (本タスクで変更しない)

## 変更内容

### `movie-maker-api/app/external/gateway_init.py`

`init_gateway()` 内、既存の `hailuo` ブロックの直後に追記 (Design Doc §3.3 コードそのまま):

```python
try:
    from app.external.piapi_seedance_provider import PiAPISeedanceProvider
    registry.register(
        ModelMetadata(
            name="seedance",
            provider="piapi",
            capabilities=["i2v", "t2v"],
            quality_score=8,
            speed_score=6,
            cost_per_second=0.20,  # 720p VIP tier
        ),
        PiAPISeedanceProvider(),
    )
    logger.info("Gateway: Registered seedance provider")
except Exception as e:
    logger.debug(f"Gateway: Skipped seedance provider: {e}")
```

## 完了条件 (AC)

- [ ] `gateway_init.py` に Seedance 登録ブロックが存在する
- [ ] `GATEWAY_ENABLED=false` 時に FastAPI 起動エラーが発生しない
- [ ] `GATEWAY_ENABLED=false` 時に通常の動画生成フロー (`get_video_provider()` 経由) が影響を受けない
- [ ] `pytest` 既存テストが全て PASS する (既知 2 件失敗を除く)

## テスト

新規ユニットテスト不要。`pytest tests/test_health.py -v` と `pytest tests/videos/ -v` で既存テストが PASS することを確認する。

## ロールバック

追加した `try:...except:` ブロックを削除する。

## 参照

- Design Doc §3.3 (`app/external/gateway_init.py` 変更)
- Design Doc §合意チェックリスト (並行運用: `GATEWAY_ENABLED=false` のまま維持)
- `movie-maker-api/app/external/gateway_init.py` line 86–101 (hailuo 登録パターン)
