"""
LipSync (Lip Synchronization) ルーター
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile

from app.core.dependencies import get_current_user
from app.lip_sync.schemas import (
    LipSyncRequest,
    LipSyncResponse,
    LipSyncStatusResponse,
    AudioUploadResponse,
)
from app.lip_sync.service import (
    create_lip_sync_generation,
    get_lip_sync_status,
    list_lip_sync_generations,
)
from app.tasks.lip_sync_processor import start_lip_sync_processing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lip-sync", tags=["LipSync"])


@router.post("", response_model=LipSyncResponse)
async def generate_lip_sync(
    request: LipSyncRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    LipSync 生成を開始する

    画像または動画と音声から、口の動きを同期した動画を生成する
    バックグラウンドタスクを起動し、生成レコードを返す。
    """
    user_id = current_user["user_id"]

    # DB に生成レコードを作成
    generation = await create_lip_sync_generation(
        user_id=user_id,
        source_type=request.source_type,
        source_url=request.source_url,
        audio_url=request.audio_url,
    )

    # バックグラウンドタスクを開始
    await start_lip_sync_processing(generation["id"])

    return LipSyncResponse(
        id=generation["id"],
        status=generation["status"],
        progress=generation.get("progress", 0),
        output_video_url=generation.get("output_video_url"),
        created_at=generation.get("created_at", ""),
    )


@router.get("/{generation_id}/status", response_model=LipSyncStatusResponse)
async def get_status(
    generation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    LipSync 生成のステータスを返す

    Args:
        generation_id: 生成 ID
    """
    user_id = current_user["user_id"]
    status = await get_lip_sync_status(user_id, generation_id)

    if status is None:
        raise HTTPException(status_code=404, detail="LipSync generation not found")

    return LipSyncStatusResponse(
        id=status["id"],
        status=status["status"],
        progress=status.get("progress", 0),
        output_video_url=status.get("output_video_url"),
        error_message=status.get("error_message"),
    )


@router.get("", response_model=list[LipSyncResponse])
async def list_generations(
    current_user: dict = Depends(get_current_user),
):
    """
    LipSync 生成履歴を返す（新しい順）
    """
    user_id = current_user["user_id"]
    generations = await list_lip_sync_generations(user_id)

    return [
        LipSyncResponse(
            id=gen["id"],
            status=gen["status"],
            progress=gen.get("progress", 0),
            output_video_url=gen.get("output_video_url"),
            created_at=gen.get("created_at", ""),
        )
        for gen in generations
    ]


@router.post("/upload-audio", response_model=AudioUploadResponse)
async def upload_audio_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    LipSync 用の音声ファイルをアップロードする

    Returns:
        AudioUploadResponse: アップロード先の URL と音声の長さ
    """
    result = await upload_audio_to_r2(file, current_user["user_id"])

    return AudioUploadResponse(
        audio_url=result["audio_url"],
        duration_seconds=result.get("duration_seconds"),
    )


async def upload_audio_to_r2(file: UploadFile, user_id: str) -> dict:
    """
    音声ファイルを R2 にアップロードして URL を返す（内部用）

    Args:
        file: アップロードされたファイル
        user_id: ユーザー ID

    Returns:
        dict: audio_url と duration_seconds を含む辞書
    """
    from app.external.r2 import upload_audio

    allowed_extensions = ["mp3", "wav", "ogg", "m4a", "aac"]
    ext = "mp3"
    if file.filename and "." in file.filename:
        ext = file.filename.split(".")[-1].lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(allowed_extensions)}",
        )

    contents = await file.read()

    # ファイルサイズチェック（50MB 上限）
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    filename = f"lip_sync/audio/{user_id}/{uuid.uuid4()}.{ext}"
    audio_url = await upload_audio(contents, filename)

    logger.info(f"Audio uploaded for lip sync: {filename}, user={user_id}")

    return {"audio_url": audio_url, "duration_seconds": None}
