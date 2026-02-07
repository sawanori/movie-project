"""
動画アップスケール処理タスク

- HD (1080p): Runway AI Upscale → FFmpegで1080pにダウンスケール（AI品質維持）
- 4K: Runway Upscale v1 APIを使用（そのまま）
"""

import asyncio
import logging
import os
import tempfile
import time

import httpx

from app.core.supabase import get_supabase
from app.external.runway_provider import RunwayProvider
from app.external.video_provider import VideoGenerationStatus
from app.external.r2 import upload_video
from app.services.ffmpeg_service import get_ffmpeg_service

logger = logging.getLogger(__name__)


async def process_upscale(upscale_id: str) -> None:
    """
    動画アップスケール処理のメイン関数

    Args:
        upscale_id: アップスケールタスクID
    """
    supabase = get_supabase()
    provider = RunwayProvider()

    try:
        # アップスケールタスクを取得
        response = (
            supabase.table("video_upscales")
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
        resolution = upscale["resolution"]
        user_id = upscale.get("user_id", "unknown")

        logger.info(f"Starting upscale for {upscale_id}: {resolution}")

        # ステータスを処理中に更新
        supabase.table("video_upscales").update({
            "status": "processing",
            "progress": 10,
        }).eq("id", upscale_id).execute()

        # Runway Upscale APIを呼び出し（HD/4K共通）
        logger.info(f"Calling Runway upscale API for {original_video_url}")
        task_id = await provider.upscale_video(original_video_url)

        if not task_id:
            raise Exception("Runway Upscale APIからタスクIDが返されませんでした")

        logger.info(f"Runway upscale task created: {task_id}")

        # タスクIDを保存
        supabase.table("video_upscales").update({
            "runway_task_id": task_id,
            "progress": 30,
        }).eq("id", upscale_id).execute()

        # ポーリングで完了を待機
        runway_video_url = await poll_upscale_completion(
            task_id=task_id,
            upscale_id=upscale_id,
            supabase=supabase,
            provider=provider,
            timeout=300,
            interval=5,
        )

        if not runway_video_url:
            raise Exception("アップスケール処理が失敗しました")

        # 解像度に応じて処理を分岐
        if resolution == "hd":
            # HD (1080p): Runway 4K出力を1080pにダウンスケール
            video_url = await process_hd_downscale(
                upscale_id=upscale_id,
                runway_video_url=runway_video_url,
                user_id=user_id,
                supabase=supabase,
            )
        else:
            # 4K: Runway URLをそのまま使用
            video_url = runway_video_url
            logger.info(f"Using Runway URL directly for 4K: {video_url}")

        if not video_url:
            raise Exception("アップスケール処理が失敗しました")

        # 完了に更新
        supabase.table("video_upscales").update({
            "status": "completed",
            "progress": 100,
            "upscaled_video_url": video_url,
        }).eq("id", upscale_id).execute()

        logger.info(f"Upscale completed: {upscale_id}")

    except Exception as e:
        logger.exception(f"Upscale failed for {upscale_id}: {e}")
        supabase.table("video_upscales").update({
            "status": "failed",
            "progress": 0,
            "error_message": str(e),
        }).eq("id", upscale_id).execute()


async def process_hd_downscale(
    upscale_id: str,
    runway_video_url: str,
    user_id: str,
    supabase,
) -> str | None:
    """
    HD (1080p) ダウンスケール処理

    Runway AI Upscaleで4Kにアップスケールされた動画を
    FFmpegで1080pにダウンスケール。AI品質を維持しつつ正確なHD解像度を実現。

    Args:
        upscale_id: アップスケールID
        runway_video_url: Runwayからの4K動画URL
        user_id: ユーザーID
        supabase: Supabaseクライアント

    Returns:
        str: ダウンスケール済み動画URL（R2）
    """
    ffmpeg = get_ffmpeg_service()
    temp_input = None
    temp_output = None

    try:
        logger.info(f"Starting HD downscale for {upscale_id}")

        # 進捗更新
        supabase.table("video_upscales").update({
            "progress": 75,
        }).eq("id", upscale_id).execute()

        # Runway 4K動画をダウンロード
        logger.info(f"Downloading 4K video from Runway: {runway_video_url}")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                runway_video_url,
                timeout=180.0,  # 4K動画は大きいので長めのタイムアウト
                follow_redirects=True,
            )
            response.raise_for_status()
            video_content = response.content

        # 一時ファイルに保存
        with tempfile.NamedTemporaryFile(suffix="_4k.mp4", delete=False) as f:
            temp_input = f.name
            f.write(video_content)

        logger.info(f"Downloaded 4K video to {temp_input} ({len(video_content)} bytes)")

        # 進捗更新
        supabase.table("video_upscales").update({
            "progress": 85,
        }).eq("id", upscale_id).execute()

        # FFmpegで1080pにダウンスケール
        with tempfile.NamedTemporaryFile(suffix="_hd.mp4", delete=False) as f:
            temp_output = f.name

        logger.info(f"Downscaling to HD: {temp_input} -> {temp_output}")
        await ffmpeg.downscale_to_hd(temp_input, temp_output)

        # 進捗更新
        supabase.table("video_upscales").update({
            "progress": 92,
        }).eq("id", upscale_id).execute()

        # R2にアップロード
        with open(temp_output, "rb") as f:
            hd_content = f.read()

        timestamp = int(time.time())
        filename = f"{user_id}/upscaled_hd_{upscale_id}_{timestamp}.mp4"
        r2_url = await upload_video(hd_content, filename)

        logger.info(f"HD video uploaded to R2: {r2_url}")

        return r2_url

    finally:
        # 一時ファイルをクリーンアップ
        for temp_file in [temp_input, temp_output]:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file {temp_file}: {e}")


async def poll_upscale_completion(
    task_id: str,
    upscale_id: str,
    supabase,
    provider: RunwayProvider,
    timeout: int = 300,
    interval: int = 5,
) -> str | None:
    """
    アップスケールタスクの完了をポーリング

    Args:
        task_id: RunwayタスクID
        upscale_id: DBのアップスケールID
        supabase: Supabaseクライアント
        provider: RunwayProvider
        timeout: タイムアウト（秒）
        interval: ポーリング間隔（秒）

    Returns:
        str: 動画URL（成功時）、None（失敗時）
    """
    elapsed = 0
    base_progress = 30
    max_progress = 70  # HDの場合はダウンスケール処理があるので70%まで

    while elapsed < timeout:
        status = await provider.check_status(task_id)

        if status.status == VideoGenerationStatus.COMPLETED:
            return status.video_url
        elif status.status == VideoGenerationStatus.FAILED:
            logger.error(f"Upscale task {task_id} failed: {status.error_message}")
            return None

        # 進捗を更新
        if status.progress > 0:
            current_progress = min(status.progress, max_progress)
        else:
            progress_ratio = min(elapsed / timeout, 1.0)
            current_progress = int(base_progress + (max_progress - base_progress) * progress_ratio)

        supabase.table("video_upscales").update({
            "progress": current_progress,
        }).eq("id", upscale_id).execute()

        await asyncio.sleep(interval)
        elapsed += interval

    logger.error(f"Upscale task {task_id} timed out after {timeout}s")
    return None


async def start_upscale_processing(upscale_id: str) -> None:
    """
    アップスケール処理をバックグラウンドで開始

    Args:
        upscale_id: アップスケールタスクID
    """
    await process_upscale(upscale_id)
