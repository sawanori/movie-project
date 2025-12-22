from fastapi import APIRouter, HTTPException

from app.core.supabase import get_supabase
from app.templates.schemas import TemplateResponse, BGMResponse

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateResponse])
async def list_templates():
    """利用可能なテンプレート一覧を取得"""
    try:
        supabase = get_supabase()
        response = supabase.table("templates").select("*").eq("is_active", True).execute()

        return [
            TemplateResponse(
                id=str(t["id"]),
                name=t["name"],
                description=t.get("description"),
                prompt_template=t["prompt_template"],
                style_keywords=t.get("style_keywords") or [],
                thumbnail_url=t.get("thumbnail_url"),
                is_active=t.get("is_active", True),
            )
            for t in response.data
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch templates: {str(e)}")


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: str):
    """テンプレートの詳細を取得"""
    try:
        supabase = get_supabase()
        response = supabase.table("templates").select("*").eq("id", template_id).eq("is_active", True).single().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Template not found")

        t = response.data
        return TemplateResponse(
            id=str(t["id"]),
            name=t["name"],
            description=t.get("description"),
            prompt_template=t["prompt_template"],
            style_keywords=t.get("style_keywords") or [],
            thumbnail_url=t.get("thumbnail_url"),
            is_active=t.get("is_active", True),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch template: {str(e)}")


@router.get("/bgm/list", response_model=list[BGMResponse])
async def list_bgm():
    """利用可能なBGM一覧を取得"""
    try:
        supabase = get_supabase()
        response = supabase.table("bgm_tracks").select("*").eq("is_active", True).execute()

        return [
            BGMResponse(
                id=str(b["id"]),
                name=b["name"],
                description=b.get("description"),
                duration_seconds=b.get("duration_seconds", 5),
                mood=b.get("mood"),
                file_url=b.get("file_url"),
            )
            for b in response.data
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch BGM tracks: {str(e)}")
