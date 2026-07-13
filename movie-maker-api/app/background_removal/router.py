"""
背景削除（Background Removal）ルーター
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user
from app.background_removal.schemas import (
    BackgroundRemovalRequest,
    BackgroundRemovalResponse,
    BackgroundRemovalStatusResponse,
    BackgroundRemovalListResponse,
)
from app.background_removal.service import (
    create_background_removal,
    get_background_removal_status,
    list_background_removals,
)
from app.tasks.bg_removal_processor import start_bg_removal_processing

router = APIRouter(prefix="/background-removal", tags=["BackgroundRemoval"])


@router.post("", response_model=BackgroundRemovalResponse)
async def create_removal(
    request: BackgroundRemovalRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    背景削除を開始する

    動画または画像の背景を AI で削除し、透過アセットを生成する。
    バックグラウンドタスクを起動し、生成レコードを返す。
    """
    user_id = current_user["user_id"]

    # DB にレコードを作成
    generation = await create_background_removal(
        user_id=user_id,
        source_type=request.source_type,
        source_url=request.source_url,
        output_format=request.output_format,
    )

    # バックグラウンドタスクを開始
    await start_bg_removal_processing(generation["id"])

    return BackgroundRemovalResponse(
        id=generation["id"],
        status=generation["status"],
        progress=generation.get("progress", 0),
        source_type=generation["source_type"],
        output_format=generation["output_format"],
        output_url=generation.get("output_url"),
        created_at=generation.get("created_at", ""),
    )


@router.get("/{generation_id}/status", response_model=BackgroundRemovalStatusResponse)
async def get_status(
    generation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    背景削除のステータスを返す

    Args:
        generation_id: 生成 ID
    """
    user_id = current_user["user_id"]
    status = await get_background_removal_status(user_id, generation_id)

    if status is None:
        raise HTTPException(status_code=404, detail="Background removal not found")

    return BackgroundRemovalStatusResponse(
        id=status["id"],
        status=status["status"],
        progress=status.get("progress", 0),
        output_url=status.get("output_url"),
        error_message=status.get("error_message"),
    )


@router.get("", response_model=BackgroundRemovalListResponse)
async def list_removals(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    背景削除履歴を返す（新しい順）
    """
    user_id = current_user["user_id"]
    result = await list_background_removals(user_id, page=page, per_page=per_page)

    return BackgroundRemovalListResponse(
        items=[
            BackgroundRemovalResponse(
                id=item["id"],
                status=item["status"],
                progress=item.get("progress", 0),
                source_type=item["source_type"],
                output_format=item["output_format"],
                output_url=item.get("output_url"),
                created_at=item.get("created_at", ""),
            )
            for item in result["items"]
        ],
        total=result["total"],
        page=result["page"],
        per_page=result["per_page"],
    )
