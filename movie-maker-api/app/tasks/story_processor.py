"""
ストーリー動画生成のバックグラウンドタスク

AI主導ストーリーテリング:
1. 画像解析 → ベースプロンプト生成
2. ストーリーボード(4プロンプト)生成
3. 3枚の画像生成 (フレーム2,3,4)
4. KlingAI動画生成
5. 後処理・完了
"""

import asyncio
import logging
import os
import tempfile
from typing import Optional

from app.core.supabase import get_supabase
from app.external.gemini_client import (
    analyze_image_for_base_prompt,
    generate_storyboard_prompts,
    generate_story_frame_image,
    get_gemini_client,
)
from google.genai import types
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


async def _summarize_prompt_for_kling(raw_prompt: str, story_text: str) -> str:
    """
    長いプロンプトをKlingAI用に2400文字以内に要約

    Args:
        raw_prompt: 元の長いプロンプト
        story_text: ユーザーのストーリーテキスト（コンテキスト用）

    Returns:
        str: 要約されたプロンプト（2400文字以内）
    """
    client = get_gemini_client()

    system_prompt = f"""
You are an expert at summarizing video generation prompts for KlingAI.

Summarize the following multi-frame prompt into a single, cohesive prompt under 2000 characters.

Requirements:
- Keep the essential visual elements (scene, subject, style)
- Preserve the key actions/movements across frames
- Maintain the cinematic quality descriptors
- Output in English only
- The story context is: "{story_text}"

Original prompt:
{raw_prompt}

Output ONLY the summarized prompt, nothing else.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=system_prompt,
            config=types.GenerateContentConfig(temperature=0.3)
        )

        summarized = response.text.strip()

        # 念のため2400文字制限
        if len(summarized) > 2400:
            summarized = summarized[:2400]

        logger.info(f"Prompt summarized from {len(raw_prompt)} to {len(summarized)} chars")
        return summarized

    except Exception as e:
        logger.warning(f"Prompt summarization failed: {e}, using truncated version")
        # フォールバック: 単純に切り詰め
        return raw_prompt[:2400]


async def process_story_generation(video_id: str) -> None:
    """
    ストーリー動画生成のバックグラウンド処理

    1. 画像解析 → ベースプロンプト生成 (Gemini)
    2. ストーリーボード(4プロンプト)生成 (Gemini)
    3. 3枚の画像生成 - フレーム2,3,4 (Gemini)
    4. KlingAI動画生成
    5. FFmpeg処理 → R2アップロード → 完了
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
        original_image_url = video_data["original_image_url"]
        story_text = video_data["story_text"]

        if not story_text:
            raise Exception("story_text is required for story generation mode")

        # ステータスを processing に更新
        await update_video_status(video_id, "processing", progress=5)
        logger.info(f"Starting story video processing: {video_id}")

        # Step 1: 画像解析 → ベースプロンプト生成
        await update_video_status(video_id, "processing", progress=10)
        logger.info(f"Analyzing image for base prompt: {video_id}")

        base_prompt = await analyze_image_for_base_prompt(original_image_url)
        if not base_prompt:
            raise Exception("Failed to analyze image")

        # ベースプロンプトをDBに保存
        supabase.table("video_generations").update({
            "base_prompt": base_prompt
        }).eq("id", video_id).execute()

        logger.info(f"Base prompt generated: {base_prompt[:100]}...")
        await update_video_status(video_id, "processing", progress=20)

        # Step 2: ストーリーボード(3プロンプト)生成
        logger.info(f"Generating storyboard prompts: {video_id}")

        storyboard_prompts = await generate_storyboard_prompts(base_prompt, story_text)
        if len(storyboard_prompts) != 3:
            raise Exception(f"Expected 3 storyboard prompts, got {len(storyboard_prompts)}")

        # ストーリーボードプロンプトをDBに保存
        supabase.table("video_generations").update({
            "storyboard_prompts": storyboard_prompts
        }).eq("id", video_id).execute()

        logger.info(f"Storyboard prompts generated: {len(storyboard_prompts)} frames")
        await update_video_status(video_id, "processing", progress=30)

        # Step 3: 2枚の画像生成 (フレーム2,3)
        # フレーム1はユーザーのオリジナル画像を使用
        ai_generated_image_urls = []

        for i, prompt in enumerate(storyboard_prompts[1:], start=2):  # フレーム2,3
            logger.info(f"Generating frame {i} image: {video_id}")

            image_bytes = await generate_story_frame_image(prompt)
            if not image_bytes:
                raise Exception(f"Failed to generate image for frame {i}")

            # R2にアップロード
            image_key = f"story-frames/{user_id}/{video_id}/frame_{i}.png"
            image_url = await r2_client.upload_file(
                file_data=image_bytes,
                key=image_key,
                content_type="image/png",
            )

            if not image_url:
                raise Exception(f"Failed to upload frame {i} image to R2")

            ai_generated_image_urls.append(image_url)

            progress = 30 + (i - 1) * 15  # 30 → 45
            await update_video_status(video_id, "processing", progress=progress)
            logger.info(f"Frame {i} uploaded: {image_url}")

        # AI生成画像URLをDBに保存
        supabase.table("video_generations").update({
            "ai_generated_image_urls": ai_generated_image_urls
        }).eq("id", video_id).execute()

        # 全3枚の画像URL (オリジナル + AI生成2枚)
        all_image_urls = [original_image_url] + ai_generated_image_urls

        # image_urlsもDBに保存
        supabase.table("video_generations").update({
            "image_urls": all_image_urls
        }).eq("id", video_id).execute()

        logger.info(f"All 3 frames ready: {all_image_urls}")
        await update_video_status(video_id, "processing", progress=55)

        # Step 4: KlingAIで動画生成
        logger.info(f"Starting KlingAI video generation: {video_id}")

        kling_task_id = await generate_video(
            image_urls=all_image_urls,
            prompt=story_text,  # ユーザーのストーリーテキストを使用
        )

        if not kling_task_id:
            raise Exception("KlingAI task creation failed")

        logger.info(f"KlingAI task created: {kling_task_id}")
        await update_video_status(video_id, "processing", progress=60)

        # KlingAIの完了を待つ（最大5分、10秒間隔でポーリング）
        max_attempts = 30
        raw_video_url = None

        for attempt in range(max_attempts):
            await asyncio.sleep(10)

            status_data = await check_video_status(kling_task_id)
            if not status_data:
                continue

            status = status_data.get("status")
            progress = min(60 + (attempt * 1), 80)  # 60% → 80%
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

        # Step 5: FFmpeg処理 → R2アップロード
        await update_video_status(video_id, "processing", progress=85)

        with tempfile.TemporaryDirectory() as temp_dir:
            raw_video_path = os.path.join(temp_dir, "raw_video.mp4")
            processed_video_path = os.path.join(temp_dir, "processed_video.mp4")

            # ダウンロード
            success = await download_video(raw_video_url, raw_video_path)
            if not success:
                raise Exception("Failed to download video from KlingAI")

            await update_video_status(video_id, "processing", progress=88)

            # FFmpeg処理（フィルムグレイン + オプションのオーバーレイ/BGM）
            # BGMのパスを取得
            bgm_path = None
            if video_data.get("bgm_track_id"):
                bgm_response = supabase.table("bgm_tracks").select("file_url").eq("id", video_data["bgm_track_id"]).single().execute()
                if bgm_response.data:
                    bgm_url = bgm_response.data["file_url"]
                    bgm_path = os.path.join(temp_dir, "bgm.mp3")
                    # TODO: 実際のBGMファイルダウンロード実装

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
                    lut_intensity=0.3,  # 50%→30%に軽減
                )
            except FFmpegError as e:
                logger.warning(f"FFmpeg processing failed, using raw video: {e}")
                processed_video_path = raw_video_path

            await update_video_status(video_id, "processing", progress=92)

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

            await update_video_status(video_id, "processing", progress=96)

            # Raw動画もR2に保存
            raw_key = f"videos/{user_id}/{video_id}/raw.mp4"
            with open(raw_video_path, "rb") as f:
                raw_bytes = f.read()
            raw_url_saved = await r2_client.upload_file(
                file_data=raw_bytes,
                key=raw_key,
                content_type="video/mp4",
            )

        # Step 6: 完了
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


