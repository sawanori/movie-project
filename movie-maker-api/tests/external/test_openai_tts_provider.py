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
        """language='ja' で instructions を明示的に指定した場合、prefix が先頭に付与される"""
        from app.external.openai_tts_provider import OpenAITTSProvider, JAPANESE_ACCENT_PREFIX

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
        assert request_body["instructions"] == JAPANESE_ACCENT_PREFIX + custom_instructions

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


class TestOpenAITTSProviderDefaultInstructions:
    """デフォルト instructions 強化のテスト"""

    async def _call_generate_speech(self, provider, captured_payload, **kwargs):
        """generate_speech を呼び出してリクエスト payload をキャプチャするヘルパー"""
        async def mock_post(url, json, headers):
            captured_payload.update(json)
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"fake_audio"
            return mock_response

        with patch("app.external.openai_tts_provider.r2_client") as mock_r2, \
             patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_cls:
            mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio.mp3")
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(side_effect=mock_post)
            mock_client_cls.return_value = mock_client

            await provider.generate_speech(**kwargs)

    @pytest.mark.asyncio
    async def test_default_english_instructions_applied_when_instructions_none(self):
        """instructions=None かつ language='ja' で英語デフォルト文が適用される (AC1 / AC10b)"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions=None,
        )

        assert "instructions" in captured_payload
        instructions_sent = captured_payload["instructions"]
        assert "Speak natural Japanese" in instructions_sent
        assert "robotic" in instructions_sent

    @pytest.mark.asyncio
    async def test_default_instructions_applied_when_instructions_empty_string(self):
        """instructions='' でもデフォルト英語文が適用される (AC10b: 空文字防御)"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions="",
        )

        assert "instructions" in captured_payload
        assert "Speak natural Japanese" in captured_payload["instructions"]

    @pytest.mark.asyncio
    async def test_custom_instructions_passed_through(self):
        """language='ja' で instructions='custom' の場合、prefix が先頭に付与される"""
        from app.external.openai_tts_provider import OpenAITTSProvider, JAPANESE_ACCENT_PREFIX

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions="Speak with dramatic excitement",
        )

        assert captured_payload.get("instructions") == JAPANESE_ACCENT_PREFIX + "Speak with dramatic excitement"

    @pytest.mark.asyncio
    async def test_default_instructions_contains_dynamic_intonation(self):
        """B3 反映: After 固有語句 'dynamic intonation' / 'low to high' / 'emotionally charged' が新デフォルトに含まれる"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions="",
        )

        instructions_sent = captured_payload["instructions"]
        assert "dynamic intonation" in instructions_sent
        assert "low to high" in instructions_sent
        assert "emotionally charged" in instructions_sent

    @pytest.mark.asyncio
    async def test_default_instructions_minimum_length(self):
        """B2 反映: 新デフォルト instructions が 380 文字以上 (抑揚指示込み)"""
        from app.external.openai_tts_provider import OpenAITTSProvider

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions=None,
        )

        instructions_sent = captured_payload["instructions"]
        assert len(instructions_sent) >= 380


class TestJapaneseAccentPrefix:
    """JAPANESE_ACCENT_PREFIX 付与ロジックのテスト"""

    async def _call_generate_speech(self, provider, captured_payload, **kwargs):
        """generate_speech を呼び出してリクエスト payload をキャプチャするヘルパー"""
        async def mock_post(url, json, headers):
            captured_payload.update(json)
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"fake_audio"
            return mock_response

        with patch("app.external.openai_tts_provider.r2_client") as mock_r2, \
             patch("app.external.openai_tts_provider.httpx.AsyncClient") as mock_client_cls:
            mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio.mp3")
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(side_effect=mock_post)
            mock_client_cls.return_value = mock_client

            await provider.generate_speech(**kwargs)

    @pytest.mark.asyncio
    async def test_japanese_accent_prefix_prepended_to_default(self):
        """language='ja' かつ instructions=None の場合、先頭に JAPANESE_ACCENT_PREFIX が含まれる"""
        from app.external.openai_tts_provider import OpenAITTSProvider, JAPANESE_ACCENT_PREFIX

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions=None,
        )

        instructions_sent = captured_payload["instructions"]
        assert "Use natural Japanese pitch accent" in instructions_sent
        assert instructions_sent.startswith(JAPANESE_ACCENT_PREFIX)

    @pytest.mark.asyncio
    async def test_japanese_accent_prefix_prepended_to_custom(self):
        """language='ja' で custom instructions 指定時、先頭に JAPANESE_ACCENT_PREFIX が付与される"""
        from app.external.openai_tts_provider import OpenAITTSProvider, JAPANESE_ACCENT_PREFIX

        provider = OpenAITTSProvider()
        captured_payload = {}
        custom = "Calm and natural narration"

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="nova",
            language="ja",
            instructions=custom,
        )

        instructions_sent = captured_payload["instructions"]
        assert instructions_sent == JAPANESE_ACCENT_PREFIX + custom
        assert instructions_sent.startswith(JAPANESE_ACCENT_PREFIX)

    @pytest.mark.asyncio
    async def test_japanese_accent_prefix_not_duplicated(self):
        """instructions が既に JAPANESE_ACCENT_PREFIX で始まる場合、重複付与されない"""
        from app.external.openai_tts_provider import OpenAITTSProvider, JAPANESE_ACCENT_PREFIX

        provider = OpenAITTSProvider()
        captured_payload = {}
        already_prefixed = JAPANESE_ACCENT_PREFIX + "Extra body instructions."

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="こんにちは",
            voice_id="alloy",
            language="ja",
            instructions=already_prefixed,
        )

        instructions_sent = captured_payload["instructions"]
        # prefix が二重に付与されていないこと
        assert instructions_sent == already_prefixed
        assert instructions_sent.count(JAPANESE_ACCENT_PREFIX[:30]) == 1

    @pytest.mark.asyncio
    async def test_english_no_prefix_applied(self):
        """language='en' の場合、JAPANESE_ACCENT_PREFIX は付与されない"""
        from app.external.openai_tts_provider import OpenAITTSProvider, JAPANESE_ACCENT_PREFIX

        provider = OpenAITTSProvider()
        captured_payload = {}

        await self._call_generate_speech(
            provider,
            captured_payload,
            text="Hello world",
            voice_id="alloy",
            language="en",
            instructions=None,
        )

        # language='en' は instructions フィールド自体が payload に含まれない
        assert "instructions" not in captured_payload
        # prefix が含まれていないことも確認
        instructions_sent = captured_payload.get("instructions", "")
        assert JAPANESE_ACCENT_PREFIX not in instructions_sent
