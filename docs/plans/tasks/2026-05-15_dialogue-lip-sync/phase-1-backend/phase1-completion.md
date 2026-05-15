---
id: phase1-completion
phase: 1
title: "Phase 1 完了チェック — バックエンド E2E 統合確認"
depends_on:
  - T1-6
estimated_effort: S
files_touched: []
---

## 目的

Phase 1 (T1-1〜T1-6) の全タスクが完了したことを確認し、バックエンドの統合ポイントを E2E 検証する。Design Doc §10-4「ステップ 1 完了時」の期待状態をすべて満たすことを確認する。

## 完了条件チェックリスト

### 全タスク完了確認

- [ ] T1-1: `docs/migrations/20260515_dialogue_use_lip_sync.sql` が存在し Supabase に適用済
- [ ] T1-2: `app/dialogue/schemas.py` に `use_lip_sync: bool = Field(default=False, ...)` が追加済
- [ ] T1-3: `app/dialogue/router.py` が `use_lip_sync=request.use_lip_sync` を service に渡している
- [ ] T1-4: `app/dialogue/service.py` の `create_dialogue_generation` / `update_dialogue_status` が拡張済
- [ ] T1-5: `app/tasks/dialogue_processor.py` に分岐ロジック + 新規関数 3 個が実装済
- [ ] T1-6: `tests/dialogue/test_lip_sync_branch.py` の 5 ケースが pass

### E2E 統合確認 (Design Doc §10-4)

#### 1. 全テスト pass

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
pytest tests/dialogue/ -v 2>&1 | tail -20
# 全件 pass (FAILED が 0 件)
```

#### 2. use_lip_sync=true が HTTP 200 で受理される

```bash
# 開発サーバー起動後
curl -X POST http://localhost:8000/api/v1/dialogue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"video_url":"https://example.com/v.mp4","text":"テスト","voice_id":"alloy","use_lip_sync":true}'
# 期待: HTTP 200, { "id": "<uuid>", "status": "pending" }
```

#### 3. 既存 use_lip_sync=false 経路に regression なし

```bash
curl -X POST http://localhost:8000/api/v1/dialogue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"video_url":"https://example.com/v.mp4","text":"テスト","voice_id":"alloy"}'
# 期待: HTTP 200 (use_lip_sync 省略で 400 にならないこと)
```

#### 4. DB に lip_sync_generation_id カラムが存在する

```sql
-- Supabase MCP または psql で確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'dialogue_generations'
  AND column_name IN ('use_lip_sync', 'lip_sync_generation_id');
-- 2 行返ること
```

#### 5. `_translate_hedra_error` が正しく動作する

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api
python -c "
from app.tasks.dialogue_processor import _translate_hedra_error
assert '顔を検出できませんでした' in _translate_hedra_error('face_detection_failed')
assert '長すぎます' in _translate_hedra_error('video duration exceeded')
assert 'リップシンク生成に失敗しました' in _translate_hedra_error(None)
print('All translate tests OK')
"
```

## 参照

- Design Doc §10-1 ステップ 1 完了条件 (L1/L2/L3)
- Design Doc §10-4 統合ポイント定義「ステップ 1 完了時」
- Design Doc §12 統合ポイントマップ (インテグレーションポイント 1-3)
