"""
LipSync (Lip Synchronization) スキーマ定義
"""

from typing import Optional
from pydantic import BaseModel, Field, field_validator


class LipSyncRequest(BaseModel):
    """LipSync 生成リクエスト"""
    source_type: str = Field(..., description="ソースタイプ ('image' または 'video')")
    source_url: str = Field(..., min_length=1, description="ソース画像または動画の URL")
    audio_url: str = Field(..., min_length=1, description="音声ファイルの URL")

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        allowed = {"image", "video"}
        if v not in allowed:
            raise ValueError(f"source_type must be one of {allowed}, got '{v}'")
        return v


class LipSyncResponse(BaseModel):
    """LipSync 生成レスポンス"""
    id: str
    status: str
    progress: int = 0
    output_video_url: Optional[str] = None
    created_at: str


class LipSyncStatusResponse(BaseModel):
    """LipSync 生成ステータスレスポンス"""
    id: str
    status: str
    progress: int
    output_video_url: Optional[str] = None
    error_message: Optional[str] = None


class AudioUploadResponse(BaseModel):
    """音声アップロードレスポンス"""
    audio_url: str
    duration_seconds: Optional[float] = None
