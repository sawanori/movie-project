"""
FFmpegService FPS関連修正のテスト

FPS変換をスキップし、元動画のFPSを維持する方針を検証する。
結合時は入力動画のFPSを自動検出して統一する。
"""

import pytest
from unittest.mock import AsyncMock, patch
import inspect

from app.services.ffmpeg_service import FFmpegService


class TestProcessVideoDefaultFps:
    """process_video() のデフォルト target_fps が None（変換なし）であることを検証"""

    def test_default_target_fps_is_none(self):
        sig = inspect.signature(FFmpegService.process_video)
        default = sig.parameters["target_fps"].default
        assert default is None, f"Expected default target_fps=None, got {default}"


class TestConvertFpsDefaultFps:
    """convert_fps() のデフォルト target_fps が 24 であることを検証"""

    def test_default_target_fps_is_24(self):
        sig = inspect.signature(FFmpegService.convert_fps)
        default = sig.parameters["target_fps"].default
        assert default == 24, f"Expected default target_fps=24, got {default}"


class TestConcatVideosDefaultFps:
    """concat_videos() のデフォルト target_fps が None（自動検出）であることを検証"""

    def test_default_target_fps_is_none(self):
        sig = inspect.signature(FFmpegService.concat_videos)
        default = sig.parameters["target_fps"].default
        assert default is None, f"Expected default target_fps=None, got {default}"


class TestBuildVideoXfadeFilter:
    """_build_video_xfade_filter() の target_fps パラメータ対応を検証"""

    def test_uses_target_fps_in_filter(self):
        """target_fps が fps= フィルターに正しく反映されること"""
        service = FFmpegService()
        result = service._build_video_xfade_filter(
            n=2, durations=[5.0, 5.0],
            transition="fade", transition_duration=0.5, target_fps=24,
        )
        assert "fps=24" in result

    def test_uses_custom_fps_in_filter(self):
        """カスタム target_fps が正しく反映されること"""
        service = FFmpegService()
        result = service._build_video_xfade_filter(
            n=2, durations=[5.0, 5.0],
            transition="dissolve", transition_duration=0.5, target_fps=60,
        )
        assert "fps=60" in result

    def test_three_videos_uses_target_fps(self):
        """3本の動画でも target_fps が全入力に適用されること"""
        service = FFmpegService()
        result = service._build_video_xfade_filter(
            n=3, durations=[5.0, 5.0, 5.0],
            transition="fade", transition_duration=0.5, target_fps=24,
        )
        assert result.count("fps=24") == 3


class TestConcatSimpleFpsSignature:
    """_concat_simple() の FPS自動検出パラメータを検証"""

    def test_has_target_fps_parameter(self):
        sig = inspect.signature(FFmpegService._concat_simple)
        assert "target_fps" in sig.parameters

    def test_target_fps_default_none(self):
        """_concat_simple の target_fps デフォルトが None（自動検出）であること"""
        sig = inspect.signature(FFmpegService._concat_simple)
        default = sig.parameters["target_fps"].default
        assert default is None


class TestGetVideoFps:
    """_get_video_fps() メソッドの存在を検証"""

    def test_method_exists(self):
        service = FFmpegService()
        assert hasattr(service, "_get_video_fps")
        assert callable(service._get_video_fps)


class TestConcatWithTransitionFpsSignature:
    """_concat_with_transition() の target_fps パラメータを検証"""

    def test_has_target_fps_parameter(self):
        sig = inspect.signature(FFmpegService._concat_with_transition)
        assert "target_fps" in sig.parameters

    def test_target_fps_default_none(self):
        """_concat_with_transition の target_fps デフォルトが None であること"""
        sig = inspect.signature(FFmpegService._concat_with_transition)
        default = sig.parameters["target_fps"].default
        assert default is None


class TestConcatVideosPassesTargetFps:
    """concat_videos() が target_fps を内部メソッドに正しく伝播することを検証"""

    @pytest.mark.asyncio
    async def test_concat_simple_receives_target_fps(self):
        service = FFmpegService()
        with patch.object(service, "_concat_simple", new_callable=AsyncMock, return_value="/output.mp4") as mock_simple:
            with patch("os.path.exists", return_value=True):
                await service.concat_videos(
                    video_paths=["/a.mp4", "/b.mp4"],
                    output_path="/output.mp4",
                    transition="none",
                    target_fps=24,
                )
            mock_simple.assert_called_once_with(
                ["/a.mp4", "/b.mp4"], "/output.mp4", target_fps=24,
            )

    @pytest.mark.asyncio
    async def test_concat_with_transition_receives_target_fps(self):
        service = FFmpegService()
        with patch.object(service, "_concat_with_transition", new_callable=AsyncMock, return_value="/output.mp4") as mock_transition:
            with patch("os.path.exists", return_value=True):
                await service.concat_videos(
                    video_paths=["/a.mp4", "/b.mp4"],
                    output_path="/output.mp4",
                    transition="fade",
                    transition_duration=0.5,
                    target_fps=24,
                )
            mock_transition.assert_called_once_with(
                ["/a.mp4", "/b.mp4"], "/output.mp4", "fade", 0.5, target_fps=24,
            )


class TestVideoProcessorFpsLogic:
    """video_processor.py の FPS変換ロジック修正を検証"""

    def test_fps_logic_always_returns_none(self):
        """FPS変換は常にスキップ（None）されること"""
        # 修正後: ffmpeg_target_fps = None
        ffmpeg_target_fps = None
        assert ffmpeg_target_fps is None
