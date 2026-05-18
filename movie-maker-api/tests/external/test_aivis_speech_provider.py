"""
AivisSpeechProvider のテスト

Aivis Speech Engine (Docker) は不要。httpx.AsyncClient を mock して完全に unit テストする。
"""
import logging
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestAivisSpeechProviderName:
    """provider_name プロパティのテスト"""

    def test_provider_name(self):
        """provider_name が 'aivis_speech' を返す"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        assert provider.provider_name == "aivis_speech"

    def test_is_synchronous_returns_true(self):
        """is_synchronous が True を返す (同期プロバイダー)"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        assert provider.is_synchronous is True

    def test_default_api_url(self):
        """デフォルト API URL が http://localhost:10101"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        assert provider._api_url == "http://localhost:10101"


class TestAivisSpeechGenerateSpeech:
    """generate_speech のテスト"""

    @pytest.mark.asyncio
    async def test_generate_speech_calls_audio_query_and_synthesis(self):
        """audio_query と synthesis の 2 つの POST リクエストが発行される"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        mock_audio_url = "https://r2.example.com/tts/test.wav"

        # audio_query レスポンス
        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        # synthesis レスポンス
        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = b"RIFF....WAV_DATA"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(
            side_effect=[mock_query_response, mock_synth_response]
        )

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value=mock_audio_url)

                result = await provider.generate_speech(
                    text="こんにちは",
                    voice_id="1",
                )

        assert result == mock_audio_url
        assert mock_client.post.call_count == 2

        # 1 回目が audio_query エンドポイント
        first_call_url = mock_client.post.call_args_list[0].args[0]
        assert "/audio_query" in first_call_url

        # 2 回目が synthesis エンドポイント
        second_call_url = mock_client.post.call_args_list[1].args[0]
        assert "/synthesis" in second_call_url

    @pytest.mark.asyncio
    async def test_speed_clamped_to_maximum(self):
        """speed=4.0 は推奨上限 2.0 にクランプされる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = b"WAV"

        captured_synthesis_body: dict = {}

        async def capture_post(url, **kwargs):
            if "/synthesis" in url:
                captured_synthesis_body.update(kwargs.get("json", {}))
                return mock_synth_response
            return mock_query_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=capture_post)

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                await provider.generate_speech(
                    text="テスト",
                    voice_id="1",
                    speed=4.0,
                )

        assert captured_synthesis_body["speedScale"] == 2.0

    @pytest.mark.asyncio
    async def test_speed_clamped_to_minimum(self):
        """speed=0.1 は推奨下限 0.5 にクランプされる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = b"WAV"

        captured_synthesis_body: dict = {}

        async def capture_post(url, **kwargs):
            if "/synthesis" in url:
                captured_synthesis_body.update(kwargs.get("json", {}))
                return mock_synth_response
            return mock_query_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=capture_post)

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                await provider.generate_speech(
                    text="テスト",
                    voice_id="1",
                    speed=0.1,
                )

        assert captured_synthesis_body["speedScale"] == 0.5

    @pytest.mark.asyncio
    async def test_connect_error_raises_runtime_error_with_docker_hint(self):
        """httpx.ConnectError は RuntimeError に変換され Aivis docker hint が含まれる"""
        import httpx
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError) as exc_info:
                await provider.generate_speech(text="テスト", voice_id="1")

        error_message = str(exc_info.value)
        assert "ghcr.io/aivis-project/aivisspeech-engine" in error_message

    @pytest.mark.asyncio
    async def test_invalid_voice_id_raises_value_error(self):
        """数値でない voice_id は ValueError を発生させる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        with pytest.raises(ValueError, match="voice_id"):
            await provider.generate_speech(text="テスト", voice_id="not_a_number")

    @pytest.mark.asyncio
    async def test_empty_text_raises_value_error(self):
        """空のテキストは ValueError を発生させる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        with pytest.raises(ValueError, match="text"):
            await provider.generate_speech(text="", voice_id="1")

    @pytest.mark.asyncio
    async def test_whitespace_only_text_raises_value_error(self):
        """空白のみのテキストは ValueError を発生させる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        with pytest.raises(ValueError, match="text"):
            await provider.generate_speech(text="   ", voice_id="1")

    @pytest.mark.asyncio
    async def test_output_sampling_rate_is_48000(self):
        """synthesis に渡される query_data の outputSamplingRate が 48000"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = b"WAV"

        captured_synthesis_body: dict = {}

        async def capture_post(url, **kwargs):
            if "/synthesis" in url:
                captured_synthesis_body.update(kwargs.get("json", {}))
                return mock_synth_response
            return mock_query_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=capture_post)

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                await provider.generate_speech(text="テスト", voice_id="1")

        assert captured_synthesis_body["outputSamplingRate"] == 48000

    @pytest.mark.asyncio
    async def test_output_stereo_is_true(self):
        """synthesis に渡される query_data の outputStereo が True"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = b"WAV"

        captured_synthesis_body: dict = {}

        async def capture_post(url, **kwargs):
            if "/synthesis" in url:
                captured_synthesis_body.update(kwargs.get("json", {}))
                return mock_synth_response
            return mock_query_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=capture_post)

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                await provider.generate_speech(text="テスト", voice_id="1")

        assert captured_synthesis_body["outputStereo"] is True


class TestAivisSpeechInstructionsWarning:
    """instructions 引数の WARN ログ動作テスト"""

    @pytest.mark.asyncio
    async def test_instructions_warning_only_once(self, caplog):
        """instructions 引数は 1 回目だけ WARN ログが出て 2 回目以降は quiet"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = b"WAV"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(
            side_effect=[
                mock_query_response, mock_synth_response,
                mock_query_response, mock_synth_response,
            ]
        )

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                with caplog.at_level(logging.WARNING, logger="app.external.aivis_speech_provider"):
                    await provider.generate_speech(
                        text="テスト1", voice_id="1", instructions="明るく読んでください"
                    )
                    warn_count_after_first = sum(
                        1 for r in caplog.records
                        if r.levelno == logging.WARNING and "instructions" in r.message
                    )

                    await provider.generate_speech(
                        text="テスト2", voice_id="1", instructions="ゆっくり読んでください"
                    )
                    warn_count_after_second = sum(
                        1 for r in caplog.records
                        if r.levelno == logging.WARNING and "instructions" in r.message
                    )

        assert warn_count_after_first == 1
        assert warn_count_after_second == 1


