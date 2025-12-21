from fastapi import APIRouter

from app.templates.schemas import TemplateResponse, BGMResponse

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateResponse])
async def list_templates():
    """利用可能なテンプレート一覧を取得"""
    # TODO: Supabaseから取得
    return []


@router.get("/bgm", response_model=list[BGMResponse])
async def list_bgm():
    """利用可能なBGM一覧を取得"""
    # TODO: Supabaseから取得
    return []
