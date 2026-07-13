"""
TTSProviderInterface のテスト
"""
import pytest
from typing import Optional


class TestTTSProviderInterface:
    """TTSProviderInterface 抽象クラスのテスト"""

    def test_abstract_class_cannot_be_instantiated(self):
        """抽象クラスは直接インスタンス化できない"""
        from app.external.tts_provider import TTSProviderInterface

        with pytest.raises(TypeError):
            TTSProviderInterface()

    def test_concrete_subclass_must_implement_all_abstract_methods(self):
        """具象サブクラスはすべての抽象メソッドを実装しなければならない"""
        from app.external.tts_provider import TTSProviderInterface, TTSStatus

        # 抽象メソッドを実装しない不完全な具象クラス
        class IncompleteProvider(TTSProviderInterface):
            @property
            def provider_name(self) -> str:
                return "incomplete"

        # generate_speech, list_voices, check_status, get_audio_url が未実装
        with pytest.raises(TypeError):
            IncompleteProvider()

    def test_is_synchronous_defaults_to_false(self):
        """is_synchronous はデフォルトで False を返す"""
        from app.external.tts_provider import TTSProviderInterface, TTSStatus

        class MinimalProvider(TTSProviderInterface):
            @property
            def provider_name(self) -> str:
                return "minimal"

            async def generate_speech(self, text: str, voice_id: str, language: str = "ja", speed: float = 1.0) -> str:
                return "task_id"

            async def list_voices(self, language: Optional[str] = None) -> list:
                return []

            async def check_status(self, task_id: str):
                return TTSStatus(status="pending", audio_url=None, duration_seconds=None, error_message=None)

            async def get_audio_url(self, task_id: str) -> Optional[str]:
                return None

        provider = MinimalProvider()
        assert provider.is_synchronous is False

    def test_tts_status_dataclass_creation(self):
        """TTSStatus データクラスが正しく作成できる"""
        from app.external.tts_provider import TTSStatus

        status = TTSStatus(
            status="completed",
            audio_url="https://example.com/audio.mp3",
            duration_seconds=3.5,
            error_message=None,
        )

        assert status.status == "completed"
        assert status.audio_url == "https://example.com/audio.mp3"
        assert status.duration_seconds == 3.5
        assert status.error_message is None

    def test_tts_status_with_error(self):
        """TTSStatus がエラー状態を表現できる"""
        from app.external.tts_provider import TTSStatus

        status = TTSStatus(
            status="failed",
            audio_url=None,
            duration_seconds=None,
            error_message="API error occurred",
        )

        assert status.status == "failed"
        assert status.audio_url is None
        assert status.error_message == "API error occurred"
