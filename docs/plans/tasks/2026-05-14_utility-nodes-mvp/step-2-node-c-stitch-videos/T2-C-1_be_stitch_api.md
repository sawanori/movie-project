---
id: T2-C-1
step: 2
node: C
title: "BE: POST /api/v1/videos/stitch (非同期) + GET /api/v1/videos/stitch/{id} ステータス取得 + 単体テスト (既存 video_concat_processor 流用)"
depends_on: [T1-common-1]
estimated_effort: M
files_touched:
  - movie-maker-api/app/videos/router.py
  - movie-maker-api/app/videos/schemas.py
  - movie-maker-api/tests/videos/test_stitch.py (新規)
---

## 目的

2〜5 本の動画 URL を受け取り、連結動画 URL を返す **非同期 API** を実装する。既存の `video_concat_processor.py` を**そのまま流用**し、新規 API は thin wrapper として実装する。FE の `StitchVideosNode` がポーリングで利用。

## 前提

- Design Doc §7.3 に準拠。
- **既存実装の流用**:
  - 既存 `process_concat_generation()` の `direct_video_urls` パラメータをそのまま使う (`video_concat_processor.py` L106)
  - 既存 `video_concatenations` テーブルをそのまま流用 (Design Doc §11.1)、**マイグレーション不要**
- 既存 `POST /api/v1/concat` (旧 API, `source_video_ids` 受け取り) とは別エンドポイント。新 `/stitch` は `video_urls` を直接受け取る。
- Phase 1 では `transition: 'none'` のみサポート。
- DB マイグレーション不要 (Design Doc §11.1)、ただし RLS ポリシーが `/stitch` から INSERT 可能であることを事前確認。

## 変更内容

### 1. Pydantic スキーマ追加 (`movie-maker-api/app/videos/schemas.py`)

Design Doc §7.3 のシグネチャに準拠:

```python
from typing import Literal
from pydantic import BaseModel, Field

class StitchVideosRequest(BaseModel):
    video_urls: list[str] = Field(min_length=2, max_length=5, description="結合する動画URL（2〜5本）")
    transition: Literal["none"] = "none"  # Phase 1 は none のみ

class StitchVideosResponse(BaseModel):
    id: str
    status: Literal["pending"] = "pending"

class StitchStatusResponse(BaseModel):
    id: str
    status: Literal["pending", "processing", "completed", "failed"]
    progress: int  # 0-100
    output_video_url: str | None = None
    error_message: str | None = None
```

### 2. ルーター追加 (`movie-maker-api/app/videos/router.py`)

```python
@router.post("/stitch", response_model=StitchVideosResponse, status_code=202)
async def stitch_videos(
    request: StitchVideosRequest,
    current_user = Depends(get_current_user),
) -> StitchVideosResponse:
    # 1. video_concatenations テーブルにレコード挿入
    #    - user_id = current_user.id
    #    - status = 'pending'
    #    - transition = request.transition
    # 2. start_concat_processing(concat_id, direct_video_urls=request.video_urls)
    #    既存 video_concat_processor の start_concat_processing を呼ぶ
    # 3. StitchVideosResponse(id=concat_id) を返す (HTTP 202)
    ...

@router.get("/stitch/{stitch_id}", response_model=StitchStatusResponse)
async def get_stitch_status(
    stitch_id: str,
    current_user = Depends(get_current_user),
) -> StitchStatusResponse:
    # 1. video_concatenations テーブルから取得
    # 2. user_id が current_user と一致しなければ 403/404
    # 3. StitchStatusResponse にマッピング (final_video_url → output_video_url)
    ...
```

### 3. 単体テスト (`movie-maker-api/tests/videos/test_stitch.py` 新規)

Design Doc §10.3 に準拠:

| テストケース | 確認内容 |
|-------------|---------|
| 動画 2 本で POST /stitch | 202 + `id`, `status='pending'` を含むレスポンス、`start_concat_processing` がモック呼び出しされる |
| 動画 5 本で POST /stitch | 上限内で正常 (202) |
| 動画 1 本で POST /stitch | 422 (min_length=2 違反) |
| 動画 6 本で POST /stitch | 422 (max_length=5 違反) |
| transition が "crossfade" | 422 (Literal["none"] 違反、Phase 1 制約) |
| GET /stitch/{id} pending | `status='pending'`, `progress=0`, `output_video_url=None` |
| GET /stitch/{id} processing | `status='processing'`, `progress=45` (DBレコードに応じて) |
| GET /stitch/{id} completed | `status='completed'`, `output_video_url` が設定される |
| GET /stitch/{id} failed | `status='failed'`, `error_message` が設定される |
| GET /stitch/{id} 他人のジョブ | 403 or 404 (RLS / authz) |
| 認証なし | 401 |

## 完了条件 (AC)

- [x] `StitchVideosRequest` / `StitchVideosResponse` / `StitchStatusResponse` が `schemas.py` に追加されている (`grep -n "class StitchVideosRequest\|class StitchVideosResponse\|class StitchStatusResponse" movie-maker-api/app/videos/schemas.py` で 3 件ヒット)
- [x] `min_length=2, max_length=5` 制約が `video_urls` フィールドに設定されている
- [x] `transition: Literal["none"]` で `'crossfade'` を受け付けない
- [x] `POST /stitch` (HTTP 202) と `GET /stitch/{id}` の 2 エンドポイントが `router.py` に追加されている (`grep -n "/stitch" movie-maker-api/app/videos/router.py` で 2 件以上ヒット)
- [x] `test_stitch.py` に 10 件以上のテストが含まれ、すべて pass (`cd movie-maker-api && pytest tests/videos/test_stitch.py -v`) — 13 件 PASSED
- [x] 既存 `start_concat_processing` をモックして呼び出し確認 (引数 `direct_video_urls` が渡されることをチェック)
- [x] 既存テスト (`pytest tests/videos/`, `pytest tests/`) が壊れていない (`video_concat_processor` 既存テストが壊れていないこと) — 639 passed, 4 skipped, 1 pre-existing failed
- [ ] `ruff check` が clean
- [x] **マイグレーション未実施を確認**: `video_concatenations` テーブルへの新カラム追加が**ない**こと

## テスト

- 単体テスト: 上記 10 ケース最低 (TDD)
- 結合テスト: T3-1 で実 R2/DB と接続して FE から動作確認 (実際の concat 完了待ちあり)

## ロールバック

- `router.py` / `schemas.py` の追加分のみ `git revert` で元に戻せる。
- `test_stitch.py` は新規ファイルなので削除のみで完了。
- DB マイグレーション未実施のためロールバックリスクなし。

## 参照

- Design Doc §7.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 866-874
- Design Doc §7.3 BE API 設計 — 行 938-984
- Design Doc §10.3 BE 単体テスト — 行 1321-1325
- Design Doc §11.1 DB マイグレーション (既存テーブル流用) — 行 1329-1357
- 既存実装: `movie-maker-api/app/tasks/video_concat_processor.py` L66 (`direct_video_urls`), L106 (`process_concat_generation`)
- 既存テーブル: `video_concatenations` (id, user_id, status, progress, final_video_url, error_message, transition, transition_duration)
