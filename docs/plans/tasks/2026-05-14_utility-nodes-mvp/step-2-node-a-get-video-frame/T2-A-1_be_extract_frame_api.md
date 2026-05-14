---
id: T2-A-1
step: 2
node: A
title: "BE: POST /api/v1/videos/extract-frame 同期エンドポイント実装 + Pydantic スキーマ + 単体テスト"
depends_on: [T1-common-1]
estimated_effort: M
files_touched:
  - movie-maker-api/app/videos/router.py
  - movie-maker-api/app/videos/schemas.py
  - movie-maker-api/tests/videos/test_extract_frame.py (新規)
---

## 目的

動画 URL を受け取り、最初または最後のフレームを画像 URL として返す **同期 API** を実装する。FE の `GetVideoFrameNode` が呼び出す。

## 前提

- Design Doc §5.1〜§5.2 に準拠。
- 既存 FFmpeg 実装:
  - `ffmpeg_service.extract_first_frame(video_path, output_path)` — `movie-maker-api/app/services/ffmpeg_service.py` L2041
  - `ffmpeg_service.extract_last_frame(video_path, output_path)` — 同 L1772
- R2 アップロード処理は既存ヘルパー (`storyboard_processor.py` L176-215 の `_extract_and_upload_last_frame()` パターンを参考) を踏襲する。
- 同期処理のため FastAPI の `async def` ハンドラ内で完結する。タイムアウトは FastAPI デフォルト 60s 以内で完了する想定 (2〜5 秒)。

## 変更内容

### 1. Pydantic スキーマ追加 (`movie-maker-api/app/videos/schemas.py`)

Design Doc §5.2 のシグネチャに準拠:

```python
from typing import Literal
from pydantic import BaseModel

class ExtractFrameRequest(BaseModel):
    video_url: str
    direction: Literal["first", "last"] = "first"

class ExtractFrameResponse(BaseModel):
    image_url: str
```

### 2. ルーター追加 (`movie-maker-api/app/videos/router.py`)

```python
@router.post("/extract-frame", response_model=ExtractFrameResponse)
async def extract_frame(
    request: ExtractFrameRequest,
    current_user = Depends(get_current_user),
) -> ExtractFrameResponse:
    # 1. video_url から動画を tmpfile にダウンロード (httpx 等)
    # 2. direction == 'first' → ffmpeg_service.extract_first_frame(tmp_path, out_path)
    #    direction == 'last'  → ffmpeg_service.extract_last_frame(tmp_path, out_path)
    # 3. 生成された画像を R2 にアップロード (storyboard_processor.py の R2 アップロードヘルパー流用)
    # 4. ExtractFrameResponse(image_url=...) を返す
    ...
```

**エラー処理**:
- 動画ダウンロード失敗 → HTTP 502 / 「動画の取得に失敗しました」をメッセージに含む
- FFmpeg 失敗 → HTTP 500 / 「フレームの抽出に失敗しました」
- 必ず tmpfile を finally で削除すること

### 3. 単体テスト (`movie-maker-api/tests/videos/test_extract_frame.py` 新規)

Design Doc §10.3 に準拠。`ffmpeg_service.extract_first_frame` / `extract_last_frame` をモックして以下を確認:

| テストケース | 確認内容 |
|-------------|---------|
| `direction='first'` で正常呼び出し | `extract_first_frame` が呼ばれ、200 + `image_url` を含むレスポンスが返る |
| `direction='last'` で正常呼び出し | `extract_last_frame` が呼ばれる |
| `direction` が不正 (Literal 違反) | 422 が返る |
| 動画ダウンロード失敗 | エラーステータス + エラーメッセージ |
| FFmpeg 失敗 | エラーステータス + エラーメッセージ |
| 認証なし | 401 が返る |

## 完了条件 (AC)

- [ ] `ExtractFrameRequest` / `ExtractFrameResponse` が `schemas.py` に追加されている (`grep -n "class ExtractFrameRequest\|class ExtractFrameResponse" movie-maker-api/app/videos/schemas.py` で 2 件ヒット)
- [ ] `/extract-frame` エンドポイントが `router.py` に追加されている (`grep -n "/extract-frame" movie-maker-api/app/videos/router.py` でヒット)
- [ ] `test_extract_frame.py` に 4 件以上のテストが含まれ、すべて pass (`cd movie-maker-api && pytest tests/videos/test_extract_frame.py -v`)
- [ ] 既存テスト (`pytest tests/videos/`) が壊れていない
- [ ] `ruff check movie-maker-api/app/videos/router.py movie-maker-api/app/videos/schemas.py movie-maker-api/tests/videos/test_extract_frame.py` が clean
- [ ] tmpfile が finally で確実に削除されることをテストで確認 (リソースリーク防止)
- [ ] `direction` パラメータが Literal で型安全 (任意の文字列を受け付けない)

## テスト

- 単体テスト: 上記 6 ケース以上 (TDD: 失敗テスト → 実装 → green を踏むこと)
- 結合テスト: T3-1 で実 R2 と接続して FE から呼び出して動作確認

## ロールバック

- `router.py` / `schemas.py` の追加分のみ `git revert` で元に戻せる。
- 既存エンドポイントに触れていないため影響なし。
- `test_extract_frame.py` は新規ファイルなので削除のみで完了。

## 参照

- Design Doc §5.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 494-500
- Design Doc §5.2 BE API: POST /api/v1/videos/extract-frame — 行 502-546
- Design Doc §10.3 BE 単体テスト — 行 1321-1325
- 既存実装:
  - `movie-maker-api/app/services/ffmpeg_service.py` L2041 (`extract_first_frame`)
  - `movie-maker-api/app/services/ffmpeg_service.py` L1772 (`extract_last_frame`)
  - `movie-maker-api/app/tasks/storyboard_processor.py` L176-215 (`_extract_and_upload_last_frame()`)
