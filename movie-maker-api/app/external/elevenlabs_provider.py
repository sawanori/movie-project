"""
ElevenLabs TTS プロバイダー

ElevenLabs API を使用してテキストから音声を生成する。
同期プロバイダー: generate_speech 呼び出し時に即座に音声 URL を返す。
"""

import logging
from typing import Optional
from uuid import uuid4

import httpx

from app.external.tts_provider import TTSProviderInterface, TTSStatus
from app.external.r2 import r2_client

logger = logging.getLogger(__name__)

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

# ElevenLabs Premade Voice IDs (公開、voices_read 権限なしでも使用可能)
# 全て eleven_multilingual_v2 対応で日本語 OK
_PREMADE_VOICES_FALLBACK: list[dict] = [
    {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "language": "en", "preview_url": None},
    {"voice_id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "language": "en", "preview_url": None},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "language": "en", "preview_url": None},
    {"voice_id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "language": "en", "preview_url": None},
    {"voice_id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "language": "en", "preview_url": None},
    {"voice_id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam", "language": "en", "preview_url": None},
    {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "language": "en", "preview_url": None},
    {"voice_id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "language": "en", "preview_url": None},
    {"voice_id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "language": "en", "preview_url": None},
    {"voice_id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam", "language": "en", "preview_url": None},
    {"voice_id": "ThT5KcBeYPX3keUQqHPh", "name": "Dorothy", "language": "en", "preview_url": None},
    {"voice_id": "bVMeCyTHy58xNoL34h3p", "name": "Jeremy", "language": "en", "preview_url": None},
    {"voice_id": "z9fAnlkpzviPz146aGWa", "name": "Glinda", "language": "en", "preview_url": None},
    {"voice_id": "GBv7mTt0atIp3Br8iCZE", "name": "Thomas", "language": "en", "preview_url": None},
    {"voice_id": "g5CIjZEefAph4nQFvHAz", "name": "Ethan", "language": "en", "preview_url": None},
    {"voice_id": "JBFqnCBsd6RMkjVDRZzb", "name": "George", "language": "en", "preview_url": None},
    {"voice_id": "N2lVS1w4EtoT3dr4eOWO", "name": "Callum", "language": "en", "preview_url": None},
    {"voice_id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "language": "en", "preview_url": None},
    {"voice_id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice", "language": "en", "preview_url": None},
    {"voice_id": "iP95p4xoKVk53GoZ742B", "name": "Chris", "language": "en", "preview_url": None},
    {"voice_id": "nPczCjzI2devNBz1zQrb", "name": "Brian", "language": "en", "preview_url": None},
    {"voice_id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "language": "en", "preview_url": None},
    {"voice_id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily", "language": "en", "preview_url": None},
    {"voice_id": "pqHfZKP75CvOlQylNhV4", "name": "Bill", "language": "en", "preview_url": None},
]


class ElevenLabsProvider(TTSProviderInterface):
    """ElevenLabs TTS プロバイダー"""

    def __init__(self):
        from app.core.config import settings
        self._api_key = getattr(settings, 'ELEVENLABS_API_KEY', '')

    @property
    def provider_name(self) -> str:
        return "elevenlabs"

    @property
    def is_synchronous(self) -> bool:
        """ElevenLabs は同期プロバイダー（音声バイトを直接返す）"""
        return True

    async def generate_speech(
        self,
        text: str,
        voice_id: str,
        language: str = "ja",
        speed: float = 1.0,
    ) -> str:
        """
        ElevenLabs API を使用して音声を生成し、R2 にアップロードして URL を返す

        Args:
            text: 読み上げテキスト
            voice_id: ElevenLabs の音声 ID
            language: 言語コード（ElevenLabs では model_id に影響）
            speed: 読み上げ速度

        Returns:
            str: R2 にアップロードされた音声の URL

        Raises:
            ValueError: テキストが空の場合
            httpx.HTTPStatusError: API エラーの場合
        """
        if not text or not text.strip():
            raise ValueError("text must not be empty")

        url = f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}"

        # 言語に応じてモデルを選択
        model_id = "eleven_multilingual_v2" if language != "en" else "eleven_monolingual_v1"

        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "speed": speed,
            },
        }

        headers = {
            "xi-api-key": self._api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            audio_bytes = response.content

        # R2 にアップロード
        audio_key = f"tts/{uuid4().hex}.mp3"
        audio_url = await r2_client.upload_file(
            file_data=audio_bytes,
            key=audio_key,
            content_type="audio/mpeg",
        )

        logger.info(f"ElevenLabs TTS generated and uploaded: {audio_url}")
        return audio_url

    async def list_voices(self, language: Optional[str] = None) -> list[dict]:
        """
        ElevenLabs の利用可能な音声一覧を取得。
        voices_read 権限がない場合は hardcoded premade 一覧をフォールバックとして返す。

        Args:
            language: 言語コード (例: "ja", "en")。
                      指定時は、ラベル一致 OR 多言語対応 (eleven_multilingual_v2) voice を含める。
                      None の場合は全 voice を返す。

        Returns:
            list[dict]: 音声情報のリスト
        """
        url = f"{ELEVENLABS_API_BASE}/voices"
        headers = {"xi-api-key": self._api_key}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                logger.warning(
                    "ElevenLabs /voices returned 401 (likely missing voices_read permission). "
                    "Falling back to hardcoded premade voice list. "
                    "Add voices_read permission to your API key to see your custom voices: "
                    "https://elevenlabs.io/app/settings/api-keys"
                )
                # Fallback to hardcoded list. 多言語 voice なので language filter は全件通過
                return list(_PREMADE_VOICES_FALLBACK)
            raise

        voices = data.get("voices", [])

        result = []
        for voice in voices:
            labels = voice.get("labels", {})
            voice_language = labels.get("language")

            # 言語フィルタ (緩和): ラベル一致 OR 多言語対応 voice を含める
            if language is not None:
                # ラベル一致なら無条件 OK
                if voice_language == language:
                    pass
                else:
                    # 多言語対応モデルがサポート対象なら含める
                    base_models = voice.get("high_quality_base_model_ids", [])
                    is_multilingual = (
                        "eleven_multilingual_v2" in base_models
                        or "eleven_turbo_v2_5" in base_models
                        or "eleven_multilingual_v1" in base_models
                    )
                    if not is_multilingual:
                        continue  # 多言語非対応 voice はスキップ

            result.append({
                "voice_id": voice["voice_id"],
                "name": voice["name"],
                "language": voice_language,
                "preview_url": voice.get("preview_url"),
            })

        return result

    async def check_status(self, task_id: str) -> TTSStatus:
        """
        ElevenLabs は同期プロバイダーのため、task_id は実際には audio_url。
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
        ElevenLabs は同期プロバイダーのため、task_id が audio_url そのもの。

        Args:
            task_id: generate_speech() が返した audio_url

        Returns:
            str: 音声 URL
        """
        return task_id
