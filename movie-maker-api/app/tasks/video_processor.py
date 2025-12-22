"""
動画処理のバックグラウンドタスク

KlingAI → FFmpeg処理 → R2アップロード の一連の処理を行う
"""

import asyncio
import logging
import os
import tempfile
from typing import Optional

from app.core.supabase import get_supabase
from app.external.kling import generate_video, check_video_status, download_video
from app.external.r2 import r2_client
from app.services.ffmpeg_service import get_ffmpeg_service, FFmpegError
from app.videos.service import update_video_status

logger = logging.getLogger(__name__)


def _get_grain_intensity(preset: str | None) -> int:
    """フィルムグレインプリセットを強度値に変換"""
    presets = {
        "none": 0,
        "light": 15,
        "medium": 30,
        "heavy": 45,
    }
    return presets.get(preset, 30)  # デフォルトはmedium (30%)


async def process_video_generation(video_id: str) -> None:
    """
    動画生成のバックグラウンド処理

    1. KlingAIに動画生成をリクエスト
    2. 生成完了を待つ（ポーリング）
    3. 動画をダウンロード
    4. FFmpegでテキスト/BGMを追加
    5. 最終動画をR2にアップロード
    6. ステータスを更新
    """
    supabase = get_supabase()
    ffmpeg = get_ffmpeg_service()

    try:
        # 動画生成情報を取得
        response = supabase.table("video_generations").select("*").eq("id", video_id).single().execute()
        if not response.data:
            logger.error(f"Video generation not found: {video_id}")
            return

        video_data = response.data
        user_id = video_data["user_id"]

        # ステータスを processing に更新
        await update_video_status(video_id, "processing", progress=5)
        logger.info(f"Starting video processing: {video_id}")

        # Step 1: KlingAIに生成リクエスト
        await update_video_status(video_id, "processing", progress=10)

        # 複数画像対応（後方互換: image_urlsがなければoriginal_image_urlを使用）
        image_urls = video_data.get("image_urls") or [video_data["original_image_url"]]

        kling_task_id = await generate_video(
            image_urls=image_urls,
            prompt=video_data["optimized_prompt"] or video_data["user_prompt"],
        )

        if not kling_task_id:
            raise Exception("KlingAI task creation failed")

        logger.info(f"KlingAI task created: {kling_task_id}")
        await update_video_status(video_id, "processing", progress=20)

        # Step 2: KlingAIの完了を待つ（最大5分、10秒間隔でポーリング）
        max_attempts = 30
        for attempt in range(max_attempts):
            await asyncio.sleep(10)

            status_data = await check_video_status(kling_task_id)
            if not status_data:
                continue

            status = status_data.get("status")
            progress = min(20 + (attempt * 2), 60)  # 20% → 60%
            await update_video_status(video_id, "processing", progress=progress)

            if status == "completed":
                raw_video_url = status_data.get("video_url")
                logger.info(f"KlingAI completed: {raw_video_url}")
                break
            elif status == "failed":
                error = status_data.get("error", "Unknown error")
                raise Exception(f"KlingAI generation failed: {error}")

        else:
            raise Exception("KlingAI generation timed out")

        # Step 3: 動画をダウンロード
        await update_video_status(video_id, "processing", progress=65)

        with tempfile.TemporaryDirectory() as temp_dir:
            raw_video_path = os.path.join(temp_dir, "raw_video.mp4")
            processed_video_path = os.path.join(temp_dir, "processed_video.mp4")

            # ダウンロード
            success = await download_video(raw_video_url, raw_video_path)
            if not success:
                raise Exception("Failed to download video from KlingAI")

            await update_video_status(video_id, "processing", progress=70)

            # Step 4: FFmpeg処理 (カラーグレーディング・テキスト・BGM)
            # 常に実行して脱AI感（フィルムルック）を適用する
            bgm_path = None
            if video_data.get("bgm_track_id"):
                bgm_response = supabase.table("bgm_tracks").select("file_url").eq("id", video_data["bgm_track_id"]).single().execute()
                if bgm_response.data:
                    # BGMファイルをダウンロード
                    bgm_url = bgm_response.data["file_url"]
                    bgm_path = os.path.join(temp_dir, "bgm.mp3")
                    # BGMダウンロード（実際の実装が必要）
                    # 今回は簡易的にスキップ（または別途実装が必要）
            
            await update_video_status(video_id, "processing", progress=75)

            # LUTファイルのパスを取得（use_lutがTrueの場合のみ）
            use_lut = video_data.get("use_lut", True)
            lut_path = None
            if use_lut:
                lut_path = os.path.join(os.path.dirname(__file__), "..", "assets", "luts", "clean_film.cube")
            logger.info(f"LUT enabled: {use_lut}")

            # フィルムグレイン強度を取得
            grain_intensity = _get_grain_intensity(video_data.get("film_grain"))
            logger.info(f"Film grain intensity: {grain_intensity}% (preset: {video_data.get('film_grain', 'default')})")

            try:
                # カラーグレーディング設定（docs/color.mdに基づく）
                await ffmpeg.process_video(
                    video_path=raw_video_path,
                    output_path=processed_video_path,
                    text=video_data.get("overlay_text"),
                    text_position=video_data.get("overlay_position", "bottom"),
                    text_font=video_data.get("overlay_font", "NotoSansJP"),
                    text_color=video_data.get("overlay_color", "#FFFFFF"),
                    bgm_path=bgm_path,
                    film_grain_intensity=grain_intensity,
                    lut_path=lut_path,
                    lut_intensity=0.3,
                    target_fps=24,
                )
            except FFmpegError as e:
                logger.warning(f"FFmpeg processing failed, using raw video: {e}")
                processed_video_path = raw_video_path

            await update_video_status(video_id, "processing", progress=85)

            # Step 5: R2にアップロード
            final_key = f"videos/{user_id}/{video_id}/final.mp4"
            with open(processed_video_path, "rb") as f:
                video_bytes = f.read()

            final_url = await r2_client.upload_file(
                file_data=video_bytes,
                key=final_key,
                content_type="video/mp4",
            )

            if not final_url:
                raise Exception("Failed to upload final video to R2")

            await update_video_status(video_id, "processing", progress=95)

            # Raw動画もR2に保存
            raw_key = f"videos/{user_id}/{video_id}/raw.mp4"
            with open(raw_video_path, "rb") as f:
                raw_bytes = f.read()
            raw_url = await r2_client.upload_file(
                file_data=raw_bytes,
                key=raw_key,
                content_type="video/mp4",
            )

        # Step 6: 完了
        await update_video_status(
            video_id,
            status="completed",
            progress=100,
            raw_video_url=raw_url,
            final_video_url=final_url,
        )

        logger.info(f"Video processing completed: {video_id}")

    except Exception as e:
        logger.exception(f"Video processing failed: {video_id}")
        await update_video_status(
            video_id,
            status="failed",
            progress=0,
            error_message=str(e),
        )


async def start_video_processing(video_id: str) -> None:
    """動画処理をバックグラウンドで開始"""
    # asyncio.create_taskでバックグラウンド実行
    asyncio.create_task(process_video_generation(video_id))
