"""
ストーリー動画生成のバックグラウンドタスク

シンプル化されたフロー:
1. 単一画像 + ストーリーテキスト + カメラワーク
2. 動画プロバイダーで動画生成
3. FFmpeg処理（BGM、オーバーレイ）
4. R2アップロード → 完了
"""

import asyncio
import logging
import os
import tempfile
from typing import Optional

from app.core.supabase import get_supabase
from app.external.video_provider import get_video_provider, VideoGenerationStatus
from app.external.r2 import r2_client
from app.services.ffmpeg_service import get_ffmpeg_service, FFmpegError
from app.videos.service import update_video_status

logger = logging.getLogger(__name__)


def _build_video_prompt(story_text: str, camera_work: str | None = None) -> str:
    """
    動画生成用プロンプトを構築

    Args:
        story_text: ユーザーのストーリーテキスト
        camera_work: カメラワーク名/プロンプト

    Returns:
        Runway API用のプロンプト
    """
    # プロンプト構築順序（重要度順）:
    # 1. カメラワーク（先頭に配置 = Runway APIがより重視）
    # 2. Identity Protection
    # 3. ストーリーテキスト

    parts = []

    # カメラワークを最優先で配置（静止以外）
    is_dynamic_camera = camera_work and camera_work.lower() not in [
        "static", "static shot", "static shot, camera remains still", "none"
    ]

    if is_dynamic_camera:
        # 動作描写形式でカメラワークを記述
        parts.append(f"The camera smoothly {camera_work}.")

    # 人物の自然な動き（動作描写形式）
    parts.append(
        "The person blinks naturally and softly, "
        "with subtle lifelike facial movements. "
        "Same face, same hair, same outfit throughout. "
    )

    # ストーリー
    parts.append(story_text)

    full_prompt = " ".join(parts)

    # Runway API制限: 1000文字
    if len(full_prompt) > 1000:
        full_prompt = full_prompt[:997] + "..."
        logger.warning(f"Prompt truncated to 1000 chars")

    return full_prompt


