from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """現在のユーザー情報を取得"""
    return current_user
