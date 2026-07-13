"""
背景削除（Background Removal）サービス

背景削除レコードの CRUD 操作を担当する
"""

from typing import Optional

from app.core.config import settings
from app.core.supabase import get_supabase


async def create_background_removal(
    user_id: str,
    source_type: str,
    source_url: str,
    output_format: str = "webm",
) -> dict:
    """
    背景削除レコードを DB に作成して返す

    Args:
        user_id: ユーザー ID
        source_type: ソースタイプ ("video" または "image")
        source_url: ソース URL
        output_format: 出力形式 ("webm" または "prores"。image の場合は png に強制)

    Returns:
        dict: 作成されたレコード
    """
    # 画像ソースは常に透過 PNG 出力
    if source_type == "image":
        output_format = "png"

    model_id = (
        settings.FAL_BG_REMOVAL_VIDEO_MODEL
        if source_type == "video"
        else settings.FAL_BG_REMOVAL_IMAGE_MODEL
    )

    supabase = get_supabase()

    record_data = {
        "user_id": user_id,
        "source_type": source_type,
        "source_url": source_url,
        "output_format": output_format,
        "provider": "fal",
        "model_id": model_id,
        "status": "pending",
        "progress": 0,
    }

    response = supabase.table("background_removals").insert(record_data).execute()
    record = response.data[0]

    return _format_background_removal_response(record)


async def get_background_removal_status(user_id: str, generation_id: str) -> Optional[dict]:
    """
    背景削除のステータスを取得する

    Args:
        user_id: ユーザー ID（所有者確認用）
        generation_id: 生成 ID

    Returns:
        dict: ステータス情報、存在しない場合は None
    """
    supabase = get_supabase()

    response = (
        supabase.table("background_removals")
        .select("id, status, progress, output_url, error_message")
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
        "output_url": data.get("output_url"),
        "error_message": data.get("error_message"),
    }


async def list_background_removals(
    user_id: str,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """
    ユーザーの背景削除履歴を取得する（新しい順）

    Args:
        user_id: ユーザー ID
        page: ページ番号（1 始まり）
        per_page: 1ページあたりの件数

    Returns:
        dict: items / total / page / per_page を含む辞書
    """
    supabase = get_supabase()

    offset = (page - 1) * per_page

    response = (
        supabase.table("background_removals")
        .select(
            "id, status, progress, source_type, output_format, output_url, created_at",
            count="exact",
        )
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    items = [_format_background_removal_response(record) for record in (response.data or [])]

    return {
        "items": items,
        "total": response.count or 0,
        "page": page,
        "per_page": per_page,
    }


async def update_background_removal_status(
    generation_id: str,
    status: str,
    progress: Optional[int] = None,
    output_url: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    背景削除のステータスを DB で更新する

    Args:
        generation_id: 生成 ID
        status: 新しいステータス
        progress: 進捗（0-100）
        output_url: 出力 URL（完了時）
        error_message: エラーメッセージ（失敗時）
    """
    supabase = get_supabase()

    update_data: dict = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if output_url is not None:
        update_data["output_url"] = output_url
    if error_message is not None:
        update_data["error_message"] = error_message

    supabase.table("background_removals").update(update_data).eq("id", generation_id).execute()


def _format_background_removal_response(data: dict) -> dict:
    """DB レコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "source_type": data.get("source_type", ""),
        "output_format": data.get("output_format", ""),
        "output_url": data.get("output_url"),
        "created_at": data.get("created_at", ""),
    }
