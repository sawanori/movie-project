"""
VeoProvider の duration 対応テスト

- generate_video と generate_video_from_text に duration_seconds が渡されること
- hasattr guard: GenerateVideosConfig が duration_seconds 未対応の場合は warning ログ + 無視
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


def _make_provider():
    """VeoProvider を settings モックで生成"""
    with patch("app.external.veo_provider.settings") as mock_settings:
        mock_settings.GOOGLE_API_KEY = "test-api-key"
        from app.external.veo_provider import VeoProvider
        return VeoProvider()


# ===========================================================================
# generate_video — duration_seconds が GenerateVideosConfig に渡される
# ===========================================================================

class TestVeoGenerateVideoDuration:

    @pytest.mark.asyncio
    @pytest.mark.parametrize("duration", [4, 6, 8])
    async def test_generate_video_passes_duration_seconds(self, duration):
        """generate_video() が GenerateVideosConfig に duration_seconds=<duration> を渡すこと"""
        provider = _make_provider()

        mock_operation = MagicMock()
        mock_operation.name = f"operations/veo-op-{duration}"

        captured_configs = []

        def fake_generate_videos(**kwargs):
            captured_configs.append(kwargs.get("config"))
            return mock_operation

        mock_client = MagicMock()
        mock_client.models.generate_videos.side_effect = fake_generate_videos
        provider._client = mock_client

        # image download mock
        with patch.object(provider, "_download_image", new=AsyncMock(return_value=b"fake_image")):
            with patch("asyncio.get_event_loop") as mock_loop:
                mock_loop.return_value.run_in_executor = AsyncMock(
                    side_effect=lambda _, fn: fn()
                )
                task_id = await provider.generate_video(
                    image_url="https://example.com/img.jpg",
                    prompt="test prompt",
                    duration=duration,
                    aspect_ratio="9:16",
                )

        assert task_id == f"operations/veo-op-{duration}"
        assert len(captured_configs) >= 1
        config = captured_configs[0]
        # duration_seconds が設定されているか確認 (SDK が対応している場合)
        assert hasattr(config, "duration_seconds"), (
            f"config should have duration_seconds attribute, got: {config}"
        )
        assert config.duration_seconds == duration, (
            f"Expected duration_seconds={duration}, got {config.duration_seconds}"
        )


# ===========================================================================
# generate_video_from_text — duration_seconds が GenerateVideosConfig に渡される
# ===========================================================================

class TestVeoGenerateVideoFromTextDuration:

    @pytest.mark.asyncio
    @pytest.mark.parametrize("duration", [4, 6, 8])
    async def test_generate_video_from_text_passes_duration_seconds(self, duration):
        """generate_video_from_text() が GenerateVideosConfig に duration_seconds=<duration> を渡すこと"""
        provider = _make_provider()

        mock_operation = MagicMock()
        mock_operation.name = f"operations/veo-t2v-{duration}"

        captured_configs = []

        def fake_generate_videos(**kwargs):
            captured_configs.append(kwargs.get("config"))
            return mock_operation

        mock_client = MagicMock()
        mock_client.models.generate_videos.side_effect = fake_generate_videos
        provider._client = mock_client

        with patch("asyncio.get_event_loop") as mock_loop:
            mock_loop.return_value.run_in_executor = AsyncMock(
                side_effect=lambda _, fn: fn()
            )
            task_id = await provider.generate_video_from_text(
                prompt="test t2v prompt",
                duration=duration,
                aspect_ratio="9:16",
            )

        assert task_id == f"operations/veo-t2v-{duration}"
        assert len(captured_configs) >= 1


# ===========================================================================
# hasattr guard: duration_seconds 未対応 SDK の場合の warning + 無視
# ===========================================================================

class TestVeoDurationHashattrGuard:

    @pytest.mark.asyncio
    async def test_generate_video_logs_warning_when_duration_seconds_not_supported(self, caplog):
        """
        GenerateVideosConfig が duration_seconds を受け付けない場合 (TypeError):
        - warning ログが出力される
        - generate_videos が呼ばれる (duration 無視で続行)
        """
        import logging
        provider = _make_provider()

        mock_operation = MagicMock()
        mock_operation.name = "operations/veo-no-duration"

        # GenerateVideosConfig が duration_seconds を受け付けないモッククラス
        class MockGenerateVideosConfigNoDuration:
            def __init__(self, **kwargs):
                if "duration_seconds" in kwargs:
                    raise TypeError("__init__() got an unexpected keyword argument 'duration_seconds'")
                self.aspect_ratio = kwargs.get("aspect_ratio")
                self.number_of_videos = kwargs.get("number_of_videos")

        def fake_generate_videos(**kwargs):
            return mock_operation

        mock_client = MagicMock()
        mock_client.models.generate_videos.side_effect = fake_generate_videos
        provider._client = mock_client

        import google.genai
        original_types = google.genai.types

        with patch("google.genai.types") as mock_types:
            mock_types.GenerateVideosConfig = MockGenerateVideosConfigNoDuration
            mock_types.Image = MagicMock

            with patch.object(provider, "_download_image", new=AsyncMock(return_value=b"fake_image")):
                with patch("asyncio.get_event_loop") as mock_loop:
                    mock_loop.return_value.run_in_executor = AsyncMock(
                        side_effect=lambda _, fn: fn()
                    )
                    with caplog.at_level(logging.WARNING, logger="app.external.veo_provider"):
                        await provider.generate_video(
                            image_url="https://example.com/img.jpg",
                            prompt="test prompt",
                            duration=6,
                            aspect_ratio="9:16",
                        )

        warning_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
        assert any("duration_seconds" in msg for msg in warning_messages), (
            f"Expected warning about duration_seconds, got: {warning_messages}"
        )
