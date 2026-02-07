"""
BGM再処理タスク

既存の動画に後からBGMを追加するための処理
"""

import asyncio
import logging
import os
import tempfile

from app.core.supabase import get_supabase
from app.services.ffmpeg_service import FFmpegService
from app.external.r2 import download_file, upload_video

logger = logging.getLogger(__name__)


async def process_bgm_reprocessing(video_id: str):
    """
    既存の動画にBGMを追加して再処理

    1. 動画データを取得
    2. 元動画（raw_video_url or final_video_url）をダウンロード
    3. カスタムBGMをダウンロード
    4. FFmpegでBGMを追加
    5. R2にアップロード
    6. DBを更新
    """
    supabase = get_supabase()
    ffmpeg = FFmpegService()

    try:
        # 動画データを取得
        response = (
            supabase.table("video_generations")
            .select("*")
            .eq("id", video_id)
            .single()
            .execute()
        )
        video_data = response.data

        if not video_data:
            logger.error(f"Video not found: {video_id}")
            return

        custom_bgm_url = video_data.get("custom_bgm_url")
        if not custom_bgm_url:
            logger.error(f"No custom BGM URL for video: {video_id}")
            supabase.table("video_generations").update({
                "status": "failed",
                "error_message": "BGM URLが指定されていません",
            }).eq("id", video_id).execute()
            return

        # 進捗更新: 10%
        supabase.table("video_generations").update({
            "progress": 10,
        }).eq("id", video_id).execute()

        # ソース動画URLを取得（raw_video_urlを優先、なければfinal_video_url）
        source_video_url = video_data.get("raw_video_url") or video_data.get("final_video_url")
        if not source_video_url:
            raise Exception("ソース動画が見つかりません")

        with tempfile.TemporaryDirectory() as temp_dir:
            # ソース動画をダウンロード
            logger.info(f"Downloading source video: {source_video_url}")
            video_content = await download_file(source_video_url)
            source_video_path = os.path.join(temp_dir, "source_video.mp4")
            with open(source_video_path, "wb") as f:
                f.write(video_content)

            # 進捗更新: 30%
            supabase.table("video_generations").update({
                "progress": 30,
            }).eq("id", video_id).execute()

            # BGMをダウンロード
            logger.info(f"Downloading BGM: {custom_bgm_url}")
            bgm_content = await download_file(custom_bgm_url)
            bgm_ext = custom_bgm_url.split(".")[-1] if "." in custom_bgm_url else "mp3"
            bgm_path = os.path.join(temp_dir, f"bgm.{bgm_ext}")
            with open(bgm_path, "wb") as f:
                f.write(bgm_content)

            # 進捗更新: 50%
            supabase.table("video_generations").update({
                "progress": 50,
            }).eq("id", video_id).execute()

            # FFmpegでBGMを追加
            output_path = os.path.join(temp_dir, "output_with_bgm.mp4")
            logger.info(f"Adding BGM to video...")

            await ffmpeg.add_bgm(
                video_path=source_video_path,
                audio_path=bgm_path,
                output_path=output_path,
                video_volume=0.3,  # 元動画の音声ボリューム
                audio_volume=0.7,  # BGMのボリューム
                fade_out_duration=1.0,
            )

            # 進捗更新: 80%
            supabase.table("video_generations").update({
                "progress": 80,
            }).eq("id", video_id).execute()

            # R2にアップロード
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            final_filename = f"{video_data['user_id']}/{video_id}_with_bgm.mp4"
            final_video_url = await upload_video(video_bytes, final_filename)

            logger.info(f"Uploaded video with BGM: {final_video_url}")

            # DB更新: 完了
            supabase.table("video_generations").update({
                "status": "completed",
                "progress": 100,
                "final_video_url": final_video_url,
                "error_message": None,
            }).eq("id", video_id).execute()

            logger.info(f"BGM reprocessing completed for video: {video_id}")

    except Exception as e:
        logger.error(f"BGM reprocessing failed for video {video_id}: {e}")
        supabase.table("video_generations").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", video_id).execute()


def start_bgm_reprocessing(video_id: str):
    """BGM再処理タスクを開始（同期ラッパー）"""
    asyncio.run(process_bgm_reprocessing(video_id))
