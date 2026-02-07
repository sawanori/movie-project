"""
動画処理のバックグラウンドタスク

Runway API → [Topaz 60fps変換] → FFmpeg処理 → R2アップロード の一連の処理を行う
"""

import asyncio
import logging
import os
import tempfile
from typing import Optional

import httpx

from app.core.supabase import get_supabase
from app.external.runway_client import (
    generate_video_single,
    check_video_status_single,
    download_video,
)
from app.external.r2 import r2_client
from app.services.ffmpeg_service import get_ffmpeg_service, FFmpegError
from app.services.topaz_service import get_topaz_service, TopazServiceError
from app.videos.service import update_video_status

logger = logging.getLogger(__name__)


async def process_video_generation(video_id: str) -> None:
    """
    動画生成のバックグラウンド処理

    1. Runway APIに動画生成をリクエスト
    2. 生成完了を待つ（ポーリング）
    3. 動画をダウンロード
    4. [NEW] 60fps変換（オプション、FFmpegの前）
    5. FFmpegでカラグレ/BGMを追加
    6. 最終動画をR2にアップロード
    7. ステータスを更新
    """
    supabase = get_supabase()
    ffmpeg = get_ffmpeg_service()
    topaz = get_topaz_service()

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

        # Step 1: Runway APIに生成リクエスト
        await update_video_status(video_id, "processing", progress=10)

        # 画像URL（最初の1枚を使用）
        image_urls = video_data.get("image_urls") or [video_data["original_image_url"]]
        image_url = image_urls[0] if image_urls else video_data.get("original_image_url")

        if not image_url:
            raise Exception("No image URL provided")

        # プロンプト
        prompt = video_data.get("optimized_prompt") or video_data.get("user_prompt", "")
        camera_work = video_data.get("camera_work")

        # アスペクト比をRunway APIのratio形式に変換
        aspect_ratio = video_data.get("aspect_ratio", "9:16")
        ratio = "720:1280" if aspect_ratio == "9:16" else "1280:720"
        logger.info(f"Using aspect ratio: {aspect_ratio} -> ratio: {ratio}")

        runway_task_id = await generate_video_single(
            image_url=image_url,
            prompt=prompt,
            camera_work=camera_work,
            duration=5,
            ratio=ratio,
        )

        if not runway_task_id:
            raise Exception("Runway task creation failed")

        logger.info(f"Runway task created: {runway_task_id}")
        await update_video_status(video_id, "processing", progress=20)

        # Step 2: Runwayの完了を待つ（最大10分、10秒間隔でポーリング）
        max_attempts = 60
        raw_video_url = None

        for attempt in range(max_attempts):
            await asyncio.sleep(10)

            status_data = await check_video_status_single(runway_task_id)
            if not status_data:
                continue

            status = status_data.get("status")
            progress = min(20 + (attempt * 1), 60)
            await update_video_status(video_id, "processing", progress=progress)

            if status == "completed":
                raw_video_url = status_data.get("video_url")
                logger.info(f"Runway completed: {raw_video_url}")
                break
            elif status == "failed":
                error = status_data.get("error", "Unknown error")
                raise Exception(f"Runway generation failed: {error}")

        else:
            raise Exception("Runway generation timed out")

        # Step 3: 動画をダウンロード
        await update_video_status(video_id, "processing", progress=65)

        with tempfile.TemporaryDirectory() as temp_dir:
            raw_video_path = os.path.join(temp_dir, "raw_video.mp4")
            processed_video_path = os.path.join(temp_dir, "processed_video.mp4")

            # ダウンロード
            success = await download_video(raw_video_url, raw_video_path)
            if not success:
                raise Exception("Failed to download video from Runway")

            await update_video_status(video_id, "processing", progress=70)

            # Step 3.5: 60fps変換（オプション、FFmpegの前）
            target_fps = video_data.get("target_fps", 30)  # デフォルト30fps
            interpolated_video_path = raw_video_path  # デフォルトはそのまま

            if target_fps == 60:
                logger.info(f"60fps補間開始: video_id={video_id}")

                try:
                    # 進捗更新コールバック
                    async def update_topaz_progress(progress: int):
                        await update_video_status(video_id, "processing", progress=progress)

                    # Topaz APIで60fps変換（ローカルファイルをR2にアップロードしてから変換）
                    # まず一時的にR2にアップロード
                    temp_r2_key = f"videos/temp/{video_id}/raw_for_topaz.mp4"
                    with open(raw_video_path, "rb") as f:
                        temp_video_bytes = f.read()
                    temp_r2_url = await r2_client.upload_file(
                        file_data=temp_video_bytes,
                        key=temp_r2_key,
                        content_type="video/mp4",
                    )

                    # Topaz APIで60fps変換
                    interpolated_url = await topaz.interpolate_to_60fps(
                        video_url=temp_r2_url,
                        model="apo-8",
                        progress_callback=update_topaz_progress,
                    )

                    # 変換後の動画をダウンロード
                    interpolated_video_path = os.path.join(temp_dir, "interpolated_60fps.mp4")
                    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
                        async with client.stream("GET", interpolated_url) as response:
                            response.raise_for_status()
                            with open(interpolated_video_path, "wb") as f:
                                async for chunk in response.aiter_bytes(chunk_size=8192):
                                    f.write(chunk)

                    logger.info(f"60fps補間完了: video_id={video_id}")

                except TopazServiceError as e:
                    logger.error(f"Topaz補間失敗（30fpsで続行）: {e}")
                    # エラーでも処理継続（元の動画を使用）
                    interpolated_video_path = raw_video_path
                    await update_video_status(
                        video_id,
                        "processing",
                        progress=75,
                        error_message=f"60fps変換失敗（30fpsで続行）: {str(e)}"
                    )

            # Step 4: FFmpeg処理 (カラーグレーディング・テキスト・BGM)
            bgm_path = None
            if video_data.get("bgm_track_id"):
                bgm_response = supabase.table("bgm_tracks").select("file_url").eq("id", video_data["bgm_track_id"]).single().execute()
                if bgm_response.data:
                    bgm_url = bgm_response.data["file_url"]
                    bgm_path = os.path.join(temp_dir, "bgm.mp3")
                    # TODO: BGMダウンロード実装

            await update_video_status(video_id, "processing", progress=75)

            try:
                # 60fps変換済みの場合はそのFPSを維持、そうでなければ24fps
                ffmpeg_target_fps = None if target_fps == 60 else 24

                await ffmpeg.process_video(
                    video_path=interpolated_video_path,  # 60fps変換済み or 元動画
                    output_path=processed_video_path,
                    text=video_data.get("overlay_text"),
                    text_position=video_data.get("overlay_position", "bottom"),
                    text_font=video_data.get("overlay_font", "NotoSansJP"),
                    text_color=video_data.get("overlay_color", "#FFFFFF"),
                    bgm_path=bgm_path,
                    target_fps=ffmpeg_target_fps,  # 60fpsの場合はFPS変換しない
                )
            except FFmpegError as e:
                logger.warning(f"FFmpeg processing failed, using source video: {e}")
                processed_video_path = interpolated_video_path

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

        # Step 7: HLS変換をバックグラウンドで開始（失敗してもMP4で再生可能）
        start_hls_conversion_background(
            video_id=video_id,
            video_url=final_url,
            supabase_client=supabase,
            table_name="video_generations",
        )

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
    asyncio.create_task(process_video_generation(video_id))