async def process_story_video(video_id: str, video_provider_name: str = None, element_images: list[str] = None) -> None:
    """
    ストーリー動画生成のバックグラウンド処理

    1. 単一画像 + ストーリーテキスト取得
    2. 選択されたプロバイダーで動画生成
    3. FFmpeg処理（BGM + オーバーレイ）
    4. R2アップロード → 完了

    Args:
        video_id: 動画生成ID
        video_provider_name: プロバイダー名（"runway", "veo", "domoai", "piapi_kling", "hailuo"、Noneの場合はDBから取得）
        element_images: Kling Elements用追加画像URLリスト（最大3枚）
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
        image_url = video_data.get("original_image_url") or video_data.get("image_urls", [None])[0]
        story_text = video_data.get("story_text") or video_data.get("user_prompt", "")
        camera_work = video_data.get("camera_work")
        aspect_ratio = video_data.get("aspect_ratio", "9:16")

        # Act-Two用パラメータ
        use_act_two = video_data.get("use_act_two", False)
        motion_type = video_data.get("motion_type")
        expression_intensity = video_data.get("expression_intensity", 5)
        body_control = video_data.get("body_control", True)

        # Kling AI用パラメータ
        kling_mode = video_data.get("kling_mode")
        end_frame_image_url = video_data.get("end_frame_image_url")
        kling_camera_control = video_data.get("kling_camera_control")

        # プロバイダーを決定（引数 > DB > デフォルト）
        provider_name = video_provider_name or video_data.get("video_provider") or "runway"
        provider = get_video_provider(provider_name)
        logger.info(f"Using video provider: {provider.provider_name}, use_act_two: {use_act_two}")

        if not image_url:
            raise Exception("No image URL provided")

        if not story_text:
            raise Exception("No story text provided")

        # ステータスを processing に更新
        await update_video_status(video_id, "processing", progress=5)
        logger.info(f"Starting story video processing: {video_id}")

        # Step 1: プロンプト構築（カメラワーク込み）
        video_prompt = _build_video_prompt(story_text, camera_work)
        logger.info(f"Video prompt ({len(video_prompt)} chars): {video_prompt}")

        await update_video_status(video_id, "processing", progress=10)

        # Step 2: プロバイダーで動画生成
        if use_act_two and motion_type:
            # Act-Twoモード: パフォーマンス動画ベースの精密制御
            from app.external.video_provider import VideoProviderError
            from app.external.runway_provider import RunwayProvider

            if not isinstance(provider, RunwayProvider):
                raise VideoProviderError("Act-TwoはRunwayプロバイダーでのみ使用可能です")

            # Supabaseからモーション情報を取得
            supabase_client = get_supabase()
            motion_result = supabase_client.table("motions").select("motion_url").eq("id", motion_type).single().execute()
            if not motion_result.data:
                raise VideoProviderError(f"モーション '{motion_type}' が見つかりません")
            motion_url = motion_result.data["motion_url"]

            logger.info(f"Starting Act-Two generation: {video_id}, motion: {motion_type}, URL: {motion_url}, expressionIntensity: {expression_intensity}")

            task_id = await provider.generate_video_act_two(
                image_url=image_url,
                motion_url=motion_url,
                expression_intensity=expression_intensity,
                body_control=body_control,
                aspect_ratio=aspect_ratio,
            )
        else:
            # 通常モード: テキストプロンプトベース
            logger.info(f"Starting video generation with {provider.provider_name}: {video_id}, camera_work: {camera_work}, end_frame: {end_frame_image_url is not None}")

            # Kling AI用の追加パラメータを構築
            extra_params = {}
            if provider_name == "piapi_kling":
                if kling_mode:
                    extra_params["mode"] = kling_mode
                if end_frame_image_url:
                    extra_params["image_tail_url"] = end_frame_image_url
                # カメラコントロール（6軸スライダー）
                if kling_camera_control:
                    extra_params["camera_control"] = kling_camera_control
                    logger.info(f"Using Kling camera_control: {kling_camera_control}")
                # Kling Elements: 追加画像がある場合はベース画像と結合
                if element_images:
                    all_elements = [image_url] + element_images
                    extra_params["element_images"] = all_elements[:4]  # 最大4枚
                    logger.info(f"Using Kling Elements with {len(extra_params['element_images'])} images")

            task_id = await provider.generate_video(
                image_url=image_url,
                prompt=video_prompt,
                duration=5,
                aspect_ratio=aspect_ratio,
                camera_work=camera_work,
                **extra_params,
            )

        if not task_id:
            raise Exception(f"{provider.provider_name} task creation failed")

        logger.info(f"{provider.provider_name} task created: {task_id}")
        await update_video_status(video_id, "processing", progress=20)

        # プロバイダーの完了を待つ（最大10分、10秒間隔でポーリング）
        max_attempts = 60
        raw_video_url = None

        for attempt in range(max_attempts):
            await asyncio.sleep(10)

            status_result = await provider.check_status(task_id)
            if not status_result:
                continue

            progress = min(20 + (attempt * 1), 70)
            await update_video_status(video_id, "processing", progress=progress)

            if status_result.status == VideoGenerationStatus.COMPLETED:
                raw_video_url = status_result.video_url
                logger.info(f"{provider.provider_name} completed: {raw_video_url}")
                break
            elif status_result.status == VideoGenerationStatus.FAILED:
                error = status_result.error_message or "Unknown error"
                raise Exception(f"{provider.provider_name} generation failed: {error}")

        else:
            raise Exception(f"{provider.provider_name} generation timed out")

        # Step 3: FFmpeg処理 → R2アップロード
        await update_video_status(video_id, "processing", progress=75)

        with tempfile.TemporaryDirectory() as temp_dir:
            raw_video_path = os.path.join(temp_dir, "raw_video.mp4")
            processed_video_path = os.path.join(temp_dir, "processed_video.mp4")

            # プロバイダー経由でダウンロード
            logger.info(f"Downloading video from {provider.provider_name}...")
            video_bytes = await provider.download_video_bytes(task_id)
            if not video_bytes:
                raise Exception(f"Failed to download video from {provider.provider_name}")

            with open(raw_video_path, "wb") as f:
                f.write(video_bytes)

            await update_video_status(video_id, "processing", progress=80)

            # BGMのパスを取得（custom_bgm_urlを優先）
            bgm_path = None
            bgm_url = None

            # カスタムBGMが設定されている場合は優先
            if video_data.get("custom_bgm_url"):
                bgm_url = video_data["custom_bgm_url"]
                logger.info(f"Using custom BGM: {bgm_url}")
            # プリセットBGMを使用
            elif video_data.get("bgm_track_id"):
                bgm_response = supabase.table("bgm_tracks").select("file_url").eq("id", video_data["bgm_track_id"]).single().execute()
                if bgm_response.data and bgm_response.data.get("file_url"):
                    bgm_url = bgm_response.data["file_url"]
                    logger.info(f"Using preset BGM: {bgm_url}")

            # BGMをダウンロード
            if bgm_url:
                try:
                    from app.external.r2 import download_file
                    bgm_ext = bgm_url.split(".")[-1] if "." in bgm_url else "mp3"
                    bgm_path = os.path.join(temp_dir, f"bgm.{bgm_ext}")
                    bgm_content = await download_file(bgm_url)
                    with open(bgm_path, "wb") as f:
                        f.write(bgm_content)
                    logger.info(f"Downloaded BGM to: {bgm_path}")
                except Exception as e:
                    logger.warning(f"Failed to download BGM: {e}")
                    bgm_path = None

            try:
                await ffmpeg.process_video(
                    video_path=raw_video_path,
                    output_path=processed_video_path,
                    text=video_data.get("overlay_text"),
                    text_position=video_data.get("overlay_position", "bottom"),
                    text_font=video_data.get("overlay_font", "NotoSansJP"),
                    text_color=video_data.get("overlay_color", "#FFFFFF"),
                    bgm_path=bgm_path,
                )
            except FFmpegError as e:
                logger.warning(f"FFmpeg processing failed, using raw video: {e}")
                processed_video_path = raw_video_path

            await update_video_status(video_id, "processing", progress=90)

            # R2にアップロード
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

            # Raw動画も保存
            raw_key = f"videos/{user_id}/{video_id}/raw.mp4"
            with open(raw_video_path, "rb") as f:
                raw_bytes = f.read()
            raw_url_saved = await r2_client.upload_file(
                file_data=raw_bytes,
                key=raw_key,
                content_type="video/mp4",
            )

        # Step 4: 完了
        await update_video_status(
            video_id,
            status="completed",
            progress=100,
            raw_video_url=raw_url_saved,
            final_video_url=final_url,
        )

        logger.info(f"Story video processing completed: {video_id}")

    except Exception as e:
        logger.exception(f"Story video processing failed: {video_id}")
        await update_video_status(
            video_id,
            status="failed",
            progress=0,
            error_message=str(e),
        )


async def start_story_processing(video_id: str, video_provider: str = None, element_images: list[str] = None) -> None:
    """ストーリー動画処理をバックグラウンドで開始"""
    asyncio.create_task(process_story_video(video_id, video_provider, element_images))


# 後方互換性のためのエイリアス
async def start_story_video_processing(video_id: str) -> None:
    """プレビュー済み動画処理（後方互換性）"""
    await start_story_processing(video_id)


async def process_story_generation(video_id: str) -> None:
    """後方互換性のためのエイリアス"""
    await process_story_video(video_id)


async def process_story_video_from_preview(video_id: str) -> None:
    """後方互換性のためのエイリアス"""
    await process_story_video(video_id)
