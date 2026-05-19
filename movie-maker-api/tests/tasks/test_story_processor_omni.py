"""
Tests for story_processor Seedance omni-reference branch (v3 §15.1).

Covers:
- B-27: omni URL あり → generate_video_with_omni_references が呼ばれる
- B-28: omni URL なし → 既存 generate_video が呼ばれる (回帰)
- B-28b: image_url + image_reference_urls 結合順序保持
- audio_reference_urls 単独 (image_reference_urls/video_reference_urls 空) → omni 経路へ
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_supabase(video_data: dict) -> MagicMock:
    """Return a MagicMock supabase client that returns video_data from single select."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = video_data
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    mock_supabase.rpc.return_value.execute.return_value = MagicMock()
    return mock_supabase


def _make_seedance_video_data(**overrides) -> dict:
    """Return a minimal video_generations row for a Seedance generation."""
    base = {
        "id": "story-seedance-omni-001",
        "user_id": "user-001",
        "original_image_url": "https://example.com/base.jpg",
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
        "seedance_duration": 5,
        "seedance_mode": "pro",
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
        "image_reference_urls": None,
        "video_reference_urls": None,
        "audio_reference_urls": None,
        "status": "pending",
        "progress": 0,
    }
    base.update(overrides)
    return base


def _make_completed_status():
    from app.external.video_provider import VideoStatus, VideoGenerationStatus
    return VideoStatus(
        status=VideoGenerationStatus.COMPLETED,
        progress=100,
        video_url="https://cdn.example.com/out.mp4",
    )


def _build_mock_provider(omni_task_id="task-omni", legacy_task_id="task-legacy"):
    """Create a mock Seedance provider capturing both omni and legacy invocations."""
    mock_provider = AsyncMock()
    mock_provider.provider_name = "seedance"

    captured = {"omni": None, "legacy": None}

    async def capture_omni(**kwargs):
        captured["omni"] = kwargs
        return omni_task_id

    async def capture_legacy(**kwargs):
        captured["legacy"] = kwargs
        return legacy_task_id

    mock_provider.generate_video_with_omni_references = capture_omni
    mock_provider.generate_video = capture_legacy
    mock_provider.check_status = AsyncMock(return_value=_make_completed_status())
    mock_provider.download_video_bytes = AsyncMock(return_value=b"fake_bytes")
    return mock_provider, captured


def _patch_processor(mock_supabase, mock_provider):
    """Common patch stack for process_story_video."""
    mock_r2 = AsyncMock()
    mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/out.mp4")

    patches = [
        patch("app.tasks.story_processor.get_supabase", return_value=mock_supabase),
        patch("app.tasks.story_processor.get_video_provider", return_value=mock_provider),
        patch("app.tasks.story_processor.r2_client", mock_r2),
        patch("app.tasks.story_processor.update_video_status", new_callable=AsyncMock),
        patch("app.tasks.story_processor.get_ffmpeg_service"),
    ]
    return patches


