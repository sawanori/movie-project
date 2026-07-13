"""
Tests for Veo T2V (Text-to-Video) implementation
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestVeoT2V:
    """Test T2V support in VeoProvider"""

    def _make_provider(self):
        """Create a VeoProvider with mocked settings"""
        with patch("app.external.veo_provider.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "test-api-key"
            from app.external.veo_provider import VeoProvider
            return VeoProvider()

    def test_supports_t2v_returns_true(self):
        """VeoProvider.supports_t2v should return True"""
        provider = self._make_provider()
        assert provider.supports_t2v is True

    @pytest.mark.asyncio
    async def test_generate_video_from_text_calls_correct_api(self):
        """generate_video_from_text should call generate_videos API without an image"""
        provider = self._make_provider()

        mock_operation = MagicMock()
        mock_operation.name = "operations/test-op-123"

        mock_client = MagicMock()
        mock_client.models.generate_videos.return_value = mock_operation
        provider._client = mock_client

        with patch("asyncio.get_event_loop") as mock_loop:
            mock_loop.return_value.run_in_executor = AsyncMock(return_value=mock_operation)

            task_id = await provider.generate_video_from_text(
                prompt="A beautiful sunset over mountains",
                duration=5,
                aspect_ratio="9:16",
            )

        assert task_id == "operations/test-op-123"
        assert task_id in provider._pending_operations

    @pytest.mark.asyncio
    async def test_generate_video_from_text_with_custom_duration_and_aspect_ratio(self):
        """generate_video_from_text should pass aspect_ratio to the API"""
        provider = self._make_provider()

        mock_operation = MagicMock()
        mock_operation.name = "operations/custom-op"

        mock_client = MagicMock()
        mock_client.models.generate_videos.return_value = mock_operation
        provider._client = mock_client

        with patch("asyncio.get_event_loop") as mock_loop:
            mock_loop.return_value.run_in_executor = AsyncMock(return_value=mock_operation)

            task_id = await provider.generate_video_from_text(
                prompt="Wide cinematic landscape",
                duration=8,
                aspect_ratio="16:9",
            )

        assert task_id == "operations/custom-op"

    @pytest.mark.asyncio
    async def test_generate_video_from_text_api_error_handling(self):
        """generate_video_from_text should raise VideoProviderError on API failure"""
        from app.external.video_provider import VideoProviderError
        provider = self._make_provider()

        mock_client = MagicMock()
        mock_client.models.generate_videos.side_effect = Exception("API quota exceeded")
        provider._client = mock_client

        with patch("asyncio.get_event_loop") as mock_loop:
            mock_loop.return_value.run_in_executor = AsyncMock(
                side_effect=Exception("API quota exceeded")
            )

            with pytest.raises(VideoProviderError):
                await provider.generate_video_from_text(
                    prompt="Test prompt",
                )
