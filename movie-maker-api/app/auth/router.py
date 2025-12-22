from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user, get_plan_limits
from app.auth.schemas import UserResponse, UsageResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """現在のユーザー情報を取得"""
    return UserResponse(
        id=current_user["user_id"],
        email=current_user["email"],
        display_name=current_user.get("display_name"),
        plan_type=current_user["plan_type"],
        video_count_this_month=current_user["video_count_this_month"],
    )


@router.get("/usage", response_model=UsageResponse)
async def get_usage(current_user: dict = Depends(get_current_user)):
    """今月の使用状況を取得"""
    limits = get_plan_limits(current_user["plan_type"])

    return UsageResponse(
        plan_type=current_user["plan_type"],
        videos_used=current_user["video_count_this_month"],
        videos_limit=limits["max_videos_per_month"],
        videos_remaining=max(0, limits["max_videos_per_month"] - current_user["video_count_this_month"]),
    )