class TestAivisSpeechListVoices:
    """list_voices のテスト"""

    @pytest.mark.asyncio
    async def test_list_voices_flattens_speakers_and_styles(self):
        """speakers[].styles[] がフラット化されたリストになる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_speakers = [
            {
                "name": "AivisSpeechキャラA",
                "styles": [
                    {"id": 10, "name": "ノーマル"},
                    {"id": 11, "name": "楽しい"},
                ],
            },
            {
                "name": "AivisSpeechキャラB",
                "styles": [
                    {"id": 20, "name": "ノーマル"},
                ],
            },
        ]

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=mock_speakers)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            result = await provider.list_voices()

        assert len(result) == 3

        voice_ids = {v["voice_id"] for v in result}
        assert "10" in voice_ids
        assert "11" in voice_ids
        assert "20" in voice_ids

        names = {v["name"] for v in result}
        assert "AivisSpeechキャラA (ノーマル)" in names
        assert "AivisSpeechキャラA (楽しい)" in names
        assert "AivisSpeechキャラB (ノーマル)" in names

        for voice in result:
            assert voice["language"] == "ja"
            assert voice["preview_url"] is None

    @pytest.mark.asyncio
    async def test_list_voices_returns_empty_on_connect_error(self):
        """Aivis Speech Engine に接続できない場合は空リストを返す"""
        import httpx
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            result = await provider.list_voices()

        assert result == []

    @pytest.mark.asyncio
    async def test_list_voices_skips_styles_without_id(self):
        """id が None のスタイルはスキップされる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()

        mock_speakers = [
            {
                "name": "テストキャラ",
                "styles": [
                    {"id": None, "name": "不明"},  # id なし → スキップ
                    {"id": 5, "name": "ノーマル"},
                ],
            },
        ]

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=mock_speakers)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            result = await provider.list_voices()

        assert len(result) == 1
        assert result[0]["voice_id"] == "5"


class TestAivisSpeechCheckStatusAndGetAudioUrl:
    """check_status / get_audio_url のテスト"""

    @pytest.mark.asyncio
    async def test_check_status_returns_completed(self):
        """check_status は常に completed を返す"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        status = await provider.check_status("https://r2.example.com/tts/abc.wav")

        assert status.status == "completed"
        assert status.audio_url == "https://r2.example.com/tts/abc.wav"

    @pytest.mark.asyncio
    async def test_get_audio_url_returns_task_id(self):
        """get_audio_url は task_id をそのまま返す"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        url = await provider.get_audio_url("https://r2.example.com/tts/abc.wav")

        assert url == "https://r2.example.com/tts/abc.wav"


class TestGetTTSProviderFactoryAivisSpeech:
    """get_tts_provider ファクトリー関数の Aivis Speech 対応テスト"""

    def test_get_tts_provider_returns_aivis_speech(self):
        """provider_name='aivis_speech' で AivisSpeechProvider が返る"""
        from app.external.tts_provider import get_tts_provider
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = get_tts_provider("aivis_speech")
        assert isinstance(provider, AivisSpeechProvider)


