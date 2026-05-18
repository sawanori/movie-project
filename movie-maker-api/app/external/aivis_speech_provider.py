"""
Aivis Speech Engine TTS プロバイダー

Aivis Speech Engine (Docker, port 10101) を使用してテキストから音声を生成する。
Voicevox Engine 互換 API (audio_query + synthesis の 2 ステップ) で WAV を生成し
R2 にアップロードする。
同期プロバイダー: generate_speech 呼び出し時に即座に音声 URL を返す。
"""

import logging
from typing import Optional
from uuid import uuid4

import httpx

from app.external.tts_provider import TTSProviderInterface, TTSStatus
from app.external.r2 import r2_client
from app.services.audio_postprocessing import apply_audio_postprocessing

logger = logging.getLogger(__name__)


class AivisSpeechProvider(TTSProviderInterface):
    """Aivis Speech Engine TTS プロバイダー (Voicevox 互換, 日本語ネイティブ)"""

    def __init__(self):
        from app.core.config import settings
        self._api_url = getattr(settings, 'AIVIS_SPEECH_API_URL', 'http://localhost:10101')
        self._warned_about_instructions = False  # 初回のみ WARN

    @property
    def provider_name(self) -> str:
        return "aivis_speech"

    @property
    def is_synchronous(self) -> bool:
        """Aivis Speech は同期プロバイダー（音声バイトを直接返す）"""
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
        Aivis Speech で TTS 生成 (audio_query + synthesis の 2 ステップ)

        Args:
            text: 読み上げテキスト。is_kana=True の場合は AquesTalk カナ記法
                  (例: ダンボ'ール) でアクセント核を指定できる
            voice_id: スタイル ID (数値文字列)
            language: 言語コード (Aivis Speech は日本語専用; 引数は互換性のため受け取る)
            speed: 読み上げ速度 (推奨範囲 0.5-2.0 にクランプ)
            instructions: 無視される (Aivis Speech 非サポート; 初回のみ WARN ログ)
            is_kana: True の場合 AquesTalk カナ表記モードで audio_query を呼び出す。
                     text に AquesTalk カナ記法 (例: ダンボ'ール) を渡してアクセント核を
                     指定する。False (デフォルト) の場合は通常テキスト読み上げ。

        Returns:
            str: R2 にアップロードされた WAV の URL

        Raises:
            ValueError: text が空、または voice_id が数値文字列でない場合
            RuntimeError: Aivis Speech Engine への接続に失敗した場合
            httpx.HTTPStatusError: Aivis Speech Engine が 4xx/5xx を返した場合
        """
        if not text or not text.strip():
            raise ValueError("text must not be empty")

        # instructions は無視、初回のみ WARN
        if instructions and not self._warned_about_instructions:
            logger.warning("Aivis Speech does not support 'instructions' parameter; ignoring.")
            self._warned_about_instructions = True

        # voice_id を int に変換 (string -> int)
        try:
            speaker_id = int(voice_id)
        except (ValueError, TypeError):
            raise ValueError(
                f"Invalid voice_id for Aivis Speech (expected numeric string): {voice_id}"
            )

        try:
            # CPU 推論 + Style-Bert-VITS2 + 48kHz ステレオで重いため長めに設定
            async with httpx.AsyncClient(timeout=300.0) as client:
                # Step 1: audio_query でクエリデータを取得
                # is_kana=True の場合、AquesTalk カナ記法でアクセント核を指定する
                query_response = await client.post(
                    f"{self._api_url}/audio_query",
                    params={
                        "text": text,
                        "speaker": speaker_id,
                        "is_kana": str(is_kana).lower(),  # "true" or "false"
                    },
                )
                query_response.raise_for_status()
                query_data = query_response.json()

                # Step 2: defensive speed clamp (推奨範囲 0.5-2.0)
                query_data["speedScale"] = max(0.5, min(2.0, speed))
                # 音声品質向上: サンプリング → 48kHz、モノラル → ステレオ
                query_data["outputSamplingRate"] = 48000
                query_data["outputStereo"] = True

                # Step 3: synthesis で WAV バイナリを取得
                synth_response = await client.post(
                    f"{self._api_url}/synthesis",
                    params={"speaker": speaker_id},
                    json=query_data,
                )
                synth_response.raise_for_status()
                audio_bytes = synth_response.content  # WAV
        except httpx.ConnectError as e:
            raise RuntimeError(
                f"Failed to connect to Aivis Speech Engine at {self._api_url}. "
                "Is the Docker container running? "
                "Try: docker run --rm -d -p 10101:10101 "
                "-v ~/.local/share/AivisSpeech-Engine:/home/user/.local/share/AivisSpeech-Engine-Dev "
                "ghcr.io/aivis-project/aivisspeech-engine:cpu-latest"
            ) from e

        # 音質後処理 (env で OFF にできる)
        from app.core.config import settings
        if getattr(settings, 'ENABLE_TTS_POSTPROCESSING', True):
            try:
                audio_bytes = await apply_audio_postprocessing(audio_bytes)
                ext = "mp3"
                mime_type = "audio/mpeg"
            except Exception as e:
                logger.warning(f"Audio postprocessing failed, falling back to WAV: {e}")
                ext = "wav"
                mime_type = "audio/wav"
        else:
            ext = "wav"
            mime_type = "audio/wav"

        # R2 アップロード
        audio_key = f"tts/{uuid4().hex}.{ext}"
        audio_url = await r2_client.upload_file(
            file_data=audio_bytes,
            key=audio_key,
            content_type=mime_type,
        )

        logger.info(f"Aivis Speech TTS generated and uploaded: {audio_url}")
        return audio_url

    async def list_voices(self, language: Optional[str] = None) -> list[dict]:
        """
        Aivis Speech /speakers を取得しキャラ × スタイルでフラット化

        Args:
            language: 絞り込み言語コード (Aivis Speech は全て "ja" なので実質フィルタなし)

        Returns:
            list[dict]: フラット化された音声情報リスト。
                        Aivis Speech 未起動時は空リストを返す (WARN ログあり)
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self._api_url}/speakers")
                response.raise_for_status()
                speakers = response.json()
        except httpx.ConnectError:
            logger.warning(
                f"Aivis Speech Engine not reachable at {self._api_url}. "
                "Returning empty voice list. Start Docker: "
                "docker run --rm -d -p 10101:10101 "
                "-v ~/.local/share/AivisSpeech-Engine:/home/user/.local/share/AivisSpeech-Engine-Dev "
                "ghcr.io/aivis-project/aivisspeech-engine:cpu-latest"
            )
            return []

        # フラット化: speakers[].styles[] -> [{voice_id, name, language, preview_url}]
        result = []
        for speaker in speakers:
            speaker_name = speaker.get("name", "Unknown")
            for style in speaker.get("styles", []):
                style_id = style.get("id")
                style_name = style.get("name", "Default")
                if style_id is None:
                    continue
                result.append({
                    "voice_id": str(style_id),
                    "name": f"{speaker_name} ({style_name})",
                    "language": "ja",
                    "preview_url": None,
                })

        return result

    async def check_status(self, task_id: str) -> TTSStatus:
        """
        同期プロバイダーのため常に completed を返す

        Args:
            task_id: generate_speech() が返した audio_url

        Returns:
            TTSStatus: completed ステータス
        """
        return TTSStatus(status="completed", audio_url=task_id)

    async def get_audio_url(self, task_id: str) -> Optional[str]:
        """
        task_id がそのまま audio_url

        Args:
            task_id: generate_speech() が返した audio_url

        Returns:
            str: 音声 URL
        """
        return task_id
