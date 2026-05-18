"""
TTS (Text-to-Speech) サービス

TTS 生成レコードの CRUD 操作を担当する
"""

import logging
from typing import Optional

from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)


async def create_tts_generation(
    user_id: str,
    text: str,
    voice_id: str,
    language: str = "ja",
    speed: float = 1.0,
    instructions: Optional[str] = None,
    kana_text: Optional[str] = None,
    is_kana: bool = False,
) -> dict:
    """
    TTS 生成レコードを DB に作成して返す

    Args:
        user_id: ユーザー ID
        text: 読み上げテキスト
        voice_id: 音声 ID
        language: 言語コード
        speed: 読み上げ速度
        instructions: 感情/トーン指定 (gpt-4o-mini-tts のみ適用)。None の場合はデフォルト適用
        kana_text: AquesTalk カナ表記 (Voicevox 専用)。DB への保存のみ目的。
        is_kana: is_kana モードかどうか。tts_processor で generate_speech に渡すために記録する。

    Returns:
        dict: 作成された生成レコード
    """
    supabase = get_supabase()

    record_data = {
        "user_id": user_id,
        "text": text,
        "voice_id": voice_id,
        "language": language,
        "speed": speed,
        "status": "pending",
        "instructions": instructions,
        "kana_text": kana_text,
    }

    response = supabase.table("tts_generations").insert(record_data).execute()
    record = response.data[0]

    return _format_tts_response(record)


async def get_tts_status(user_id: str, generation_id: str) -> Optional[dict]:
    """
    TTS 生成のステータスを取得する

    Args:
        user_id: ユーザー ID（所有者確認用）
        generation_id: 生成 ID

    Returns:
        dict: ステータス情報、存在しない場合は None
    """
    supabase = get_supabase()

    response = (
        supabase.table("tts_generations")
        .select("id, status, audio_url, duration_seconds, error_message")
        .eq("id", generation_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if not response.data:
        return None

    data = response.data
    return {
        "id": data["id"],
        "status": data["status"],
        "audio_url": data.get("audio_url"),
        "duration_seconds": data.get("duration_seconds"),
        "error_message": data.get("error_message"),
    }


async def update_tts_status(
    generation_id: str,
    status: str,
    audio_url: Optional[str] = None,
    duration_seconds: Optional[float] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    TTS 生成のステータスを DB で更新する

    Args:
        generation_id: 生成 ID
        status: 新しいステータス
        audio_url: 音声 URL（完了時）
        duration_seconds: 音声の長さ（秒）
        error_message: エラーメッセージ（失敗時）
    """
    supabase = get_supabase()

    update_data = {"status": status}
    if audio_url is not None:
        update_data["audio_url"] = audio_url
    if duration_seconds is not None:
        update_data["duration_seconds"] = duration_seconds
    if error_message is not None:
        update_data["error_message"] = error_message

    supabase.table("tts_generations").update(update_data).eq("id", generation_id).execute()


def _format_tts_response(data: dict) -> dict:
    """DB レコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "text": data["text"],
        "voice_id": data["voice_id"],
        "language": data.get("language", "ja"),
        "speed": data.get("speed", 1.0),
        "status": data["status"],
        "audio_url": data.get("audio_url"),
        "duration_seconds": data.get("duration_seconds"),
        "error_message": data.get("error_message"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }
