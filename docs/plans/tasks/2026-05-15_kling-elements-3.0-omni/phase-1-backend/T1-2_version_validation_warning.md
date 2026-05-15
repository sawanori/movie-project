---
id: T1-2
phase: 1
title: piapi_kling_provider.py の __init__ に version バリデーション WARNING ログ追加
depends_on:
  - T1-1
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/piapi_kling_provider.py
---

## 目的

`PiAPIKlingProvider.__init__` 内で `self.version` が `"3."` で始まらない場合に WARNING ログを出力し、非推奨バージョン使用時の検知を可能にする。  
Design Doc §8-2 の「実装上の保証」を実コードに落とし込む。

## 前提

- T1-1 完了済み (config.py にポリシーコメントあり)
- `PiAPIKlingProvider.__init__` は `movie-maker-api/app/external/piapi_kling_provider.py` L213-224 に存在する

## 変更内容

`PiAPIKlingProvider.__init__` (L213) の末尾に以下を追加する。

```python
# 既存コード終端 (L224 付近)
if not self.api_key:
    raise ValueError("PIAPI_API_KEY must be configured")

# ▼ NEW: バージョンポリシー検証 (Design Doc §8-2)
if not self.version.startswith("3"):
    logger.warning(
        f"PIAPI_KLING_VERSION={self.version!r} は推奨外です。"
        f"Elements / 音声生成 / reference video 機能が利用できません。"
        f"3.0 以上への昇格を推奨します。"
    )
```

変更行数: 5 行追加。実行ロジックに副作用なし（ログのみ）。

## 完了条件 (AC)

- [x] `grep -n "startswith.*3" movie-maker-api/app/external/piapi_kling_provider.py` で `__init__` 内にバリデーションコードが確認できる
- [x] バージョン `"2.6"` を渡した場合の動作確認:
  ```bash
  cd movie-maker-api
  python -c "
  import os; os.environ['PIAPI_API_KEY']='dummy'; os.environ['PIAPI_KLING_VERSION']='2.6'
  import logging; logging.basicConfig(level=logging.WARNING)
  from app.external.piapi_kling_provider import PiAPIKlingProvider
  p = PiAPIKlingProvider()
  " 2>&1 | grep -q "推奨外" && echo "PASS" || echo "FAIL"
  ```
- [x] バージョン `"3.0"` では WARNING が出ない:
  ```bash
  python -c "
  import os; os.environ['PIAPI_API_KEY']='dummy'; os.environ['PIAPI_KLING_VERSION']='3.0'
  import logging; logging.basicConfig(level=logging.WARNING)
  from app.external.piapi_kling_provider import PiAPIKlingProvider
  p = PiAPIKlingProvider()
  " 2>&1 | grep -q "推奨外" && echo "FAIL" || echo "PASS"
  ```
- [x] `pytest movie-maker-api/` が新たに失敗しない

## テスト

既存テストスイートの全 pass 確認で十分。新規テストは T1-7 にまとめる。

```bash
cd movie-maker-api
pytest -q --tb=short 2>&1 | tail -10
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §8-2: 「実装上の保証」セクション
- `movie-maker-api/app/external/piapi_kling_provider.py` L213-225 (`PiAPIKlingProvider.__init__`)
