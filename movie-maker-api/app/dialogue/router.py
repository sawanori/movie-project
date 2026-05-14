"""
Dialogue (TTS ミックス) ルーター

POST /dialogue  — Dialogue 生成を開始する
GET  /dialogue/{generation_id}/status  — ステータスを返す
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.dialogue.schemas import (
    DialogueCreateRequest,
    DialogueCreateResponse,
    DialogueStatusResponse,
)
from app.dialogue.service import create_dialogue_generation, get_dialogue_status
from app.tasks.dialogue_processor import start_dialogue_processing

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dialogue"])


@router.post("/dialogue", response_model=DialogueCreateResponse)
async def create_dialogue(
    request: DialogueCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Dialogue 生成を開始する

    動画 URL + セリフテキスト → TTS → ffmpeg ミックス → 合成動画 URL
    """
    user_id = current_user["user_id"]

    record = await create_dialogue_generation(
        user_id=user_id,
        video_url=request.video_url,
        text=request.text,
        voice_id=request.voice_id,
        language=request.language,
        speed=request.speed,
    )

    # バックグラウンドタスクを起動
    await start_dialogue_processing(record["id"])

    return DialogueCreateResponse(
        id=record["id"],
        status=record["status"],
        created_at=record.get("created_at", ""),
    )


@router.get("/dialogue/{generation_id}/status", response_model=DialogueStatusResponse)
async def get_status(
    generation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Dialogue 生成のステータスを返す"""
    user_id = current_user["user_id"]

    record = await get_dialogue_status(user_id, generation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Not found")

    return DialogueStatusResponse(
        id=record["id"],
        status=record["status"],
        output_video_url=record.get("output_video_url"),
        error_message=record.get("error_message"),
    )
