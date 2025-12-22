from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.core.supabase import get_supabase
from app.videos.schemas import VideoCreate, VideoStatus, VideoResponse
from app.external.gemini_client import optimize_prompt
from app.external.kling import generate_video as kling_generate, check_video_status as kling_check_status


async def create_video(user_id: str, request: VideoCreate) -> dict:
    """動画生成のメインロジック"""
    supabase = get_supabase()

    # テンプレートのプロンプトを取得
    template_prompt = ""
    if request.template_id:
        template_response = supabase.table("templates").select("prompt_template, style_keywords").eq("id", request.template_id).single().execute()
        if template_response.data:
            template_prompt = template_response.data.get("prompt_template", "")
            style_keywords = template_response.data.get("style_keywords", [])
            if style_keywords:
                template_prompt += f" Style: {', '.join(style_keywords)}"

    # プロンプト最適化
    combined_prompt = f"{request.prompt}. {template_prompt}" if template_prompt else request.prompt
    optimized_prompt = await optimize_prompt(combined_prompt, request.template_id)

    # 有効期限（7日後）
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # video_generations テーブルに保存
    video_data = {
        "user_id": user_id,
        "template_id": request.template_id,
        "image_urls": request.image_urls,  # 新規: 複数画像対応
        "original_image_url": request.image_urls[0],  # 後方互換: 最初の画像
        "user_prompt": request.prompt,
        "optimized_prompt": optimized_prompt,
        "status": VideoStatus.PENDING.value,
        "progress": 0,
        "expires_at": expires_at.isoformat(),
    }

    # オーバーレイ設定
    if request.overlay:
        video_data["overlay_text"] = request.overlay.text
        video_data["overlay_position"] = request.overlay.position
        video_data["overlay_font"] = request.overlay.font
        video_data["overlay_color"] = request.overlay.color

    # BGM設定
    if request.bgm_track_id:
        video_data["bgm_track_id"] = request.bgm_track_id

    # DBに挿入
    response = supabase.table("video_generations").insert(video_data).execute()
    video_record = response.data[0]

    # ユーザーの動画生成カウントを更新
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # usage_logsに記録
    supabase.table("usage_logs").insert({
        "user_id": user_id,
        "video_generation_id": video_record["id"],
        "action_type": "video_generated",
    }).execute()

    return _format_video_response(video_record)


async def get_video(user_id: str, video_id: str) -> dict | None:
    """動画の詳細を取得"""
    supabase = get_supabase()

    response = supabase.table("video_generations").select("*").eq("id", video_id).eq("user_id", user_id).single().execute()

    if not response.data:
        return None

    return _format_video_response(response.data)


async def get_video_status(user_id: str, video_id: str) -> dict | None:
    """動画生成のステータスを取得"""
    supabase = get_supabase()

    response = supabase.table("video_generations").select("id, status, progress, final_video_url, error_message, expires_at").eq("id", video_id).eq("user_id", user_id).single().execute()

    if not response.data:
        return None

    data = response.data
    status = data["status"]

    # ステータスに応じたメッセージ
    messages = {
        "pending": "動画生成を準備中...",
        "processing": f"動画を生成中... ({data['progress']}%)",
        "completed": "動画生成が完了しました",
        "failed": data.get("error_message") or "動画生成に失敗しました",
    }

    return {
        "id": data["id"],
        "status": status,
        "progress": data["progress"],
        "message": messages.get(status, ""),
        "video_url": data.get("final_video_url"),
        "expires_at": data.get("expires_at"),
    }


