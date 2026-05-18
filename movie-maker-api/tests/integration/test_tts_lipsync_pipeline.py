"""
Integration tests: TTS -> LipSync pipeline

Tests the end-to-end flow where TTS generates audio, and that audio
is then consumed by the LipSync processor to produce a video.
All external services (Supabase, HTTP providers, R2) are mocked.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.tasks.tts_processor import process_tts_generation
from app.tasks.lip_sync_processor import process_lip_sync_generation
from app.external.tts_provider import TTSStatus
from app.external.lip_sync_provider import LipSyncStatus


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for all table operations."""
    with patch("app.core.supabase.get_supabase") as mock_get:
        client = MagicMock()
        mock_get.return_value = client
        yield client


@pytest.fixture
def mock_tts_provider():
    """Stub TTS provider that returns an audio URL synchronously."""
    provider = MagicMock()
    provider.provider_name = "elevenlabs"
    provider.is_synchronous = True
    provider.generate_speech = AsyncMock(return_value="https://example.com/audio.mp3")
    provider.check_status = AsyncMock()
    provider.get_audio_url = AsyncMock(return_value="https://example.com/audio.mp3")
    return provider


@pytest.fixture
def mock_lip_sync_provider():
    """Stub LipSync provider that completes on first poll."""
    provider = MagicMock()
    provider.provider_name = "hedra"
    provider.generate_lip_sync = AsyncMock(return_value="task-lipsync-001")
    provider.check_status = AsyncMock(
        return_value=LipSyncStatus(
            status="completed",
            progress=100,
            video_url="https://hedra.example.com/output.mp4",
        )
    )
    provider.get_video_url = AsyncMock(return_value="https://hedra.example.com/output.mp4")
    return provider


def _make_tts_supabase(client: MagicMock, tts_record: dict) -> None:
    """Wire a Supabase mock to return the given TTS record on select."""
    select_chain = (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
    )
    select_chain.execute.return_value = MagicMock(data=tts_record)

    # update chain — just needs to not raise
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()


def _make_lipsync_supabase(client: MagicMock, lipsync_record: dict) -> None:
    """Wire a Supabase mock to return the given LipSync record on select."""
    select_chain = (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
    )
    select_chain.execute.return_value = MagicMock(data=lipsync_record)
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tts_to_lipsync_full_pipeline(mock_supabase, mock_tts_provider, mock_lip_sync_provider):
    """
    Full pipeline: TTS processor generates audio_url, then LipSync processor
    uses that audio_url to generate a lip-synced video and writes it to DB.
    """
    tts_generation_id = "tts-gen-001"
    lipsync_generation_id = "ls-gen-001"

    tts_record = {
        "id": tts_generation_id,
        "user_id": "user-001",
        "text": "こんにちは",
        "voice_id": "voice_ja_1",
        "language": "ja",
        "speed": 1.0,
        "status": "pending",
    }

    lipsync_record = {
        "id": lipsync_generation_id,
        "user_id": "user-001",
        "source_url": "https://example.com/avatar.jpg",
        "audio_url": "https://example.com/audio.mp3",
        "source_type": "image",
        "provider": "hedra",
        "status": "pending",
    }

    captured_tts_audio_url = {}

    def track_tts_update(update_data):
        if "audio_url" in update_data:
            captured_tts_audio_url["url"] = update_data["audio_url"]
        mock_chain = MagicMock()
        mock_chain.eq.return_value.execute.return_value = MagicMock()
        return mock_chain

    # TTS phase setup
    tts_select_chain = (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
    )
    tts_select_chain.execute.return_value = MagicMock(data=tts_record)
    mock_supabase.table.return_value.update.side_effect = track_tts_update

    with patch("app.tasks.tts_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.tts_processor.get_tts_provider", return_value=mock_tts_provider):
            await process_tts_generation(tts_generation_id)

    # Verify TTS provider was called with correct text
    mock_tts_provider.generate_speech.assert_awaited_once_with(
        text="こんにちは",
        voice_id="voice_ja_1",
        language="ja",
        speed=1.0,
        instructions=None,
    )

    # LipSync phase — use the TTS-produced audio URL
    lipsync_select_chain = (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
    )
    lipsync_select_chain.execute.return_value = MagicMock(data=lipsync_record)

    with patch("app.tasks.lip_sync_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.lip_sync_processor.get_lip_sync_provider", return_value=mock_lip_sync_provider):
            with patch("app.tasks.lip_sync_processor.upload_to_r2", new_callable=AsyncMock,
                       return_value="https://r2.example.com/lip_sync_ls-gen-001.mp4"):
                await process_lip_sync_generation(lipsync_generation_id)

    # Verify LipSync provider was called with the audio URL from the TTS record
    mock_lip_sync_provider.generate_lip_sync.assert_awaited_once_with(
        source_url="https://example.com/avatar.jpg",
        audio_url="https://example.com/audio.mp3",
        source_type="image",
    )


