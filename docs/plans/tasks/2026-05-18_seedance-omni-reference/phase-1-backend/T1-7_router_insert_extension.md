---
id: T1-7
phase: 1
title: Router INSERT 拡張 + asset 解決 (cross-user / TTL / audio 合計 / image 合計再検証)
depends_on: [T1-3]
parallel_with: [T1-4]
estimated_effort: M
files_touched:
  - movie-maker-api/app/videos/router.py
  - movie-maker-api/app/videos/service.py
  - movie-maker-api/tests/videos/test_asset_id_resolution.py
wave: 3
agent: backend
---

## 目的

v3 計画書 §6.4 (Router 側) に従い、`POST /videos/story` 内で asset_id → URL 解決ヘルパー (`resolve_asset_ids`) を追加。cross-user 拒否、`expires_at > now` チェック、`media_type` 一致、**audio 合計 ≤15s 検証 (v3, H-2 解消)**、**image 合計 (base + ref) ≤9 再検証 (v3)** を実装。`video_generations` 行に snapshot URL を保存。

## 前提

- 依存タスク: T1-3 (schemas 拡張で `*_reference_asset_ids` field が存在)
- 並列実行可: T1-4 (Upload API 別 endpoint)
- 参照箇所: v3 計画書 §6.4 Router 側コード, §15.1 B-35, B-36, B-36b, B-43, B-43b, B-43c

## 変更内容

### `movie-maker-api/app/videos/router.py` または `service.py`

```python
from uuid import UUID
from datetime import datetime
from dateutil.parser import parse
from fastapi import HTTPException

MAX_AUDIO_TOTAL_SECONDS = 15.0  # v3 PiAPI 公式

async def resolve_asset_ids(
    asset_ids: list[UUID],
    user_id: UUID,
    media_type: str,
) -> list[tuple[str, float | None]]:
    """
    Returns: [(public_url, duration_seconds), ...] 順序保持
    """
    if not asset_ids:
        return []
    sb = get_supabase()  # service-role
    rows = (
        sb.table('omni_reference_assets')
        .select('id,public_url,user_id,expires_at,media_type,duration_seconds')
        .in_('id', [str(i) for i in asset_ids])
        .execute()
    )
    result = []
    for aid in asset_ids:
        row = next((r for r in rows.data if r['id'] == str(aid)), None)
        if row is None:
            raise HTTPException(422, f"asset_id {aid} not found")
        if row['user_id'] != str(user_id):
            raise HTTPException(422, f"asset_id {aid} not found")  # 詳細リーク防止
        if row['media_type'] != media_type:
            raise HTTPException(422, f"asset_id {aid} は media_type 不一致")
        if parse(row['expires_at']) < datetime.utcnow():
            raise HTTPException(422, f"asset_id {aid} は期限切れ")
        result.append((row['public_url'], row.get('duration_seconds')))
    return result


# POST /videos/story 内 (既存 endpoint 拡張)
async def create_story_video(payload: StoryVideoCreate, user=Depends(get_current_user)):
    image_resolved = await resolve_asset_ids(
        payload.image_reference_asset_ids or [], user.id, 'image',
    )
    video_resolved = await resolve_asset_ids(
        payload.video_reference_asset_ids or [], user.id, 'video',
    )
    audio_resolved = await resolve_asset_ids(
        payload.audio_reference_asset_ids or [], user.id, 'audio',
    )

    # v3 H-2: audio 合計検証
    audio_total = sum((d or 0.0) for _, d in audio_resolved)
    if audio_total > MAX_AUDIO_TOTAL_SECONDS:
        raise HTTPException(
            422,
            f"audio 参照の合計時間 {audio_total:.1f}s が上限 {MAX_AUDIO_TOTAL_SECONDS}s を超過 (PiAPI 公式仕様)"
        )

    # v3: image 合計再検証
    base_image = 1 if payload.image_url else 0
    if base_image + len(image_resolved) > 9:
        raise HTTPException(422, "image_urls 合計は 9 個まで")

    # snapshot 保存
    row_data = {
        # ... 既存 video_generations フィールド
        "image_reference_urls": [u for u, _ in image_resolved] or None,
        "video_reference_urls": [u for u, _ in video_resolved] or None,
        "audio_reference_urls": [u for u, _ in audio_resolved] or None,
    }
    # ... INSERT video_generations (status_code=201)
```

### 新規テスト: `tests/videos/test_asset_id_resolution.py`

v3 §15.1 から B-35, B-36, B-36b, B-43, B-43b, B-43c を実装。

| # | テスト |
|---|--------|
| B-35 | 他ユーザー asset_id → 422 |
| B-36 | expires_at < now → 422 |
| B-36b | media_type 不一致 → 422 |
| B-43 (v3) | audio 3 本 (6+5+5=16s) → 422 |
| B-43b (v3) | audio 2 本 14s → 201 |
| B-43c (v3) | image_url + image refs=8 → 201 (上限内) |

## 完了条件 (AC)

- [x] `resolve_asset_ids` 関数実装
- [x] cross-user / TTL / media_type 不一致で 422
- [x] audio 合計 >15s で 422 (B-43)
- [x] image 合計 (base+ref) >9 で 422
- [x] video_generations に snapshot URL 3 カラム保存
- [x] `POST /videos/story` は **201 Created** で返す (既存通り、H-B 確認)
- [x] `pytest tests/videos/test_story_router_omni.py -v` 全 pass (8/8)
- [x] 既存 i2v 経路 (refs 全 None) は変更なし、回帰なし
- [x] AC-14, AC-15, AC-20, AC-23 を test でカバー

## ロールバック

`resolve_asset_ids` 削除、Router の追加分削除、snapshot 列 INSERT 削除。

## 参照

- v3 計画書 §6.4 Router 側コード
- v3 計画書 §15.1 (B-35, B-36, B-36b, B-43, B-43b, B-43c)
- v3 計画書 AC-14, AC-15, AC-20, AC-23
- H-2 解消: audio 合計検証を Router 内に実装
