"""
Dialogue (TTS + ffmpeg ミックス / Hedra リップシンク) バックグラウンドタスク

フロー (共通):
  1. dialogue_generations レコード取得
  2. ステータスを processing に更新
  3. TTS 生成 (tts/service.py を直接呼び出し + tts_processor を直列 await)

フロー (use_lip_sync=False, 従来):
  4. 元動画ダウンロード
  5. 音声ダウンロード
  6. ffmpeg_service.mix_audio_to_video() でミックス
  7. R2 にアップロード
  8. dialogue_generations を completed に更新

フロー (use_lip_sync=True, 新規):
  4. lip_sync_generations レコード作成 (source_type='video')
  5. process_lip_sync_generation を直 await (Hedra ポーリング 最大 6 分)
  6. 完了後に get_lip_sync_status で再 fetch (例外は握り潰されるため)
  7. dialogue_generations を completed に更新 (output_video_url は Hedra → R2 にアップロード済の URL)
"""

import asyncio
import logging
import os
import tempfile
import uuid
from typing import Optional

import httpx

from app.core.supabase import get_supabase
from app.dialogue.service import update_dialogue_status
from app.external.r2 import upload_video
from app.lip_sync.service import create_lip_sync_generation, get_lip_sync_status
from app.services.ffmpeg_service import FFmpegError, get_ffmpeg_service
from app.tasks.lip_sync_processor import process_lip_sync_generation
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
        # use_lip_sync は新規カラム。default False で既存レコードを後方互換にする
        use_lip_sync = record.get("use_lip_sync", False)
        tts_instructions = record.get("tts_instructions")  # None の場合はデフォルト適用
        kana_text = record.get("kana_text")  # None の場合は通常テキスト読み上げ

        # 2. ステータスを processing に更新
        await update_dialogue_status(generation_id, "processing")
        logger.info(
            f"Starting dialogue processing: {generation_id} "
            f"(use_lip_sync={use_lip_sync}, is_kana={bool(kana_text)})"
        )

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
                use_lip_sync=use_lip_sync,
                tts_instructions=tts_instructions,
                kana_text=kana_text,
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
    use_lip_sync: bool,
    tts_instructions: Optional[str] = None,
    kana_text: Optional[str] = None,
) -> None:
    """
    コア処理 (asyncio.wait_for でラップされる)

    TTS は常に実行する。その後 use_lip_sync で分岐:
      - True  → Hedra リップシンク (_run_lip_sync_and_get_video_url)
      - False → ffmpeg ミックス (_run_ffmpeg_mix)
    """
    # 3. TTS 生成 (use_lip_sync 関係なく必須)
    audio_url = await _run_tts_and_get_audio_url(
        text=text,
        voice_id=voice_id,
        language=language,
        speed=speed,
        user_id=user_id,
        generation_id=generation_id,
        tts_instructions=tts_instructions,
        kana_text=kana_text,
    )

    # 4-7. use_lip_sync で経路分岐
    if use_lip_sync:
        output_video_url = await _run_lip_sync_and_get_video_url(
            video_url=video_url,
            audio_url=audio_url,
            user_id=user_id,
            generation_id=generation_id,
        )
    else:
        output_video_url = await _run_ffmpeg_mix(
            video_url=video_url,
            audio_url=audio_url,
            generation_id=generation_id,
        )

    # 8. completed に更新 (共通)
    await update_dialogue_status(
        generation_id,
        "completed",
        output_video_url=output_video_url,
    )
    logger.info(
        f"Dialogue processing completed: {generation_id}, url={output_video_url}"
    )


