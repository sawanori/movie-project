from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.videos.schemas import VideoCreate, VideoResponse, VideoListResponse
from app.videos import service

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def create_video(
    request: VideoCreate,
    current_user: dict = Depends(get_current_user),
):
    """動画を生成"""
    # TODO: 使用量チェック
    result = await service.create_video(current_user["user_id"], request)
    return result


@router.get("", response_model=VideoListResponse)
async def list_videos(
    page: int = 1,
    per_page: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """生成履歴を取得"""
    return await service.get_user_videos(current_user["user_id"], page, per_page)


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """動画の詳細を取得"""
    # TODO: 実装
    raise HTTPException(status_code=404, detail="Video not found")
