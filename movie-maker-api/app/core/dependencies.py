from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config import settings
from app.core.supabase import get_supabase

security = HTTPBearer(auto_error=False)

# 開発用モックユーザー
MOCK_USER = {
    "user_id": "a2022e56-1d9e-4430-a7a0-2c868d9b5bcd",
    "email": "snp.inc.info@gmail.com",
    "display_name": "inc snp",
    "plan_type": "free",
    "video_count_this_month": 0,
}


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Supabase JWTトークンを検証してユーザー情報を取得"""

    # 開発モードで認証ヘッダーがない場合はモックユーザーを返す
    if settings.DEBUG and (credentials is None or not credentials.credentials):
        return MOCK_USER

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    token = credentials.credentials

    try:
        # Supabase JWTを検証
        supabase = get_supabase()
        user_response = supabase.auth.get_user(token)

        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        user = user_response.user

        # usersテーブルからユーザー情報を取得
        user_data = supabase.table("users").select("*").eq("id", user.id).single().execute()

        if user_data.data:
            return {
                "user_id": str(user.id),
                "email": user.email,
                "display_name": user_data.data.get("display_name"),
                "plan_type": user_data.data.get("plan_type", "free"),
                "video_count_this_month": user_data.data.get("video_count_this_month", 0),
            }
        else:
            # usersテーブルにレコードがない場合
            return {
                "user_id": str(user.id),
                "email": user.email,
                "display_name": user.user_metadata.get("full_name") or user.user_metadata.get("name"),
                "plan_type": "free",
                "video_count_this_month": 0,
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
        )


def get_plan_limits(plan_type: str) -> dict:
    """プランごとの制限を取得"""
    limits = {
        "free": {"max_videos_per_month": 3, "max_video_duration": 5},
        "starter": {"max_videos_per_month": 5, "max_video_duration": 5},
        "pro": {"max_videos_per_month": 15, "max_video_duration": 5},
        "business": {"max_videos_per_month": 50, "max_video_duration": 5},
    }
    return limits.get(plan_type, limits["free"])


async def check_usage_limit(current_user: dict = Depends(get_current_user)) -> dict:
    """使用量制限をチェック"""
    # 開発モードでは制限をスキップ
    if settings.DEBUG:
        return current_user

    limits = get_plan_limits(current_user["plan_type"])

    if current_user["video_count_this_month"] >= limits["max_videos_per_month"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Monthly video limit reached ({limits['max_videos_per_month']} videos). Please upgrade your plan.",
        )

    return current_user