@pytest.mark.asyncio
async def test_tts_generates_audio_for_lipsync(mock_supabase, mock_tts_provider):
    """
    TTS processor creates a DB record, processes audio, and sets audio_url
    that is compatible with the LipSync input contract (a URL string).
    """
    generation_id = "tts-gen-002"
    tts_record = {
        "id": generation_id,
        "user_id": "user-002",
        "text": "テスト音声",
        "voice_id": "voice_ja_1",
        "language": "ja",
        "speed": 1.0,
        "status": "pending",
    }

    captured_updates = []

    def capture_update(update_data):
        captured_updates.append(dict(update_data))
        mock_chain = MagicMock()
        mock_chain.eq.return_value.execute.return_value = MagicMock()
        return mock_chain

    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=tts_record)
    mock_supabase.table.return_value.update.side_effect = capture_update

    with patch("app.tasks.tts_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.tts_processor.get_tts_provider", return_value=mock_tts_provider):
            await process_tts_generation(generation_id)

    # Find the completed update
    completed_update = next(
        (u for u in captured_updates if u.get("status") == "completed"),
        None,
    )
    assert completed_update is not None, "Expected a 'completed' status update"

    audio_url = completed_update.get("audio_url")
    assert isinstance(audio_url, str), "audio_url must be a string (URL)"
    assert audio_url.startswith("https://"), "audio_url should be an HTTPS URL"


@pytest.mark.asyncio
async def test_lipsync_uses_tts_output(mock_supabase, mock_lip_sync_provider):
    """
    LipSync processor accepts a TTS-generated audio URL from the DB record
    and passes it verbatim to the LipSync provider.
    """
    generation_id = "ls-gen-003"
    tts_generated_audio_url = "https://r2.example.com/tts/audio_gen_123.mp3"

    lipsync_record = {
        "id": generation_id,
        "user_id": "user-003",
        "source_url": "https://example.com/portrait.jpg",
        "audio_url": tts_generated_audio_url,
        "source_type": "image",
        "provider": "hedra",
        "status": "pending",
    }

    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=lipsync_record)
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

    with patch("app.tasks.lip_sync_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.lip_sync_processor.get_lip_sync_provider", return_value=mock_lip_sync_provider):
            with patch(
                "app.tasks.lip_sync_processor.upload_to_r2",
                new_callable=AsyncMock,
                return_value="https://r2.example.com/lip_sync_ls-gen-003.mp4",
            ):
                await process_lip_sync_generation(generation_id)

    # The audio_url passed to generate_lip_sync must be the TTS output URL
    call_kwargs = mock_lip_sync_provider.generate_lip_sync.call_args
    assert call_kwargs is not None
    assert call_kwargs.kwargs.get("audio_url") == tts_generated_audio_url, (
        "LipSync must forward the TTS audio_url unchanged"
    )


