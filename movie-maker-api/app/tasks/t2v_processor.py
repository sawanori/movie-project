"""
T2V (Text-to-Video) 処理タスク

テキストプロンプトから直接動画を生成する処理を行う。
画像なしでプロバイダーAPI（VeoまたはKling）を呼び出す。
"""

import asyncio
import logging
import tempfile
import os

from app.core.supabase import get_supabase
from app.external.video_provider import (
    get_video_provider,
    VideoProviderError,
    VideoGenerationStatus,
)
from app.external.r2 import r2_client
from app.videos.service import update_video_status

logger = logging.getLogger(__name__)


async def process_t2v_generation(video_id: str) -> None:
    """
    T2V動画生成のバックグラウンド処理

    1. DBからレコード取得（generation_mode='t2v'）
    2. プロバイダーを取得してT2Vサポートを確認
    3. generate_video_from_text を呼び出す
    4. check_status でポーリング
    5. 動画バイトをダウンロードしてR2にアップロード
    6. DBステータスを更新

    Args:
        video_id: 動画生成ID
    """
    supabase = get_supabase()

    try:
        # Step 1: レコードを取得
        response = supabase.table("video_generations").select("*").eq("id", video_id).single().execute()
        if not response.data:
            logger.error(f"T2V: Video generation record not found: {video_id}")
            return

        video_data = response.data
        user_id = video_data["user_id"]
        prompt = video_data.get("prompt") or video_data.get("user_prompt", "")
        duration = video_data.get("duration", 5)
        aspect_ratio = video_data.get("aspect_ratio", "9:16")
        provider_name = video_data.get("video_provider")

        await update_video_status(video_id, "processing", progress=5)
        logger.info(f"T2V: Starting text-to-video processing: {video_id}")

        # Step 2: プロバイダーを取得してT2Vサポートを確認
        provider = get_video_provider(provider_name)
        if not provider.supports_t2v:
            raise VideoProviderError(
                f"Provider '{provider.provider_name}' does not support Text-to-Video generation"
            )

        await update_video_status(video_id, "processing", progress=10)

        # Step 3: T2V生成リクエスト
        task_id = await provider.generate_video_from_text(
            prompt=prompt,
            duration=duration,
            aspect_ratio=aspect_ratio,
        )

        logger.info(f"T2V: Provider task created: {task_id}")
        await update_video_status(video_id, "processing", progress=20)

        # Step 4: ポーリングで完了を待つ（最大10分、10秒間隔）
        max_attempts = 60
        video_url = None

        for attempt in range(max_attempts):
            await asyncio.sleep(10)

            status = await provider.check_status(task_id)
            progress = min(20 + (attempt * 1), 70)
            await update_video_status(video_id, "processing", progress=progress)

            if status.status == VideoGenerationStatus.COMPLETED:
                video_url = status.video_url
                logger.info(f"T2V: Provider completed: {video_url}")
                break
            elif status.status == VideoGenerationStatus.FAILED:
                error_msg = status.error_message or "動画生成に失敗しました"
                raise Exception(f"T2V generation failed: {error_msg}")

        else:
            raise Exception("T2V generation timed out")

        await update_video_status(video_id, "processing", progress=75)

        # Step 5: 動画をダウンロードしてR2にアップロード
        with tempfile.TemporaryDirectory() as temp_dir:
            video_bytes = await provider.download_video_bytes(task_id)

            if not video_bytes:
                raise Exception("Failed to download T2V video bytes")

            final_key = f"videos/{user_id}/{video_id}/t2v_final.mp4"
            final_url = await r2_client.upload_file(
                file_data=video_bytes,
                key=final_key,
                content_type="video/mp4",
            )

            if not final_url:
                raise Exception("Failed to upload T2V video to R2")

        await update_video_status(video_id, "processing", progress=95)

        # Step 6: 完了
        await update_video_status(
            video_id,
            status="completed",
            progress=100,
            final_video_url=final_url,
        )

        logger.info(f"T2V: Processing completed: {video_id}")

    except Exception as e:
        logger.exception(f"T2V: Processing failed: {video_id}")
        await update_video_status(
            video_id,
            status="failed",
            progress=0,
            error_message=str(e),
        )


async def start_t2v_processing(video_id: str) -> None:
    """T2V動画処理をバックグラウンドで開始"""
    asyncio.create_task(process_t2v_generation(video_id))
