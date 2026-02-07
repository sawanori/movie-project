"""
BGM AI生成タスク

Suno APIを使用してBGMを生成し、動画に同期させる非同期タスク処理。

Note: SunoAPI.orgはコールバック方式のため、生成リクエスト後は
Webhookでコールバックを受け取りDBを更新します。
"""

import logging
import os
import tempfile

from app.core.supabase import get_supabase
from app.external.suno_client import suno_client, SunoAPIError
from app.external.r2 import download_file
from app.services.video_analyzer import video_analyzer
from app.services.ffmpeg_service import get_ffmpeg_service

logger = logging.getLogger(__name__)


async def update_bgm_status(
    bgm_id: str,
    status: str,
    progress: int = None,
    error_message: str = None,
    **extra_fields,
) -> None:
    """BGM生成ステータスを更新"""
    supabase = get_supabase()
    update_data = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if error_message is not None:
        update_data["error_message"] = error_message
    update_data.update(extra_fields)

    supabase.table("bgm_generations").update(update_data).eq("id", bgm_id).execute()


async def process_bgm_ai_generation(
    bgm_generation_id: str,
    concat_id: str,
    user_id: str,
    request_params: dict,
) -> None:
    """
    BGM AI生成の非同期タスク（フェーズ1: 分析と生成リクエスト）

    処理フロー:
    1. 結合動画をダウンロード
    2. 動画分析（auto_analyze=Trueの場合）
    3. Suno APIにBGM生成リクエスト送信
    4. Webhookでコールバック受信待ち（別処理）

    Suno APIはコールバック方式のため、生成完了はWebhookで通知されます。
    Webhook: /api/v1/webhooks/suno がDBを更新します。
    """
    supabase = get_supabase()

    try:
        # 結合動画情報を取得
        concat_response = (
            supabase.table("video_concatenations")
            .select("*")
            .eq("id", concat_id)
            .single()
            .execute()
        )
        concat_data = concat_response.data
        video_url = concat_data["final_video_url"]
        video_duration = concat_data.get("total_duration", 30)

        with tempfile.TemporaryDirectory() as temp_dir:
            # Step 1: 動画ダウンロード
            await update_bgm_status(bgm_generation_id, "analyzing", progress=5)

            video_path = os.path.join(temp_dir, "video.mp4")
            video_content = await download_file(video_url)
            with open(video_path, "wb") as f:
                f.write(video_content)

            # Step 2: 動画分析・プロンプト生成
            cut_points = []
            prompt = request_params.get("custom_prompt")

            if not prompt and request_params.get("auto_analyze", True):
                await update_bgm_status(bgm_generation_id, "analyzing", progress=15)

                # カット位置を取得（動画IDリストから推定）
                source_video_ids = concat_data.get("source_video_ids", [])
                if source_video_ids:
                    num_cuts = len(source_video_ids)
                    cut_points = [video_duration * i / num_cuts for i in range(num_cuts)]
                else:
                    cut_points = [0, video_duration / 3, video_duration * 2 / 3]

                suggestion = await video_analyzer.analyze_for_bgm(
                    video_path, cut_points, video_duration
                )

                prompt = suggestion.prompt
                await update_bgm_status(
                    bgm_generation_id, "analyzing", progress=25,
                    auto_generated_prompt=prompt,
                    detected_mood=suggestion.mood.value,
                    detected_genre=suggestion.genre.value,
                    detected_tempo_bpm=suggestion.tempo_bpm,
                )
            else:
                if not prompt:
                    prompt = "cinematic instrumental music, orchestral, medium tempo, professional production quality"
                await update_bgm_status(
                    bgm_generation_id, "analyzing", progress=25,
                    auto_generated_prompt=prompt,
                )

        # Step 3: Suno APIにBGM生成リクエスト送信
        await update_bgm_status(bgm_generation_id, "generating", progress=30)

        logger.info(f"Requesting BGM generation for {bgm_generation_id} with prompt: {prompt[:100]}...")

        suno_result = await suno_client.generate_music(
            prompt=prompt,
            bgm_generation_id=bgm_generation_id,
            make_instrumental=True,
            model="V3_5",
        )

        # タスクIDを保存
        await update_bgm_status(
            bgm_generation_id, "generating", progress=35,
            suno_task_id=suno_result.task_id,
        )

        logger.info(
            f"BGM generation request sent: bgm_id={bgm_generation_id}, "
            f"suno_task_id={suno_result.task_id}. Waiting for callback..."
        )

        # コールバック方式のため、ここで処理終了
        # Webhookが完了を受け取ったらDBを更新します

    except SunoAPIError as e:
        logger.error(f"Suno API error for {bgm_generation_id}: {e}")
        await update_bgm_status(bgm_generation_id, "failed", error_message=str(e))
    except Exception as e:
        logger.exception(f"BGM generation failed for {bgm_generation_id}: {e}")
        await update_bgm_status(bgm_generation_id, "failed", error_message=str(e))


