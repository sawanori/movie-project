import pytest
from unittest.mock import patch, MagicMock

from app.external import r2


@pytest.mark.asyncio
async def test_upload_with_key_uses_key_directly():
    """key argument is passed directly to R2 without prefix concatenation."""
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
    assert call.kwargs["Body"] == b"fake"
    assert url.endswith("omni-references/u/123.mp4")


@pytest.mark.asyncio
async def test_upload_with_key_audio_content_type():
    """audio MIME type is accepted and forwarded."""
    mock_client = MagicMock()
    with patch("app.external.r2.get_r2_client", return_value=mock_client):
        await r2.upload_with_key(b"x", "omni-references/u/a.mp3", "audio/mpeg")
    assert mock_client.put_object.call_args.kwargs["ContentType"] == "audio/mpeg"
    assert mock_client.put_object.call_args.kwargs["Key"] == "omni-references/u/a.mp3"


@pytest.mark.asyncio
async def test_upload_with_key_image_content_type():
    """image MIME type is accepted and forwarded."""
    mock_client = MagicMock()
    with patch("app.external.r2.get_r2_client", return_value=mock_client):
        url = await r2.upload_with_key(
            b"img", "omni-references/u/pic.jpg", "image/jpeg"
        )
    call = mock_client.put_object.call_args
    assert call.kwargs["ContentType"] == "image/jpeg"
    assert call.kwargs["Key"] == "omni-references/u/pic.jpg"
    # ensure no implicit prefix like "images/" is added
    assert "images/omni-references" not in call.kwargs["Key"]
    assert url.endswith("omni-references/u/pic.jpg")


@pytest.mark.asyncio
async def test_upload_with_key_returns_public_url_via_get_public_url():
    """Return value matches get_public_url(key)."""
    mock_client = MagicMock()
    key = "omni-references/user42/file.mp4"
    with patch("app.external.r2.get_r2_client", return_value=mock_client):
        url = await r2.upload_with_key(b"data", key, "video/mp4")
    assert url == r2.get_public_url(key)
