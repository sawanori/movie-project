"""
LipSync (Lip Synchronization) 生成のバックグラウンドタスク

LipSync プロバイダー → R2 アップロード → DB 更新 の一連の処理を行う
"""

import asyncio
import logging
import tempfile
import os
from typing import Optional

import httpx

from app.core.supabase import get_supabase
from app.external.lip_sync_provider import get_lip_sync_provider

logger = logging.getLogger(__name__)

# ポーリング設定
POLLING_INTERVAL_SECONDS = 5
MAX_POLLING_ATTEMPTS = 72  # 最大6分


async def process_lip_sync_generation(generation_id: str) -> None:
    """
    LipSync 生成のバックグラウンド処理

    1. DB から生成レコードを取得
    2. LipSync プロバイダーを取得
    3. generate_lip_sync を呼び出し
    4. check_status をポーリングして完了を待つ
    5. 完了したら動画を R2 にアップロード
    6. DB を結果で更新
    """
    supabase = get_supabase()

    try:
        # 生成レコードを取得
        response = (
            supabase.table("lip_sync_generations")
            .select("*")
            .eq("id", generation_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"LipSync generation record not found: {generation_id}")
            return

        record = response.data
        source_url = record["source_url"]
        audio_url = record["audio_url"]
        source_type = record.get("source_type", "image")
        provider_name = record.get("provider", "hedra")

        # ステータスを processing に更新
        _update_status(supabase, generation_id, "processing", progress=0)
        logger.info(f"Starting LipSync processing: {generation_id}")

        # LipSync プロバイダーを取得
        provider = get_lip_sync_provider(provider_name)

        # LipSync 生成を開始
        task_id = await provider.generate_lip_sync(
            source_url=source_url,
            audio_url=audio_url,
            source_type=source_type,
        )

        # provider_task_id を DB に保存
        _update_status(supabase, generation_id, "processing", provider_task_id=task_id)
        logger.info(f"LipSync task started: generation_id={generation_id}, task_id={task_id}")

        # ポーリングでステータスを確認
        for attempt in range(MAX_POLLING_ATTEMPTS):
            await asyncio.sleep(POLLING_INTERVAL_SECONDS)

            status = await provider.check_status(task_id)

            if status.status == "completed" and status.video_url:
                # 動画を R2 にアップロード
                r2_url = await upload_to_r2(status.video_url, generation_id)

                _update_status(
                    supabase,
                    generation_id,
                    "completed",
                    progress=100,
                    output_video_url=r2_url,
                )
                logger.info(f"LipSync generation completed: {generation_id}")
                return

            elif status.status == "failed":
                error_msg = status.error_message or "Provider reported failure"
                raise Exception(f"LipSync provider failed: {error_msg}")

            elif status.progress > 0:
                # 進捗を更新
                _update_status(supabase, generation_id, "processing", progress=status.progress)

            logger.debug(
                f"LipSync polling attempt {attempt + 1}: "
                f"generation_id={generation_id}, status={status.status}, progress={status.progress}"
            )

        else:
            raise Exception("LipSync generation timed out")

    except Exception as e:
        logger.exception(f"LipSync processing failed: {generation_id}, error={e}")
        _update_status(
            supabase,
            generation_id,
            "failed",
            error_message=str(e),
        )


async def start_lip_sync_processing(generation_id: str) -> None:
    """LipSync 処理をバックグラウンドで開始"""
    asyncio.create_task(process_lip_sync_generation(generation_id))


async def upload_to_r2(video_url: str, generation_id: str) -> str:
    """
    動画を R2 にアップロードして URL を返す

    Args:
        video_url: ダウンロード元の動画 URL
        generation_id: 生成 ID（ファイル名に使用）

    Returns:
        str: R2 の動画 URL
    """
    from app.external.r2 import upload_video

    temp_file = None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            with tempfile.NamedTemporaryFile(suffix="_lip_sync.mp4", delete=False) as f:
                temp_file = f.name
                async with client.stream("GET", video_url, follow_redirects=True) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)

        with open(temp_file, "rb") as f:
            video_content = f.read()

        r2_url = await upload_video(
            video_content,
            f"lip_sync_{generation_id}.mp4",
        )
        logger.info(f"Uploaded lip sync video to R2: {r2_url}")
        return r2_url

    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)


def _update_status(
    supabase,
    generation_id: str,
    status: str,
    progress: Optional[int] = None,
    output_video_url: Optional[str] = None,
    provider_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """LipSync 生成ステータスを DB で更新（内部用）"""
    update_data: dict = {"status": status}

    if progress is not None:
        update_data["progress"] = progress
    if output_video_url is not None:
        update_data["output_video_url"] = output_video_url
    if provider_task_id is not None:
        update_data["provider_task_id"] = provider_task_id
    if error_message is not None:
        update_data["error_message"] = error_message

    supabase.table("lip_sync_generations").update(update_data).eq("id", generation_id).execute()
