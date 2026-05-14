"""
POST /api/v1/videos/extract-frame 単体テスト
"""
from unittest.mock import patch, MagicMock, AsyncMock
from io import BytesIO


VIDEO_URL = "https://r2.example.com/videos/test.mp4"
IMAGE_URL = "https://r2.example.com/images/extract_frame/test_user_1234567890_first.jpg"


def _make_pil_image_mock(width: int = 1280, height: int = 720) -> MagicMock:
    """PIL.Image.open の戻り値として使えるモックを返す"""
    mock_img = MagicMock()
    mock_img.size = (width, height)
    mock_img.__enter__ = MagicMock(return_value=mock_img)
    mock_img.__exit__ = MagicMock(return_value=False)
    return mock_img


class TestExtractFrameEndpoint:
    """POST /api/v1/videos/extract-frame のテスト"""

    def test_extract_first_frame_success(self, auth_client):
        """direction='first' で正常呼び出し → extract_first_frame が呼ばれ 200 + image_url/width/height が返る"""
        with patch("app.videos.router.get_ffmpeg_service") as mock_ffmpeg_factory, \
             patch("app.videos.router.upload_image", new_callable=AsyncMock) as mock_upload, \
             patch("httpx.AsyncClient") as mock_http_class, \
             patch("builtins.open", MagicMock()):

            # httpx のモック
            mock_http_instance = AsyncMock()
            mock_http_class.return_value.__aenter__ = AsyncMock(return_value=mock_http_instance)
            mock_http_class.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"fake_video_content"
            mock_http_instance.get = AsyncMock(return_value=mock_response)

            # FFmpeg のモック
            mock_ffmpeg = MagicMock()
            mock_ffmpeg.extract_first_frame = AsyncMock(return_value="/tmp/frame.jpg")
            mock_ffmpeg.extract_last_frame = AsyncMock(return_value="/tmp/frame.jpg")
            mock_ffmpeg_factory.return_value = mock_ffmpeg

            # R2 アップロードのモック
            mock_upload.return_value = IMAGE_URL

            # open モック (ファイル書き込み・読み込み)
            mock_file = MagicMock()
            mock_file.__enter__ = MagicMock(return_value=mock_file)
            mock_file.__exit__ = MagicMock(return_value=False)
            mock_file.read = MagicMock(return_value=b"fake_frame_content")

            with patch("tempfile.mkdtemp", return_value="/tmp/test_tmpdir"), \
                 patch("os.path.join", side_effect=lambda *args: "/".join(args)), \
                 patch("os.path.exists", return_value=False), \
                 patch("os.path.isdir", return_value=False), \
                 patch("builtins.open", return_value=mock_file), \
                 patch("PIL.Image.open", return_value=_make_pil_image_mock(1280, 720)):

                response = auth_client.post(
                    "/api/v1/videos/extract-frame",
                    json={"video_url": VIDEO_URL, "direction": "first"},
                )

        assert response.status_code == 200
        data = response.json()
        assert "image_url" in data
        assert data["image_url"] == IMAGE_URL
        assert "width" in data
        assert "height" in data
        assert isinstance(data["width"], int) and data["width"] > 0
        assert isinstance(data["height"], int) and data["height"] > 0

    def test_extract_last_frame_success(self, auth_client):
        """direction='last' で正常呼び出し → extract_last_frame が呼ばれる"""
        with patch("app.videos.router.get_ffmpeg_service") as mock_ffmpeg_factory, \
             patch("app.videos.router.upload_image", new_callable=AsyncMock) as mock_upload, \
             patch("httpx.AsyncClient") as mock_http_class, \
             patch("builtins.open", MagicMock()):

            mock_http_instance = AsyncMock()
            mock_http_class.return_value.__aenter__ = AsyncMock(return_value=mock_http_instance)
            mock_http_class.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"fake_video_content"
            mock_http_instance.get = AsyncMock(return_value=mock_response)

            mock_ffmpeg = MagicMock()
            mock_ffmpeg.extract_first_frame = AsyncMock(return_value="/tmp/frame.jpg")
            mock_ffmpeg.extract_last_frame = AsyncMock(return_value="/tmp/frame.jpg")
            mock_ffmpeg_factory.return_value = mock_ffmpeg

            last_image_url = "https://r2.example.com/images/extract_frame/test_user_1234567890_last.jpg"
            mock_upload.return_value = last_image_url

            mock_file = MagicMock()
            mock_file.__enter__ = MagicMock(return_value=mock_file)
            mock_file.__exit__ = MagicMock(return_value=False)
            mock_file.read = MagicMock(return_value=b"fake_frame_content")

            with patch("tempfile.mkdtemp", return_value="/tmp/test_tmpdir"), \
                 patch("os.path.join", side_effect=lambda *args: "/".join(args)), \
                 patch("os.path.exists", return_value=False), \
                 patch("os.path.isdir", return_value=False), \
                 patch("builtins.open", return_value=mock_file), \
                 patch("PIL.Image.open", return_value=_make_pil_image_mock(1920, 1080)):

                response = auth_client.post(
                    "/api/v1/videos/extract-frame",
                    json={"video_url": VIDEO_URL, "direction": "last"},
                )

        assert response.status_code == 200
        data = response.json()
        assert "image_url" in data
        assert data["image_url"] == last_image_url
        assert isinstance(data["width"], int) and data["width"] > 0
        assert isinstance(data["height"], int) and data["height"] > 0

    def test_extract_frame_invalid_direction(self, auth_client):
        """direction が Literal 以外 → 422 が返る"""
        response = auth_client.post(
            "/api/v1/videos/extract-frame",
            json={"video_url": VIDEO_URL, "direction": "middle"},
        )
        assert response.status_code == 422

    def test_extract_frame_missing_video_url(self, auth_client):
        """video_url が空文字 → 422 が返る"""
        response = auth_client.post(
            "/api/v1/videos/extract-frame",
            json={"video_url": "", "direction": "first"},
        )
        assert response.status_code == 422

    def test_extract_frame_video_download_failure(self, auth_client):
        """動画ダウンロード失敗 → 502 + エラーメッセージ"""
        import httpx as _httpx

        with patch("app.videos.router.get_ffmpeg_service") as mock_ffmpeg_factory, \
             patch("httpx.AsyncClient") as mock_http_class:

            mock_http_instance = AsyncMock()
            mock_http_class.return_value.__aenter__ = AsyncMock(return_value=mock_http_instance)
            mock_http_class.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_http_instance.get = AsyncMock(
                side_effect=_httpx.ConnectError("Connection failed")
            )

            mock_ffmpeg = MagicMock()
            mock_ffmpeg_factory.return_value = mock_ffmpeg

            with patch("tempfile.mkdtemp", return_value="/tmp/test_tmpdir"), \
                 patch("os.path.exists", return_value=False), \
                 patch("os.path.isdir", return_value=False):

                response = auth_client.post(
                    "/api/v1/videos/extract-frame",
                    json={"video_url": VIDEO_URL, "direction": "first"},
                )

        assert response.status_code == 502
        assert "動画の取得に失敗しました" in response.json()["detail"]

    def test_extract_frame_ffmpeg_failure(self, auth_client):
        """FFmpeg 失敗 → 500 + エラーメッセージ"""
        with patch("app.videos.router.get_ffmpeg_service") as mock_ffmpeg_factory, \
             patch("httpx.AsyncClient") as mock_http_class:

            mock_http_instance = AsyncMock()
            mock_http_class.return_value.__aenter__ = AsyncMock(return_value=mock_http_instance)
            mock_http_class.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"fake_video_content"
            mock_http_instance.get = AsyncMock(return_value=mock_response)

            mock_ffmpeg = MagicMock()
            mock_ffmpeg.extract_first_frame = AsyncMock(
                side_effect=Exception("FFmpeg process failed")
            )
            mock_ffmpeg_factory.return_value = mock_ffmpeg

            mock_file = MagicMock()
            mock_file.__enter__ = MagicMock(return_value=mock_file)
            mock_file.__exit__ = MagicMock(return_value=False)

            with patch("tempfile.mkdtemp", return_value="/tmp/test_tmpdir"), \
                 patch("os.path.join", side_effect=lambda *args: "/".join(args)), \
                 patch("os.path.exists", return_value=False), \
                 patch("os.path.isdir", return_value=False), \
                 patch("builtins.open", return_value=mock_file):

                response = auth_client.post(
                    "/api/v1/videos/extract-frame",
                    json={"video_url": VIDEO_URL, "direction": "first"},
                )

        assert response.status_code == 500
        assert "フレームの抽出に失敗しました" in response.json()["detail"]

    def test_extract_frame_unauthenticated(self, client):
        """認証なし (DEBUG=False 相当) → 401 が返る"""
        from app.core.dependencies import get_current_user
        from fastapi import HTTPException

        async def raise_401():
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")

        from app.main import app
        app.dependency_overrides[get_current_user] = raise_401
        try:
            response = client.post(
                "/api/v1/videos/extract-frame",
                json={"video_url": VIDEO_URL, "direction": "first"},
            )
            assert response.status_code == 401
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_extract_frame_tmpfile_cleanup_on_success(self, auth_client):
        """正常完了時に tmpfile が削除されることを確認（リソースリーク防止）"""
        removed_paths = []

        def fake_remove(path):
            removed_paths.append(path)

        with patch("app.videos.router.get_ffmpeg_service") as mock_ffmpeg_factory, \
             patch("app.videos.router.upload_image", new_callable=AsyncMock) as mock_upload, \
             patch("httpx.AsyncClient") as mock_http_class:

            mock_http_instance = AsyncMock()
            mock_http_class.return_value.__aenter__ = AsyncMock(return_value=mock_http_instance)
            mock_http_class.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"fake_video_content"
            mock_http_instance.get = AsyncMock(return_value=mock_response)

            mock_ffmpeg = MagicMock()
            mock_ffmpeg.extract_first_frame = AsyncMock(return_value="/tmp/td/frame.jpg")
            mock_ffmpeg_factory.return_value = mock_ffmpeg
            mock_upload.return_value = IMAGE_URL

            mock_file = MagicMock()
            mock_file.__enter__ = MagicMock(return_value=mock_file)
            mock_file.__exit__ = MagicMock(return_value=False)
            mock_file.read = MagicMock(return_value=b"fake_frame_content")

            with patch("tempfile.mkdtemp", return_value="/tmp/td"), \
                 patch("os.path.join", side_effect=lambda *args: "/".join(args)), \
                 patch("os.path.exists", return_value=True), \
                 patch("os.path.isdir", return_value=False), \
                 patch("os.remove", side_effect=fake_remove), \
                 patch("builtins.open", return_value=mock_file), \
                 patch("PIL.Image.open", return_value=_make_pil_image_mock(1280, 720)):

                response = auth_client.post(
                    "/api/v1/videos/extract-frame",
                    json={"video_url": VIDEO_URL, "direction": "first"},
                )

        assert response.status_code == 200
        # 少なくとも動画ファイルとフレームファイルが削除対象になっている
        assert len(removed_paths) >= 2
