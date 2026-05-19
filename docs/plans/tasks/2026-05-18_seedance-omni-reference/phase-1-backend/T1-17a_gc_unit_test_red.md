---
id: T1-17a
phase: 1
title: GC バッチ unit テスト先行作成 (RED)
depends_on: [T1-1]
parallel_with: [T1-3, T1-5]
estimated_effort: S
files_touched:
  - movie-maker-api/tests/tasks/test_omni_reference_gc.py
wave: 2
agent: backend
---

## 目的

TDD Red フェーズ。`gc_expired_omni_assets()` の unit テストを先行作成し、未実装状態で RED (ImportError or AttributeError) を確認する。v3 計画書 §15.1 B-37, B-38, B-42 をカバー。

## 前提

- 依存タスク: T1-1 (テーブル存在前提だが test は mock のみ)
- 並列実行可: T1-3, T1-5
- 参照箇所: v3 計画書 §6.6 (GC バッチ), §15.1 (test B-37/B-38/B-42)
- 実装は T1-17b で行う (本タスクは test のみ)

## 変更内容

### 新規ファイル: `movie-maker-api/tests/tasks/test_omni_reference_gc.py`

```python
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

# 未実装段階では ImportError、実装後に GREEN
from app.tasks.omni_reference_gc import gc_expired_omni_assets


@pytest.fixture
def mock_supabase():
    """omni_reference_assets テーブル mock"""
    sb = MagicMock()
    sb.table.return_value.select.return_value.lt.return_value.execute.return_value.data = []
    sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    return sb


@pytest.mark.asyncio
async def test_b37_expired_asset_is_deleted(mock_supabase):
    """B-37: expires_at < now の asset → R2.delete_file + DB DELETE 呼出"""
    past_row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "r2_key": "omni-references/u1/abc.mp4",
    }
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = [past_row]

    with patch("app.tasks.omni_reference_gc.get_supabase", return_value=mock_supabase), \
         patch("app.tasks.omni_reference_gc.r2.delete_file", new_callable=AsyncMock) as mock_del:
        await gc_expired_omni_assets()

    mock_del.assert_awaited_once_with("omni-references/u1/abc.mp4")
    mock_supabase.table.return_value.delete.return_value.eq.assert_called_with("id", past_row["id"])


@pytest.mark.asyncio
async def test_b38_future_asset_is_not_deleted(mock_supabase):
    """B-38: expires_at > now の asset → 削除されない"""
    # select.lt(expires_at, now) で空 → 削除呼出なし
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = []
    with patch("app.tasks.omni_reference_gc.get_supabase", return_value=mock_supabase), \
         patch("app.tasks.omni_reference_gc.r2.delete_file", new_callable=AsyncMock) as mock_del:
        await gc_expired_omni_assets()
    mock_del.assert_not_awaited()


@pytest.mark.asyncio
async def test_b42_delete_file_arg_matches_db_r2_key(mock_supabase):
    """B-42 (v3 新): r2.delete_file 引数が DB r2_key と完全一致 (二重 prefix なし)"""
    row = {
        "id": "22222222-2222-2222-2222-222222222222",
        "r2_key": "omni-references/user-xyz/uuid-abc.mp3",
    }
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = [row]
    with patch("app.tasks.omni_reference_gc.get_supabase", return_value=mock_supabase), \
         patch("app.tasks.omni_reference_gc.r2.delete_file", new_callable=AsyncMock) as mock_del:
        await gc_expired_omni_assets()
    arg = mock_del.call_args.args[0]
    assert arg == "omni-references/user-xyz/uuid-abc.mp3"
    assert "videos/" not in arg
    assert "bgm/" not in arg
```

## 完了条件 (AC)

- [x] test ファイル作成済 (`tests/tasks/test_gc_omni_assets.py` ※ユーザー指示によりファイル名/モジュール名は `gc_omni_assets` を採用)
- [x] `pytest tests/tasks/test_gc_omni_assets.py -v` 実行で **RED** (ModuleNotFoundError: `app.tasks.gc_omni_assets`)
- [x] 5 テストが定義されている (B-37, B-38, B-42 + R2 失敗時 graceful 処理 + idempotency)
- [x] CI を blocking にしない (後続 T1-17b で GREEN 化、本タスクは TDD RED 確認のみ)

## 注意

- 本タスクは **実装ファイルを作成しない**。RED 確認のみ。
- T1-17b で `app/tasks/omni_reference_gc.py` を実装して GREEN 化する。

## 参照

- v3 計画書 §6.6 (GC バッチ仕様)
- v3 計画書 §15.1 (test B-37/B-38/B-42)
- testing-principles skill: TDD Red-Green-Refactor
