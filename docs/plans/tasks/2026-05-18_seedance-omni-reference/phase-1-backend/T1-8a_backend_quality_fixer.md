---
id: T1-8a
phase: 1
title: Backend quality-fixer (pytest 全件 pass + lint)
depends_on: [T1-6, T1-17b, T1-storyboard_smoke]
parallel_with: [T1-8b]
estimated_effort: S
files_touched: []
wave: 6
agent: ops
---

## 目的

Wave 1-5 で実装した Backend 全変更について、品質保証を実施。pytest 全件 pass (既知失敗 3 件除く)、lint pass、型チェック pass を担保する。問題があれば修正を委託または直接修正する。

## 前提

- 依存タスク: T1-6, T1-17b, T1-storyboard_smoke (Backend 全実装完了)
- 並列実行可: T1-8b (code-reviewer と独立)
- v3 計画書 §15.3 既存テスト回帰要件

## 実施手順

### 1. 全テスト実行

```bash
cd movie-maker-api
make test
# または
pytest -v --tb=short 2>&1 | tee /tmp/be_test_log.txt
```

### 2. 新規追加テストの内訳確認

| ファイル | 件数目標 |
|---------|---------|
| tests/external/test_r2_upload_with_key.py | 2+ |
| tests/external/test_piapi_seedance_omni_reference.py | 14 (B-1〜B-12, B-29〜B-31) |
| tests/videos/test_omni_reference_schema.py | 10 (B-13〜B-20, B-32, B-16b, B-17a-c) |
| tests/videos/test_upload_omni_reference_api.py | 9 (B-21〜B-26, B-33, B-34, B-41) |
| tests/videos/test_asset_id_resolution.py | 6 (B-35, B-36, B-36b, B-43, B-43b, B-43c) |
| tests/tasks/test_omni_reference_gc.py | 3 (B-37, B-38, B-42) |
| tests/tasks/test_story_processor.py 拡張 | 3 (B-27, B-28, B-28b) |
| tests/tasks/test_storyboard_processor_omni_nullsafe.py | 2 |
| **合計** | **49+** |

### 3. lint / format

```bash
ruff check app/ tests/
ruff format --check app/ tests/
mypy app/ || true  # 既存に mypy がある場合のみ
```

### 4. 既知失敗 3 件 (CLAUDE.md 記載) の除外確認

`tests/videos/test_text_to_image.py` × 2、`tests/library/test_service.py` × 1 が **依然として既知失敗のまま、新たな失敗が増えていない** ことを確認。

### 5. 問題発生時

- lint エラー: 自動修正後 commit
- test 失敗: 該当タスク (T1-X) を再委託して修正
- 新たな既存テスト破壊: 即座に root cause 調査して fix

## 完了条件 (AC)

- [ ] 新規追加テスト 49 件以上 が全 pass
- [ ] 既存テスト 764+ 件のうち、既知失敗 3 件を除き全 pass
- [ ] `ruff check` pass
- [ ] `ruff format --check` pass
- [ ] **新たに失敗するテストが 0 件** (回帰なし)
- [ ] テスト結果ログを `/tmp/be_test_log.txt` に保存

## ロールバック

quality-fixer は変更を加える場合 atomic commit にとどめ、問題タスクへ差し戻す。

## 参照

- v3 計画書 §15 (テスト戦略)
- v3 計画書 AC-18 (既存テスト全件 pass)
- CLAUDE.md 既知失敗 3 件
