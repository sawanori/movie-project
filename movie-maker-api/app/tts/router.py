"""
TTS (Text-to-Speech) ルーター
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user
from app.external.tts_provider import get_tts_provider
from app.tts.schemas import TTSRequest, TTSResponse, TTSStatusResponse, VoiceInfo
from app.tts.service import create_tts_generation, get_tts_status
from app.tasks.tts_processor import start_tts_processing

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tts"])


@router.post("/tts", response_model=TTSResponse)
async def generate_tts(
    request: TTSRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    TTS 生成を開始する

    テキストから音声を生成するバックグラウンドタスクを起動し、
    生成レコードを返す。
    """
    user_id = current_user["user_id"]

    # DB に生成レコードを作成
    generation = await create_tts_generation(
        user_id=user_id,
        text=request.text,
        voice_id=request.voice_id,
        language=request.language,
        speed=request.speed,
    )

    # バックグラウンドタスクを開始
    await start_tts_processing(generation["id"])

    return TTSResponse(
        id=generation["id"],
        status=generation["status"],
        audio_url=generation.get("audio_url"),
        duration_seconds=generation.get("duration_seconds"),
        created_at=generation.get("created_at", ""),
    )


@router.get("/tts/voices", response_model=list[VoiceInfo])
async def list_voices(
    lang: Optional[str] = Query(default=None, description="言語コードで絞り込み（例: ja, en）"),
    current_user: dict = Depends(get_current_user),
):
    """
    利用可能な音声一覧を返す

    Args:
        lang: 言語コードで絞り込み（省略時は全言語）
    """
    provider = get_tts_provider()
    voices = await provider.list_voices(language=lang)

    return [
        VoiceInfo(
            voice_id=v["voice_id"],
            name=v["name"],
            language=v.get("language"),
            preview_url=v.get("preview_url"),
        )
        for v in voices
    ]


@router.get("/tts/{generation_id}/status", response_model=TTSStatusResponse)
async def get_status(
    generation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    TTS 生成のステータスを返す

    Args:
        generation_id: 生成 ID
    """
    user_id = current_user["user_id"]
    status = await get_tts_status(user_id, generation_id)

    if status is None:
        raise HTTPException(status_code=404, detail="TTS generation not found")

    return TTSStatusResponse(
        id=status["id"],
        status=status["status"],
        audio_url=status.get("audio_url"),
        duration_seconds=status.get("duration_seconds"),
    )
