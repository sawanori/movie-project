---
id: T1-4
phase: 1
title: Upload API 3 endpoints 実装 (video/audio/image)
depends_on: [T1-3, T1-2]
parallel_with: [T1-7]
estimated_effort: L
files_touched:
  - movie-maker-api/app/videos/router.py
  - movie-maker-api/app/videos/service.py
  - movie-maker-api/tests/videos/test_upload_omni_reference_api.py
wave: 3
agent: backend
---

## 目的

v3 計画書 §6.3.1〜§6.3.3 に従い、media 別 3 endpoints (video/audio/image) を実装。各 endpoint で size/format/duration validation、`consent_accepted` 検証、ffprobe duration 計測、`r2.upload_user_video` (動画) または `r2.upload_with_key` (audio/image) で R2 配置、`omni_reference_assets` テーブルに service-role キーで INSERT。レスポンスは T1-3 で定義した `OmniReferenceAssetResponse` を返却。

## 前提

- 依存タスク:
  - T1-3 完了 (Upload schema `OmniReferenceAssetResponse` 利用、`StoryVideoCreate` validator が存在)
  - T1-2 完了 (`r2.upload_with_key` 存在)
- 並列実行可: T1-7 (Router INSERT 拡張 — 別 endpoint なので独立)
- 参照箇所: v3 計画書 §6.3, `movie-maker-api/app/videos/router.py` 既存 `/upload-image`

## 変更内容

### `movie-maker-api/app/videos/router.py` (3 endpoint 追加)

```python
from app.videos.schemas import OmniReferenceAssetResponse
from app.external import r2
from app.services.ffmpeg_service import probe_duration  # ffprobe ラッパ
from uuid import uuid4

MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50MB
MAX_AUDIO_SIZE = 10 * 1024 * 1024
MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_VIDEO_DURATION = 15.4
MAX_AUDIO_DURATION_EACH = 15.0  # 単体上限 (合計は Router 側で T1-7)

ALLOWED_VIDEO_CT = {"video/mp4", "video/quicktime"}
ALLOWED_AUDIO_CT = {"audio/mpeg", "audio/wav"}
ALLOWED_IMAGE_CT = {"image/jpeg", "image/png", "image/webp"}


@router.post("/upload-omni-video-reference", status_code=200, response_model=OmniReferenceAssetResponse)
async def upload_omni_video_reference(
    file: UploadFile = File(...),
    consent_accepted: bool = Form(...),
    user=Depends(get_current_user),
):
    if not consent_accepted:
        raise HTTPException(422, "著作権同意が必要です")
    if file.content_type not in ALLOWED_VIDEO_CT:
        raise HTTPException(422, f"Content-Type 不正 (許可: {ALLOWED_VIDEO_CT})")
    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(413, "ファイルサイズが大きすぎます")
    duration = await probe_duration(content)
    if duration > MAX_VIDEO_DURATION:
        raise HTTPException(422, f"動画 duration は {MAX_VIDEO_DURATION}s 以下")

    ext = "mp4" if file.content_type == "video/mp4" else "mov"
    asset_id = uuid4()
    key = f"omni-references/{user.id}/{asset_id}.{ext}"
    url = await r2.upload_user_video(content, key=key, content_type=file.content_type)

    sb = get_supabase()  # service-role
    row = sb.table("omni_reference_assets").insert({
        "id": str(asset_id),
        "user_id": str(user.id),
        "r2_key": key,
        "public_url": url,
        "media_type": "video",
        "content_type": file.content_type,
        "duration_seconds": float(duration),
        "file_size_bytes": len(content),
        "consent_accepted": True,
    }).execute()
    return OmniReferenceAssetResponse(
        id=asset_id, url=url, media_type="video",
        duration_seconds=float(duration), content_type=file.content_type,
        file_size_bytes=len(content),
        expires_at=row.data[0]["expires_at"],
    )


@router.post("/upload-omni-audio-reference", status_code=200, response_model=OmniReferenceAssetResponse)
async def upload_omni_audio_reference(...):
    # 同パターン、ALLOWED_AUDIO_CT / MAX_AUDIO_SIZE / MAX_AUDIO_DURATION_EACH
    # r2.upload_with_key 使用 (v3 新規)


@router.post("/upload-omni-image-reference", status_code=200, response_model=OmniReferenceAssetResponse)
async def upload_omni_image_reference(...):
    # 同パターン、ALLOWED_IMAGE_CT / MAX_IMAGE_SIZE / duration_seconds=None
    # r2.upload_with_key 使用
```

### 新規テスト: `tests/videos/test_upload_omni_reference_api.py`

v3 計画書 §15.1 から B-21〜B-26, B-33, B-34, B-41 を実装。

| # | テスト |
|---|--------|
| B-21 | MP4 5s + consent=true → 200 + duration=5.0 + DB row |
| B-22 | PNG を video endpoint → 422 (Content-Type) |
| B-23 | MP4 20s → 422 (duration) |
| B-24 | MP3 10s → 200 |
| B-25 | MP3 20s 単体 → 422 |
| B-26 | 60MB → 413 |
| B-33 | consent_accepted=false → 422 |
| B-34 | 統合: anonymous GET で 200 (R2 公開) |
| B-41 (v3) | レスポンス url の path 部 = DB r2_key 完全一致 (二重 prefix なし) |

## 完了条件 (AC)

- [x] 3 endpoints 実装済
- [x] 動画・audio・image いずれも `r2.upload_with_key` を使用 (二重 prefix bug 回避のため統一; user 指示により AC を更新)
- [x] consent_accepted=false で 422
- [x] DB INSERT は service-role キーで実行 (RLS bypass)
- [x] レスポンス型 = `OmniReferenceAssetResponse` (T1-3 で定義)
- [x] `pytest tests/videos/test_upload_omni_reference.py -v` 全 pass (13 件 / file 名は user 指示準拠)
- [x] B-41 で r2_key と response.url path 部の完全一致を assert
- [x] AC-2, AC-3, AC-16, AC-21 を test でカバー

## ロールバック

3 endpoints + test ファイル削除。

## 参照

- v3 計画書 §6.3 (Upload API 仕様)
- v3 計画書 §15.1 (B-21〜B-26, B-33, B-34, B-41)
- v3 計画書 AC-2, AC-3, AC-16, AC-21
- H-1 解消: schema は T1-3 で定義済を import