async def _run_ffmpeg_mix(
    video_url: str,
    audio_url: str,
    generation_id: str,
) -> str:
    """
    既存の ffmpeg ミックス処理 (リップシンクなし)。

    元動画 + 音声 → ffmpeg amix → R2 アップロード → output_video_url 返却。

    変更前 _process_core L132-173 のロジックをそのまま関数化したもの。
    tempfile.TemporaryDirectory はこの関数内に閉じ込めて、リップシンク経路では
    一時ディレクトリを作らない。

    Args:
        video_url: 元動画 URL
        audio_url: TTS 出力音声 URL
        generation_id: Dialogue 生成 ID (R2 のファイル名に使用)

    Returns:
        str: 合成済み動画 URL (R2)
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        # 元動画ダウンロード
        local_video_path = os.path.join(tmp_dir, f"input_{uuid.uuid4().hex}.mp4")
        await _download_file(video_url, local_video_path)

        # 音声ダウンロード
        local_audio_path = os.path.join(tmp_dir, f"audio_{uuid.uuid4().hex}.mp3")
        await _download_file(audio_url, local_audio_path)

        # ffmpeg ミックス
        output_path = os.path.join(tmp_dir, f"output_{uuid.uuid4().hex}.mp4")
        ffmpeg_service = get_ffmpeg_service()
        await ffmpeg_service.mix_audio_to_video(
            video_path=local_video_path,
            audio_path=local_audio_path,
            output_path=output_path,
        )

        # R2 にアップロード
        with open(output_path, "rb") as f:
            video_content = f.read()

        output_filename = f"dialogue/{generation_id}.mp4"
        output_video_url = await upload_video(video_content, output_filename)
        return output_video_url


async def _run_lip_sync_and_get_video_url(
    video_url: str,
    audio_url: str,
    user_id: str,
    generation_id: str,
) -> str:
    """
    Hedra リップシンクを実行して動画 URL を返す。

    B3 解決パターン踏襲: process_lip_sync_generation を直列 await する。
    asyncio.create_task によるバックグラウンド起動ラッパーは使わない (混乱回避)。

    フロー:
      1. lip_sync.service.create_lip_sync_generation で record 作成 (source_type='video')
      2. dialogue_generations に lip_sync_generation_id を記録 (デバッグ用 FK)
      3. process_lip_sync_generation を直 await (Hedra ポーリングはこの関数内で完結)
      4. status を再 fetch (process_lip_sync_generation は例外を握り潰す設計のため)
      5. completed → output_video_url を返す
      6. failed → _translate_hedra_error で日本語化した ValueError を投げる

    Args:
        video_url: 元動画 URL (Hedra の source_url に渡す)
        audio_url: TTS 出力音声 URL (Hedra の audio_url に渡す)
        user_id: ユーザー ID
        generation_id: Dialogue 生成 ID (lip_sync_generation_id FK 記録用)

    Returns:
        str: リップシンク済み動画 URL (R2)

    Raises:
        ValueError: Hedra リップシンクが failed になった、または record が見つからない場合
    """
    # 1. lip_sync レコード作成
    lip_sync_record = await create_lip_sync_generation(
        user_id=user_id,
        source_type="video",
        source_url=video_url,
        audio_url=audio_url,
    )
    lip_sync_id = lip_sync_record["id"]

    # 2. dialogue に lip_sync_generation_id を記録 (デバッグ用 FK)
    await update_dialogue_status(
        generation_id,
        "processing",
        lip_sync_generation_id=lip_sync_id,
    )

    # 3. Hedra ポーリング (直 await、最大 6 分)
    await process_lip_sync_generation(lip_sync_id)

    # 4. status 再 fetch (process_lip_sync_generation は例外を握り潰す設計)
    lip_sync_status = await get_lip_sync_status(user_id, lip_sync_id)
    if lip_sync_status is None:
        raise ValueError("リップシンク生成が見つかりません")

    # 5. completed → output_video_url を返す
    if lip_sync_status["status"] == "completed":
        output_video_url = lip_sync_status.get("output_video_url")
        if not output_video_url:
            raise ValueError("リップシンク生成は完了しましたが動画 URL が取得できません")
        return output_video_url

    # 6. failed → 日本語エラーを raise
    raise ValueError(_translate_hedra_error(lip_sync_status.get("error_message")))


def _translate_hedra_error(error_message: Optional[str]) -> str:
    """
    Hedra の英文エラーを日本語ユーザーメッセージに変換する。

    既知のキーワードベース判定。マッチしない場合は元エラーの先頭 200 文字を含む
    汎用メッセージを返す (Design Doc §7-3)。

    Args:
        error_message: Hedra から返ったエラー文字列 (None も許容)

    Returns:
        str: 日本語のユーザー向けエラーメッセージ
    """
    msg = (error_message or "").lower()
    if "face" in msg or "detect" in msg or "no face" in msg:
        return "動画から顔を検出できませんでした。キャラの顔がはっきり映る動画を使ってください"
    if "duration" in msg or "length" in msg or "too long" in msg:
        return "動画が長すぎます (Hedra の上限を超過)。1 分以内の動画を使ってください"
    if "quota" in msg or "credit" in msg:
        return "リップシンク サービスの利用上限に達しました。しばらくしてから再試行してください"
    if "timeout" in msg:
        return "リップシンク生成がタイムアウトしました (6 分)。再試行してください"
    if "401" in msg or "403" in msg or "unauthorized" in msg or "forbidden" in msg:
        return "リップシンク サービスに接続できません。管理者にお問い合わせください"
    # 不明なエラー: 元エラーの先頭 200 文字を保持
    if error_message:
        return f"リップシンク生成に失敗しました: {error_message[:200]}"
    return "リップシンク生成に失敗しました。動画とセリフを確認して再試行してください"


async def _run_tts_and_get_audio_url(
    text: str,
    voice_id: str,
    language: str,
    speed: float,
    user_id: str,
    generation_id: str,
    tts_instructions: Optional[str] = None,
    kana_text: Optional[str] = None,
) -> str:
    """
    TTS を内部的に実行して audio_url を返す

    既存の TTS サービスを HTTP 経由ではなく直接関数呼び出しで使用する。

    B3 解決: process_tts_generation を直列 await し、ポーリングループは使わない。

    kana_text が指定された場合、text の代わりに kana_text を TTS レコードに保存し、
    is_kana=True モード (AquesTalk カナ表記) で Voicevox を呼び出す。

    Args:
        text: 読み上げテキスト（kana_text が指定されている場合は表示・保存用）
        voice_id: TTS 音声 ID
        language: 言語コード
        speed: 読み上げ速度
        user_id: ユーザー ID
        generation_id: Dialogue 生成 ID (tts_generation_id FK 記録用)
        tts_instructions: 感情/トーン指定
        kana_text: AquesTalk カナ表記 (Voicevox 専用)。指定時は TTS 合成に kana_text を
                   使い is_kana=True で呼び出す

    Returns:
        str: audio_url

    Raises:
        ValueError: TTS が "failed" ステータスになった場合
    """
    # kana_text が指定されている場合は is_kana=True モードで合成する
    effective_text = kana_text if kana_text else text
    effective_is_kana = bool(kana_text)

    # 1. TTS 生成レコードを作成 (kana_text も保存する)
    tts_record = await create_tts_generation(
        user_id=user_id,
        text=effective_text,
        voice_id=voice_id,
        language=language,
        speed=speed,
        instructions=tts_instructions,
        kana_text=kana_text,
        is_kana=effective_is_kana,
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
