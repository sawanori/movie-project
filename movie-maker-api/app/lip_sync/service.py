"""
LipSync (Lip Synchronization) サービス

LipSync 生成レコードの CRUD 操作を担当する
"""

import logging
from typing import Optional

from app.core.config import settings
from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)


async def create_lip_sync_generation(
    user_id: str,
    source_type: str,
    source_url: str,
    audio_url: str,
    provider: Optional[str] = None,
) -> dict:
    """
    LipSync 生成レコードを DB に作成して返す

    Args:
        user_id: ユーザー ID
        source_type: ソースタイプ ("image" または "video")
        source_url: ソース URL
        audio_url: 音声 URL
        provider: 使用するプロバイダー。未指定時は settings.LIP_SYNC_PROVIDER を使用
                  （モジュールロード時に値を固定しないよう、関数内で解決する）

    Returns:
        dict: 作成された生成レコード
    """
    provider = provider or settings.LIP_SYNC_PROVIDER

    supabase = get_supabase()

    record_data = {
        "user_id": user_id,
        "source_type": source_type,
        "source_url": source_url,
        "audio_url": audio_url,
        "provider": provider,
        "status": "pending",
        "progress": 0,
    }

    response = supabase.table("lip_sync_generations").insert(record_data).execute()
    record = response.data[0]

    return _format_lip_sync_response(record)


async def get_lip_sync_status(user_id: str, generation_id: str) -> Optional[dict]:
    """
    LipSync 生成のステータスを取得する

    Args:
        user_id: ユーザー ID（所有者確認用）
        generation_id: 生成 ID

    Returns:
        dict: ステータス情報、存在しない場合は None
    """
    supabase = get_supabase()

    response = (
        supabase.table("lip_sync_generations")
        .select("id, status, progress, output_video_url, error_message")
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
        "progress": data.get("progress", 0),
        "output_video_url": data.get("output_video_url"),
        "error_message": data.get("error_message"),
    }


async def list_lip_sync_generations(user_id: str) -> list[dict]:
    """
    ユーザーの LipSync 生成履歴を取得する

    Args:
        user_id: ユーザー ID

    Returns:
        list[dict]: 生成履歴のリスト（新しい順）
    """
    supabase = get_supabase()

    response = (
        supabase.table("lip_sync_generations")
        .select("id, status, progress, output_video_url, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    return [_format_list_item(record) for record in (response.data or [])]


async def update_lip_sync_status(
    generation_id: str,
    status: str,
    progress: Optional[int] = None,
    output_video_url: Optional[str] = None,
    provider_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    LipSync 生成のステータスを DB で更新する

    Args:
        generation_id: 生成 ID
        status: 新しいステータス
        progress: 進捗（0-100）
        output_video_url: 出力動画 URL（完了時）
        provider_task_id: プロバイダーのタスク ID
        error_message: エラーメッセージ（失敗時）
    """
    supabase = get_supabase()

    update_data: dict = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if output_video_url is not None:
        update_data["output_video_url"] = output_video_url
    if provider_task_id is not None:
        update_data["provider_task_id"] = provider_task_id
    if error_message is not None:
        update_data["error_message"] = error_message

    supabase.table("lip_sync_generations").update(update_data).eq("id", generation_id).execute()


def _format_lip_sync_response(data: dict) -> dict:
    """DB レコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "source_type": data["source_type"],
        "source_url": data["source_url"],
        "audio_url": data["audio_url"],
        "provider": data.get("provider", "hedra"),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "output_video_url": data.get("output_video_url"),
        "error_message": data.get("error_message"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def _format_list_item(data: dict) -> dict:
    """一覧用の DB レコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "output_video_url": data.get("output_video_url"),
        "created_at": data.get("created_at"),
    }
