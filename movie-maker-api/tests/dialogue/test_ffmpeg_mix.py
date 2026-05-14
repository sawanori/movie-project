"""
FFmpegService.mix_audio_to_video と _has_audio_track の単体テスト

実際の ffmpeg/ffprobe は呼び出さない (subprocess.run / asyncio.create_subprocess_exec をモック)
"""
import asyncio
import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ffmpeg_service import FFmpegError, FFmpegService


@pytest.fixture
def service():
    return FFmpegService()


# ---------------------------------------------------------------------------
# _has_audio_track
# ---------------------------------------------------------------------------


class TestHasAudioTrack:
    def test_has_audio_track_true(self, service):
        """ffprobe が 'audio' を含む stdout を返すとき True"""
        mock_result = MagicMock()
        mock_result.stdout = "audio\n"
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            result = service._has_audio_track("/tmp/video.mp4")

        assert result is True
        mock_run.assert_called_once()

    def test_has_audio_track_false(self, service):
        """ffprobe が空の stdout を返すとき False"""
        mock_result = MagicMock()
        mock_result.stdout = ""
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            result = service._has_audio_track("/tmp/video.mp4")

        assert result is False

    def test_has_audio_track_ffprobe_error(self, service):
        """subprocess.run が例外を投げるとき False (安全側フォールバック)"""
        with patch("subprocess.run", side_effect=FileNotFoundError("ffprobe not found")):
            result = service._has_audio_track("/tmp/video.mp4")

        assert result is False

    def test_has_audio_track_called_process_error(self, service):
        """CalledProcessError でも False を返す"""
        with patch(
            "subprocess.run",
            side_effect=subprocess.CalledProcessError(1, "ffprobe"),
        ):
            result = service._has_audio_track("/tmp/video.mp4")

        assert result is False


# ---------------------------------------------------------------------------
# mix_audio_to_video
# ---------------------------------------------------------------------------


class TestMixAudioToVideo:
    @pytest.mark.asyncio
    async def test_mix_audio_video_with_audio_track(self, service):
        """元動画に音声あり → amix フィルターが使われる"""
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch.object(service, "_has_audio_track", return_value=True):
            with patch(
                "asyncio.create_subprocess_exec",
                return_value=mock_process,
            ) as mock_exec:
                result = await service.mix_audio_to_video(
                    "/tmp/video.mp4",
                    "/tmp/audio.mp3",
                    "/tmp/output.mp4",
                )

        assert result == "/tmp/output.mp4"
        call_args = mock_exec.call_args[0]
        cmd_str = " ".join(call_args)
        assert "amix" in cmd_str
        assert "-shortest" in cmd_str

    @pytest.mark.asyncio
    async def test_mix_audio_video_without_audio_track(self, service):
        """元動画に音声なし → -map 1:a フォールバックが使われる"""
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch.object(service, "_has_audio_track", return_value=False):
            with patch(
                "asyncio.create_subprocess_exec",
                return_value=mock_process,
            ) as mock_exec:
                result = await service.mix_audio_to_video(
                    "/tmp/video.mp4",
                    "/tmp/audio.mp3",
                    "/tmp/output.mp4",
                )

        assert result == "/tmp/output.mp4"
        call_args = mock_exec.call_args[0]
        cmd_str = " ".join(call_args)
        assert "-map" in cmd_str
        assert "1:a" in cmd_str
        assert "amix" not in cmd_str
        assert "-shortest" in cmd_str

    @pytest.mark.asyncio
    async def test_mix_audio_video_ffmpeg_failure(self, service):
        """ffmpeg が returncode=1 を返すと FFmpegError が raise される"""
        mock_process = AsyncMock()
        mock_process.returncode = 1
        mock_process.communicate = AsyncMock(return_value=(b"", b"some error"))

        with patch.object(service, "_has_audio_track", return_value=True):
            with patch("asyncio.create_subprocess_exec", return_value=mock_process):
                with pytest.raises(FFmpegError):
                    await service.mix_audio_to_video(
                        "/tmp/video.mp4",
                        "/tmp/audio.mp3",
                        "/tmp/output.mp4",
                    )

    @pytest.mark.asyncio
    async def test_mix_audio_video_with_audio_track_returns_output_path(self, service):
        """成功時は output_path が返る"""
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch.object(service, "_has_audio_track", return_value=True):
            with patch("asyncio.create_subprocess_exec", return_value=mock_process):
                result = await service.mix_audio_to_video(
                    "/tmp/video.mp4",
                    "/tmp/audio.mp3",
                    "/tmp/out.mp4",
                )

        assert result == "/tmp/out.mp4"

    @pytest.mark.asyncio
    async def test_mix_audio_video_without_audio_track_returns_output_path(self, service):
        """元動画音声なし成功時も output_path が返る"""
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch.object(service, "_has_audio_track", return_value=False):
            with patch("asyncio.create_subprocess_exec", return_value=mock_process):
                result = await service.mix_audio_to_video(
                    "/tmp/video.mp4",
                    "/tmp/audio.mp3",
                    "/tmp/out.mp4",
                )

        assert result == "/tmp/out.mp4"
