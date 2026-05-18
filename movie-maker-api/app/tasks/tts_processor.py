"""
TTS (Text-to-Speech) 生成のバックグラウンドタスク

TTS プロバイダー → R2 アップロード → DB 更新 の一連の処理を行う
"""

import asyncio
import logging

from app.core.supabase import get_supabase
from app.external.tts_provider import get_tts_provider

logger = logging.getLogger(__name__)

# 非同期プロバイダーのポーリング設定
POLLING_INTERVAL_SECONDS = 5
MAX_POLLING_ATTEMPTS = 60  # 最大5分


async def process_tts_generation(generation_id: str) -> None:
    """
    TTS 生成のバックグラウンド処理

    1. DB から生成レコードを取得
    2. TTS プロバイダーを取得
    3. generate_speech を呼び出し
    4. 同期プロバイダー: 即座に audio_url を取得
       非同期プロバイダー: check_status をポーリング
    5. DB を結果で更新
    """
    supabase = get_supabase()

    try:
        # 生成レコードを取得
        response = (
            supabase.table("tts_generations")
            .select("*")
            .eq("id", generation_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"TTS generation record not found: {generation_id}")
            return

        record = response.data
        text = record["text"]
        voice_id = record["voice_id"]
        language = record.get("language", "ja")
        speed = record.get("speed", 1.0)
        instructions = record.get("instructions")  # None の場合はプロバイダーのデフォルトが適用される

        # ステータスを processing に更新
        _update_status(supabase, generation_id, "processing")
        logger.info(f"Starting TTS processing: {generation_id}")

        # TTS プロバイダーを取得
        provider = get_tts_provider()

        # 音声生成
        task_id_or_url = await provider.generate_speech(
            text=text,
            voice_id=voice_id,
            language=language,
            speed=speed,
            instructions=instructions,
        )

        if provider.is_synchronous:
            # 同期プロバイダー: task_id_or_url は実際には audio_url
            audio_url = task_id_or_url
            duration_seconds = None

            _update_status(
                supabase,
                generation_id,
                "completed",
                audio_url=audio_url,
                duration_seconds=duration_seconds,
            )
            logger.info(f"TTS generation completed (sync): {generation_id}, url={audio_url}")

        else:
            # 非同期プロバイダー: ポーリングでステータスを確認
            task_id = task_id_or_url

            for attempt in range(MAX_POLLING_ATTEMPTS):
                await asyncio.sleep(POLLING_INTERVAL_SECONDS)

                status = await provider.check_status(task_id)

                if status.status == "completed":
                    _update_status(
                        supabase,
                        generation_id,
                        "completed",
                        audio_url=status.audio_url,
                        duration_seconds=status.duration_seconds,
                    )
                    logger.info(f"TTS generation completed (async): {generation_id}")
                    return

                elif status.status == "failed":
                    error_msg = status.error_message or "Provider reported failure"
                    raise Exception(f"TTS provider failed: {error_msg}")

                logger.debug(f"TTS polling attempt {attempt + 1}: {generation_id}, status={status.status}")

            else:
                raise Exception("TTS generation timed out")

    except Exception as e:
        logger.exception(f"TTS processing failed: {generation_id}, error={e}")
        _update_status(
            supabase,
            generation_id,
            "failed",
            error_message=str(e),
        )


async def start_tts_processing(generation_id: str) -> None:
    """TTS 処理をバックグラウンドで開始"""
    asyncio.create_task(process_tts_generation(generation_id))


def _update_status(
    supabase,
    generation_id: str,
    status: str,
    audio_url: str = None,
    duration_seconds: float = None,
    error_message: str = None,
) -> None:
    """TTS 生成ステータスを DB で更新（内部用）"""
    update_data = {"status": status}

    if audio_url is not None:
        update_data["audio_url"] = audio_url
    if duration_seconds is not None:
        update_data["duration_seconds"] = duration_seconds
    if error_message is not None:
        update_data["error_message"] = error_message

    supabase.table("tts_generations").update(update_data).eq("id", generation_id).execute()