class TestSeedanceOmniBranch:
    """v3 §15.1: Seedance omni-reference 分岐の振る舞いを検証する。"""

    @pytest.mark.asyncio
    async def test_b27_omni_urls_present_calls_omni_method(self):
        """B-27: video_reference_urls=[v] → generate_video_with_omni_references が呼ばれる."""
        video_data = _make_seedance_video_data(
            video_reference_urls=["https://example.com/ref-video.mp4"],
        )

        mock_provider, captured = _build_mock_provider()
        mock_supabase = _make_mock_supabase(video_data)

        patches = _patch_processor(mock_supabase, mock_provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4] as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()
            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-omni-001", video_provider_name="seedance")

        assert captured["omni"] is not None, (
            "B-27: omni 経路が呼ばれていない (generate_video_with_omni_references)"
        )
        assert captured["legacy"] is None, (
            "B-27: omni 経路時に既存 generate_video を呼んではいけない"
        )
        omni_args = captured["omni"]
        assert omni_args["video_urls"] == ["https://example.com/ref-video.mp4"]
        # base image_url のみ (image_reference_urls 空)
        assert omni_args["image_urls"] == ["https://example.com/base.jpg"]
        assert omni_args["audio_urls"] == []
        assert omni_args["duration"] == 5
        assert omni_args["aspect_ratio"] == "9:16"
        assert omni_args["mode"] == "pro"

    @pytest.mark.asyncio
    async def test_b28_no_omni_urls_calls_legacy_generate_video(self):
        """B-28: 全 reference NULL → 既存 generate_video が呼ばれる (回帰防止)."""
        video_data = _make_seedance_video_data(
            image_reference_urls=None,
            video_reference_urls=None,
            audio_reference_urls=None,
        )

        mock_provider, captured = _build_mock_provider()
        mock_supabase = _make_mock_supabase(video_data)

        patches = _patch_processor(mock_supabase, mock_provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4] as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()
            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-omni-001", video_provider_name="seedance")

        assert captured["legacy"] is not None, (
            "B-28: 既存 generate_video が呼ばれていない (回帰)"
        )
        assert captured["omni"] is None, (
            "B-28: omni URL なしで omni 経路を呼んではいけない"
        )
        legacy_args = captured["legacy"]
        assert legacy_args["image_url"] == "https://example.com/base.jpg"
        assert legacy_args["mode"] == "pro"

    @pytest.mark.asyncio
    async def test_b28b_base_image_url_and_image_refs_merge_order(self):
        """B-28b: base image_url + image_reference_urls=[i2,i3] → omni 呼出時 image_urls=[base, i2, i3] 順序保持."""
        video_data = _make_seedance_video_data(
            image_reference_urls=[
                "https://example.com/ref-1.jpg",
                "https://example.com/ref-2.jpg",
            ],
        )

        mock_provider, captured = _build_mock_provider()
        mock_supabase = _make_mock_supabase(video_data)

        patches = _patch_processor(mock_supabase, mock_provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4] as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()
            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-omni-001", video_provider_name="seedance")

        assert captured["omni"] is not None
        assert captured["omni"]["image_urls"] == [
            "https://example.com/base.jpg",
            "https://example.com/ref-1.jpg",
            "https://example.com/ref-2.jpg",
        ], "B-28b: image_urls の順序は [base, ref1, ref2] でなければならない"

    @pytest.mark.asyncio
    async def test_omni_passes_seedance_resolution_to_provider(self):
        """H-NEW-3: DB seedance_resolution='1080p' → provider 呼出引数 resolution='1080p' に伝搬"""
        video_data = _make_seedance_video_data(
            image_reference_urls=["https://example.com/ref-1.jpg"],
            seedance_resolution="1080p",
        )

        mock_provider, captured = _build_mock_provider()
        mock_supabase = _make_mock_supabase(video_data)

        patches = _patch_processor(mock_supabase, mock_provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4] as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()
            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-omni-001", video_provider_name="seedance")

        assert captured["omni"] is not None, "omni 経路が呼ばれていない"
        assert captured["omni"]["resolution"] == "1080p", (
            "DB の seedance_resolution が provider 呼出に伝搬していない"
        )

    @pytest.mark.asyncio
    async def test_audio_only_reference_routes_to_omni(self):
        """audio_reference_urls のみあり (image_refs/video_refs 空) → omni 経路、image_urls=[base]、video_urls=[]、audio_urls=[...]."""
        video_data = _make_seedance_video_data(
            audio_reference_urls=["https://example.com/voice.mp3"],
        )

        mock_provider, captured = _build_mock_provider()
        mock_supabase = _make_mock_supabase(video_data)

        patches = _patch_processor(mock_supabase, mock_provider)
        with patches[0], patches[1], patches[2], patches[3], patches[4] as mock_ffmpeg_factory:
            mock_ffmpeg_factory.return_value = MagicMock()
            from app.tasks.story_processor import process_story_video
            await process_story_video("story-seedance-omni-001", video_provider_name="seedance")

        assert captured["omni"] is not None, (
            "audio_reference_urls のみでも omni 経路へ分岐すべき"
        )
        omni_args = captured["omni"]
        assert omni_args["image_urls"] == ["https://example.com/base.jpg"], (
            "base image_url のみが image_urls に入るべき"
        )
        assert omni_args["video_urls"] == []
        assert omni_args["audio_urls"] == ["https://example.com/voice.mp3"]
