"""
Tests for PiAPI Kling T2V (Text-to-Video) implementation
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx


class TestPiAPIKlingT2V:
    """Test T2V support in PiAPIKlingProvider"""

    def _make_provider(self):
        """Create a PiAPIKlingProvider with mocked settings"""
        with patch("app.external.piapi_kling_provider.settings") as mock_settings:
            mock_settings.PIAPI_API_KEY = "test-piapi-key"
            mock_settings.PIAPI_KLING_VERSION = "2.6"
            mock_settings.PIAPI_KLING_MODE = "std"
            mock_settings.PIAPI_KLING_RESOLUTION = "720p"
            mock_settings.PIAPI_KLING_ENABLE_AUDIO = False
            from app.external.piapi_kling_provider import PiAPIKlingProvider
            return PiAPIKlingProvider()

    def test_supports_t2v_returns_true(self):
        """PiAPIKlingProvider.supports_t2v should return True"""
        provider = self._make_provider()
        assert provider.supports_t2v is True

    @pytest.mark.asyncio
    async def test_generate_video_from_text_calls_piapi_without_image(self):
        """generate_video_from_text should call PiAPI without image_url in body"""
        provider = self._make_provider()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {"task_id": "kling-t2v-task-001"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_async_client = AsyncMock()
            mock_async_client.__aenter__ = AsyncMock(return_value=mock_async_client)
            mock_async_client.__aexit__ = AsyncMock(return_value=None)
            mock_async_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_async_client

            task_id = await provider.generate_video_from_text(
                prompt="A serene mountain landscape",
                duration=5,
                aspect_ratio="9:16",
            )

        assert task_id == "kling-t2v-task-001"

        # Verify the call was made without image_url
        call_args = mock_async_client.post.call_args
        request_body = call_args.kwargs.get("json") or call_args[1].get("json")
        assert "image_url" not in request_body.get("input", {})

    @pytest.mark.asyncio
    async def test_generate_video_from_text_with_duration_10(self):
        """generate_video_from_text should pass duration=10 to PiAPI"""
        provider = self._make_provider()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {"task_id": "kling-t2v-task-10s"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_async_client = AsyncMock()
            mock_async_client.__aenter__ = AsyncMock(return_value=mock_async_client)
            mock_async_client.__aexit__ = AsyncMock(return_value=None)
            mock_async_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_async_client

            task_id = await provider.generate_video_from_text(
                prompt="An epic battle scene",
                duration=10,
                aspect_ratio="16:9",
            )

        assert task_id == "kling-t2v-task-10s"

        call_args = mock_async_client.post.call_args
        request_body = call_args.kwargs.get("json") or call_args[1].get("json")
        assert request_body["input"]["duration"] == 10

    @pytest.mark.asyncio
    async def test_generate_video_from_text_api_error_handling(self):
        """generate_video_from_text should raise VideoProviderError on HTTP error"""
        from app.external.video_provider import VideoProviderError
        provider = self._make_provider()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_async_client = AsyncMock()
            mock_async_client.__aenter__ = AsyncMock(return_value=mock_async_client)
            mock_async_client.__aexit__ = AsyncMock(return_value=None)

            mock_error_response = MagicMock()
            mock_error_response.status_code = 429
            mock_error_response.text = "Rate limit exceeded"
            mock_error_response.json.return_value = {"message": "rate limit exceeded"}
            mock_async_client.post = AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "Rate limit", request=MagicMock(), response=mock_error_response
                )
            )
            mock_client_cls.return_value = mock_async_client

            with pytest.raises(VideoProviderError):
                await provider.generate_video_from_text(
                    prompt="Test prompt",
                )
