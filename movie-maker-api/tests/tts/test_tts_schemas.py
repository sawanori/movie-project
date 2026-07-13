"""
TTS スキーマのテスト
"""
import pytest
from pydantic import ValidationError


class TestTTSRequest:
    """TTSRequest スキーマのテスト"""

    def test_valid_tts_request_creation(self):
        """有効な TTSRequest が作成できる"""
        from app.tts.schemas import TTSRequest

        request = TTSRequest(
            text="こんにちは世界",
            voice_id="voice_123",
            language="ja",
            speed=1.0,
        )

        assert request.text == "こんにちは世界"
        assert request.voice_id == "voice_123"
        assert request.language == "ja"
        assert request.speed == 1.0

    def test_tts_request_text_length_validation_empty(self):
        """空のテキストは ValidationError を発生させる"""
        from app.tts.schemas import TTSRequest

        with pytest.raises(ValidationError):
            TTSRequest(
                text="",
                voice_id="voice_123",
            )

    def test_tts_request_speed_validation_out_of_range_low(self):
        """速度が範囲外（低すぎる）の場合は ValidationError を発生させる"""
        from app.tts.schemas import TTSRequest

        with pytest.raises(ValidationError):
            TTSRequest(
                text="テスト",
                voice_id="voice_123",
                speed=0.1,  # min: 0.25
            )

    def test_tts_request_speed_validation_out_of_range_high(self):
        """速度が範囲外（高すぎる）の場合は ValidationError を発生させる"""
        from app.tts.schemas import TTSRequest

        with pytest.raises(ValidationError):
            TTSRequest(
                text="テスト",
                voice_id="voice_123",
                speed=5.0,  # max: 4.0
            )

    def test_tts_request_defaults(self):
        """TTSRequest のデフォルト値が正しい"""
        from app.tts.schemas import TTSRequest

        request = TTSRequest(
            text="テスト",
            voice_id="voice_123",
        )

        assert request.language == "ja"
        assert request.speed == 1.0

    def test_tts_request_text_max_length(self):
        """テキストが最大長を超えると ValidationError を発生させる"""
        from app.tts.schemas import TTSRequest

        with pytest.raises(ValidationError):
            TTSRequest(
                text="a" * 5001,  # max: 5000
                voice_id="voice_123",
            )


class TestTTSResponse:
    """TTSResponse スキーマのテスト"""

    def test_tts_response_creation(self):
        """有効な TTSResponse が作成できる"""
        from app.tts.schemas import TTSResponse

        response = TTSResponse(
            id="gen_123",
            status="pending",
            audio_url=None,
            duration_seconds=None,
            created_at="2026-01-01T00:00:00Z",
        )

        assert response.id == "gen_123"
        assert response.status == "pending"
        assert response.audio_url is None
        assert response.duration_seconds is None
        assert response.created_at == "2026-01-01T00:00:00Z"

    def test_tts_response_with_audio_url(self):
        """audio_url が含まれる TTSResponse が作成できる"""
        from app.tts.schemas import TTSResponse

        response = TTSResponse(
            id="gen_456",
            status="completed",
            audio_url="https://example.com/audio.mp3",
            duration_seconds=3.5,
            created_at="2026-01-01T00:00:00Z",
        )

        assert response.audio_url == "https://example.com/audio.mp3"
        assert response.duration_seconds == 3.5


class TestTTSStatusResponse:
    """TTSStatusResponse スキーマのテスト"""

    def test_tts_status_response_creation(self):
        """有効な TTSStatusResponse が作成できる"""
        from app.tts.schemas import TTSStatusResponse

        response = TTSStatusResponse(
            id="gen_123",
            status="processing",
            audio_url=None,
            duration_seconds=None,
        )

        assert response.id == "gen_123"
        assert response.status == "processing"


class TestVoiceInfo:
    """VoiceInfo スキーマのテスト"""

    def test_voice_info_creation(self):
        """有効な VoiceInfo が作成できる"""
        from app.tts.schemas import VoiceInfo

        voice = VoiceInfo(
            voice_id="voice_123",
            name="Japanese Voice",
            language="ja",
            preview_url="https://example.com/preview.mp3",
        )

        assert voice.voice_id == "voice_123"
        assert voice.name == "Japanese Voice"
        assert voice.language == "ja"
        assert voice.preview_url == "https://example.com/preview.mp3"

    def test_voice_info_optional_fields(self):
        """VoiceInfo の optional フィールドが None を受け付ける"""
        from app.tts.schemas import VoiceInfo

        voice = VoiceInfo(
            voice_id="voice_456",
            name="Generic Voice",
            language=None,
            preview_url=None,
        )

        assert voice.language is None
        assert voice.preview_url is None
