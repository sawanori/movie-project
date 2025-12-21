from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config import settings

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Supabase JWTトークンを検証してユーザー情報を取得"""
    # TODO: Supabase JWT検証を実装
    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    # 仮実装: 実際はSupabaseでトークン検証
    return {"user_id": "temp-user-id", "email": "user@example.com"}
