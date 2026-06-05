"""
HedraProvider のテスト
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


class TestHedraProvider:
    """HedraProvider のテスト"""

    @pytest.fixture(autouse=True)
    def _set_hedra_api_key(self):
        """テスト中は HEDRA_API_KEY を擬似値に固定する。
        (未設定だと _get_headers がガードで ValueError を投げるため)
        """
        with patch("app.core.config.settings.HEDRA_API_KEY", "test-hedra-key"):
            yield

    def test_provider_name_returns_hedra(self):
        """provider_name が 'hedra' を返す"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()
        assert provider.provider_name == "hedra"

    def test_get_headers_raises_clear_error_when_api_key_missing(self):
        """HEDRA_API_KEY 未設定時は明確な ValueError を投げる
        (httpx の 'Illegal header value' になる前に弾く)
        """
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()
        with patch("app.core.config.settings.HEDRA_API_KEY", ""):
            with pytest.raises(ValueError, match="HEDRA_API_KEY"):
                provider._get_headers()

    @pytest.mark.asyncio
    async def test_generate_lip_sync_with_image_source(self):
        """画像ソースで lip sync 生成を開始する"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "hedra-task-001"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            task_id = await provider.generate_lip_sync(
                source_url="https://example.com/image.jpg",
                audio_url="https://example.com/audio.mp3",
                source_type="image",
            )

        assert task_id == "hedra-task-001"

    @pytest.mark.asyncio
    async def test_generate_lip_sync_with_video_source(self):
        """動画ソースで lip sync 生成を開始する"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "hedra-task-002"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            task_id = await provider.generate_lip_sync(
                source_url="https://example.com/video.mp4",
                audio_url="https://example.com/audio.mp3",
                source_type="video",
            )

        assert task_id == "hedra-task-002"

    @pytest.mark.asyncio
    async def test_generate_lip_sync_api_error_handling(self):
        """API エラーを適切に処理する"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with pytest.raises(Exception):
                await provider.generate_lip_sync(
                    source_url="https://example.com/image.jpg",
                    audio_url="https://example.com/audio.mp3",
                    source_type="image",
                )

    @pytest.mark.asyncio
    async def test_check_status_pending(self):
        """pending ステータスを正しく返す"""
        from app.external.hedra_provider import HedraProvider
        from app.external.lip_sync_provider import LipSyncStatus

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "hedra-task-001",
            "status": "pending",
            "progress": 0,
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            status = await provider.check_status("hedra-task-001")

        assert status.status == "pending"
        assert status.progress == 0
        assert status.video_url is None

    @pytest.mark.asyncio
    async def test_check_status_completed_with_video_url(self):
        """completed ステータスと video_url を返す"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "hedra-task-001",
            "status": "completed",
            "progress": 100,
            "video_url": "https://api.hedra.com/output/video.mp4",
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            status = await provider.check_status("hedra-task-001")

        assert status.status == "completed"
        assert status.progress == 100
        assert status.video_url == "https://api.hedra.com/output/video.mp4"

    @pytest.mark.asyncio
    async def test_check_status_failed(self):
        """failed ステータスとエラーメッセージを返す"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "hedra-task-001",
            "status": "error",
            "progress": 0,
            "error": "Processing failed due to invalid audio format",
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            status = await provider.check_status("hedra-task-001")

        assert status.status == "failed"
        assert status.error_message == "Processing failed due to invalid audio format"

    @pytest.mark.asyncio
    async def test_get_video_url_returns_url_when_completed(self):
        """完了時に video_url を返す"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "hedra-task-001",
            "status": "completed",
            "progress": 100,
            "video_url": "https://api.hedra.com/output/video.mp4",
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            url = await provider.get_video_url("hedra-task-001")

        assert url == "https://api.hedra.com/output/video.mp4"

    @pytest.mark.asyncio
    async def test_get_video_url_returns_none_when_not_ready(self):
        """未完了時に None を返す"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "hedra-task-001",
            "status": "processing",
            "progress": 50,
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            url = await provider.get_video_url("hedra-task-001")

        assert url is None

    @pytest.mark.asyncio
    async def test_empty_source_url_raises_value_error(self):
        """空の source_url は ValueError を発生させる"""
        from app.external.hedra_provider import HedraProvider

        provider = HedraProvider()

        with pytest.raises(ValueError, match="source_url"):
            await provider.generate_lip_sync(
                source_url="",
                audio_url="https://example.com/audio.mp3",
                source_type="image",
            )
