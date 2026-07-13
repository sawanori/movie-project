"""
背景削除パイプライン用 FFmpegService ヘルパーのテスト

- probe_video_info: ffprobe JSON から codec_name / pix_fmt / width / height を抽出
- create_h264_proxy: 10bit+ マスター → fal 投入用 8bit H.264 プロキシ
- composite_master_with_alpha_matte: マスター + アルファマット → ProRes 4444

コマンドの組み立てとエラーハンドリングを検証する。
実際の ffmpeg は呼び出さない（asyncio.create_subprocess_exec をモック）。
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ffmpeg_service import FFmpegError, FFmpegService


def _make_mock_process(returncode: int = 0, stderr: bytes = b"") -> MagicMock:
    """create_subprocess_exec が返すプロセスのモックを作る"""
    mock_process = MagicMock()
    mock_process.returncode = returncode
    mock_process.communicate = AsyncMock(return_value=(b"", stderr))
    return mock_process


class TestProbeVideoInfo:
    """probe_video_info のテスト"""

    @pytest.mark.asyncio
    async def test_extracts_video_stream_fields(self):
        """get_video_info の結果から最初の映像ストリームの主要フィールドを抽出する"""
        service = FFmpegService()
        ffprobe_json = {
            "streams": [
                {"codec_type": "audio", "codec_name": "pcm_s16le"},
                {
                    "codec_type": "video",
                    "codec_name": "prores",
                    "pix_fmt": "yuv422p10le",
                    "width": 1920,
                    "height": 1080,
                    "r_frame_rate": "30000/1001",
                },
            ],
            "format": {"duration": "5.0"},
        }

        with patch.object(
            service, "get_video_info", new_callable=AsyncMock, return_value=ffprobe_json
        ):
            info = await service.probe_video_info("/tmp/master.mov")

        assert info == {
            "codec_name": "prores",
            "pix_fmt": "yuv422p10le",
            "width": 1920,
            "height": 1080,
        }

    @pytest.mark.asyncio
    async def test_raises_when_no_video_stream(self):
        """映像ストリームが見つからない場合は日本語メッセージの FFmpegError を投げる"""
        service = FFmpegService()

        with patch.object(
            service, "get_video_info", new_callable=AsyncMock, return_value={}
        ):
            with pytest.raises(FFmpegError) as exc_info:
                await service.probe_video_info("/tmp/broken.mov")

        assert "映像ストリームが見つかりません" in str(exc_info.value)


class TestCreateH264Proxy:
    """create_h264_proxy のテスト"""

    @pytest.mark.asyncio
    async def test_builds_expected_command(self):
        """期待どおりの ffmpeg コマンドを正確に組み立てる（8bit yuv420p / faststart）"""
        service = FFmpegService()
        mock_process = _make_mock_process(returncode=0)

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", return_value=True
        ), patch(
            "asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=mock_process,
        ) as mock_exec:
            result = await service.create_h264_proxy("/tmp/master.mov", "/tmp/proxy.mp4")

        assert result == "/tmp/proxy.mp4"

        cmd = list(mock_exec.call_args.args)
        assert cmd == [
            "ffmpeg", "-y",
            "-i", "/tmp/master.mov",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart",
            "/tmp/proxy.mp4",
        ]

    @pytest.mark.asyncio
    async def test_raises_on_nonzero_returncode(self):
        """ffmpeg が非ゼロ終了した場合は日本語メッセージの FFmpegError を投げる"""
        service = FFmpegService()
        mock_process = _make_mock_process(returncode=1, stderr=b"encode error")

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", return_value=True
        ), patch(
            "asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=mock_process,
        ):
            with pytest.raises(FFmpegError) as exc_info:
                await service.create_h264_proxy("/tmp/master.mov", "/tmp/proxy.mp4")

        assert "H.264プロキシの作成に失敗" in str(exc_info.value)
        assert "encode error" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_input_missing(self):
        """入力ファイルが存在しない場合は FFmpegError を投げる"""
        service = FFmpegService()

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", return_value=False
        ):
            with pytest.raises(FFmpegError) as exc_info:
                await service.create_h264_proxy("/tmp/missing.mov", "/tmp/proxy.mp4")

        assert "入力動画が見つかりません" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_ffmpeg_not_installed(self):
        """ffmpeg 未インストールの場合は FFmpegError を投げる"""
        service = FFmpegService()

        with patch.object(service, "_check_ffmpeg", return_value=False):
            with pytest.raises(FFmpegError) as exc_info:
                await service.create_h264_proxy("/tmp/master.mov", "/tmp/proxy.mp4")

        assert "FFmpegがインストールされていません" in str(exc_info.value)


class TestCompositeMasterWithAlphaMatte:
    """composite_master_with_alpha_matte のテスト"""

    @pytest.mark.asyncio
    async def test_builds_expected_command(self):
        """期待どおりの ffmpeg コマンドを正確に組み立てる

        重要:
        - `-c:v libvpx-vp9` がマット入力の -i より前にあること（ネイティブ VP9
          デコーダーはアルファチャンネルを破棄するため）
        - filtergraph が alphaextract → scale（マスター解像度）→ alphamerge であること
        - `-shortest` でマスター / マットの長さ差異を吸収すること
        """
        service = FFmpegService()
        mock_process = _make_mock_process(returncode=0)

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", return_value=True
        ), patch(
            "asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=mock_process,
        ) as mock_exec:
            result = await service.composite_master_with_alpha_matte(
                "/tmp/master.mov", "/tmp/matte.webm", "/tmp/out.mov", 1920, 1080
            )

        assert result == "/tmp/out.mov"

        cmd = list(mock_exec.call_args.args)
        assert cmd == [
            "ffmpeg", "-y",
            "-i", "/tmp/master.mov",
            "-c:v", "libvpx-vp9",
            "-i", "/tmp/matte.webm",
            "-filter_complex",
            "[1:v]alphaextract,scale=1920:1080[a];[0:v][a]alphamerge[out]",
            "-map", "[out]",
            "-map", "0:a:0?",
            "-c:v", "prores_ks",
            "-profile:v", "4444",
            "-pix_fmt", "yuva444p10le",
            "-c:a", "pcm_s16le",
            "-shortest",
            "/tmp/out.mov",
        ]

        # デコーダー指定（libvpx-vp9）がマット入力（2 つ目の -i）より前にあること
        matte_input_index = cmd.index("/tmp/matte.webm")
        assert cmd[matte_input_index - 1] == "-i"
        assert cmd.index("libvpx-vp9") < matte_input_index - 1

    @pytest.mark.asyncio
    async def test_raises_on_nonzero_returncode(self):
        """ffmpeg が非ゼロ終了した場合は日本語メッセージの FFmpegError を投げる"""
        service = FFmpegService()
        mock_process = _make_mock_process(returncode=1, stderr=b"filter error")

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", return_value=True
        ), patch(
            "asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=mock_process,
        ):
            with pytest.raises(FFmpegError) as exc_info:
                await service.composite_master_with_alpha_matte(
                    "/tmp/master.mov", "/tmp/matte.webm", "/tmp/out.mov", 1920, 1080
                )

        assert "マスターとアルファマットの合成に失敗" in str(exc_info.value)
        assert "filter error" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_master_missing(self):
        """マスターが存在しない場合は FFmpegError を投げる"""
        service = FFmpegService()

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", side_effect=lambda p: p != "/tmp/missing-master.mov"
        ):
            with pytest.raises(FFmpegError) as exc_info:
                await service.composite_master_with_alpha_matte(
                    "/tmp/missing-master.mov", "/tmp/matte.webm", "/tmp/out.mov", 1920, 1080
                )

        assert "マスター動画が見つかりません" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_matte_missing(self):
        """マットが存在しない場合は FFmpegError を投げる"""
        service = FFmpegService()

        with patch.object(service, "_check_ffmpeg", return_value=True), patch(
            "os.path.exists", side_effect=lambda p: p != "/tmp/missing-matte.webm"
        ):
            with pytest.raises(FFmpegError) as exc_info:
                await service.composite_master_with_alpha_matte(
                    "/tmp/master.mov", "/tmp/missing-matte.webm", "/tmp/out.mov", 1920, 1080
                )

        assert "アルファマット動画が見つかりません" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_ffmpeg_not_installed(self):
        """ffmpeg 未インストールの場合は FFmpegError を投げる"""
        service = FFmpegService()

        with patch.object(service, "_check_ffmpeg", return_value=False):
            with pytest.raises(FFmpegError) as exc_info:
                await service.composite_master_with_alpha_matte(
                    "/tmp/master.mov", "/tmp/matte.webm", "/tmp/out.mov", 1920, 1080
                )

        assert "FFmpegがインストールされていません" in str(exc_info.value)
