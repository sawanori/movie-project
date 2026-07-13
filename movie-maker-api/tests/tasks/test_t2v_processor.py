"""
Tests for T2V background processor
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


MOCK_VIDEO_RECORD = {
    "id": "t2v-video-001",
    "user_id": "user-001",
    "prompt": "A beautiful sunrise over mountains",
    "duration": 5,
    "aspect_ratio": "9:16",
    "video_provider": "veo",
    "generation_mode": "t2v",
    "status": "pending",
    "progress": 0,
}


class TestProcessT2VGeneration:
    """Tests for process_t2v_generation function"""

    @pytest.mark.asyncio
    async def test_process_t2v_generation_success(self):
        """process_t2v_generation should complete successfully for a valid record"""
        from app.external.video_provider import VideoStatus, VideoGenerationStatus

        mock_provider = AsyncMock()
        mock_provider.supports_t2v = True
        mock_provider.generate_video_from_text = AsyncMock(return_value="t2v-task-123")
        mock_provider.check_status = AsyncMock(return_value=VideoStatus(
            status=VideoGenerationStatus.COMPLETED,
            progress=100,
            video_url="https://cdn.example.com/video.mp4",
        ))
        mock_provider.download_video_bytes = AsyncMock(return_value=b"fake_video_bytes")

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = MOCK_VIDEO_RECORD
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        mock_r2_client = AsyncMock()
        mock_r2_client.upload_file = AsyncMock(return_value="https://r2.example.com/video.mp4")

        with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.t2v_processor.get_video_provider", return_value=mock_provider), \
             patch("app.tasks.t2v_processor.r2_client", mock_r2_client), \
             patch("app.tasks.t2v_processor.update_video_status", new_callable=AsyncMock):
            from app.tasks.t2v_processor import process_t2v_generation
            await process_t2v_generation("t2v-video-001")

        mock_provider.generate_video_from_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_t2v_generation_provider_not_supporting_t2v(self):
        """process_t2v_generation should fail if provider doesn't support T2V"""
        mock_provider = MagicMock()
        mock_provider.supports_t2v = False
        mock_provider.provider_name = "runway"

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = MOCK_VIDEO_RECORD

        mock_update = AsyncMock()

        with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.t2v_processor.get_video_provider", return_value=mock_provider), \
             patch("app.tasks.t2v_processor.update_video_status", mock_update):
            from app.tasks.t2v_processor import process_t2v_generation
            await process_t2v_generation("t2v-video-001")

        # Should have called update_video_status with "failed" status
        calls = mock_update.call_args_list
        assert any("failed" in str(call) for call in calls)

    @pytest.mark.asyncio
    async def test_process_t2v_generation_handles_provider_error(self):
        """process_t2v_generation should handle VideoProviderError gracefully"""
        from app.external.video_provider import VideoProviderError

        mock_provider = MagicMock()
        mock_provider.supports_t2v = True
        mock_provider.generate_video_from_text = AsyncMock(
            side_effect=VideoProviderError("API rate limit exceeded")
        )

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = MOCK_VIDEO_RECORD

        mock_update = AsyncMock()

        with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.t2v_processor.get_video_provider", return_value=mock_provider), \
             patch("app.tasks.t2v_processor.update_video_status", mock_update):
            from app.tasks.t2v_processor import process_t2v_generation
            await process_t2v_generation("t2v-video-001")

        # Should have updated status to "failed"
        calls = mock_update.call_args_list
        assert any("failed" in str(call) for call in calls)

    @pytest.mark.asyncio
    async def test_process_t2v_generation_handles_missing_record(self):
        """process_t2v_generation should handle missing DB record gracefully"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

        with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase):
            from app.tasks.t2v_processor import process_t2v_generation
            # Should not raise an exception
            await process_t2v_generation("nonexistent-id")

    @pytest.mark.asyncio
    async def test_start_t2v_processing_creates_task(self):
        """start_t2v_processing should create an asyncio task"""
        with patch("asyncio.create_task") as mock_create_task:
            from app.tasks.t2v_processor import start_t2v_processing
            await start_t2v_processing("t2v-video-001")
            mock_create_task.assert_called_once()
            # Close the unawaited coroutine to prevent RuntimeWarning
            mock_create_task.call_args[0][0].close()
