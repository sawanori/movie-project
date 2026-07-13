"""
背景削除（Background Removal）スキーマ定義
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class BackgroundRemovalRequest(BaseModel):
    """背景削除リクエスト"""
    source_type: Literal["video", "image"] = Field(..., description="ソースタイプ ('video' または 'image')")
    source_url: str = Field(..., min_length=1, description="ソース動画または画像の URL")
    output_format: Literal["webm", "prores"] = Field(
        "webm", description="出力形式（動画のみ有効。画像は常に透過 PNG）"
    )

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("source_url must be a valid http(s) URL")
        return v


class BackgroundRemovalResponse(BaseModel):
    """背景削除レスポンス"""
    id: str
    status: str
    progress: int = 0
    source_type: str
    output_format: str
    output_url: Optional[str] = None
    created_at: str


class BackgroundRemovalStatusResponse(BaseModel):
    """背景削除ステータスレスポンス"""
    id: str
    status: str
    progress: int
    output_url: Optional[str] = None
    error_message: Optional[str] = None


class BackgroundRemovalListResponse(BaseModel):
    """背景削除一覧レスポンス"""
    items: list[BackgroundRemovalResponse]
    total: int
    page: int
    per_page: int