class TestAivisSpeechPostprocessingIntegration:
    """ENABLE_TTS_POSTPROCESSING フラグと音質後処理の統合テスト"""

    def _make_base_mocks(self, audio_content: bytes = b"RIFF....WAV_DATA"):
        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value={"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = audio_content

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=[mock_query_response, mock_synth_response])
        return mock_client

    @pytest.mark.asyncio
    async def test_aivis_uses_mp3_when_postprocessing_enabled(self):
        """ENABLE_TTS_POSTPROCESSING=True 時、R2 アップロードのキーが .mp3 で終わる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        mock_client = self._make_base_mocks()
        mock_mp3_bytes = b"\xff\xfb\x90\x00" + b"\x00" * 100

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/test.mp3")
                with patch(
                    "app.external.aivis_speech_provider.apply_audio_postprocessing",
                    new_callable=AsyncMock,
                    return_value=mock_mp3_bytes,
                ):
                    with patch("app.core.config.settings") as mock_settings:
                        mock_settings.ENABLE_TTS_POSTPROCESSING = True
                        await provider.generate_speech(text="こんにちは", voice_id="1")

        upload_call = mock_r2.upload_file.call_args
        key_arg = upload_call.kwargs.get("key") or upload_call.args[1]
        assert key_arg.endswith(".mp3"), f"Expected .mp3 key, got: {key_arg}"
        content_type_arg = upload_call.kwargs.get("content_type") or upload_call.args[2]
        assert content_type_arg == "audio/mpeg", f"Expected audio/mpeg, got: {content_type_arg}"

    @pytest.mark.asyncio
    async def test_aivis_falls_back_to_wav_on_ffmpeg_failure(self, caplog):
        """apply_audio_postprocessing が RuntimeError を送出すると WARN ログ + WAV フォールバック"""
        import logging as _logging
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        mock_client = self._make_base_mocks()

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/test.wav")
                with patch(
                    "app.external.aivis_speech_provider.apply_audio_postprocessing",
                    new_callable=AsyncMock,
                    side_effect=RuntimeError("ffmpeg postprocessing failed: test error"),
                ):
                    with patch("app.core.config.settings") as mock_settings:
                        mock_settings.ENABLE_TTS_POSTPROCESSING = True
                        with caplog.at_level(_logging.WARNING, logger="app.external.aivis_speech_provider"):
                            await provider.generate_speech(text="テスト", voice_id="1")

        assert any("falling back to WAV" in r.message for r in caplog.records), \
            "Expected 'falling back to WAV' in WARNING log"

        upload_call = mock_r2.upload_file.call_args
        key_arg = upload_call.kwargs.get("key") or upload_call.args[1]
        assert key_arg.endswith(".wav"), f"Expected .wav fallback key, got: {key_arg}"

    @pytest.mark.asyncio
    async def test_aivis_skips_postprocessing_when_disabled(self):
        """ENABLE_TTS_POSTPROCESSING=False の場合、apply_audio_postprocessing を呼ばない"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        mock_client = self._make_base_mocks()

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/test.wav")
                with patch(
                    "app.external.aivis_speech_provider.apply_audio_postprocessing",
                    new_callable=AsyncMock,
                ) as mock_postprocess:
                    with patch("app.core.config.settings") as mock_settings:
                        mock_settings.ENABLE_TTS_POSTPROCESSING = False
                        await provider.generate_speech(text="テスト", voice_id="1")

        mock_postprocess.assert_not_called()

        upload_call = mock_r2.upload_file.call_args
        key_arg = upload_call.kwargs.get("key") or upload_call.args[1]
        assert key_arg.endswith(".wav"), f"Expected .wav key when disabled, got: {key_arg}"


class TestAivisSpeechIsKanaMode:
    """is_kana パラメータ (AquesTalk カナ表記モード) のテスト"""

    def _make_mock_client(self, query_data=None, audio_content=b"WAV"):
        mock_query_response = MagicMock()
        mock_query_response.raise_for_status = MagicMock()
        mock_query_response.json = MagicMock(return_value=query_data or {"speedScale": 1.0})

        mock_synth_response = MagicMock()
        mock_synth_response.raise_for_status = MagicMock()
        mock_synth_response.content = audio_content

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=[mock_query_response, mock_synth_response])
        return mock_client

    @pytest.mark.asyncio
    async def test_generate_speech_with_is_kana_true(self):
        """is_kana=True の場合、audio_query の params に is_kana='true' が含まれる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        mock_client = self._make_mock_client()

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                await provider.generate_speech(
                    text="ダンボ'ール",
                    voice_id="1",
                    is_kana=True,
                )

        first_call = mock_client.post.call_args_list[0]
        params = first_call.kwargs.get("params", {})
        assert params.get("is_kana") == "true"

    @pytest.mark.asyncio
    async def test_generate_speech_with_is_kana_false_default(self):
        """is_kana=False (デフォルト) の場合、audio_query の params に is_kana='false' が含まれる"""
        from app.external.aivis_speech_provider import AivisSpeechProvider

        provider = AivisSpeechProvider()
        mock_client = self._make_mock_client()

        with patch("app.external.aivis_speech_provider.httpx.AsyncClient", return_value=mock_client):
            with patch("app.external.aivis_speech_provider.r2_client") as mock_r2:
                mock_r2.upload_file = AsyncMock(return_value="https://r2.example.com/tts/x.wav")

                await provider.generate_speech(
                    text="こんにちは",
                    voice_id="1",
                )

        first_call = mock_client.post.call_args_list[0]
        params = first_call.kwargs.get("params", {})
        assert params.get("is_kana") == "false"