async def process_bgm_post_processing(
    bgm_generation_id: str,
) -> None:
    """
    BGM後処理（フェーズ2: ビート同期とタイムストレッチ）

    Note: 現在は後処理機能を無効化しています。
    ビート同期やタイムストレッチは将来的に実装予定。
    WebhookでBGM生成完了時に既にcompletedに設定されるため、
    ここでは何もしません。
    """
    logger.info(f"Post-processing skipped for {bgm_generation_id} (feature not yet enabled)")


async def process_bgm_apply(
    concat_id: str,
    bgm_url: str,
    bgm_volume: float,
    original_volume: float,
    fade_in: float,
    fade_out: float,
) -> None:
    """BGMを動画に適用"""
    supabase = get_supabase()
    ffmpeg = get_ffmpeg_service()

    try:
        # 結合動画情報を取得
        concat_response = (
            supabase.table("video_concatenations")
            .select("*")
            .eq("id", concat_id)
            .single()
            .execute()
        )
        concat_data = concat_response.data
        video_url = concat_data["final_video_url"]
        user_id = concat_data["user_id"]

        with tempfile.TemporaryDirectory() as temp_dir:
            # ダウンロード
            video_path = os.path.join(temp_dir, "video.mp4")
            bgm_path = os.path.join(temp_dir, "bgm.mp3")
            output_path = os.path.join(temp_dir, "output_with_bgm.mp4")

            video_content = await download_file(video_url)
            with open(video_path, "wb") as f:
                f.write(video_content)

            bgm_content = await download_file(bgm_url)
            with open(bgm_path, "wb") as f:
                f.write(bgm_content)

            # BGM追加
            await ffmpeg.add_bgm(
                video_path=video_path,
                audio_path=bgm_path,
                output_path=output_path,
                video_volume=original_volume,
                audio_volume=bgm_volume,
                fade_out_duration=fade_out,
            )

            # R2にアップロード
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            from app.external.r2 import upload_video
            filename = f"{user_id}/concat/{concat_id}/final_with_bgm.mp4"
            final_url = await upload_video(
                file_content=video_bytes,
                filename=filename,
            )

            # 更新
            supabase.table("video_concatenations").update({
                "final_video_with_bgm_url": final_url,
            }).eq("id", concat_id).execute()

            logger.info(f"BGM applied to concat: {concat_id}")

    except Exception as e:
        logger.exception(f"BGM apply failed for {concat_id}: {e}")
        raise


async def start_bgm_ai_generation(
    bgm_generation_id: str,
    concat_id: str,
    user_id: str,
    request_params: dict,
) -> None:
    """BGM生成タスクを開始（非同期）"""
    await process_bgm_ai_generation(bgm_generation_id, concat_id, user_id, request_params)


async def start_bgm_post_processing(bgm_generation_id: str) -> None:
    """BGM後処理タスクを開始（非同期）"""
    await process_bgm_post_processing(bgm_generation_id)


async def start_bgm_apply(
    concat_id: str,
    bgm_url: str,
    bgm_volume: float,
    original_volume: float,
    fade_in: float,
    fade_out: float,
) -> None:
    """BGM適用タスクを開始（非同期）"""
    await process_bgm_apply(concat_id, bgm_url, bgm_volume, original_volume, fade_in, fade_out)
