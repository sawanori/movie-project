"""
OpenAITTSProvider のテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from typing import Optional


class TestOpenAITTSProvider:
    """OpenAITTSProvider のテスト"""

    def test_provider_name_returns_openai_tts(self):
        """provider_name が 'openai_tts' を返す"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        assert provider.provider_name == "openai_tts"

    def test_is_synchronous_returns_true(self):
        """OpenAI TTS は同期プロバイダーなので is_synchronous が True を返す"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        assert provider.is_synchronous is True

    @pytest.mark.asyncio
    async def test_generate_speech_success(self):
        """generate_speech が成功して audio_url を返す"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        mock_audio_bytes = b"fake_audio_bytes"
        mock_audio_url = "https://r2.example.com/audio/test.mp3"

        with patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = mock_audio_bytes
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.openai_tts_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value=mock_audio_url)

                result = await provider.generate_speech(
                    text="Hello world",
                    voice_id="alloy",
                    language="en",
                    speed=1.0,
                )

        assert result == mock_audio_url

    @pytest.mark.asyncio
    async def test_generate_speech_api_error(self):
        """generate_speech が API エラーを適切に処理する"""
        from app.external.openai_tts_provider import OpenAITTSProvider
        import httpx

        provider = OpenAITTSProvider()

        with patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_response.raise_for_status = MagicMock(
                side_effect=httpx.HTTPStatusError(
                    "Unauthorized",
                    request=MagicMock(),
                    response=mock_response,
                )
            )

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with pytest.raises(Exception):
                await provider.generate_speech(
                    text="Hello",
                    voice_id="alloy",
                )

    @pytest.mark.asyncio
    async def test_list_voices_returns_hardcoded_openai_voices(self):
        """list_voices が OpenAI のハードコードされた音声リストを返す"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        voices = await provider.list_voices()

        expected_voice_ids = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
        returned_voice_ids = {v["voice_id"] for v in voices}

        assert returned_voice_ids == expected_voice_ids

    @pytest.mark.asyncio
    async def test_list_voices_with_language_filter(self):
        """list_voices は言語フィルタを受け付けるが OpenAI 音声は全言語対応なので全件返す"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        voices = await provider.list_voices(language="ja")

        # OpenAI TTS は全言語対応なので言語フィルタしても全件返す
        assert len(voices) == 6

    def test_default_model_is_gpt_4o_mini_tts(self):
        """デフォルトモデルが 'gpt-4o-mini-tts' になっている"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        assert provider._model == "gpt-4o-mini-tts"

    @pytest.mark.asyncio
    async def test_generate_speech_includes_instructions_for_japanese(self):
        """language='ja' かつ instructions=None の場合、デフォルト instructions が payload に含まれる"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()

        with patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.openai_tts_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="こんにちは",
                    voice_id="alloy",
                    language="ja",
                    instructions=None,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")
        assert "instructions" in request_body
        assert len(request_body["instructions"]) > 0

    @pytest.mark.asyncio
    async def test_generate_speech_custom_instructions(self):
        """instructions を明示的に指定した場合、その値が payload に使われる"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        custom_instructions = "穏やかで自然な日本語のナレーション"

        with patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.openai_tts_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="こんにちは",
                    voice_id="nova",
                    language="ja",
                    instructions=custom_instructions,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")
        assert request_body["instructions"] == custom_instructions

    @pytest.mark.asyncio
    async def test_generate_speech_no_instructions_for_english(self):
        """language='en' かつ instructions=None の場合、instructions フィールドが payload に含まれない"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()

        with patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.openai_tts_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="Hello world",
                    voice_id="alloy",
                    language="en",
                    instructions=None,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")
        assert "instructions" not in request_body

    @pytest.mark.asyncio
    async def test_tts_request_format_matches_audio_speech_endpoint(self):
        """payload に model, input, voice, speed が含まれ、日本語時は instructions も含まれる"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()

        with patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.openai_tts_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="テストナレーション",
                    voice_id="shimmer",
                    language="ja",
                    speed=1.0,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")

        assert request_body["model"] == "gpt-4o-mini-tts"
        assert request_body["input"] == "テストナレーション"
        assert request_body["voice"] == "shimmer"
        assert request_body["speed"] == 1.0
        assert "instructions" in request_body
