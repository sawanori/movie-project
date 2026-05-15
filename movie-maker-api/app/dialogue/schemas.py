"""
Dialogue (TTS ミックス) スキーマ定義
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

DialogueStatus = Literal["pending", "processing", "completed", "failed"]


class DialogueCreateRequest(BaseModel):
    """Dialogue 生成リクエスト"""

    video_url: str = Field(..., description="入力動画の公開 URL (R2 等)")
    text: str = Field(..., min_length=1, max_length=5000, description="セリフテキスト")
    voice_id: str = Field(..., description="TTS 音声 ID")
    # language は "ja" 固定。UI には表示しないが API レベルでは保持
    language: str = Field(default="ja", description="言語コード (固定: ja)")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="読み上げ速度")
    use_lip_sync: bool = Field(
        default=False,
        description="True の場合 Hedra でリップシンクを行う。False は ffmpeg 単純ミックス",
    )


class DialogueCreateResponse(BaseModel):
    """Dialogue 生成起動レスポンス"""

    id: str
    status: DialogueStatus
    created_at: str


class DialogueStatusResponse(BaseModel):
    """Dialogue 生成ステータスレスポンス"""

    id: str
    status: DialogueStatus
    output_video_url: Optional[str] = None
    error_message: Optional[str] = None
