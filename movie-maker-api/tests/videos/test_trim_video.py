"""
POST /api/v1/videos/trim エンドポイントの単体テスト

境界値テストを中心に、Pydantic バリデーションとルーター処理を検証する。
"""
from unittest.mock import patch, MagicMock, AsyncMock


class TestTrimVideoValidation:
    """Pydantic バリデーションのテスト（422 系）"""

    def test_start_greater_than_end_returns_422(self, auth_client):
        """start=5, end=3 (start > end) → 422"""
        response = auth_client.post(
            "/api/v1/videos/trim",
            json={
                "video_url": "https://example.com/video.mp4",
                "start_seconds": 5.0,
                "end_seconds": 3.0,
            },
        )
        assert response.status_code == 422

    def test_start_equal_end_returns_422(self, auth_client):
        """start=5, end=5 (start == end) → 422"""
        response = auth_client.post(
            "/api/v1/videos/trim",
            json={
                "video_url": "https://example.com/video.mp4",
                "start_seconds": 5.0,
                "end_seconds": 5.0,
            },
        )
        assert response.status_code == 422

    def test_range_less_than_half_second_returns_422(self, auth_client):
        """start=0, end=0.3 (範囲 < 0.5s) → 422"""
        response = auth_client.post(
            "/api/v1/videos/trim",
            json={
                "video_url": "https://example.com/video.mp4",
                "start_seconds": 0.0,
                "end_seconds": 0.3,
            },
        )
        assert response.status_code == 422

    def test_negative_start_returns_422(self, auth_client):
        """start=-1 (負値) → 422 (ge=0.0 違反)"""
        response = auth_client.post(
            "/api/v1/videos/trim",
            json={
                "video_url": "https://example.com/video.mp4",
                "start_seconds": -1.0,
                "end_seconds": 5.0,
            },
        )
        assert response.status_code == 422

    def test_empty_video_url_returns_422(self, auth_client):
        """video_url が空文字 → 422 (min_length=1 違反)"""
        response = auth_client.post(
            "/api/v1/videos/trim",
            json={
                "video_url": "",
                "start_seconds": 0.0,
                "end_seconds": 5.0,
            },
        )
        assert response.status_code == 422