async def get_user_videos(user_id: str, page: int = 1, per_page: int = 10) -> dict:
    """ユーザーの動画一覧を取得"""
    supabase = get_supabase()

    # 総数を取得
    count_response = supabase.table("video_generations").select("id", count="exact").eq("user_id", user_id).execute()
    total = count_response.count or 0

    # ページネーション
    offset = (page - 1) * per_page
    response = supabase.table("video_generations").select("*").eq("user_id", user_id).order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    videos = [_format_video_response(v) for v in response.data]

    return {
        "videos": videos,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


async def delete_video(user_id: str, video_id: str) -> bool:
    """動画を削除"""
    import logging
    logger = logging.getLogger(__name__)

    supabase = get_supabase()

    try:
        # 所有者確認
        logger.info(f"Checking ownership for video {video_id}")
        check_response = supabase.table("video_generations").select("id").eq("id", video_id).eq("user_id", user_id).single().execute()

        if not check_response.data:
            logger.warning(f"Video not found or not owned: {video_id}")
            return False

        # 既存のusage_logsのvideo_generation_idをNULLに更新（FK制約対策）
        logger.info(f"Updating usage_logs for video {video_id}")
        supabase.table("usage_logs").update({
            "video_generation_id": None
        }).eq("video_generation_id", video_id).execute()

        # 削除ログを記録
        logger.info(f"Inserting delete log for video {video_id}")
        supabase.table("usage_logs").insert({
            "user_id": user_id,
            "video_generation_id": None,
            "action_type": "video_deleted",
        }).execute()

        # 削除
        logger.info(f"Deleting video {video_id}")
        supabase.table("video_generations").delete().eq("id", video_id).execute()

        logger.info(f"Video deleted successfully: {video_id}")
        return True

    except Exception as e:
        logger.error(f"Error deleting video {video_id}: {e}")
        raise


async def update_video_status(video_id: str, status: str, progress: int = None, error_message: str = None, raw_video_url: str = None, final_video_url: str = None) -> None:
    """動画のステータスを更新（内部用）"""
    supabase = get_supabase()

    update_data = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if error_message is not None:
        update_data["error_message"] = error_message
    if raw_video_url is not None:
        update_data["raw_video_url"] = raw_video_url
    if final_video_url is not None:
        update_data["final_video_url"] = final_video_url

    supabase.table("video_generations").update(update_data).eq("id", video_id).execute()


def _format_video_response(data: dict) -> dict:
    """DBレコードをレスポンス形式に変換"""
    # image_urlsの取得（後方互換: なければoriginal_image_urlから生成）
    image_urls = data.get("image_urls") or [data["original_image_url"]]

    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "image_urls": image_urls,
        "original_image_url": data["original_image_url"],
        "user_prompt": data["user_prompt"],
        "optimized_prompt": data.get("optimized_prompt"),
        "overlay_text": data.get("overlay_text"),
        "overlay_position": data.get("overlay_position"),
        "raw_video_url": data.get("raw_video_url"),
        "final_video_url": data.get("final_video_url"),
        "error_message": data.get("error_message"),
        "expires_at": data.get("expires_at"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


async def create_story_video(user_id: str, image_url: str, story_text: str, bgm_track_id: str | None = None, overlay: dict | None = None) -> dict:
    """ストーリー動画生成のメインロジック（AI主導モード）"""
    from app.videos.schemas import VideoStatus
    from datetime import datetime, timedelta, timezone

    supabase = get_supabase()

    # 有効期限（7日後）
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # video_generations テーブルに保存
    video_data = {
        "user_id": user_id,
        "generation_mode": "story",
        "original_image_url": image_url,
        "story_text": story_text,
        "user_prompt": story_text,  # 互換性のためstory_textをuser_promptにも設定
        "status": VideoStatus.PENDING.value,
        "progress": 0,
        "expires_at": expires_at.isoformat(),
    }

    # オーバーレイ設定
    if overlay:
        video_data["overlay_text"] = overlay.get("text")
        video_data["overlay_position"] = overlay.get("position", "bottom")
        video_data["overlay_font"] = overlay.get("font", "default")
        video_data["overlay_color"] = overlay.get("color", "#FFFFFF")

    # BGM設定
    if bgm_track_id:
        video_data["bgm_track_id"] = bgm_track_id

    # DBに挿入
    response = supabase.table("video_generations").insert(video_data).execute()
    video_record = response.data[0]

    # ユーザーの動画生成カウントを更新
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # usage_logsに記録
    supabase.table("usage_logs").insert({
        "user_id": user_id,
        "video_generation_id": video_record["id"],
        "action_type": "video_generated",  # 既存のaction_typeを使用
    }).execute()

    return _format_story_video_response(video_record)


def _format_story_video_response(data: dict) -> dict:
    """ストーリー動画のDBレコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "generation_mode": data.get("generation_mode", "story"),
        "original_image_url": data["original_image_url"],
        "story_text": data.get("story_text", ""),
        "base_prompt": data.get("base_prompt"),
        "storyboard_prompts": data.get("storyboard_prompts"),
        "ai_generated_image_urls": data.get("ai_generated_image_urls", []),
        "image_urls": data.get("image_urls", []),
        "final_video_url": data.get("final_video_url"),
        "error_message": data.get("error_message"),
        "expires_at": data.get("expires_at"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }
