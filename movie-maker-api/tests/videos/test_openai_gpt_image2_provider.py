"""
OpenAIGPTImage2Provider ユニットテスト

全テストは実 API コールなし（モックベース）。
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

import httpx
import openai


@pytest.fixture
def provider():
    """テスト用プロバイダーインスタンス（OPENAI_API_KEY をモック）"""
    with patch("app.core.config.settings") as mock_settings:
        mock_settings.OPENAI_API_KEY = "test-api-key"
        mock_settings.OPENAI_IMAGE_MODEL = "gpt-image-2"
        mock_settings.R2_PUBLIC_URL = "https://r2.example"
        from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider
        p = OpenAIGPTImage2Provider()
        p.api_key = "test-api-key"
        p.model = "gpt-image-2"
        yield p


class TestResolveSize:
    """_resolve_size の単体テスト（同期）"""

    def test_resolve_size_9_16(self, provider):
        assert provider._resolve_size("9:16", None) == "1024x1536"

    def test_resolve_size_16_9(self, provider):
        assert provider._resolve_size("16:9", None) == "1536x1024"

    def test_resolve_size_1_1(self, provider):
        assert provider._resolve_size("1:1", None) == "1024x1024"

    def test_resolve_size_direct_override(self, provider):
        """size を直接指定した場合は aspect_ratio より優先される"""
        assert provider._resolve_size("1:1", "2048x2048") == "2048x2048"

    def test_resolve_size_unknown_aspect_ratio_defaults_to_auto(self, provider):
        """未知のアスペクト比は auto にフォールバックする"""
        assert provider._resolve_size("4:3", None) == "auto"


class TestGenerateImageSuccess:
    """正常系: 画像生成 → R2 アップロード → URL 返却"""

    @pytest.mark.asyncio
    async def test_generate_image_success(self, provider):
        # b64 "aGVsbG8=" = base64("hello")
        mock_response_data = MagicMock()
        mock_response_data.b64_json = "aGVsbG8="

        mock_images_response = MagicMock()
        mock_images_response.data = [mock_response_data]

        mock_images = AsyncMock()
        mock_images.generate = AsyncMock(return_value=mock_images_response)

        mock_client = MagicMock()
        mock_client.images = mock_images

        with patch("app.external.openai_gpt_image2_provider.openai.AsyncOpenAI", return_value=mock_client), \
             patch("app.external.openai_gpt_image2_provider.upload_image", new_callable=AsyncMock) as mock_upload, \
             patch("app.core.config.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "test-api-key"
            mock_settings.OPENAI_IMAGE_MODEL = "gpt-image-2"
            mock_settings.R2_PUBLIC_URL = "https://r2.example"
            mock_upload.return_value = "https://r2.example/images/generated/gpt2_abc123.png"

            from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider
            p = OpenAIGPTImage2Provider()

            result = await p.generate_image(prompt="test prompt", aspect_ratio="9:16")

        assert result.startswith("https://r2.example/images/generated/gpt2_")
        mock_upload.assert_called_once()
        # gpt-image-2 では response_format は禁止 (実 API が 400 を返す)
        call_kwargs = mock_images.generate.call_args.kwargs
        assert "response_format" not in call_kwargs, (
            "gpt-image-2 は response_format パラメータを受け付けない。"
            "削除すること (base64 がデフォルト)。"
        )


class TestGenerateImageErrors:
    """異常系: エラーハンドリング"""

    @pytest.mark.asyncio
    async def test_generate_image_moderation_rejected(self):
        """コンテンツポリシー違反エラーが ValueError に変換される"""
        request = httpx.Request("POST", "https://api.openai.com/v1/images/generations")
        response = httpx.Response(400, request=request, text="{}")
        # gpt-image-2 の実エラーコードは moderation_blocked
        body = {"code": "moderation_blocked", "message": "Your request was rejected by the safety system."}
        bad_request_error = openai.BadRequestError("moderation_blocked", response=response, body=body)

        mock_images = AsyncMock()
        mock_images.generate = AsyncMock(side_effect=bad_request_error)
        mock_client = MagicMock()
        mock_client.images = mock_images

        with patch("app.external.openai_gpt_image2_provider.openai.AsyncOpenAI", return_value=mock_client), \
             patch("app.core.config.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            mock_settings.OPENAI_IMAGE_MODEL = "gpt-image-2"

            from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider
            p = OpenAIGPTImage2Provider()

            with pytest.raises(ValueError) as exc_info:
                await p.generate_image(prompt="test", aspect_ratio="9:16")

        assert "コンテンツポリシー" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generate_image_org_not_verified(self):
        """Org Verification 未完了エラーが ValueError に変換される"""
        request = httpx.Request("POST", "https://api.openai.com/v1/images/generations")
        response = httpx.Response(403, request=request, text="{}")
        permission_error = openai.PermissionDeniedError("permission denied", response=response, body=None)

        mock_images = AsyncMock()
        mock_images.generate = AsyncMock(side_effect=permission_error)
        mock_client = MagicMock()
        mock_client.images = mock_images

        with patch("app.external.openai_gpt_image2_provider.openai.AsyncOpenAI", return_value=mock_client), \
             patch("app.core.config.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            mock_settings.OPENAI_IMAGE_MODEL = "gpt-image-2"

            from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider
            p = OpenAIGPTImage2Provider()

            with pytest.raises(ValueError) as exc_info:
                await p.generate_image(prompt="test", aspect_ratio="9:16")

        assert "Org Verification" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generate_image_rate_limit(self):
        """レート制限エラーが ValueError に変換される"""
        request = httpx.Request("POST", "https://api.openai.com/v1/images/generations")
        response = httpx.Response(429, request=request, text="{}")
        rate_limit_error = openai.RateLimitError("rate limit exceeded", response=response, body=None)

        mock_images = AsyncMock()
        mock_images.generate = AsyncMock(side_effect=rate_limit_error)
        mock_client = MagicMock()
        mock_client.images = mock_images

        with patch("app.external.openai_gpt_image2_provider.openai.AsyncOpenAI", return_value=mock_client), \
             patch("app.core.config.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            mock_settings.OPENAI_IMAGE_MODEL = "gpt-image-2"

            from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider
            p = OpenAIGPTImage2Provider()

            with pytest.raises(ValueError) as exc_info:
                await p.generate_image(prompt="test", aspect_ratio="9:16")

        assert "レート制限" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generate_image_r2_upload_failure(self):
        """R2 アップロード失敗時に VideoProviderError が発生しメッセージが正しい"""
        from botocore.exceptions import ClientError
        from app.external.video_provider import VideoProviderError

        mock_response_data = MagicMock()
        mock_response_data.b64_json = "aGVsbG8="

        mock_images_response = MagicMock()
        mock_images_response.data = [mock_response_data]

        mock_images = AsyncMock()
        mock_images.generate = AsyncMock(return_value=mock_images_response)

        mock_client = MagicMock()
        mock_client.images = mock_images

        client_error = ClientError(
            {"Error": {"Code": "InternalError", "Message": "upload failed"}},
            "PutObject",
        )

        with patch("app.external.openai_gpt_image2_provider.openai.AsyncOpenAI", return_value=mock_client), \
             patch("app.external.openai_gpt_image2_provider.upload_image", new_callable=AsyncMock) as mock_upload, \
             patch("app.core.config.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "test-api-key"
            mock_settings.OPENAI_IMAGE_MODEL = "gpt-image-2"
            mock_upload.side_effect = client_error

            from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider
            p = OpenAIGPTImage2Provider()

            with pytest.raises(VideoProviderError) as exc_info:
                await p.generate_image(prompt="test", aspect_ratio="9:16")

        assert "生成された画像のアップロードに失敗しました。再試行してください。" in str(exc_info.value)
