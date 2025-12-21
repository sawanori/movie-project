from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class VideoStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class VideoCreate(BaseModel):
    """動画生成リクエスト"""
    image_url: str = Field(..., description="アップロード済み画像のURL")
    prompt: str = Field(..., min_length=1, max_length=500, description="動画の説明")
    template_id: str = Field(..., description="使用するテンプレートID")
    bgm_id: str | None = Field(None, description="BGMのID（オプション）")
    overlay_text: str | None = Field(None, max_length=100, description="オーバーレイテキスト")


class VideoResponse(BaseModel):
    """動画生成レスポンス"""
    id: str
    user_id: str
    status: VideoStatus
    image_url: str
    prompt: str
    optimized_prompt: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class VideoListResponse(BaseModel):
    """動画一覧レスポンス"""
    videos: list[VideoResponse]
    total: int
    page: int
    per_page: int
