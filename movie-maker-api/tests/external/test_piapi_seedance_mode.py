"""
PiAPISeedanceProvider._resolve_task_type および mode 引数テスト

Design Doc に基づく:
  - mode=None → env そのまま
  - mode='pro' で fast-preview → preview に戻す
  - mode='fast' で preview → fast-preview に変更
  - mode='fast' で既に fast → そのまま
  - generate_video に mode='fast' を渡すと payload の task_type が *-fast-preview* になること
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.external.piapi_seedance_provider import PiAPISeedanceProvider


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_provider(task_type: str) -> PiAPISeedanceProvider:
    """指定した task_type を持つ PiAPISeedanceProvider インスタンスを返す"""
    with patch("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE=task_type,
        PIAPI_SEEDANCE_RESOLUTION="720p",
    )):
        return PiAPISeedanceProvider()


def _make_mock_response(json_data: dict) -> MagicMock:
    mock_response = MagicMock()
    mock_response.json.return_value = json_data
    mock_response.raise_for_status = MagicMock()
    return mock_response


# ---------------------------------------------------------------------------
# _resolve_task_type ユニットテスト
# ---------------------------------------------------------------------------

class TestResolveTaskType:

    def test_resolve_task_type_default(self):
        """mode=None → env そのまま"""
        provider = _make_provider("seedance-2-preview-vip")
        assert provider._resolve_task_type(None) == "seedance-2-preview-vip"

    def test_resolve_task_type_pro_from_fast_vip(self):
        """env=seedance-2-fast-preview-vip + mode='pro' → seedance-2-preview-vip"""
        provider = _make_provider("seedance-2-fast-preview-vip")
        assert provider._resolve_task_type("pro") == "seedance-2-preview-vip"

    def test_resolve_task_type_fast_from_pro_vip(self):
        """env=seedance-2-preview-vip + mode='fast' → seedance-2-fast-preview-vip"""
        provider = _make_provider("seedance-2-preview-vip")
        assert provider._resolve_task_type("fast") == "seedance-2-fast-preview-vip"

    def test_resolve_task_type_fast_from_pro_no_vip(self):
        """env=seedance-2-preview + mode='fast' → seedance-2-fast-preview"""
        provider = _make_provider("seedance-2-preview")
        assert provider._resolve_task_type("fast") == "seedance-2-fast-preview"

    def test_resolve_task_type_fast_already_fast(self):
        """env=seedance-2-fast-preview-vip + mode='fast' → same (べき等)"""
        provider = _make_provider("seedance-2-fast-preview-vip")
        assert provider._resolve_task_type("fast") == "seedance-2-fast-preview-vip"

    def test_resolve_task_type_pro_already_pro(self):
        """env=seedance-2-preview-vip + mode='pro' → same (べき等)"""
        provider = _make_provider("seedance-2-preview-vip")
        assert provider._resolve_task_type("pro") == "seedance-2-preview-vip"

    def test_resolve_task_type_invalid_mode_raises(self):
        """無効な mode は ValueError"""
        provider = _make_provider("seedance-2-preview-vip")
        with pytest.raises(ValueError, match="Invalid seedance mode"):
            provider._resolve_task_type("ultra")


# ---------------------------------------------------------------------------
# generate_video が resolved task_type を payload に使うことを確認
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_video_uses_resolved_task_type_fast():
    """mode='fast' を渡すと payload の task_type が *-fast-preview* を含むこと"""
    provider = _make_provider("seedance-2-preview-vip")
    mock_response = _make_mock_response({"data": {"task_id": "seed_fast_001"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="fast mode test",
            duration=5,
            aspect_ratio="9:16",
            mode="fast",
        )

    assert task_id == "seed_fast_001"
    assert "fast-preview" in captured_payload.get("task_type", ""), (
        f"task_type should contain 'fast-preview', got: {captured_payload.get('task_type')}"
    )


@pytest.mark.asyncio
async def test_generate_video_uses_resolved_task_type_pro():
    """mode='pro' を渡すと payload の task_type に fast が含まれないこと"""
    provider = _make_provider("seedance-2-fast-preview-vip")
    mock_response = _make_mock_response({"data": {"task_id": "seed_pro_001"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="pro mode test",
            duration=5,
            aspect_ratio="9:16",
            mode="pro",
        )

    assert task_id == "seed_pro_001"
    resolved = captured_payload.get("task_type", "")
    assert "fast" not in resolved, (
        f"task_type should not contain 'fast' for mode='pro', got: {resolved}"
    )


@pytest.mark.asyncio
async def test_generate_video_mode_none_uses_env():
    """mode=None の場合は env の task_type がそのまま使われること"""
    provider = _make_provider("seedance-2-preview-vip")
    mock_response = _make_mock_response({"data": {"task_id": "seed_default_001"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="default mode test",
            duration=5,
            aspect_ratio="9:16",
        )

    assert task_id == "seed_default_001"
    assert captured_payload.get("task_type") == "seedance-2-preview-vip"
