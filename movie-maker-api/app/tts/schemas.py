"""
TTS (Text-to-Speech) スキーマ定義
"""

from typing import Optional
from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    """TTS 生成リクエスト"""
    text: str = Field(..., min_length=1, max_length=5000, description="読み上げテキスト")
    voice_id: str = Field(..., description="音声 ID")
    language: str = Field(default="ja", description="言語コード")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="読み上げ速度（0.25〜4.0）")


class TTSResponse(BaseModel):
    """TTS 生成レスポンス"""
    id: str
    status: str
    audio_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    created_at: str


class TTSStatusResponse(BaseModel):
    """TTS 生成ステータスレスポンス"""
    id: str
    status: str
    audio_url: Optional[str] = None
    duration_seconds: Optional[float] = None


class VoiceInfo(BaseModel):
    """音声情報"""
    voice_id: str
    name: str
    language: Optional[str] = None
    preview_url: Optional[str] = None
