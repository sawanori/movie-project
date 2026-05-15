---
id: T1-1
phase: 1
title: core/config.py の PIAPI_KLING_VERSION コメント更新
depends_on: []
estimated_effort: S
files_touched:
  - movie-maker-api/app/core/config.py
---

## 目的

`core/config.py` の `PIAPI_KLING_VERSION` 環境変数定義に、バージョンポリシー (Design Doc §8-2) を反映したコメントを追加する。  
3.0 未満が非推奨・禁止であることをコードベース内に明示し、T1-2 の WARNING ログ追加の前提を整える。

## 前提

- 現在の定義: `PIAPI_KLING_VERSION: str = "3.0"`  — コメントなし (line 42)
- Design Doc §8-2 のバージョンポリシーが承認済みであること

## 変更内容

`movie-maker-api/app/core/config.py` の line 43 付近を以下に更新する。

```python
# 修正前
PIAPI_KLING_VERSION: str = "3.0"

# 修正後
# バージョンポリシー: 3.0 以上必須。2.x / 1.6 は production で使用禁止。
# Elements / 音声生成 / reference_video は 3.0 Omni 経路のみ動作する。
# 3.x 新版リリース時はここを更新すること (FU-8)。
PIAPI_KLING_VERSION: str = "3.0"
```

変更行数: 3 行追加、0 行削除。実行コードの変更はなし。

## 完了条件 (AC)

- [x] `grep -n "PIAPI_KLING_VERSION" movie-maker-api/app/core/config.py` で 3.0 必須・2.x 禁止を示すコメントが確認できる
- [x] `python -c "from app.core.config import settings; print(settings.PIAPI_KLING_VERSION)"` が `3.0` を返す (動作変更なし)
- [x] `pytest movie-maker-api/` がこの変更で新たに失敗するテストを出さない

## テスト

実行コード変更なし。既存テストスイートの全 pass を確認するだけでよい。

```bash
cd movie-maker-api
pytest -q --tb=no 2>&1 | tail -5
```

## ロールバック

```bash
git revert HEAD  # このコミット単体を revert するだけで元に戻る
```

## 参照

- Design Doc §8-2: バージョンポリシー (確定運用ルール)
- `movie-maker-api/app/core/config.py` L41-45 (既存定義)
