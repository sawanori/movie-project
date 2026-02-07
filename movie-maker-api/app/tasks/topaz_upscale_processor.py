"""
Topaz Enhancement アップスケールプロセッサ

ユーザーアップロード動画のTopaz Video AI Enhancement アップスケール処理
"""
import logging
import os
import tempfile
import time
import uuid

import httpx

from app.core.supabase import get_supabase
from app.services.topaz_service import get_topaz_service, TopazServiceError
from app.services.ffmpeg_service import get_ffmpeg_service
from app.external.r2 import upload_user_video as r2_upload_user_video

logger = logging.getLogger(__name__)


async def update_upscale_status(
    supabase,
    upscale_id: str,
    status: str = None,
    progress: int = None,
    upscaled_video_url: str = None,
    thumbnail_url: str = None,
    topaz_request_id: str = None,
    error_message: str = None,
    estimated_credits_min: int = None,
    estimated_credits_max: int = None,
    estimated_time_min: int = None,
    estimated_time_max: int = None,
) -> None:
    """user_video_upscales テーブルのステータスを更新"""
    update_data = {}
    if status is not None:
        update_data["status"] = status
    if progress is not None:
        update_data["progress"] = progress
    if upscaled_video_url is not None:
        update_data["upscaled_video_url"] = upscaled_video_url
    if thumbnail_url is not None:
        update_data["thumbnail_url"] = thumbnail_url
    if topaz_request_id is not None:
        update_data["topaz_request_id"] = topaz_request_id
    if error_message is not None:
        update_data["error_message"] = error_message
    if estimated_credits_min is not None:
        update_data["estimated_credits_min"] = estimated_credits_min
    if estimated_credits_max is not None:
        update_data["estimated_credits_max"] = estimated_credits_max
    if estimated_time_min is not None:
        update_data["estimated_time_min"] = estimated_time_min
    if estimated_time_max is not None:
        update_data["estimated_time_max"] = estimated_time_max

    if update_data:
        supabase.table("user_video_upscales").update(update_data).eq("id", upscale_id).execute()


