"""
動画結合のバックグラウンドタスク

複数動画をダウンロード → FFmpeg結合 → R2アップロード の一連の処理を行う
"""

import asyncio
import logging
import os
import tempfile
import aiohttp

from app.core.supabase import get_supabase
from app.external.r2 import r2_client
from app.services.ffmpeg_service import get_ffmpeg_service, FFmpegError

logger = logging.getLogger(__name__)


async def update_concat_status(
    concat_id: str,
    status: str,
    progress: int | None = None,
    error_message: str | None = None,
    final_video_url: str | None = None,
    total_duration: float | None = None,
) -> None:
    """結合ジョブのステータスを更新"""
    supabase = get_supabase()

    update_data = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if error_message is not None:
        update_data["error_message"] = error_message
    if final_video_url is not None:
        update_data["final_video_url"] = final_video_url
    if total_duration is not None:
        update_data["total_duration"] = total_duration

    supabase.table("video_concatenations").update(update_data).eq("id", concat_id).execute()


async def download_video_file(url: str, output_path: str) -> bool:
    """動画ファイルをダウンロード"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    logger.error(f"Failed to download video: {response.status}")
                    return False

                with open(output_path, "wb") as f:
                    while True:
                        chunk = await response.content.read(8192)
                        if not chunk:
                            break
                        f.write(chunk)

        return True
    except Exception as e:
        logger.error(f"Download error: {e}")
        return False


async def process_concat_generation(
    concat_id: str,
    direct_video_urls: list[str] | None = None,
    trim_info_list: list[dict] | None = None,
) -> None:
    """
    動画結合のバックグラウンド処理

    1. 結合する動画情報を取得（またはdirect_video_urlsを使用）
    2. 各動画をR2からダウンロード
    3. トリミングが指定されている場合は適用
    4. FFmpegで結合
    5. R2にアップロード
    6. ステータスを更新

    Args:
        concat_id: 結合ジョブID
        direct_video_urls: 直接指定された動画URL（ストーリーボード等）
        trim_info_list: 各動画のトリミング情報 [{"start_time": 0, "end_time": 5}, ...]
    """
    supabase = get_supabase()
    ffmpeg = get_ffmpeg_service()

    try:
        # 結合ジョブ情報を取得
        response = supabase.table("video_concatenations").select("*").eq("id", concat_id).single().execute()
        if not response.data:
            logger.error(f"Concat job not found: {concat_id}")
            return

        concat_data = response.data
        user_id = concat_data["user_id"]
        source_video_ids = concat_data["source_video_ids"]
        transition = concat_data.get("transition", "none")
        transition_duration = concat_data.get("transition_duration", 0.5)

        # ステータスを processing に更新
        await update_concat_status(concat_id, "processing", progress=5)

        # direct_video_urlsが指定されている場合はそれを使用
        if direct_video_urls:
            video_urls = direct_video_urls
            logger.info(f"Starting concat processing: {concat_id}, direct URLs: {len(video_urls)}")
        else:
            # 各動画の情報をDBから取得
            logger.info(f"Starting concat processing: {concat_id}, videos: {len(source_video_ids)}")
            video_urls = []
            for video_id in source_video_ids:
                video_response = (
                    supabase.table("video_generations")
                    .select("final_video_url")
                    .eq("id", video_id)
                    .single()
                    .execute()
                )
                if not video_response.data or not video_response.data.get("final_video_url"):
                    raise Exception(f"Video URL not found: {video_id}")
                video_urls.append(video_response.data["final_video_url"])

        await update_concat_status(concat_id, "processing", progress=10)

        with tempfile.TemporaryDirectory() as temp_dir:
            # Step 1: 各動画をダウンロード
            video_paths = []
            total_videos = len(video_urls)

            for i, url in enumerate(video_urls):
                video_path = os.path.join(temp_dir, f"video_{i}.mp4")

                logger.info(f"Downloading video {i+1}/{total_videos}: {url}")
                success = await download_video_file(url, video_path)

                if not success:
                    raise Exception(f"Failed to download video {i+1}")

                video_paths.append(video_path)

                # 進捗更新（10% ~ 40%）
                progress = 10 + int((i + 1) / total_videos * 30)
                await update_concat_status(concat_id, "processing", progress=progress)

            logger.info(f"Downloaded {len(video_paths)} videos")

            # Step 2: トリミング処理（必要な場合）
            trimmed_paths = []
            if trim_info_list and len(trim_info_list) == len(video_paths):
                logger.info("Applying trim to videos")
                await update_concat_status(concat_id, "processing", progress=45)

                for i, (video_path, trim_info) in enumerate(zip(video_paths, trim_info_list)):
                    start_time = trim_info.get("start_time", 0)
                    end_time = trim_info.get("end_time")

                    # トリムが必要かチェック
                    needs_trim = start_time > 0 or end_time is not None

                    if needs_trim:
                        trimmed_path = os.path.join(temp_dir, f"trimmed_{i}.mp4")
                        logger.info(f"Trimming video {i+1}: {start_time}s ~ {end_time if end_time else 'end'}s")
                        try:
                            await ffmpeg.trim_video(
                                input_path=video_path,
                                output_path=trimmed_path,
                                start_time=start_time,
                                end_time=end_time,
                            )
                            trimmed_paths.append(trimmed_path)
                        except Exception as e:
                            logger.error(f"Trim failed for video {i+1}: {e}")
                            # トリム失敗時は元の動画を使用
                            trimmed_paths.append(video_path)
                    else:
                        # トリム不要
                        trimmed_paths.append(video_path)

                    # 進捗更新（45% ~ 55%）
                    progress = 45 + int((i + 1) / total_videos * 10)
                    await update_concat_status(concat_id, "processing", progress=progress)

                video_paths_to_concat = trimmed_paths
            else:
                video_paths_to_concat = video_paths

            # Step 3: FFmpegで結合
            await update_concat_status(concat_id, "processing", progress=60)
            output_path = os.path.join(temp_dir, "concatenated.mp4")

            logger.info(f"Concatenating videos with transition: {transition}")
            await ffmpeg.concat_videos(
                video_paths=video_paths_to_concat,
                output_path=output_path,
                transition=transition,
                transition_duration=transition_duration,
            )

            await update_concat_status(concat_id, "processing", progress=75)

            # 結合後の動画の長さを取得
            total_duration = await ffmpeg._get_video_duration(output_path)
            logger.info(f"Concatenated video duration: {total_duration}s")

            # Step 4: R2にアップロード
            await update_concat_status(concat_id, "processing", progress=85)

            final_key = f"videos/{user_id}/concat/{concat_id}/final.mp4"
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            final_url = await r2_client.upload_file(
                file_data=video_bytes,
                key=final_key,
                content_type="video/mp4",
            )

            if not final_url:
                raise Exception("Failed to upload concatenated video to R2")

            await update_concat_status(concat_id, "processing", progress=95)

        # Step 5: 完了
        await update_concat_status(
            concat_id,
            status="completed",
            progress=100,
            final_video_url=final_url,
            total_duration=total_duration,
        )

        logger.info(f"Concat processing completed: {concat_id}, duration: {total_duration}s")

    except Exception as e:
        logger.exception(f"Concat processing failed: {concat_id}")
        await update_concat_status(
            concat_id,
            status="failed",
            progress=0,
            error_message=str(e),
        )


async def start_concat_processing(
    concat_id: str,
    direct_video_urls: list[str] | None = None,
    trim_info_list: list[dict] | None = None,
) -> None:
    """動画結合処理をバックグラウンドで開始
    
    Args:
        concat_id: 結合ジョブID
        direct_video_urls: 直接指定された動画URL
        trim_info_list: 各動画のトリミング情報 [{"start_time": 0, "end_time": 5}, ...]
    """
    asyncio.create_task(process_concat_generation(concat_id, direct_video_urls, trim_info_list))
