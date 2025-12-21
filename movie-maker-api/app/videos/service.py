from app.videos.schemas import VideoCreate, VideoStatus
from app.external.openai_client import optimize_prompt
from app.external.kling import generate_video as kling_generate
from app.external.r2 import upload_video


async def create_video(user_id: str, request: VideoCreate) -> dict:
    """動画生成のメインロジック"""
    # 1. プロンプト最適化
    optimized_prompt = await optimize_prompt(request.prompt, request.template_id)

    # 2. 動画生成（KlingAI）
    # TODO: 実際の実装

    # 3. 後処理（FFmpeg）
    # TODO: BGM・テキスト合成

    # 4. アップロード（R2）
    # TODO: 実装

    return {
        "id": "video-id",
        "user_id": user_id,
        "status": VideoStatus.PENDING,
        "optimized_prompt": optimized_prompt,
    }


async def get_user_videos(user_id: str, page: int = 1, per_page: int = 10) -> dict:
    """ユーザーの動画一覧を取得"""
    # TODO: Supabaseから取得
    return {
        "videos": [],
        "total": 0,
        "page": page,
        "per_page": per_page,
    }
