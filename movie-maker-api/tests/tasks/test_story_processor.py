"""
Tests for story_processor Seedance parameter handling (B-18, B-19, B-20)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_supabase(video_data: dict) -> MagicMock:
    """Return a MagicMock supabase client that returns video_data from a single select."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = video_data
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    mock_supabase.rpc.return_value.execute.return_value = MagicMock()
    return mock_supabase


def _make_seedance_video_data(**overrides) -> dict:
    """Return a minimal video_generations row for a Seedance generation."""
    base = {
        "id": "story-seedance-001",
        "user_id": "user-001",
        "original_image_url": "https://example.com/img.jpg",
        "story_text": "A cat walks through a garden",
        "camera_work": None,
        "aspect_ratio": "9:16",
        "use_act_two": False,
        "motion_type": None,
        "expression_intensity": 5,
        "body_control": True,
        "kling_mode": None,
        "end_frame_image_url": None,
        "kling_camera_control": None,
        "kling_duration": None,
        "seedance_duration": None,
        "seedance_mode": None,
        "seedance_generate_audio": None,
        "seedance_seed": None,
        "seedance_resolution": None,
        "seedance_camera_fixed": None,
        "video_provider": "seedance",
        "bgm_track_id": None,
        "custom_bgm_url": None,
        "overlay_text": None,
        "overlay_position": None,
        "overlay_font": None,
        "overlay_color": None,
        "element_images": None,
        "status": "pending",
        "progress": 0,
    }
    base.update(overrides)
    return base


class TestSeedanceParameterPassthrough:
    """
    B-18: seedance_generate_audio DB NULL -> provider receives False
    B-19: seedance_resolution DB '1080p' -> provider receives '1080p'
    B-20: seedance_camera_fixed DB NULL -> provider called without camera_fixed key (None excluded)
    """

    @pytest.mark.asyncio
    async def test_b18_generate_audio_null_defaults_to_false(self):
        """B-18: seedance_generate_audio = NULL in DB -> extra_params['generate_audio'] == False"""
        from app.external.video_provider import VideoStatus, VideoGenerationStatus

        video_data = _make_seedance_video_data(seedance_generate_audio=None)

        mock_provider = AsyncMock()
        mock_provider.provider_name = "seedance"
        mock_provider.generate_video = AsyncMock(return_value="task-001")
        mock_provider.check_status = AsyncMock(return_value=VideoStatus(
            status=VideoGenerationStatus.COMPLETED,
            progress=100,
            video_url="https://cdn.example.com/out.mp4",
        ))
        mock_provider.download_video_bytes = AsyncMock(return_value=b"fake_bytes")

        mock_supabase = _make_mock_supabase(video_data)
        mock_r2 = AsyncMock()
        mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/out.mp4")

        captured_extra_params = {}

        async def capture_generate_video(image_url, prompt, duration, aspect_ratio, **kwargs):
            captured_extra_params.update(kwargs)
            return "task-001"

        mock_provider.generate_video = capture_generate_video

        with patch("app.tasks.story_processor.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.story_processor.get_video_provider", return_value=mock_provider), \
             patch("app.tasks.story_processor.r2_client", mock_r2), \
             patch("app.tasks.story_processor.update_video_status", new_callable=AsyncMock), \
             patch("app.tasks.story_processor.get_ffmpeg_service") as mock_ffmpeg_factory:
            mock_ffmpeg = MagicMock()
            mock_ffmpeg_factory.return_value = mock_ffmpeg

            mock_provider.check_status = AsyncMock(return_value=VideoStatus(
                status=VideoGenerationStatus.COMPLETED,
                progress=100,
                video_url="https://cdn.example.com/out.mp4",
            ))
            mock_provider.download_video_bytes = AsyncMock(return_value=b"fake_bytes")

            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-001", video_provider_name="seedance")

        assert captured_extra_params.get("generate_audio") is False, (
            "B-18: generate_audio NULL in DB must default to False when passed to provider"
        )

    @pytest.mark.asyncio
    async def test_b19_resolution_1080p_passed_to_provider(self):
        """B-19: seedance_resolution = '1080p' in DB -> extra_params['resolution'] == '1080p'"""
        from app.external.video_provider import VideoStatus, VideoGenerationStatus

        video_data = _make_seedance_video_data(seedance_resolution="1080p")

        captured_extra_params = {}

        async def capture_generate_video(image_url, prompt, duration, aspect_ratio, **kwargs):
            captured_extra_params.update(kwargs)
            return "task-002"

        mock_provider = AsyncMock()
        mock_provider.provider_name = "seedance"
        mock_provider.generate_video = capture_generate_video
        mock_provider.check_status = AsyncMock()
        mock_provider.download_video_bytes = AsyncMock(return_value=b"fake_bytes")

        from app.external.video_provider import VideoStatus, VideoGenerationStatus
        mock_provider.check_status = AsyncMock(return_value=VideoStatus(
            status=VideoGenerationStatus.COMPLETED,
            progress=100,
            video_url="https://cdn.example.com/out.mp4",
        ))

        mock_supabase = _make_mock_supabase(video_data)
        mock_r2 = AsyncMock()
        mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/out.mp4")

        with patch("app.tasks.story_processor.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.story_processor.get_video_provider", return_value=mock_provider), \
             patch("app.tasks.story_processor.r2_client", mock_r2), \
             patch("app.tasks.story_processor.update_video_status", new_callable=AsyncMock), \
             patch("app.tasks.story_processor.get_ffmpeg_service") as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()

            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-001", video_provider_name="seedance")

        assert captured_extra_params.get("resolution") == "1080p", (
            "B-19: resolution='1080p' in DB must be forwarded to provider as '1080p'"
        )

    @pytest.mark.asyncio
    async def test_b20_camera_fixed_null_excluded_from_payload(self):
        """B-20: seedance_camera_fixed = NULL in DB -> camera_fixed key absent from provider args"""
        from app.external.video_provider import VideoStatus, VideoGenerationStatus

        video_data = _make_seedance_video_data(seedance_camera_fixed=None)

        captured_extra_params = {}

        async def capture_generate_video(image_url, prompt, duration, aspect_ratio, **kwargs):
            captured_extra_params.update(kwargs)
            return "task-003"

        mock_provider = AsyncMock()
        mock_provider.provider_name = "seedance"
        mock_provider.generate_video = capture_generate_video
        mock_provider.check_status = AsyncMock(return_value=VideoStatus(
            status=VideoGenerationStatus.COMPLETED,
            progress=100,
            video_url="https://cdn.example.com/out.mp4",
        ))
        mock_provider.download_video_bytes = AsyncMock(return_value=b"fake_bytes")

        mock_supabase = _make_mock_supabase(video_data)
        mock_r2 = AsyncMock()
        mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/out.mp4")

        with patch("app.tasks.story_processor.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.story_processor.get_video_provider", return_value=mock_provider), \
             patch("app.tasks.story_processor.r2_client", mock_r2), \
             patch("app.tasks.story_processor.update_video_status", new_callable=AsyncMock), \
             patch("app.tasks.story_processor.get_ffmpeg_service") as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()

            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-001", video_provider_name="seedance")

        assert "camera_fixed" not in captured_extra_params, (
            "B-20: camera_fixed=None in DB must not appear in provider kwargs"
        )
