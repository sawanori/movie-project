from pydantic import BaseModel
from datetime import datetime


class TemplateResponse(BaseModel):
    """テンプレートレスポンス"""
    id: str
    name: str
    description: str | None = None
    prompt_template: str
    style_keywords: list[str] = []
    thumbnail_url: str | None = None
    is_active: bool = True

    class Config:
        from_attributes = True


class BGMResponse(BaseModel):
    """BGMレスポンス"""
    id: str
    name: str
    duration_seconds: int
    category: str
    preview_url: str | None = None

    class Config:
        from_attributes = True
