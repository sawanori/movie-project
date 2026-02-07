"""
DomoAIProvider の単体テスト
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import httpx

from app.external.domoai_provider import DomoAIProvider
from app.external.video_provider import (
    VideoGenerationStatus,
    VideoProviderError,
    get_video_provider,
)


class TestDomoAIProvider:
    """DomoAIProvider のテスト"""

    def test_provider_name(self):
        """プロバイダー名が正しいこと"""
        provider = DomoAIProvider()
        assert provider.provider_name == "domoai"

    def test_supports_v2v_is_false(self):
        """V2Vはサポートしない"""
        provider = DomoAIProvider()
        assert provider.supports_v2v is False

    def test_convert_aspect_ratio(self):
        """アスペクト比の変換（そのまま返す）"""
        provider = DomoAIProvider()
        assert provider._convert_aspect_ratio("9:16") == "9:16"
        assert provider._convert_aspect_ratio("16:9") == "16:9"
        assert provider._convert_aspect_ratio("1:1") == "1:1"


class TestDomoAIProviderGenerateVideo:
    """generate_video メソッドのテスト"""

    @pytest.mark.asyncio
    async def test_generate_video_success(self):
        """動画生成が成功すること"""
        provider = DomoAIProvider()

        # 画像ダウンロードとAPIリクエストのモック
        mock_image_response = MagicMock()
        mock_image_response.content = b"fake_image_bytes"
        mock_image_response.raise_for_status = MagicMock()

        mock_api_response = MagicMock()
        mock_api_response.json.return_value = {
            "data": {"task_id": "test-task-123"}
        }
        mock_api_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance

            # 1回目: 画像ダウンロード、2回目: API呼び出し
            mock_instance.get.return_value = mock_image_response
            mock_instance.post.return_value = mock_api_response

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-api-key"

                task_id = await provider.generate_video(
                    image_url="https://example.com/image.jpg",
                    prompt="A cat walking",
                    duration=5,
                    aspect_ratio="9:16",
                )

        assert task_id == "test-task-123"

    @pytest.mark.asyncio
    async def test_generate_video_401_error(self):
        """401エラー（認証失敗）のハンドリング"""
        provider = DomoAIProvider()

        mock_image_response = MagicMock()
        mock_image_response.content = b"fake_image_bytes"
        mock_image_response.raise_for_status = MagicMock()

        mock_error_response = MagicMock()
        mock_error_response.status_code = 401
        mock_error_response.text = "Unauthorized"
        mock_error_response.json.return_value = {"message": "Invalid API key"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance

            mock_instance.get.return_value = mock_image_response
            mock_instance.post.side_effect = httpx.HTTPStatusError(
                "Unauthorized",
                request=MagicMock(),
                response=mock_error_response
            )

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "invalid-key"

                with pytest.raises(VideoProviderError) as exc_info:
                    await provider.generate_video(
                        image_url="https://example.com/image.jpg",
                        prompt="A cat walking",
                    )

        assert "APIキーが無効" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generate_video_402_error(self):
        """402エラー（クレジット不足）のハンドリング"""
        provider = DomoAIProvider()

        mock_image_response = MagicMock()
        mock_image_response.content = b"fake_image_bytes"
        mock_image_response.raise_for_status = MagicMock()

        mock_error_response = MagicMock()
        mock_error_response.status_code = 402
        mock_error_response.text = "Payment Required"
        mock_error_response.json.return_value = {"message": "Insufficient credits"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance

            mock_instance.get.return_value = mock_image_response
            mock_instance.post.side_effect = httpx.HTTPStatusError(
                "Payment Required",
                request=MagicMock(),
                response=mock_error_response
            )

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-key"

                with pytest.raises(VideoProviderError) as exc_info:
                    await provider.generate_video(
                        image_url="https://example.com/image.jpg",
                        prompt="A cat walking",
                    )

        assert "クレジットが不足" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generate_video_429_error(self):
        """429エラー（レート制限）のハンドリング"""
        provider = DomoAIProvider()

        mock_image_response = MagicMock()
        mock_image_response.content = b"fake_image_bytes"
        mock_image_response.raise_for_status = MagicMock()

        mock_error_response = MagicMock()
        mock_error_response.status_code = 429
        mock_error_response.text = "Too Many Requests"
        mock_error_response.json.return_value = {"message": "Rate limit exceeded"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance

            mock_instance.get.return_value = mock_image_response
            mock_instance.post.side_effect = httpx.HTTPStatusError(
                "Too Many Requests",
                request=MagicMock(),
                response=mock_error_response
            )

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-key"

                with pytest.raises(VideoProviderError) as exc_info:
                    await provider.generate_video(
                        image_url="https://example.com/image.jpg",
                        prompt="A cat walking",
                    )

        assert "レート制限" in str(exc_info.value)


class TestDomoAIProviderCheckStatus:
    """check_status メソッドのテスト"""

    @pytest.mark.asyncio
    async def test_check_status_pending(self):
        """PENDINGステータスの確認"""
        provider = DomoAIProvider()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {"status": "PENDING"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance
            mock_instance.get.return_value = mock_response

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-key"

                status = await provider.check_status("test-task-123")

        assert status.status == VideoGenerationStatus.PENDING
        assert status.progress == 10
        assert status.video_url is None

    @pytest.mark.asyncio
    async def test_check_status_processing(self):
        """PROCESSINGステータスの確認"""
        provider = DomoAIProvider()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {"status": "PROCESSING"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance
            mock_instance.get.return_value = mock_response

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-key"

                status = await provider.check_status("test-task-123")

        assert status.status == VideoGenerationStatus.PROCESSING
        assert status.progress == 50

    @pytest.mark.asyncio
    async def test_check_status_completed(self):
        """SUCCESSステータス（完了）の確認"""
        provider = DomoAIProvider()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "SUCCESS",
                "output_videos": [
                    {"url": "https://domoai.example.com/video.mp4"}
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance
            mock_instance.get.return_value = mock_response

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-key"

                status = await provider.check_status("test-task-123")

        assert status.status == VideoGenerationStatus.COMPLETED
        assert status.progress == 100
        assert status.video_url == "https://domoai.example.com/video.mp4"

    @pytest.mark.asyncio
    async def test_check_status_failed(self):
        """FAILEDステータス（失敗）の確認"""
        provider = DomoAIProvider()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "FAILED",
                "error": "Content policy violation"
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance
            mock_instance.get.return_value = mock_response

            with patch("app.external.domoai_provider.settings") as mock_settings:
                mock_settings.DOMOAI_API_KEY = "test-key"

                status = await provider.check_status("test-task-123")

        assert status.status == VideoGenerationStatus.FAILED
        assert status.error_message == "Content policy violation"


class TestGetVideoProvider:
    """get_video_provider ファクトリー関数のテスト"""

    def test_get_domoai_provider(self):
        """DomoAIプロバイダーを取得できること"""
        provider = get_video_provider("domoai")
        assert isinstance(provider, DomoAIProvider)
        assert provider.provider_name == "domoai"

    def test_get_domoai_provider_case_insensitive(self):
        """大文字小文字を区別しないこと"""
        provider = get_video_provider("DOMOAI")
        assert isinstance(provider, DomoAIProvider)

        provider = get_video_provider("DomoAI")
        assert isinstance(provider, DomoAIProvider)


class TestDomoAIProviderDownloadVideo:
    """download_video_bytes メソッドのテスト"""

    @pytest.mark.asyncio
    async def test_download_video_bytes_success(self):
        """動画ダウンロードが成功すること"""
        provider = DomoAIProvider()

        # check_status のモック
        mock_check_status = AsyncMock(return_value=MagicMock(
            video_url="https://domoai.example.com/video.mp4"
        ))
        provider.check_status = mock_check_status

        # httpx.AsyncClient のモック
        mock_response = MagicMock()
        mock_response.content = b"fake_video_bytes"
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance
            mock_instance.get.return_value = mock_response

            video_bytes = await provider.download_video_bytes("test-task-123")

        assert video_bytes == b"fake_video_bytes"

    @pytest.mark.asyncio
    async def test_download_video_bytes_no_url(self):
        """動画URLがない場合はNoneを返すこと"""
        provider = DomoAIProvider()

        mock_check_status = AsyncMock(return_value=MagicMock(video_url=None))
        provider.check_status = mock_check_status

        video_bytes = await provider.download_video_bytes("test-task-123")
        assert video_bytes is None