class TestTrimVideoSuccess:
    """正常系テスト（200）"""

    def test_trim_start0_end5_success(self, auth_client):
        """start=0, end=5 で正常 → ffmpeg_service.trim_video が呼ばれ 200 + output_video_url が返る"""
        with (
            patch("app.videos.router.download_file", new_callable=AsyncMock) as mock_download,
            patch("app.videos.router.get_ffmpeg_service") as mock_get_ffmpeg,
            patch("app.videos.router.upload_video", new_callable=AsyncMock) as mock_upload,
        ):
            mock_download.return_value = b"fake-video-bytes"
            mock_ffmpeg = MagicMock()
            mock_ffmpeg.trim_video = AsyncMock(return_value="/tmp/trimmed.mp4")
            mock_get_ffmpeg.return_value = mock_ffmpeg
            mock_upload.return_value = "https://r2.example.com/videos/trimmed.mp4"

            response = auth_client.post(
                "/api/v1/videos/trim",
                json={
                    "video_url": "https://example.com/video.mp4",
                    "start_seconds": 0.0,
                    "end_seconds": 5.0,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "output_video_url" in data
        assert data["output_video_url"] == "https://r2.example.com/videos/trimmed.mp4"
        assert "duration_seconds" in data
        assert isinstance(data["duration_seconds"], float)
        assert data["duration_seconds"] == 5.0

    def test_trim_float_values_passed_correctly(self, auth_client):
        """start=2.5, end=8.0 で正常 → float 値が ffmpeg_service.trim_video に正しく渡される"""
        with (
            patch("app.videos.router.download_file", new_callable=AsyncMock) as mock_download,
            patch("app.videos.router.get_ffmpeg_service") as mock_get_ffmpeg,
            patch("app.videos.router.upload_video", new_callable=AsyncMock) as mock_upload,
        ):
            mock_download.return_value = b"fake-video-bytes"
            mock_ffmpeg = MagicMock()
            mock_ffmpeg.trim_video = AsyncMock(return_value="/tmp/trimmed.mp4")
            mock_get_ffmpeg.return_value = mock_ffmpeg
            mock_upload.return_value = "https://r2.example.com/videos/trimmed.mp4"

            response = auth_client.post(
                "/api/v1/videos/trim",
                json={
                    "video_url": "https://example.com/video.mp4",
                    "start_seconds": 2.5,
                    "end_seconds": 8.0,
                },
            )

        assert response.status_code == 200
        # Verify correct float arguments were passed to trim_video
        call_args = mock_ffmpeg.trim_video.call_args
        assert call_args.kwargs.get("start_time", call_args.args[1] if len(call_args.args) > 1 else None) == 2.5 or \
               2.5 in call_args.args

    def test_trim_with_null_end_seconds(self, auth_client):
        """end=null で実行 → ffmpeg_service.trim_video に end_time=None が渡される"""
        with (
            patch("app.videos.router.download_file", new_callable=AsyncMock) as mock_download,
            patch("app.videos.router.get_ffmpeg_service") as mock_get_ffmpeg,
            patch("app.videos.router.upload_video", new_callable=AsyncMock) as mock_upload,
        ):
            mock_download.return_value = b"fake-video-bytes"
            mock_ffmpeg = MagicMock()
            mock_ffmpeg.trim_video = AsyncMock(return_value="/tmp/trimmed.mp4")
            mock_get_ffmpeg.return_value = mock_ffmpeg
            mock_upload.return_value = "https://r2.example.com/videos/trimmed.mp4"

            response = auth_client.post(
                "/api/v1/videos/trim",
                json={
                    "video_url": "https://example.com/video.mp4",
                    "start_seconds": 0.0,
                    "end_seconds": None,
                },
            )

        assert response.status_code == 200
        data = response.json()
        # Verify end_time=None was passed to trim_video
        call_args = mock_ffmpeg.trim_video.call_args
        # end_time can be passed as positional or keyword
        end_time_value = None
        if call_args.kwargs.get("end_time") is not None:
            end_time_value = call_args.kwargs["end_time"]
        elif len(call_args.args) > 2:
            end_time_value = call_args.args[2]
        assert end_time_value is None
        # duration_seconds は ffprobe が失敗する環境では 0.0 にフォールバック
        assert "duration_seconds" in data
        assert isinstance(data["duration_seconds"], float)


class TestTrimVideoErrors:
    """エラー系テスト"""

    def test_download_failure_returns_error(self, auth_client):
        """動画ダウンロード失敗 → エラーステータス + メッセージ"""
        with patch("app.videos.router.download_file", new_callable=AsyncMock) as mock_download:
            mock_download.side_effect = Exception("Connection failed")

            response = auth_client.post(
                "/api/v1/videos/trim",
                json={
                    "video_url": "https://example.com/video.mp4",
                    "start_seconds": 0.0,
                    "end_seconds": 5.0,
                },
            )

        assert response.status_code in (400, 500)

    def test_ffmpeg_failure_returns_error(self, auth_client):
        """FFmpeg 失敗 → エラーステータス + 「動画のトリムに失敗しました」"""
        with (
            patch("app.videos.router.download_file", new_callable=AsyncMock) as mock_download,
            patch("app.videos.router.get_ffmpeg_service") as mock_get_ffmpeg,
        ):
            mock_download.return_value = b"fake-video-bytes"
            mock_ffmpeg = MagicMock()
            mock_ffmpeg.trim_video = AsyncMock(side_effect=Exception("FFmpeg error"))
            mock_get_ffmpeg.return_value = mock_ffmpeg

            response = auth_client.post(
                "/api/v1/videos/trim",
                json={
                    "video_url": "https://example.com/video.mp4",
                    "start_seconds": 0.0,
                    "end_seconds": 5.0,
                },
            )

        assert response.status_code in (400, 500)
        assert "動画のトリムに失敗しました" in response.json().get("detail", "")

    def test_unauthenticated_returns_401(self, client):
        """認証なし → 401 (DEBUG=False の本番環境を模倣)"""
        with patch("app.core.dependencies.settings") as mock_settings:
            mock_settings.DEBUG = False
            response = client.post(
                "/api/v1/videos/trim",
                json={
                    "video_url": "https://example.com/video.mp4",
                    "start_seconds": 0.0,
                    "end_seconds": 5.0,
                },
            )
        assert response.status_code == 401
