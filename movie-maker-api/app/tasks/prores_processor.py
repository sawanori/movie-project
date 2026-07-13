"""ProRes変換（デバンド + 10bit）非同期処理タスク"""

import logging
import os
import tempfile
import time

import httpx

from app.core.supabase import get_supabase
from app.external.r2 import upload_user_video
from app.services.ffmpeg_service import get_ffmpeg_service

logger = logging.getLogger(__name__)


async def process_prores_conversion(conversion_id: str) -> None:
    """
    ProRes変換処理のメイン関数

    Args:
        conversion_id: ProRes変換タスクID
    """
    supabase = get_supabase()
    input_path = None
    output_path = None

    try:
        # prores_conversionsレコードを取得
        response = (
            supabase.table("prores_conversions")
            .select("*")
            .eq("id", conversion_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"ProRes conversion record not found: {conversion_id}")
            return

        record = response.data
        original_video_url = record["original_video_url"]
        user_id = record.get("user_id", "unknown")

        logger.info(f"Starting ProRes conversion for {conversion_id}")

        # ステータスを処理中に更新
        supabase.table("prores_conversions").update({
            "status": "processing",
            "progress": 10,
        }).eq("id", conversion_id).execute()

        # オリジナル動画をダウンロード
        logger.info(f"Downloading original video from: {original_video_url}")
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            dl_response = await client.get(original_video_url)
            dl_response.raise_for_status()
            video_content = dl_response.content

        with tempfile.NamedTemporaryFile(suffix="_prores_input.mp4", delete=False) as f:
            input_path = f.name
            f.write(video_content)

        logger.info(f"Downloaded video to {input_path} ({len(video_content)} bytes)")

        supabase.table("prores_conversions").update({
            "progress": 30,
        }).eq("id", conversion_id).execute()

        # 出力用一時ファイルを作成
        with tempfile.NamedTemporaryFile(suffix="_prores_output.mov", delete=False) as f:
            output_path = f.name

        # FFmpegでProRes変換
        ffmpeg = get_ffmpeg_service()
        logger.info(f"Converting to ProRes: {input_path} -> {output_path}")
        await ffmpeg.convert_to_prores(
            video_path=input_path,
            output_path=output_path,
            deband_strength=record.get("deband_strength"),
            deband_radius=record.get("deband_radius"),
            apply_flat_look=record.get("apply_flat_look"),
            contrast=record.get("contrast"),
            saturation=record.get("saturation"),
            brightness=record.get("brightness"),
        )

        supabase.table("prores_conversions").update({
            "progress": 70,
        }).eq("id", conversion_id).execute()

        # R2にアップロード
        with open(output_path, "rb") as f:
            content = f.read()

        timestamp = int(time.time())
        key = f"videos/{user_id}/prores_{conversion_id}_{timestamp}.mov"
        logger.info(f"Uploading ProRes video to R2: {key}")
        prores_video_url = await upload_user_video(content, key, "video/quicktime")

        supabase.table("prores_conversions").update({
            "progress": 90,
        }).eq("id", conversion_id).execute()

        # 完了に更新
        supabase.table("prores_conversions").update({
            "status": "completed",
            "prores_video_url": prores_video_url,
            "progress": 100,
        }).eq("id", conversion_id).execute()

        logger.info(f"ProRes conversion completed: {conversion_id}")

    except Exception as e:
        logger.exception(f"ProRes conversion failed for {conversion_id}: {e}")
        supabase.table("prores_conversions").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", conversion_id).execute()

    finally:
        # 一時ファイルをクリーンアップ
        for temp_file in [input_path, output_path]:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file {temp_file}: {e}")


async def start_prores_processing(conversion_id: str) -> None:
    """
    ProRes変換処理を開始するラッパー関数

    Args:
        conversion_id: ProRes変換タスクID
    """
    await process_prores_conversion(conversion_id)
