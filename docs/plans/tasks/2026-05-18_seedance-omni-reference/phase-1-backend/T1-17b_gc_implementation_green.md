---
id: T1-17b
phase: 1
title: GC バッチ実装 (GREEN) — gc_expired_omni_assets()
depends_on: [T1-17a]
parallel_with: [T1-storyboard_smoke]
estimated_effort: S
files_touched:
  - movie-maker-api/app/tasks/omni_reference_gc.py
  - movie-maker-api/app/external/r2.py (delete_file 確認のみ)
wave: 5
agent: backend
---

## 目的

T1-17a で RED 状態のテストを GREEN にする。v3 計画書 §6.6 のとおり `gc_expired_omni_assets()` を実装し、service-role キーで `expires_at < now` の asset を R2 + DB から削除する (C-2 対応)。`r2.delete_file(r2_key)` の引数が DB `r2_key` と完全一致することを保証 (B-42)。

## 前提

- 依存タスク: T1-17a (test 先行作成済、現在 RED)
- 並列実行可: T1-storyboard_smoke
- 参照箇所: v3 計画書 §6.6 (GC バッチ pseudocode), T1-17a の test

## 変更内容

### 新規ファイル: `movie-maker-api/app/tasks/omni_reference_gc.py`

```python
"""
omni_reference_assets の TTL GC バッチ.

v3: service-role キー使用 (RLS bypass)、r2_key と DB 完全一致削除.
"""
import logging
from datetime import datetime, timezone

from app.core.supabase_client import get_supabase
from app.external import r2

logger = logging.getLogger(__name__)


async def gc_expired_omni_assets() -> int:
    """
    expires_at < now の omni_reference_assets を R2 + DB から削除.

    Returns:
        削除した件数
    """
    sb = get_supabase()  # service-role
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = (
        sb.table("omni_reference_assets")
        .select("id,r2_key")
        .lt("expires_at", now_iso)
        .execute()
    )

    deleted = 0
    for row in rows.data:
        try:
            await r2.delete_file(row["r2_key"])  # v3: r2_key と DB 一致
        except Exception as e:
            logger.error(
                "omni_reference_gc R2 delete failed",
                extra={"id": row["id"], "r2_key": row["r2_key"], "error": str(e)},
            )
            continue  # R2 削除失敗時は DB 行を残し次回再試行

        sb.table("omni_reference_assets").delete().eq("id", row["id"]).execute()
        deleted += 1

    logger.info("omni_reference_gc completed", extra={"deleted": deleted})
    return deleted
```

### `r2.py` 確認のみ

`delete_file(key: str)` 関数が既存に存在することを確認。なければ追加:

```python
async def delete_file(key: str) -> None:
    client = get_r2_client()
    client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
```

## 完了条件 (AC)

- [x] `app/tasks/gc_omni_assets.py` が存在 (T1-17a によりモジュール名変更)
- [x] `pytest tests/tasks/test_gc_omni_assets.py -v` 全 **GREEN** (B-37, B-38, B-42 全 pass, 5/5)
- [x] B-42 で `r2.delete_file` 引数が DB `r2_key` と完全一致 (二重 prefix なし)
- [x] service-role キーで Supabase アクセス (RLS bypass 確認: `app.core.supabase.get_supabase` 使用)
- [x] R2 削除失敗時に DB 削除しない (リトライ可能設計)
- [x] 既存テスト回帰なし (tests/tasks/ 34/34 pass)
- [x] AC-17 (TTL GC) を test でカバー

## 注意

- 本タスクではまだ cron/scheduled jobs に登録しない (T3-17c で実施)
- 手動実行は `python -c "import asyncio; from app.tasks.omni_reference_gc import gc_expired_omni_assets; asyncio.run(gc_expired_omni_assets())"` で可能

## ロールバック

`omni_reference_gc.py` 削除。

## 参照

- v3 計画書 §6.6 (GC バッチ仕様)
- v3 計画書 AC-17, AC-21
- TDD GREEN フェーズ (T1-17a が RED)