async def start_story_processing(video_id: str) -> None:
    """ストーリー動画処理をバックグラウンドで開始"""
    # asyncio.create_taskでバックグラウンド実行
    asyncio.create_task(process_story_generation(video_id))


async def process_story_video_from_preview(video_id: str) -> None:
    """
    プレビュー済みストーリー動画の処理（KlingAI動画生成から開始）

    画像生成はプレビュー時に完了しているので、動画生成から開始する
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
        story_text = video_data.get("story_text", "")

        # image_urlsを取得（プレビュー時に設定済み）
        all_image_urls = video_data.get("image_urls", [])
        if not all_image_urls:
            # フォールバック: original + ai_generated から構築
            all_image_urls = [video_data["original_image_url"]] + video_data.get("ai_generated_image_urls", [])

        if len(all_image_urls) < 2:
            raise Exception("Not enough images for video generation")

        # ストーリーボードプロンプトを取得（プレビュー時に生成済み）
        storyboard_prompts = video_data.get("storyboard_prompts", [])

        # 動画生成用のプロンプトを構築
        # プレビューで生成した構造化プロンプトを使用（KlingAI制限: 2500文字以内）
        if storyboard_prompts and len(storyboard_prompts) > 0:
            # 全フレームのfull_promptを結合
            video_prompt_parts = []
            for i, fp in enumerate(storyboard_prompts, start=1):
                if isinstance(fp, dict):
                    full_prompt = fp.get("full_prompt", "")
                    if full_prompt:
                        video_prompt_parts.append(f"Frame {i}: {full_prompt}")

            raw_prompt = " | ".join(video_prompt_parts) if video_prompt_parts else story_text

            # 2400文字を超える場合はGeminiで要約
            if len(raw_prompt) > 2400:
                logger.info(f"Prompt too long ({len(raw_prompt)} chars), summarizing with Gemini...")
                video_prompt = await _summarize_prompt_for_kling(raw_prompt, story_text)
            else:
                video_prompt = raw_prompt

            logger.info(f"Using structured prompts for video ({len(video_prompt)} chars): {video_prompt[:200]}...")
        else:
            video_prompt = story_text
            logger.warning(f"No storyboard prompts found, using story_text: {story_text}")

        # ステータスを processing に更新
        await update_video_status(video_id, "processing", progress=10)
        logger.info(f"Starting video processing from preview: {video_id}")

        # KlingAIで動画生成
        logger.info(f"Starting KlingAI video generation: {video_id}")

        kling_task_id = await generate_video(
            image_urls=all_image_urls,
            prompt=video_prompt,
        )

        if not kling_task_id:
            raise Exception("KlingAI task creation failed")

        logger.info(f"KlingAI task created: {kling_task_id}")
        await update_video_status(video_id, "processing", progress=30)

        # KlingAIの完了を待つ
        max_attempts = 30
        raw_video_url = None

        for attempt in range(max_attempts):
            await asyncio.sleep(10)

            status_data = await check_video_status(kling_task_id)
            if not status_data:
                continue

            kling_status = status_data.get("status")
            progress = min(30 + (attempt * 2), 70)
            await update_video_status(video_id, "processing", progress=progress)

            if kling_status == "completed":
                raw_video_url = status_data.get("video_url")
                logger.info(f"KlingAI completed: {raw_video_url}")
                break
            elif kling_status == "failed":
                error = status_data.get("error", "Unknown error")
                raise Exception(f"KlingAI generation failed: {error}")

        else:
            raise Exception("KlingAI generation timed out")

        # FFmpeg処理 → R2アップロード
        await update_video_status(video_id, "processing", progress=75)

        with tempfile.TemporaryDirectory() as temp_dir:
            raw_video_path = os.path.join(temp_dir, "raw_video.mp4")
            processed_video_path = os.path.join(temp_dir, "processed_video.mp4")

            # ダウンロード
            success = await download_video(raw_video_url, raw_video_path)
            if not success:
                raise Exception("Failed to download video from KlingAI")

            await update_video_status(video_id, "processing", progress=80)

            # FFmpeg処理（カラーグレーディング + LUT + フィルムグレイン + オプションのオーバーレイ/BGM）
            bgm_path = None
            if video_data.get("bgm_track_id"):
                bgm_response = supabase.table("bgm_tracks").select("file_url").eq("id", video_data["bgm_track_id"]).single().execute()
                if bgm_response.data:
                    bgm_url = bgm_response.data["file_url"]
                    bgm_path = os.path.join(temp_dir, "bgm.mp3")

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
                    lut_intensity=0.3,  # 50%→30%に軽減
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

        # 完了
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


async def start_story_video_processing(video_id: str) -> None:
    """プレビュー済みストーリー動画処理をバックグラウンドで開始"""
    asyncio.create_task(process_story_video_from_preview(video_id))