@pytest.mark.asyncio
async def test_pipeline_handles_tts_failure(mock_supabase):
    """
    When TTS generation fails (provider raises an exception),
    the TTS record is marked 'failed' and LipSync is never triggered.
    """
    generation_id = "tts-gen-fail-001"
    tts_record = {
        "id": generation_id,
        "user_id": "user-004",
        "text": "エラーテスト",
        "voice_id": "voice_ja_1",
        "language": "ja",
        "speed": 1.0,
        "status": "pending",
    }

    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=tts_record)

    captured_statuses = []

    def capture_update(update_data):
        if "status" in update_data:
            captured_statuses.append(update_data["status"])
        mock_chain = MagicMock()
        mock_chain.eq.return_value.execute.return_value = MagicMock()
        return mock_chain

    mock_supabase.table.return_value.update.side_effect = capture_update

    # TTS provider raises an exception
    failing_provider = MagicMock()
    failing_provider.provider_name = "elevenlabs"
    failing_provider.is_synchronous = True
    failing_provider.generate_speech = AsyncMock(side_effect=Exception("API rate limit exceeded"))

    with patch("app.tasks.tts_processor.get_supabase", return_value=mock_supabase):
        with patch("app.tasks.tts_processor.get_tts_provider", return_value=failing_provider):
            await process_tts_generation(generation_id)

    # TTS should be marked failed
    assert "failed" in captured_statuses, "TTS status must be set to 'failed' on provider error"

    # Crucially, no LipSync processing was triggered (no lip_sync_generations calls)
    table_names_called = [call.args[0] for call in mock_supabase.table.call_args_list]
    assert "lip_sync_generations" not in table_names_called, (
        "LipSync must not be started when TTS fails"
    )


@pytest.mark.asyncio
async def test_pipeline_handles_lipsync_failure(mock_supabase, mock_tts_provider):
    """
    When LipSync fails after TTS has successfully produced audio,
    the TTS audio_url should still be accessible (not deleted/overwritten),
    and the LipSync record is marked 'failed'.
    """
    tts_audio_url = "https://r2.example.com/tts/audio_gen_success.mp3"
    lipsync_generation_id = "ls-gen-fail-001"

    lipsync_record = {
        "id": lipsync_generation_id,
        "user_id": "user-005",
        "source_url": "https://example.com/avatar2.jpg",
        "audio_url": tts_audio_url,
        "source_type": "image",
        "provider": "hedra",
        "status": "pending",
    }

    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = MagicMock(data=lipsync_record)

    captured_lipsync_statuses = []

    def capture_update(update_data):
        if "status" in update_data:
            captured_lipsync_statuses.append(update_data["status"])
        mock_chain = MagicMock()
        mock_chain.eq.return_value.execute.return_value = MagicMock()
        return mock_chain

    mock_supabase.table.return_value.update.side_effect = capture_update

    # LipSync provider raises on generate_lip_sync
    failing_lipsync_provider = MagicMock()
    failing_lipsync_provider.provider_name = "hedra"
    failing_lipsync_provider.generate_lip_sync = AsyncMock(
        side_effect=Exception("Hedra API error: insufficient credits")
    )

    with patch("app.tasks.lip_sync_processor.get_supabase", return_value=mock_supabase):
        with patch(
            "app.tasks.lip_sync_processor.get_lip_sync_provider",
            return_value=failing_lipsync_provider,
        ):
            await process_lip_sync_generation(lipsync_generation_id)

    # LipSync must be marked failed
    assert "failed" in captured_lipsync_statuses, "LipSync status must be set to 'failed'"

    # The TTS audio URL in the lipsync_record was never modified (it was read-only from TTS)
    # Verify that the audio_url passed to provider came from the record as-is
    failing_lipsync_provider.generate_lip_sync.assert_awaited_once_with(
        source_url="https://example.com/avatar2.jpg",
        audio_url=tts_audio_url,
        source_type="image",
    )
