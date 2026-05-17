"""
TTS (Text-to-Speech) プロバイダー共通インターフェース

ElevenLabs, OpenAI TTS などを統一的に扱うための抽象化レイヤー
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class TTSStatus:
    """TTS 生成ステータス情報"""
    status: str  # "pending", "processing", "completed", "failed"
    audio_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None


class TTSProviderInterface(ABC):
    """TTS プロバイダーの共通インターフェース"""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """プロバイダー名を返す"""
        pass

    @property
    def is_synchronous(self) -> bool:
        """
        同期プロバイダーかどうか（音声バイトを直接返すか）

        同期プロバイダー（OpenAI TTS, ElevenLabs など）は generate_speech が
        呼び出されると即座に音声URLを返す。

        Returns:
            bool: 同期プロバイダーの場合 True（デフォルト: False）
        """
        return False

    @abstractmethod
    async def generate_speech(
        self,
        text: str,
        voice_id: str,
        language: str = "ja",
        speed: float = 1.0,
        instructions: Optional[str] = None,
    ) -> str:
        """
        音声合成を開始

        Args:
            text: 読み上げテキスト
            voice_id: 音声 ID
            language: 言語コード（デフォルト: "ja"）
            speed: 読み上げ速度（0.25〜4.0）
            instructions: 感情/トーン指定（gpt-4o-mini-tts 等でサポート。非対応プロバイダーは無視）

        Returns:
            str: task_id（非同期プロバイダー）またはオーディオ URL（同期プロバイダー）

        Raises:
            ValueError: テキストが空の場合
            Exception: API エラーの場合
        """
        pass

    @abstractmethod
    async def list_voices(self, language: Optional[str] = None) -> list[dict]:
        """
        利用可能な音声一覧を取得

        Args:
            language: 絞り込み言語コード（None の場合は全言語）

        Returns:
            list[dict]: 音声情報のリスト
        """
        pass

    @abstractmethod
    async def check_status(self, task_id: str) -> TTSStatus:
        """
        生成状況を確認

        Args:
            task_id: generate_speech() で返されたタスク ID

        Returns:
            TTSStatus: 現在のステータス情報
        """
        pass

    @abstractmethod
    async def get_audio_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの音声 URL を取得

        Args:
            task_id: タスク ID

        Returns:
            str: 音声 URL（未完了の場合は None）
        """
        pass


def get_tts_provider(provider_name: Optional[str] = None) -> TTSProviderInterface:
    """
    設定に応じた TTS プロバイダーを返すファクトリー関数

    Args:
        provider_name: プロバイダー名（"elevenlabs", "openai_tts"）。
                       指定がなければ環境変数 TTS_PROVIDER を使用

    Returns:
        TTSProviderInterface: TTS プロバイダーインスタンス
    """
    if provider_name is None:
        from app.core.config import settings
        provider_name = getattr(settings, 'TTS_PROVIDER', 'elevenlabs')

    if provider_name == "openai_tts":
        from app.external.openai_tts_provider import OpenAITTSProvider
        logger.info("Using OpenAI TTS provider")
        return OpenAITTSProvider()
    else:
        from app.external.elevenlabs_provider import ElevenLabsProvider
        logger.info("Using ElevenLabs TTS provider")
        return ElevenLabsProvider()
