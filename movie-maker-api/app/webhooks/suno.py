"""
Suno API Webhook Handler

SunoAPI.orgからのコールバックを受け取り、BGM生成結果をDBに保存します。

Sunoは複数回コールバックを送信します:
- callbackType: "text" - テキスト生成完了
- callbackType: "first" - 最初の音声生成完了
- callbackType: "complete" - 全ての音声生成完了
"""
import logging
from fastapi import APIRouter, Request, HTTPException, Query
from typing import Optional, List, Any, Dict
from pydantic import BaseModel

from app.core.supabase import get_supabase
from app.external.r2 import r2_client

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


class SunoSongData(BaseModel):
    """Suno APIからの曲データ"""
    id: str
    title: Optional[str] = None
    audio_url: Optional[str] = None
    source_audio_url: Optional[str] = None
    video_url: Optional[str] = None
    image_url: Optional[str] = None
    model_name: Optional[str] = None
    status: Optional[str] = None
    duration: Optional[float] = None
    tags: Optional[str] = None
    prompt: Optional[str] = None

    class Config:
        extra = "ignore"


@router.post("/suno")
async def suno_webhook(
    request: Request,
    bgm_id: str = Query(..., description="BGM generation ID"),
):
    """
    Suno API Webhookを処理

    SunoAPI.orgが音楽生成完了時にこのエンドポイントにPOSTします。
    結果をDBに保存し、BGM生成ステータスを更新します。
    """
    try:
        body = await request.json()
        logger.info(f"Suno webhook received for bgm_id={bgm_id}")

        code = body.get("code")
        msg = body.get("msg", "")
        data_wrapper = body.get("data", {})

        # data is a nested object: { callbackType, data: [...songs], task_id }
        if isinstance(data_wrapper, dict):
            callback_type = data_wrapper.get("callbackType", "unknown")
            songs_data = data_wrapper.get("data", [])
            task_id = data_wrapper.get("task_id")
        else:
            # Fallback for direct list format
            callback_type = "complete"
            songs_data = data_wrapper if isinstance(data_wrapper, list) else []
            task_id = None

        logger.info(f"Callback type: {callback_type}, songs count: {len(songs_data)}")

        supabase = get_supabase()

        # Check if generation was successful
        if code != 200:
            error_msg = msg or "Unknown error from Suno API"
            logger.error(f"Suno generation failed: {error_msg}")

            supabase.table("bgm_generations").update({
                "status": "failed",
                "error_message": error_msg,
            }).eq("id", bgm_id).execute()

            return {"status": "error", "message": error_msg}

        # Only process "complete" or "first" callbacks (when audio is ready)
        if callback_type not in ["complete", "first"]:
            logger.info(f"Ignoring callback type: {callback_type}")
            return {"status": "ok", "message": f"Ignored callback type: {callback_type}"}

        # Find a song with audio_url
        song = None
        for s in songs_data:
            try:
                parsed = SunoSongData(**s)
                if parsed.audio_url or parsed.source_audio_url:
                    song = parsed
                    break
            except Exception as e:
                logger.warning(f"Failed to parse song data: {e}")
                continue

        if not song:
            if callback_type == "first":
                # First callback might not have all audio ready, wait for complete
                logger.info(f"No audio URL in first callback, waiting for complete")
                return {"status": "ok", "message": "Waiting for complete callback"}
            else:
                logger.error(f"No audio URL in Suno response for bgm_id={bgm_id}")
                supabase.table("bgm_generations").update({
                    "status": "failed",
                    "error_message": "No audio URL returned",
                }).eq("id", bgm_id).execute()
                return {"status": "error", "message": "No audio URL"}

        # Get the audio URL (prefer audio_url, fallback to source_audio_url)
        audio_url = song.audio_url or song.source_audio_url

        if not audio_url:
            logger.error(f"No valid audio URL for bgm_id={bgm_id}")
            return {"status": "error", "message": "No valid audio URL"}

        # Download and upload audio to R2 for permanent storage
        try:
            bgm_url = await _upload_audio_to_r2(audio_url, bgm_id)
        except Exception as e:
            logger.error(f"Failed to upload audio to R2: {e}")
            # Use original URL as fallback
            bgm_url = audio_url

        # Update BGM generation record with success
        update_data = {
            "status": "completed",
            "progress": 100,
            "bgm_url": bgm_url,
            "bgm_duration_seconds": song.duration,
            "suno_task_id": song.id,
            "error_message": None,
        }

        supabase.table("bgm_generations").update(
            update_data
        ).eq("id", bgm_id).execute()

        logger.info(f"BGM generation completed: bgm_id={bgm_id}, url={bgm_url}, duration={song.duration}s")

        return {"status": "ok", "bgm_id": bgm_id, "audio_url": bgm_url}

    except Exception as e:
        logger.exception(f"Error processing Suno webhook: {e}")

        # Try to update the record with error status
        try:
            supabase = get_supabase()
            supabase.table("bgm_generations").update({
                "status": "failed",
                "error_message": str(e),
            }).eq("id", bgm_id).execute()
        except Exception:
            pass

        raise HTTPException(status_code=500, detail=str(e))


async def _upload_audio_to_r2(audio_url: str, bgm_id: str) -> str:
    """
    Download audio from Suno and upload to R2 for permanent storage.

    Args:
        audio_url: URL of the generated audio from Suno
        bgm_id: BGM generation ID for naming

    Returns:
        str: R2 public URL for the audio
    """
    import httpx

    logger.info(f"Downloading audio from: {audio_url}")

    # Download from Suno
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(audio_url)
        response.raise_for_status()
        audio_data = response.content

    logger.info(f"Downloaded {len(audio_data)} bytes")

    # Determine file extension
    content_type = response.headers.get("content-type", "audio/mpeg")
    if "mp3" in content_type or "mpeg" in content_type:
        ext = "mp3"
    elif "wav" in content_type:
        ext = "wav"
    else:
        ext = "mp3"  # Default to mp3

    # Upload to R2
    r2_key = f"bgm/{bgm_id}.{ext}"
    r2_url = await r2_client.upload_file(audio_data, r2_key, content_type)

    logger.info(f"Uploaded BGM to R2: {r2_key}")
    return r2_url
