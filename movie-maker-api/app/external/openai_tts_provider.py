"""
OpenAI TTS プロバイダー

OpenAI Text-to-Speech API を使用してテキストから音声を生成する。
同期プロバイダー: generate_speech 呼び出し時に即座に音声 URL を返す。
"""

import logging
from typing import Optional
from uuid import uuid4

import httpx

from app.external.tts_provider import TTSProviderInterface, TTSStatus
from app.external.r2 import r2_client

logger = logging.getLogger(__name__)

OPENAI_TTS_API_URL = "https://api.openai.com/v1/audio/speech"

# 日本語ピッチアクセント指示 prefix (language="ja" 時に instructions 先頭に必ず付与)
JAPANESE_ACCENT_PREFIX = (
    "Use natural Japanese pitch accent (Tokyo dialect standard). "
    "Pay attention to mora-timed rhythm and proper word-level pitch placement. "
    "Sound like a native Japanese speaker, not with a foreign accent. "
)

# OpenAI TTS の利用可能な音声
OPENAI_VOICES = [
    {"voice_id": "alloy", "name": "Alloy", "language": None, "preview_url": None},
    {"voice_id": "echo", "name": "Echo", "language": None, "preview_url": None},
    {"voice_id": "fable", "name": "Fable", "language": None, "preview_url": None},
    {"voice_id": "onyx", "name": "Onyx", "language": None, "preview_url": None},
    {"voice_id": "nova", "name": "Nova", "language": None, "preview_url": None},
    {"voice_id": "shimmer", "name": "Shimmer", "language": None, "preview_url": None},
]


class OpenAITTSProvider(TTSProviderInterface):
    """OpenAI TTS プロバイダー"""

    def __init__(self, model: str = "gpt-4o-mini-tts"):
        from app.core.config import settings
        self._api_key = getattr(settings, 'OPENAI_API_KEY', '')
        self._model = model

    @property
    def provider_name(self) -> str:
        return "openai_tts"

    @property
    def is_synchronous(self) -> bool:
        """OpenAI TTS は同期プロバイダー（音声バイトを直接返す）"""
        return True

    async def generate_speech(
        self,
        text: str,
        voice_id: str,
        language: str = "ja",
        speed: float = 1.0,
        instructions: Optional[str] = None,
        is_kana: bool = False,
    ) -> str:
        """
        OpenAI TTS API を使用して音声を生成し、R2 にアップロードして URL を返す

        Args:
            text: 読み上げテキスト
            voice_id: OpenAI の音声 ID（alloy, echo, fable, onyx, nova, shimmer）
            language: 言語コード（OpenAI TTS は自動検出するため主に無視）
            speed: 読み上げ速度（0.25〜4.0）
            instructions: 感情/トーン指定（例: "穏やかで自然な日本語のナレーション"）。
                          未指定かつ language="ja" の場合はデフォルト日本語 instructions を使用。
            is_kana: 無視される（Voicevox 専用パラメータ）

        Returns:
            str: R2 にアップロードされた音声の URL

        Raises:
            ValueError: テキストが空の場合
            httpx.HTTPStatusError: API エラーの場合
        """
        if not text or not text.strip():
            raise ValueError("text must not be empty")

        # language="ja" の場合、JAPANESE_ACCENT_PREFIX を instructions 先頭に必ず付与する。
        # instructions 未指定 (None / 空文字 / whitespace-only) の場合は
        # デフォルト英語本文 (AC10b: 空文字も「未指定」扱い) に prefix を付与する。
        # instructions が既に prefix で始まる場合は重複付与しない。
        if language == "ja":
            default_body = (
                "Speak natural Japanese with rich emotional expression and dynamic intonation. "
                "Vary pitch widely (low to high), pace (slow to fast), and emphasis to convey "
                "the underlying feelings in the text. Insert natural pauses between phrases. "
                "Use human-like rhythm and avoid any robotic or monotone delivery. Match the "
                "tone to the dialogue's mood (joy, sadness, anger, surprise, etc.) as appropriate, "
                "adding pitch variation on emotionally charged words."
            )
            if not instructions:
                instructions = JAPANESE_ACCENT_PREFIX + default_body
            else:
                if not instructions.startswith(JAPANESE_ACCENT_PREFIX[:30]):
                    instructions = JAPANESE_ACCENT_PREFIX + instructions

        payload = {
            "model": self._model,
            "input": text,
            "voice": voice_id,
            "speed": speed,
        }
        if instructions:
            payload["instructions"] = instructions

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(OPENAI_TTS_API_URL, json=payload, headers=headers)
            response.raise_for_status()
            audio_bytes = response.content

        # R2 にアップロード
        audio_key = f"tts/{uuid4().hex}.mp3"
        audio_url = await r2_client.upload_file(
            file_data=audio_bytes,
            key=audio_key,
            content_type="audio/mpeg",
        )

        logger.info(f"OpenAI TTS generated and uploaded: {audio_url}")
        return audio_url

    async def list_voices(self, language: Optional[str] = None) -> list[dict]:
        """
        OpenAI TTS の音声一覧を返す（ハードコード）

        OpenAI TTS の音声は全言語対応しているため、言語フィルタは無視する。

        Args:
            language: 言語コード（OpenAI 音声は全言語対応のため無視）

        Returns:
            list[dict]: OpenAI TTS の音声リスト
        """
        return list(OPENAI_VOICES)

    async def check_status(self, task_id: str) -> TTSStatus:
        """
        OpenAI TTS は同期プロバイダーのため、task_id は実際には audio_url。
        ステータスは常に completed を返す。

        Args:
            task_id: generate_speech() が返した audio_url

        Returns:
            TTSStatus: completed ステータス
        """
        return TTSStatus(
            status="completed",
            audio_url=task_id,
            duration_seconds=None,
            error_message=None,
        )

    async def get_audio_url(self, task_id: str) -> Optional[str]:
        """
        OpenAI TTS は同期プロバイダーのため、task_id が audio_url そのもの。

        Args:
            task_id: generate_speech() が返した audio_url

        Returns:
            str: 音声 URL
        """
        return task_id
