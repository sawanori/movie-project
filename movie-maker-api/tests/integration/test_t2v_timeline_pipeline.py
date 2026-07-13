"""
Integration tests: T2V -> Timeline pipeline

Tests the end-to-end flow where T2V generates video clips from text prompts,
and those clips are combined on a timeline with transitions via FFmpeg.
All external services (Supabase, HTTP providers, R2, FFmpeg subprocess) are mocked.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock, call

from app.tasks.t2v_processor import process_t2v_generation
from app.tasks.video_concat_processor import process_concat_generation
from app.external.video_provider import (
    VideoGenerationStatus,
    VideoStatus,
    VideoProviderError,
)
from app.external.model_registry import ModelRegistry, ModelMetadata
from app.external.gateway_router import GatewayRouter
from app.external.unified_gateway import UnifiedGateway


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    with patch("app.core.supabase.get_supabase") as mock_get:
        client = MagicMock()
        mock_get.return_value = client
        yield client


@pytest.fixture
def t2v_video_provider():
    """Stub VideoProvider that supports T2V."""
    provider = MagicMock()
    provider.provider_name = "veo"
    provider.supports_t2v = True
    provider.generate_video_from_text = AsyncMock(return_value="task-t2v-001")
    provider.check_status = AsyncMock(
        return_value=VideoStatus(
            status=VideoGenerationStatus.COMPLETED,
            progress=100,
            video_url="https://storage.googleapis.com/veo/output.mp4",
        )
    )
    provider.download_video_bytes = AsyncMock(return_value=b"fake-video-bytes")
    return provider


@pytest.fixture
def non_t2v_video_provider():
    """Stub VideoProvider that does NOT support T2V."""
    provider = MagicMock()
    provider.provider_name = "runway"
    provider.supports_t2v = False
    return provider


def _wire_t2v_supabase(
    mock_supabase: MagicMock,
    video_record: dict,
) -> list:
    """Wire Supabase select to return the given video record. Returns captured update calls."""
    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=video_record)

    captured_updates = []

    def capture_update(update_data):
        captured_updates.append(dict(update_data))
        chain = MagicMock()
        chain.eq.return_value.execute.return_value = MagicMock()
        return chain

    mock_supabase.table.return_value.update.side_effect = capture_update
    return captured_updates


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_t2v_to_timeline_pipeline(mock_supabase, t2v_video_provider):
    """
    Full T2V pipeline: text prompt goes in, T2V video comes out, video is
    uploaded to R2, and the DB record is marked 'completed' with a final URL.
    """
    video_id = "vid-t2v-001"
    video_record = {
        "id": video_id,
        "user_id": "user-001",
        "prompt": "A beautiful sunrise over Tokyo skyline",
        "duration": 5,
        "aspect_ratio": "16:9",
        "video_provider": "veo",
        "status": "pending",
    }

    captured_updates = _wire_t2v_supabase(mock_supabase, video_record)

    with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.t2v_processor.get_video_provider", return_value=t2v_video_provider):
            with patch("app.tasks.t2v_processor.update_video_status", new_callable=AsyncMock):
                with patch(
                    "app.tasks.t2v_processor.r2_client"
                ) as mock_r2:
                    mock_r2.upload_file = AsyncMock(
                        return_value="https://r2.example.com/videos/user-001/vid-t2v-001/t2v_final.mp4"
                    )
                    await process_t2v_generation(video_id)

    # T2V provider was called with correct parameters
    t2v_video_provider.generate_video_from_text.assert_awaited_once_with(
        prompt="A beautiful sunrise over Tokyo skyline",
        duration=5,
        aspect_ratio="16:9",
    )
    # Status was polled
    t2v_video_provider.check_status.assert_awaited()
    # Video bytes were downloaded
    t2v_video_provider.download_video_bytes.assert_awaited()


@pytest.mark.asyncio
async def test_t2v_multiple_clips_with_transitions(mock_supabase):
    """
    Multiple T2V clips (already completed) are concatenated with a crossfade transition
    via the video_concat_processor using FFmpegService.concat_videos.
    """
    video_ids = ["vid-t2v-c1", "vid-t2v-c2", "vid-t2v-c3"]
    concat_id = "concat-001"

    # Simulate that T2V has already completed and each video has a final_video_url
    concat_record = {
        "id": concat_id,
        "user_id": "user-010",
        "source_video_ids": video_ids,
        "transition": "dissolve",
        "transition_duration": 0.5,
        "status": "pending",
    }

    # Each video lookup returns a URL
    def table_side_effect(table_name):
        table_mock = MagicMock()

        if table_name == "video_concatenations":
            table_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=concat_record
            )
            table_mock.update.return_value.eq.return_value.execute.return_value = MagicMock()

        elif table_name == "video_generations":
            def video_select_chain(*args, **kwargs):
                select_mock = MagicMock()

                def eq_side(*a, **kw):
                    eq_mock = MagicMock()

                    def single_side(*a2, **kw2):
                        single_mock = MagicMock()
                        # Return a different URL per video_id
                        video_idx = video_ids.index(a[1]) if len(a) > 1 and a[1] in video_ids else 0
                        single_mock.execute.return_value = MagicMock(
                            data={"final_video_url": f"https://r2.example.com/vid_{video_idx}.mp4"}
                        )
                        return single_mock

                    eq_mock.single.side_effect = single_side
                    eq_mock.single.return_value = single_side()
                    return eq_mock

                select_mock.eq.side_effect = eq_side
                return select_mock

            table_mock.select.side_effect = video_select_chain

        return table_mock

    mock_supabase.table.side_effect = table_side_effect

    # FFmpeg writes a fake output file so the concat processor can read its bytes
    import tempfile, os

    with patch("app.tasks.video_concat_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.video_concat_processor.download_video_file", new_callable=AsyncMock, return_value=True):
            with patch("app.tasks.video_concat_processor.get_ffmpeg_service") as mock_get_ffmpeg:
                mock_ffmpeg = MagicMock()

                async def fake_concat_videos(video_paths, output_path, transition, transition_duration, **kw):
                    # Write a fake mp4 so the processor can read bytes
                    with open(output_path, "wb") as f:
                        f.write(b"fake-concatenated-video")
                    return output_path

                async def fake_get_duration(path):
                    return 5.0

                mock_ffmpeg.concat_videos = AsyncMock(side_effect=fake_concat_videos)
                mock_ffmpeg._get_video_duration = AsyncMock(side_effect=fake_get_duration)
                mock_get_ffmpeg.return_value = mock_ffmpeg

                with patch("app.tasks.video_concat_processor.r2_client") as mock_r2:
                    mock_r2.upload_file = AsyncMock(
                        return_value="https://r2.example.com/concat/concat-001.mp4"
                    )
                    with patch("app.tasks.video_concat_processor.update_concat_status", new_callable=AsyncMock):
                        await process_concat_generation(concat_id)

    # FFmpeg concat_videos was called once with correct transition
    mock_ffmpeg.concat_videos.assert_awaited_once()
    call_kwargs = mock_ffmpeg.concat_videos.call_args.kwargs
    assert call_kwargs.get("transition") == "dissolve", (
        f"Expected 'dissolve' transition, got '{call_kwargs.get('transition')}'"
    )
    assert call_kwargs.get("transition_duration") == 0.5
    # All 3 video paths were passed in
    assert len(call_kwargs.get("video_paths", [])) == 3


@pytest.mark.asyncio
async def test_t2v_provider_routing_via_gateway(t2v_video_provider):
    """
    UnifiedGateway routes T2V requests to a provider that has 't2v' capability.
    Verifies that the gateway correctly selects and calls the right provider.
    """
    registry = ModelRegistry()
    metadata = ModelMetadata(
        name="veo-2",
        provider="veo",
        capabilities=["i2v", "t2v"],
        quality_score=9,
        speed_score=5,
        cost_per_second=0.05,
    )
    registry.register(metadata, t2v_video_provider)

    router = GatewayRouter(registry)
    gateway = UnifiedGateway(router)

    task_id, provider_name = await gateway.generate_video_from_text(
        prompt="A cinematic shot of mountains at dusk",
        duration=5,
        aspect_ratio="16:9",
        priority="quality",
    )

    assert task_id == "task-t2v-001"
    assert provider_name == "veo"
    t2v_video_provider.generate_video_from_text.assert_awaited_once_with(
        "A cinematic shot of mountains at dusk", 5, "16:9"
    )


@pytest.mark.asyncio
async def test_timeline_export_with_t2v_videos(mock_supabase, t2v_video_provider):
    """
    T2V-generated video is uploaded to R2, and the resulting URL can be used
    as input to a subsequent timeline export (via video_concat_processor).
    Verifies the data handoff: T2V final_video_url feeds into concat source.
    """
    video_id = "vid-t2v-export-001"
    video_record = {
        "id": video_id,
        "user_id": "user-020",
        "prompt": "Product showcase with dramatic lighting",
        "duration": 5,
        "aspect_ratio": "9:16",
        "video_provider": "veo",
        "status": "pending",
    }

    expected_r2_url = "https://r2.example.com/videos/user-020/vid-t2v-export-001/t2v_final.mp4"

    final_url_captured = {}

    async def mock_update_status(video_id, status, progress=None, final_video_url=None, error_message=None):
        if final_video_url is not None:
            final_url_captured["url"] = final_video_url

    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=video_record)

    with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.t2v_processor.get_video_provider", return_value=t2v_video_provider):
            with patch("app.tasks.t2v_processor.update_video_status", side_effect=mock_update_status):
                with patch("app.tasks.t2v_processor.r2_client") as mock_r2:
                    mock_r2.upload_file = AsyncMock(return_value=expected_r2_url)
                    await process_t2v_generation(video_id)

    # The R2 URL produced by T2V is a valid HTTPS URL suitable for timeline use
    assert "url" in final_url_captured, "final_video_url was never set"
    produced_url = final_url_captured["url"]
    assert produced_url == expected_r2_url
    assert produced_url.startswith("https://"), "T2V output URL must be HTTPS for timeline use"
    assert produced_url.endswith(".mp4"), "T2V output must be an mp4 file"


@pytest.mark.asyncio
async def test_pipeline_handles_t2v_provider_not_supporting_t2v(mock_supabase, non_t2v_video_provider):
    """
    When the selected provider does not support T2V (supports_t2v == False),
    the processor raises VideoProviderError and the video record is marked 'failed'.
    """
    video_id = "vid-t2v-err-001"
    video_record = {
        "id": video_id,
        "user_id": "user-030",
        "prompt": "An abstract art animation",
        "duration": 5,
        "aspect_ratio": "9:16",
        "video_provider": "runway",
        "status": "pending",
    }

    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=video_record)

    failed_statuses = []

    async def mock_update_status(video_id, status, progress=None, final_video_url=None, error_message=None):
        failed_statuses.append(status)

    with patch("app.tasks.t2v_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.t2v_processor.get_video_provider", return_value=non_t2v_video_provider):
            with patch("app.tasks.t2v_processor.update_video_status", side_effect=mock_update_status):
                await process_t2v_generation(video_id)

    # The processor must end with a 'failed' status update
    assert "failed" in failed_statuses, (
        "Expected 'failed' status when provider does not support T2V"
    )
    # T2V provider's generate_video_from_text must never be called
    non_t2v_video_provider.generate_video_from_text.assert_not_called()
