from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    """ユーザー情報レスポンス"""
    id: str
    email: EmailStr
    display_name: str | None = None
    plan_type: str = "free"
    video_count_this_month: int = 0

    class Config:
        from_attributes = True


class UsageResponse(BaseModel):
    """使用状況レスポンス"""
    plan_type: str
    videos_used: int
    videos_limit: int
    videos_remaining: int
