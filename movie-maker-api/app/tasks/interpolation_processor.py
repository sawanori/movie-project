"""
60fps補間処理タスク

Topaz Video APIを使用してフレーム補間を行う。
"""

import asyncio
import logging
import os
import tempfile
import time

import httpx

from app.core.supabase import get_supabase
from app.services.topaz_service import get_topaz_service, TopazServiceError
from app.external.r2 import upload_video

logger = logging.getLogger(__name__)


async def update_interpolation_status(
    supabase,
    interpolation_id: str,
    status: str | None = None,
    progress: int | None = None,
    error_message: str | None = None,
    interpolated_video_url: str | None = None,
) -> None:
    """補間ジョブのステータスを更新"""
    update_data = {}
    if status is not None:
        update_data["status"] = status
    if progress is not None:
        update_data["progress"] = progress
    if error_message is not None:
        update_data["error_message"] = error_message
    if interpolated_video_url is not None:
        update_data["interpolated_video_url"] = interpolated_video_url

    if update_data:
        supabase.table("video_interpolations").update(
            update_data
        ).eq("id", interpolation_id).execute()


async def process_interpolation(interpolation_id: str) -> None:
    """
    60fps補間処理のメイン関数

    Args:
        interpolation_id: 補間タスクID
    """
    supabase = get_supabase()
    topaz = get_topaz_service()

    try:
        # 補間タスクを取得
        response = (
            supabase.table("video_interpolations")
            .select("*")
            .eq("id", interpolation_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"Interpolation task not found: {interpolation_id}")
            return

        interpolation = response.data
        original_video_url = interpolation["original_video_url"]
        model = interpolation.get("model", "apo-8")
        user_id = interpolation.get("user_id", "unknown")

        logger.info(f"Starting interpolation for {interpolation_id}: model={model}")

        # ステータスを処理中に更新
        await update_interpolation_status(
            supabase, interpolation_id, status="processing", progress=5
        )

        # 進捗更新用コールバック
        async def progress_callback(progress: int):
            # 5-90%の範囲でTopaz処理の進捗を報告
            await update_interpolation_status(
                supabase, interpolation_id, progress=progress
            )

        # Topaz Video APIで60fps補間
        logger.info(f"Calling Topaz API for {original_video_url}")

        try:
            interpolated_url = await topaz.interpolate_to_60fps(
                video_url=original_video_url,
                model=model,
                progress_callback=progress_callback,
            )
        except TopazServiceError as e:
            logger.error(f"Topaz API error: {e}")
            raise Exception(f"Topaz API error: {e}")

        if not interpolated_url:
            raise Exception("Topaz APIからURLが返されませんでした")

        logger.info(f"Topaz interpolation completed: {interpolated_url}")

        # 進捗更新
        await update_interpolation_status(
            supabase, interpolation_id, progress=92
        )

        # 補間済み動画をR2にアップロード（Topaz URLからダウンロードして保存）
        final_url = await download_and_upload_to_r2(
            source_url=interpolated_url,
            interpolation_id=interpolation_id,
            user_id=user_id,
        )

        # 完了に更新
        await update_interpolation_status(
            supabase,
            interpolation_id,
            status="completed",
            progress=100,
            interpolated_video_url=final_url,
        )

        logger.info(f"Interpolation completed: {interpolation_id}")

    except Exception as e:
        logger.exception(f"Interpolation failed for {interpolation_id}: {e}")
        await update_interpolation_status(
            supabase,
            interpolation_id,
            status="failed",
            progress=0,
            error_message=str(e),
        )


async def download_and_upload_to_r2(
    source_url: str,
    interpolation_id: str,
    user_id: str,
) -> str:
    """
    Topazからの動画をダウンロードしてR2にアップロード

    Args:
        source_url: Topaz動画URL
        interpolation_id: 補間ID
        user_id: ユーザーID

    Returns:
        str: R2のURL
    """
    temp_file = None

    try:
        # ストリーミングダウンロード
        logger.info(f"Downloading interpolated video from Topaz: {source_url}")

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            with tempfile.NamedTemporaryFile(suffix="_60fps.mp4", delete=False) as f:
                temp_file = f.name
                async with client.stream("GET", source_url, follow_redirects=True) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)

        # ファイルサイズを確認
        file_size = os.path.getsize(temp_file)
        logger.info(f"Downloaded interpolated video: {file_size} bytes")

        # R2にアップロード
        with open(temp_file, "rb") as f:
            video_content = f.read()

        timestamp = int(time.time())
        filename = f"{user_id}/interpolated_60fps_{interpolation_id}_{timestamp}.mp4"
        r2_url = await upload_video(video_content, filename)

        logger.info(f"Uploaded interpolated video to R2: {r2_url}")

        return r2_url

    finally:
        # 一時ファイルをクリーンアップ
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except Exception as e:
                logger.warning(f"Failed to delete temp file {temp_file}: {e}")


async def start_interpolation_processing(interpolation_id: str) -> None:
    """
    60fps補間処理をバックグラウンドで開始

    Args:
        interpolation_id: 補間タスクID
    """
    await process_interpolation(interpolation_id)
