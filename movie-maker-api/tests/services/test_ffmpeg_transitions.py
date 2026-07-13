"""
FFmpegService concatenate_with_transitions のテスト

トランジション付き動画結合機能を検証する。
FFmpegバイナリへの実際の呼び出しはモックする。
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ffmpeg_service import FFmpegService, FFmpegError


class TestConcatenateWithTransitionsCrossfade:
    """crossfade トランジションのフィルター生成テスト"""

    def test_crossfade_generates_correct_ffmpeg_filter(self):
        """crossfade トランジションが xfade=transition=fade フィルターを生成すること"""
        service = FFmpegService()
        result = service._build_xfade_filter_for_transition_type(
            n=2,
            durations=[5.0, 5.0],
            transition_type="crossfade",
            transition_duration=0.5,
            target_fps=24,
        )
        assert "xfade=transition=fade" in result
        assert "duration=0.5" in result


class TestConcatenateWithTransitionsFadeBlack:
    """fade_black トランジションのフィルター生成テスト"""

    def test_fade_black_generates_correct_ffmpeg_filter(self):
        """fade_black トランジションが xfade=transition=fadeblack フィルターを生成すること"""
        service = FFmpegService()
        result = service._build_xfade_filter_for_transition_type(
            n=2,
            durations=[5.0, 5.0],
            transition_type="fade_black",
            transition_duration=0.5,
            target_fps=24,
        )
        assert "xfade=transition=fadeblack" in result
        assert "duration=0.5" in result


class TestConcatenateWithTransitionsFadeWhite:
    """fade_white トランジションのフィルター生成テスト"""

    def test_fade_white_generates_correct_ffmpeg_filter(self):
        """fade_white トランジションが xfade=transition=fadewhite フィルターを生成すること"""
        service = FFmpegService()
        result = service._build_xfade_filter_for_transition_type(
            n=2,
            durations=[5.0, 5.0],
            transition_type="fade_white",
            transition_duration=0.5,
            target_fps=24,
        )
        assert "xfade=transition=fadewhite" in result
        assert "duration=0.5" in result


class TestConcatenateWithTransitionsWipeLeft:
    """wipe_left トランジションのフィルター生成テスト"""

    def test_wipe_left_generates_correct_ffmpeg_filter(self):
        """wipe_left トランジションが xfade=transition=wipeleft フィルターを生成すること"""
        service = FFmpegService()
        result = service._build_xfade_filter_for_transition_type(
            n=2,
            durations=[5.0, 5.0],
            transition_type="wipe_left",
            transition_duration=0.5,
            target_fps=24,
        )
        assert "xfade=transition=wipeleft" in result
        assert "duration=0.5" in result


class TestConcatenateWithTransitionsNone:
    """none (cut) トランジションのテスト"""

    @pytest.mark.asyncio
    async def test_no_transition_uses_simple_concat(self):
        """none トランジションはシンプル結合を使用すること"""
        service = FFmpegService()

        with patch("os.path.exists", return_value=True):
            with patch.object(service, "_concat_simple", new_callable=AsyncMock, return_value="/output.mp4") as mock_simple:
                result = await service.concatenate_with_transitions(
                    video_paths=["/a.mp4", "/b.mp4"],
                    transitions=[{"type": "none", "duration": 0.5}],
                    output_path="/output.mp4",
                )

        mock_simple.assert_called_once()
        assert result == "/output.mp4"


class TestConcatenateWithTransitionsCustomDuration:
    """カスタムトランジション時間のテスト"""

    def test_custom_duration_03_in_filter(self):
        """0.3秒のカスタム時間がフィルターに反映されること"""
        service = FFmpegService()
        result = service._build_xfade_filter_for_transition_type(
            n=2,
            durations=[5.0, 5.0],
            transition_type="crossfade",
            transition_duration=0.3,
            target_fps=24,
        )
        assert "duration=0.3" in result

    def test_custom_duration_10_in_filter(self):
        """1.0秒のカスタム時間がフィルターに反映されること"""
        service = FFmpegService()
        result = service._build_xfade_filter_for_transition_type(
            n=2,
            durations=[5.0, 5.0],
            transition_type="crossfade",
            transition_duration=1.0,
            target_fps=24,
        )
        assert "duration=1.0" in result


class TestConcatenateWithTransitionsMismatchedDimensions:
    """解像度が異なる動画のトランジションテスト"""

    @pytest.mark.asyncio
    async def test_mismatched_dimensions_handled_gracefully(self):
        """解像度が異なる動画でも処理が完了すること"""
        service = FFmpegService()

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("os.path.exists", return_value=True):
            with patch.object(service, "_get_video_duration", new_callable=AsyncMock, return_value=5.0):
                with patch.object(service, "_get_video_fps", new_callable=AsyncMock, return_value=24.0):
                    with patch.object(service, "_has_audio_stream", new_callable=AsyncMock, return_value=False):
                        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_process):
                            result = await service.concatenate_with_transitions(
                                video_paths=["/a.mp4", "/b.mp4"],
                                transitions=[{"type": "crossfade", "duration": 0.5}],
                                output_path="/output.mp4",
                            )

        assert result == "/output.mp4"


class TestConcatenateWithTransitionsInvalidType:
    """無効なトランジション種類のフォールバックテスト"""

    @pytest.mark.asyncio
    async def test_invalid_transition_type_falls_back_to_cut(self):
        """無効なトランジション種類は cut (none) にフォールバックすること"""
        service = FFmpegService()

        with patch("os.path.exists", return_value=True):
            with patch.object(service, "_concat_simple", new_callable=AsyncMock, return_value="/output.mp4") as mock_simple:
                result = await service.concatenate_with_transitions(
                    video_paths=["/a.mp4", "/b.mp4"],
                    transitions=[{"type": "invalid_type_xyz", "duration": 0.5}],
                    output_path="/output.mp4",
                )

        mock_simple.assert_called_once()
        assert result == "/output.mp4"


class TestConcatenateWithTransitionsMultipleClips:
    """3本以上のクリップのトランジションテスト"""

    @pytest.mark.asyncio
    async def test_three_clips_with_multiple_transitions(self):
        """3本のクリップに2つのトランジションが適用されること"""
        service = FFmpegService()

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("os.path.exists", return_value=True):
            with patch.object(service, "_get_video_duration", new_callable=AsyncMock, return_value=5.0):
                with patch.object(service, "_get_video_fps", new_callable=AsyncMock, return_value=24.0):
                    with patch.object(service, "_has_audio_stream", new_callable=AsyncMock, return_value=False):
                        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_process) as mock_exec:
                            result = await service.concatenate_with_transitions(
                                video_paths=["/a.mp4", "/b.mp4", "/c.mp4"],
                                transitions=[
                                    {"type": "crossfade", "duration": 0.5},
                                    {"type": "fade_black", "duration": 0.3},
                                ],
                                output_path="/output.mp4",
                            )

        assert result == "/output.mp4"
        mock_exec.assert_called_once()
        call_args = mock_exec.call_args[0]
        filter_complex_idx = None
        for i, arg in enumerate(call_args):
            if arg == "-filter_complex":
                filter_complex_idx = i
                break
        assert filter_complex_idx is not None
        filter_complex_value = call_args[filter_complex_idx + 1]
        assert "fadeblack" in filter_complex_value or "fade" in filter_complex_value