async def process_topaz_upscale(upscale_id: str) -> None:
    """
    Topaz Enhancement アップスケール処理のメイン関数

    処理フロー:
    1. DBからタスク取得（user_video_upscales テーブル）
    2. ステータスを processing に更新
    3. TopazVideoService.enhance_video() 呼び出し
    4. 結果動画をR2にアップロード
    5. FFmpegでサムネイル生成
    6. サムネイルをR2にアップロード
    7. ステータスを completed に更新
    8. user_videos テーブルの upscaled_video_url を更新
    """
    supabase = get_supabase()
    topaz = get_topaz_service()

    try:
        # 1. DBからアップスケールタスクを取得
        response = (
            supabase.table("user_video_upscales")
            .select("*")
            .eq("id", upscale_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"Upscale task not found: {upscale_id}")
            return

        upscale = response.data
        original_video_url = upscale["original_video_url"]
        model = upscale.get("model", "prob-4")
        user_id = upscale["user_id"]
        user_video_id = upscale["user_video_id"]
        target_width = upscale["target_width"]
        target_height = upscale["target_height"]

        logger.info(
            f"Starting Topaz upscale for {upscale_id}: "
            f"model={model}, target={target_width}x{target_height}"
        )

        # 2. ステータスを processing に更新
        await update_upscale_status(
            supabase, upscale_id, status="processing", progress=5
        )

        # 進捗更新用コールバック
        async def progress_callback(progress: int):
            await update_upscale_status(
                supabase, upscale_id, progress=progress
            )

        # 3. Topaz Enhancement API呼び出し
        logger.info(f"Calling Topaz Enhancement API for {original_video_url}")

        try:
            result = await topaz.enhance_video(
                video_url=original_video_url,
                model=model,
                target_width=target_width,
                target_height=target_height,
                progress_callback=progress_callback,
            )
        except TopazServiceError as e:
            logger.error(f"Topaz API error: {e}")
            raise Exception(f"Topaz API error: {e}")

        download_url = result.get("download_url")
        topaz_request_id = result.get("request_id")

        if not download_url:
            raise Exception("Topaz APIからダウンロードURLが返されませんでした")

        # topaz_request_id と見積もり情報をDBに保存
        await update_upscale_status(
            supabase,
            upscale_id,
            topaz_request_id=topaz_request_id,
            estimated_credits_min=result.get("estimated_credits_min"),
            estimated_credits_max=result.get("estimated_credits_max"),
            estimated_time_min=result.get("estimated_time_min"),
            estimated_time_max=result.get("estimated_time_max"),
            progress=92,
        )

        logger.info(f"Topaz Enhancement completed: {download_url[:100]}...")

        # 4. 結果動画をR2にアップロード（Topaz URLは有効期限付き）
        temp_video = None
        temp_thumb = None

        try:
            # ストリーミングダウンロード
            logger.info("Downloading upscaled video from Topaz")
            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
                with tempfile.NamedTemporaryFile(suffix="_upscaled.mp4", delete=False) as f:
                    temp_video = f.name
                    async with client.stream("GET", download_url, follow_redirects=True) as resp:
                        resp.raise_for_status()
                        async for chunk in resp.aiter_bytes(chunk_size=8192):
                            f.write(chunk)

            file_size = os.path.getsize(temp_video)
            logger.info(f"Downloaded upscaled video: {file_size} bytes")

            # R2にアップロード
            timestamp = int(time.time())
            video_uuid = str(uuid.uuid4())[:8]
            video_key = f"user_videos/{user_id}/upscaled/{video_uuid}_{timestamp}.mp4"

            with open(temp_video, "rb") as f:
                video_content = f.read()
            upscaled_url = await r2_upload_user_video(video_content, video_key, "video/mp4")
            logger.info(f"Uploaded upscaled video to R2: {upscaled_url}")

            # 5. FFmpegでサムネイル生成
            with tempfile.NamedTemporaryFile(suffix="_thumb.jpg", delete=False) as tmp:
                temp_thumb = tmp.name
            ffmpeg = get_ffmpeg_service()
            await ffmpeg.extract_first_frame(temp_video, temp_thumb)

            # 6. サムネイルをR2にアップロード
            thumb_key = f"user_videos/{user_id}/upscaled/{video_uuid}_{timestamp}_thumb.jpg"
            with open(temp_thumb, "rb") as f:
                thumb_content = f.read()
            thumb_url = await r2_upload_user_video(thumb_content, thumb_key, "image/jpeg")
            logger.info(f"Uploaded upscale thumbnail to R2: {thumb_url}")

            # 7. 完了ステータス更新（try内に移動: 例外時のNameError防止）
            await update_upscale_status(
                supabase,
                upscale_id,
                status="completed",
                progress=100,
                upscaled_video_url=upscaled_url,
                thumbnail_url=thumb_url,
            )

            # 8. user_videos テーブルの upscaled_video_url を更新
            supabase.table("user_videos").update({
                "upscaled_video_url": upscaled_url,
            }).eq("id", user_video_id).execute()

            logger.info(f"Topaz upscale completed: {upscale_id}")

        finally:
            # 一時ファイルをクリーンアップ
            for temp_path in [temp_video, temp_thumb]:
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except Exception as e:
                        logger.warning(f"Failed to delete temp file {temp_path}: {e}")

    except Exception as e:
        logger.exception(f"Topaz upscale failed for {upscale_id}: {e}")

        # 失敗時: Topazジョブのキャンセルを試みる
        try:
            upscale_data = (
                supabase.table("user_video_upscales")
                .select("topaz_request_id")
                .eq("id", upscale_id)
                .single()
                .execute()
            )
            if upscale_data.data and upscale_data.data.get("topaz_request_id"):
                await topaz.cancel_task(upscale_data.data["topaz_request_id"])
                logger.info(f"Cancelled Topaz job for failed upscale {upscale_id}")
        except Exception as cancel_error:
            logger.warning(f"Failed to cancel Topaz job: {cancel_error}")

        await update_upscale_status(
            supabase,
            upscale_id,
            status="failed",
            progress=0,
            error_message=str(e),
        )


async def start_topaz_upscale_processing(upscale_id: str) -> None:
    """
    Topaz Enhancement アップスケール処理をバックグラウンドで開始

    Args:
        upscale_id: アップスケールタスクID
    """
    await process_topaz_upscale(upscale_id)
