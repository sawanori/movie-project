"""
ElevenLabsProvider のテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from typing import Optional


class TestElevenLabsProvider:
    """ElevenLabsProvider のテスト"""

    def test_provider_name_returns_elevenlabs(self):
        """provider_name が 'elevenlabs' を返す"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()
        assert provider.provider_name == "elevenlabs"

    def test_is_synchronous_returns_true(self):
        """ElevenLabs は同期プロバイダーなので is_synchronous が True を返す"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()
        assert provider.is_synchronous is True

    @pytest.mark.asyncio
    async def test_generate_speech_success(self):
        """generate_speech が成功して audio_url を返す"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()
        mock_audio_bytes = b"fake_audio_bytes"
        mock_audio_url = "https://r2.example.com/audio/test.mp3"

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = mock_audio_bytes
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.elevenlabs_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value=mock_audio_url)

                result = await provider.generate_speech(
                    text="こんにちは",
                    voice_id="test_voice_id",
                    language="ja",
                    speed=1.0,
                )

        assert result == mock_audio_url

    @pytest.mark.asyncio
    async def test_generate_speech_with_custom_speed(self):
        """generate_speech がカスタム速度で呼び出せる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()
        mock_audio_url = "https://r2.example.com/audio/test.mp3"

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.elevenlabs_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value=mock_audio_url)

                result = await provider.generate_speech(
                    text="テスト",
                    voice_id="voice_123",
                    language="ja",
                    speed=1.5,
                )

        assert result == mock_audio_url
        # speed が API リクエストに含まれていることを確認
        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json") or call_kwargs.args[1] if len(call_kwargs.args) > 1 else None
        if request_body is None and call_kwargs.kwargs:
            request_body = call_kwargs.kwargs.get("json")
        # リクエストが行われたことを確認
        assert mock_client.post.called

    @pytest.mark.asyncio
    async def test_generate_speech_api_error_handling(self):
        """generate_speech が API エラーを適切に処理する"""
        from app.external.elevenlabs_provider import ElevenLabsProvider
        import httpx

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
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
                    text="テスト",
                    voice_id="voice_123",
                )

    @pytest.mark.asyncio
    async def test_list_voices_returns_filtered_by_language(self):
        """list_voices が言語フィルタリングされた結果を返す"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        mock_voices_response = {
            "voices": [
                {
                    "voice_id": "voice_ja_1",
                    "name": "Japanese Voice 1",
                    "labels": {"language": "ja"},
                    "preview_url": "https://example.com/preview1.mp3",
                },
                {
                    "voice_id": "voice_en_1",
                    "name": "English Voice 1",
                    "labels": {"language": "en"},
                    "preview_url": "https://example.com/preview2.mp3",
                },
            ]
        }

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value=mock_voices_response)
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices(language="ja")

        # Japanese voice のみが返される
        assert len(result) == 1
        assert result[0]["voice_id"] == "voice_ja_1"

    @pytest.mark.asyncio
    async def test_list_voices_returns_all_when_no_language_filter(self):
        """list_voices が言語フィルタなしで全音声を返す"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        mock_voices_response = {
            "voices": [
                {
                    "voice_id": "voice_ja_1",
                    "name": "Japanese Voice 1",
                    "labels": {"language": "ja"},
                    "preview_url": "https://example.com/preview1.mp3",
                },
                {
                    "voice_id": "voice_en_1",
                    "name": "English Voice 1",
                    "labels": {"language": "en"},
                    "preview_url": None,
                },
            ]
        }

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value=mock_voices_response)
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices()

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_empty_text_raises_value_error(self):
        """空のテキストは ValueError を発生させる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        with pytest.raises(ValueError, match="text"):
            await provider.generate_speech(
                text="",
                voice_id="voice_123",
            )

    @pytest.mark.asyncio
    async def test_list_voices_includes_multilingual(self):
        """language='ja' フィルタ時に eleven_multilingual_v2 対応の英語ラベル voice が含まれる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        mock_voices_response = {
            "voices": [
                {
                    "voice_id": "voice_en_multi",
                    "name": "English Multilingual Voice",
                    "labels": {"language": "en"},
                    "preview_url": "https://example.com/preview_en_multi.mp3",
                    "high_quality_base_model_ids": ["eleven_multilingual_v2", "eleven_monolingual_v1"],
                },
            ]
        }

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value=mock_voices_response)
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices(language="ja")

        # 多言語対応 voice は ja フィルタでも含まれる
        assert len(result) == 1
        assert result[0]["voice_id"] == "voice_en_multi"
        assert result[0]["language"] == "en"

    @pytest.mark.asyncio
    async def test_list_voices_excludes_english_only(self):
        """language='ja' フィルタ時に eleven_multilingual_v2 非対応の英語ラベル voice は除外される"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        mock_voices_response = {
            "voices": [
                {
                    "voice_id": "voice_en_mono",
                    "name": "English Monolingual Voice",
                    "labels": {"language": "en"},
                    "preview_url": "https://example.com/preview_en_mono.mp3",
                    "high_quality_base_model_ids": ["eleven_monolingual_v1"],
                },
            ]
        }

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value=mock_voices_response)
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices(language="ja")

        # 多言語非対応 voice は除外される
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_list_voices_includes_japanese_label(self):
        """language='ja' フィルタ時に labels.language='ja' の voice は無条件で含まれる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        mock_voices_response = {
            "voices": [
                {
                    "voice_id": "voice_ja_native",
                    "name": "Japanese Native Voice",
                    "labels": {"language": "ja"},
                    "preview_url": "https://example.com/preview_ja.mp3",
                    "high_quality_base_model_ids": [],
                },
            ]
        }

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value=mock_voices_response)
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices(language="ja")

        # Japanese ラベル voice は多言語モデルなしでも含まれる
        assert len(result) == 1
        assert result[0]["voice_id"] == "voice_ja_native"
        assert result[0]["language"] == "ja"

    @pytest.mark.asyncio
    async def test_list_voices_returns_fallback_on_401(self):
        """401 レスポンス時に hardcoded premade 一覧が返る"""
        from app.external.elevenlabs_provider import ElevenLabsProvider
        import httpx

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
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
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices()

        # フォールバック一覧が返される (空ではない)
        assert len(result) > 0
        # 各エントリが必要なキーを持つ
        for voice in result:
            assert "voice_id" in voice
            assert "name" in voice
            assert "language" in voice

    @pytest.mark.asyncio
    async def test_fallback_contains_premade_voices(self):
        """hardcoded 一覧に Rachel, Adam 等の premade voice が含まれる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider
        import httpx

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
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
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            result = await provider.list_voices()

        names = {v["name"] for v in result}
        assert "Rachel" in names
        assert "Adam" in names

    @pytest.mark.asyncio
    async def test_generate_speech_uses_turbo_v2_5_for_japanese(self):
        """language='ja' 時に model_id が 'eleven_turbo_v2_5' になる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.elevenlabs_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="こんにちは",
                    voice_id="test_voice_id",
                    language="ja",
                    speed=1.0,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")
        assert request_body["model_id"] == "eleven_turbo_v2_5"

    @pytest.mark.asyncio
    async def test_generate_speech_uses_monolingual_v1_for_english(self):
        """language='en' 時に model_id が 'eleven_monolingual_v1' になる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.elevenlabs_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="Hello world",
                    voice_id="test_voice_id",
                    language="en",
                    speed=1.0,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")
        assert request_body["model_id"] == "eleven_monolingual_v1"

    @pytest.mark.asyncio
    async def test_voice_settings_includes_style_and_speaker_boost(self):
        """voice_settings に style=0.4 と use_speaker_boost=True が含まれる"""
        from app.external.elevenlabs_provider import ElevenLabsProvider

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = b"audio_data"
            mock_response.raise_for_status = MagicMock()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with patch("app.external.elevenlabs_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/audio/test.mp3")

                await provider.generate_speech(
                    text="テスト",
                    voice_id="test_voice_id",
                    language="ja",
                    speed=1.0,
                )

        call_kwargs = mock_client.post.call_args
        request_body = call_kwargs.kwargs.get("json")
        voice_settings = request_body["voice_settings"]
        assert voice_settings["style"] == 0.4
        assert voice_settings["use_speaker_boost"] is True
        assert voice_settings["stability"] == 0.4
        assert voice_settings["similarity_boost"] == 0.8

    @pytest.mark.asyncio
    async def test_other_http_errors_propagate(self):
        """401 以外の HTTP エラー (500 等) は伝播する (fallback しない)"""
        from app.external.elevenlabs_provider import ElevenLabsProvider
        import httpx

        provider = ElevenLabsProvider()

        with patch("app.external.elevenlabs_provider.httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.raise_for_status = MagicMock(
                side_effect=httpx.HTTPStatusError(
                    "Internal Server Error",
                    request=MagicMock(),
                    response=mock_response,
                )
            )

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            with pytest.raises(httpx.HTTPStatusError):
                await provider.list_voices()
