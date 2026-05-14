"""
Dialogue (TTS + ffmpeg ミックス) バックグラウンドタスク

フロー:
  1. dialogue_generations レコード取得
  2. ステータスを processing に更新
  3. TTS 生成 (tts/service.py を直接呼び出し + tts_processor を直列 await)
  4. 元動画ダウンロード
  5. 音声ダウンロード
  6. ffmpeg_service.mix_audio_to_video() でミックス
  7. R2 にアップロード
  8. dialogue_generations を completed に更新
"""

import asyncio
import logging
import os
import tempfile
import uuid

import httpx

from app.core.supabase import get_supabase
from app.dialogue.service import update_dialogue_status
from app.external.r2 import upload_video
from app.services.ffmpeg_service import FFmpegError, get_ffmpeg_service
from app.tasks.tts_processor import process_tts_generation
from app.tts.service import create_tts_generation, get_tts_status

logger = logging.getLogger(__name__)

# バックエンドは 10 分でタイムアウト
PROCESSING_TIMEOUT_SECONDS = 600


async def process_dialogue_generation(generation_id: str) -> None:
    """
    Dialogue 生成のメイン処理 (バックグラウンドで実行)

    全例外を try/except でキャッチして dialogue_generations を "failed" に更新する。
    """
    supabase = get_supabase()

    try:
        # 1. DB からレコード取得
        response = (
            supabase.table("dialogue_generations")
            .select("*")
            .eq("id", generation_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"Dialogue generation record not found: {generation_id}")
            return

        record = response.data
        user_id = record["user_id"]
        video_url = record["video_url"]
        text = record["text"]
        voice_id = record["voice_id"]
        language = record.get("language", "ja")
        speed = record.get("speed", 1.0)

        # 2. ステータスを processing に更新
        await update_dialogue_status(generation_id, "processing")
        logger.info(f"Starting dialogue processing: {generation_id}")

        # 3-8. メイン処理 (タイムアウト付き)
        await asyncio.wait_for(
            _process_core(
                generation_id=generation_id,
                user_id=user_id,
                video_url=video_url,
                text=text,
                voice_id=voice_id,
                language=language,
                speed=speed,
            ),
            timeout=PROCESSING_TIMEOUT_SECONDS,
        )

    except asyncio.TimeoutError:
        error_msg = f"処理がタイムアウトしました ({PROCESSING_TIMEOUT_SECONDS // 60} 分)"
        logger.error(f"Dialogue processing timed out: {generation_id}")
        await update_dialogue_status(generation_id, "failed", error_message=error_msg)

    except httpx.HTTPError as e:
        await update_dialogue_status(
            generation_id,
            "failed",
            error_message="入力動画を取得できませんでした。動画が削除されている可能性があります",
        )
        logger.exception("Dialogue video download failed", exc_info=e)

    except FFmpegError as e:
        await update_dialogue_status(
            generation_id,
            "failed",
            error_message="音声の合成に失敗しました。対応フォーマット: mp4 / webm",
        )
        logger.exception("Dialogue ffmpeg failed", exc_info=e)

    except ValueError as e:
        msg = str(e) if str(e) else "音声生成に失敗しました"
        # If the inner message contains no hiragana/katakana, wrap with JP prefix
        if not any(c >= "぀" for c in msg):
            msg = f"音声生成に失敗しました: {msg}"
        await update_dialogue_status(generation_id, "failed", error_message=msg)
        logger.exception("Dialogue TTS failed", exc_info=e)

    except Exception as e:
        await update_dialogue_status(
            generation_id,
            "failed",
            error_message="動画への音声合成中にエラーが発生しました",
        )
        logger.exception("Dialogue processing failed", exc_info=e)


async def _process_core(
    generation_id: str,
    user_id: str,
    video_url: str,
    text: str,
    voice_id: str,
    language: str,
    speed: float,
) -> None:
    """コア処理 (asyncio.wait_for でラップされる)"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        try:
            # 3. TTS 生成
            audio_url = await _run_tts_and_get_audio_url(
                text=text,
                voice_id=voice_id,
                language=language,
                speed=speed,
                user_id=user_id,
                generation_id=generation_id,
            )

            # 4. 元動画ダウンロード
            local_video_path = os.path.join(tmp_dir, f"input_{uuid.uuid4().hex}.mp4")
            await _download_file(video_url, local_video_path)

            # 5. 音声ダウンロード
            local_audio_path = os.path.join(tmp_dir, f"audio_{uuid.uuid4().hex}.mp3")
            await _download_file(audio_url, local_audio_path)

            # 6. ffmpeg ミックス
            output_path = os.path.join(tmp_dir, f"output_{uuid.uuid4().hex}.mp4")
            ffmpeg_service = get_ffmpeg_service()
            await ffmpeg_service.mix_audio_to_video(
                video_path=local_video_path,
                audio_path=local_audio_path,
                output_path=output_path,
            )

            # 7. R2 にアップロード
            with open(output_path, "rb") as f:
                video_content = f.read()

            output_filename = f"dialogue/{generation_id}.mp4"
            output_video_url = await upload_video(video_content, output_filename)

            # 8. completed に更新
            await update_dialogue_status(
                generation_id,
                "completed",
                output_video_url=output_video_url,
            )
            logger.info(
                f"Dialogue processing completed: {generation_id}, url={output_video_url}"
            )

        except Exception:
            # 再 raise して呼び出し元の except で failed 更新させる
            raise


async def _run_tts_and_get_audio_url(
    text: str,
    voice_id: str,
    language: str,
    speed: float,
    user_id: str,
    generation_id: str,
) -> str:
    """
    TTS を内部的に実行して audio_url を返す

    既存の TTS サービスを HTTP 経由ではなく直接関数呼び出しで使用する。

    B3 解決: process_tts_generation を直列 await し、ポーリングループは使わない。

    Args:
        text: 読み上げテキスト
        voice_id: TTS 音声 ID
        language: 言語コード
        speed: 読み上げ速度
        user_id: ユーザー ID
        generation_id: Dialogue 生成 ID (tts_generation_id FK 記録用)

    Returns:
        str: audio_url

    Raises:
        ValueError: TTS が "failed" ステータスになった場合
    """
    # 1. TTS 生成レコードを作成
    tts_record = await create_tts_generation(
        user_id=user_id,
        text=text,
        voice_id=voice_id,
        language=language,
        speed=speed,
    )
    tts_generation_id = tts_record["id"]

    # TTS 生成 ID を dialogue_generations に記録 (デバッグ/リトライ用)
    await update_dialogue_status(
        generation_id,
        "processing",
        tts_generation_id=tts_generation_id,
    )

    # 2. TTS を直列 await (ポーリングループは不要)
    await process_tts_generation(tts_generation_id)

    # 3. TTS 完了後にステータスを取得
    status_response = await get_tts_status(user_id, tts_generation_id)
    if status_response is None:
        raise ValueError(f"TTS generation record not found after processing: {tts_generation_id}")

    # 4. 結果に応じて返すか例外を投げる
    if status_response["status"] == "completed":
        audio_url = status_response.get("audio_url")
        if not audio_url:
            raise ValueError("TTS completed but audio_url is missing")
        return audio_url
    else:
        error_msg = status_response.get("error_message") or "TTS failed"
        raise ValueError(f"TTS generation failed: {error_msg}")


async def _download_file(url: str, dest_path: str) -> None:
    """
    URL からファイルをダウンロードして dest_path に書き込む

    Args:
        url: ダウンロード元 URL
        dest_path: 書き込み先ファイルパス

    Raises:
        httpx.HTTPStatusError: HTTP エラーステータスの場合
    """
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(response.content)


async def start_dialogue_processing(generation_id: str) -> None:
    """Dialogue 処理をバックグラウンドで開始"""
    asyncio.create_task(process_dialogue_generation(generation_id))
