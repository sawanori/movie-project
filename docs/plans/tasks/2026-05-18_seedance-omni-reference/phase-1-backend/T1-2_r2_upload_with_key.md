---
id: T1-2
phase: 1
title: r2.upload_with_key() 新規追加 (汎用 key 直接指定アップロード)
depends_on: []
parallel_with: [T1-1, T1-9]
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/r2.py
  - movie-maker-api/tests/external/test_r2_upload_with_key.py
wave: 1
agent: backend
---

## 目的

v3 計画書 §6.3.4 / §5.5 に従い、`r2.py` に汎用 `upload_with_key(file_content, key, content_type)` を新規追加する。既存 `upload_audio/upload_image` は内部で prefix を hardcode 結合する (二重 prefix bug) ため、omni-references 用途では本関数を使用する。動画用は既存 `upload_user_video` (L267) を流用するため本タスクでは触らない。

## 前提

- 依存タスク: なし (Wave 1)
- 並列実行可: T1-1, T1-9
- 参照箇所: `movie-maker-api/app/external/r2.py:37-41` (get_public_url), L267 (upload_user_video)

## 変更内容

### `movie-maker-api/app/external/r2.py`

末尾 (or upload_user_video の直後) に追加:

```python
async def upload_with_key(
    file_content: bytes,
    key: str,
    content_type: str,
) -> str:
    """
    汎用 R2 アップロード: key を直接指定 (prefix 結合なし)

    既存 upload_video/upload_audio/upload_image は filename を内部で
    videos/bgm/images prefix と結合するため、omni-references/ など
    任意 prefix を使いたいケースでは本関数を使用する。

    Args:
        file_content: ファイル本体
        key: R2 オブジェクトキー (例: "omni-references/{user_id}/{uuid}.mp4")
        content_type: MIME (例: "video/mp4", "audio/mpeg", "image/jpeg")

    Returns:
        str: 公開 URL (R2_PUBLIC_URL/{key} または .r2.dev/{key})
    """
    client = get_r2_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )
    return get_public_url(key)
```

### 新規テスト: `movie-maker-api/tests/external/test_r2_upload_with_key.py`

```python
import pytest
from unittest.mock import patch, MagicMock
from app.external import r2

@pytest.mark.asyncio
async def test_upload_with_key_uses_key_directly():
    """key 引数が prefix 結合なしでそのまま R2 に渡されること"""
    mock_client = MagicMock()
    with patch("app.external.r2.get_r2_client", return_value=mock_client):
        url = await r2.upload_with_key(
            b"fake",
            key="omni-references/u/123.mp4",
            content_type="video/mp4",
        )
    call = mock_client.put_object.call_args
    assert call.kwargs["Key"] == "omni-references/u/123.mp4"
    assert call.kwargs["ContentType"] == "video/mp4"
    assert call.kwargs["CacheControl"] == "public, max-age=31536000, immutable"
    assert url.endswith("omni-references/u/123.mp4")

@pytest.mark.asyncio
async def test_upload_with_key_audio_content_type():
    """audio MIME を受領できる"""
    mock_client = MagicMock()
    with patch("app.external.r2.get_r2_client", return_value=mock_client):
        await r2.upload_with_key(b"x", "omni-references/u/a.mp3", "audio/mpeg")
    assert mock_client.put_object.call_args.kwargs["ContentType"] == "audio/mpeg"
```

## 完了条件 (AC)

- [x] `r2.py` に `upload_with_key` が存在
- [x] 戻り値が `get_public_url(key)` で生成される (二重 prefix なし)
- [x] `pytest tests/external/test_r2_upload_with_key.py -v` 全 pass
- [x] 既存 `upload_video / upload_audio / upload_image / upload_user_video` は不変
- [x] 既存テスト 764+ 件への回帰なし

## ロールバック

`upload_with_key` 関数と test ファイルを削除。

## 参照

- v3 計画書 §6.3.4 (r2.py 拡張仕様)
- v3 計画書 §5.5 (関数選定理由)
- v3 計画書 §11 統合ポイント 2
- AC-21 (R2 key 一致)