async def process_hls_conversion(
    video_id: str,
    video_url: str,
    supabase_client,
    table_name: str = "video_generations",
) -> str | None:
    """
    動画をHLS形式に変換してR2にアップロード

    Args:
        video_id: 動画ID
        video_url: 元動画のURL
        supabase_client: Supabaseクライアント
        table_name: 更新対象テーブル名（デフォルト: video_generations）

    Returns:
        HLSマスタープレイリストのURL、失敗時はNone

    Note:
        この関数は動画生成完了後にバックグラウンドで呼び出される。
        失敗してもユーザー体験に影響しない（MP4フォールバックあり）。
    """
    from app.services.hls_service import (
        convert_to_hls,
        upload_hls_to_r2,
        HLSConversionError,
    )

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # 元動画をストリーミングダウンロード（メモリ効率化）
            input_path = os.path.join(temp_dir, "input.mp4")

            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
                async with client.stream("GET", video_url) as response:
                    response.raise_for_status()
                    with open(input_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            f.write(chunk)

            logger.info(f"Downloaded video for HLS conversion: {video_id}")

            # HLS変換
            output_dir = os.path.join(temp_dir, "hls")
            os.makedirs(output_dir, exist_ok=True)

            await convert_to_hls(input_path, output_dir, video_id)

            # R2にアップロード
            master_url = await upload_hls_to_r2(output_dir, video_id)

            # DB更新
            supabase_client.table(table_name).update({
                "hls_master_url": master_url
            }).eq("id", video_id).execute()

            logger.info(f"HLS conversion completed for video {video_id}: {master_url}")
            return master_url

    except HLSConversionError as e:
        logger.error(f"HLS conversion failed for video {video_id}: {e}")
        return None
    except httpx.HTTPError as e:
        logger.error(f"Failed to download video {video_id} for HLS conversion: {e}")
        return None
    except Exception as e:
        logger.exception(f"Unexpected error during HLS conversion for video {video_id}: {e}")
        return None


def start_hls_conversion_background(
    video_id: str,
    video_url: str,
    supabase_client,
    table_name: str = "video_generations",
) -> None:
    """
    HLS変換をバックグラウンドで開始

    動画生成完了後に呼び出す。結果を待たずに即座にreturnする。
    """
    asyncio.create_task(
        process_hls_conversion(video_id, video_url, supabase_client, table_name)
    )
