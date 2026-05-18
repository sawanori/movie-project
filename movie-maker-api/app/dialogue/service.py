"""
Dialogue (TTS ミックス) サービス

dialogue_generations テーブルの CRUD 操作を担当する
"""

import logging
from typing import Optional

from app.core.config import settings
from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)


async def create_dialogue_generation(
    user_id: str,
    video_url: str,
    text: str,
    voice_id: str,
    language: str = "ja",
    speed: float = 1.0,
    use_lip_sync: bool = False,
    tts_instructions: Optional[str] = None,
) -> dict:
    """
    dialogue_generations テーブルにレコードを作成して返す

    Args:
        user_id: ユーザー ID
        video_url: 入力動画の URL
        text: セリフテキスト
        voice_id: TTS 音声 ID
        language: 言語コード (デフォルト: ja)
        speed: 読み上げ速度
        use_lip_sync: True の場合 Hedra でリップシンクを行う (デフォルト: False)
        tts_instructions: 感情/トーン指定 (gpt-4o-mini-tts のみ適用)。None の場合はデフォルト適用。

    Returns:
        dict: 作成された生成レコード
    """
    supabase = get_supabase()

    record_data = {
        "user_id": user_id,
        "video_url": video_url,
        "text": text,
        "voice_id": voice_id,
        "language": language,
        "speed": speed,
        "use_lip_sync": use_lip_sync,
        "status": "pending",
        # provider には DB DEFAULT がないため service 層で必ず明示的に設定する (N3 解決)
        "provider": settings.TTS_PROVIDER,
        "tts_instructions": tts_instructions,
    }

    response = supabase.table("dialogue_generations").insert(record_data).execute()
    return response.data[0]


async def get_dialogue_status(user_id: str, generation_id: str) -> Optional[dict]:
    """
    dialogue_generations からステータスを取得する

    Args:
        user_id: ユーザー ID (所有者確認用)
        generation_id: 生成 ID

    Returns:
        dict: ステータス情報。存在しない場合は None
    """
    supabase = get_supabase()

    response = (
        supabase.table("dialogue_generations")
        .select("id, status, output_video_url, error_message, created_at")
        .eq("id", generation_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if not response.data:
        return None

    data = response.data
    return {
        "id": str(data["id"]),
        "status": data["status"],
        "output_video_url": data.get("output_video_url"),
        "error_message": data.get("error_message"),
        "created_at": data.get("created_at", ""),
    }


async def update_dialogue_status(
    generation_id: str,
    status: str,
    output_video_url: Optional[str] = None,
    error_message: Optional[str] = None,
    tts_generation_id: Optional[str] = None,
    lip_sync_generation_id: Optional[str] = None,
) -> None:
    """
    ステータスを更新する (バックグラウンドタスクから呼ぶ)

    Args:
        generation_id: 生成 ID
        status: 新しいステータス
        output_video_url: 出力動画 URL (完了時)
        error_message: エラーメッセージ (失敗時)
        tts_generation_id: TTS 生成 ID (デバッグ/リトライ用)
        lip_sync_generation_id: LipSync 生成 ID (use_lip_sync=True 時のデバッグ/リトライ用)
    """
    supabase = get_supabase()

    update_data: dict = {"status": status}
    if output_video_url is not None:
        update_data["output_video_url"] = output_video_url
    if error_message is not None:
        update_data["error_message"] = error_message
    if tts_generation_id is not None:
        update_data["tts_generation_id"] = tts_generation_id
    if lip_sync_generation_id is not None:
        update_data["lip_sync_generation_id"] = lip_sync_generation_id

    supabase.table("dialogue_generations").update(update_data).eq("id", generation_id).execute()
