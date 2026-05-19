---
id: T3-17c
phase: 3
title: GC バッチ cron 登録 (Railway scheduled jobs or Supabase pg_cron) — M-1
depends_on: [T1-17b]
parallel_with: [T3-18]
estimated_effort: S
files_touched:
  - movie-maker-api/scripts/run_omni_gc.py (新規)
  - docs/ops/omni-reference-gc-schedule.md (新規)
  - (Railway 設定 or Supabase pg_cron 設定 — UI 操作)
wave: 12
agent: ops
---

## 目的

v3 計画書 §6.6 + §17 #3 に従い、`gc_expired_omni_assets()` を本番 cron に登録する (M-1 対応)。Railway scheduled jobs または Supabase pg_cron + edge function のいずれかで日次実行。

## 前提

- 依存タスク: T1-17b (GC バッチ実装完了)
- 並列実行可: T3-18 (E2E と独立)
- 参照箇所: v3 計画書 §6.6 (GC), §17 #3

## 変更内容

### 1. 実行スクリプト: `movie-maker-api/scripts/run_omni_gc.py`

```python
"""Run omni_reference_assets GC (CLI entrypoint)."""
import asyncio
import logging
import sys

from app.tasks.omni_reference_gc import gc_expired_omni_assets

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


async def main() -> int:
    deleted = await gc_expired_omni_assets()
    print(f"omni_reference_gc deleted={deleted}")
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
```

### 2. Railway scheduled jobs 設定 (推奨)

Railway dashboard:
- Service: movie-maker-api
- Settings → Cron Jobs (or Scheduled Tasks)
- New Job:
  - Schedule: `0 3 * * *` (毎日 03:00 UTC)
  - Command: `python scripts/run_omni_gc.py`

### 3. (代替) Supabase pg_cron + Edge Function

Railway scheduled jobs が利用不可なら:

```sql
SELECT cron.schedule(
  'omni-gc-daily',
  '0 3 * * *',
  $$ SELECT net.http_post(
    url := 'https://your-edge-function/omni-gc',
    headers := jsonb_build_object('Authorization', 'Bearer ...')
  ) $$
);
```

### 4. ドキュメント: `docs/ops/omni-reference-gc-schedule.md`

```markdown
# Omni Reference GC スケジュール

## 概要
- 対象: omni_reference_assets (expires_at < now)
- 削除: R2 オブジェクト + DB 行
- service-role キー使用 (RLS bypass)

## スケジュール
- 毎日 03:00 UTC (Railway scheduled job)

## 監視
- ログ: `omni_reference_gc completed deleted={N}`
- 失敗時アラート: Railway → Slack 通知

## 手動実行
```bash
cd movie-maker-api
python scripts/run_omni_gc.py
```
```

## 完了条件 (AC)

- [ ] `scripts/run_omni_gc.py` 作成済
- [ ] Railway scheduled jobs (or pg_cron) 設定済 — UI スクショ or 設定ログ確認
- [ ] 初回手動実行成功 (`python scripts/run_omni_gc.py` で expired 0 件 or 削除確認)
- [ ] `docs/ops/omni-reference-gc-schedule.md` 作成済
- [ ] AC-17 (TTL GC) を本番環境で確認可能
- [ ] ログにエラーなし

## 注意

- **deployment owner 必須**: Railway/Supabase の権限が必要なため、ops 担当が実施。
- task-executor が直接 Railway/Supabase 設定できない場合は手順書を残し owner にハンドオフ。

## ロールバック

Railway scheduled job 無効化、`scripts/run_omni_gc.py` 削除。

## 参照

- v3 計画書 §6.6 (GC バッチ)
- v3 計画書 §17 #3 (TTL 72h 判断)
- v3 計画書 AC-17
- M-1 対応
