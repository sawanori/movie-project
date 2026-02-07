"""
ワークフローAPIルーター

ユーザーが作成したノードベースのワークフローを管理する。
React Flowのノード/エッジ構造をJSONBとして保存し、
公開ワークフローのテンプレート共有機能を提供。
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID

from app.core.dependencies import get_current_user
from app.core.supabase import get_supabase
from .schemas import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowListItem,
    WorkflowListResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(current_user: dict = Depends(get_current_user)):
    """
    自分のワークフロー一覧を取得

    ユーザーが作成したワークフローを更新日時の降順で返す。
    軽量化のため、nodes/edgesは含めず一覧表示用フィールドのみ。

    Returns:
        WorkflowListResponse: ワークフロー一覧
    """
    user_id = current_user["user_id"]
    supabase = get_supabase()

    try:
        response = (
            supabase.table("user_workflows")
            .select("id, name, description, is_public, thumbnail_url, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        return WorkflowListResponse(
            workflows=[WorkflowListItem(**w) for w in response.data],
            total=len(response.data),
        )
    except Exception as e:
        logger.error(f"Failed to list workflows for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ワークフロー一覧の取得に失敗しました"
        )


@router.get("/public", response_model=WorkflowListResponse)
async def list_public_workflows():
    """
    公開ワークフロー一覧を取得

    他のユーザーが公開しているワークフローテンプレートを返す。
    認証不要で誰でも閲覧可能。最大50件。

    Returns:
        WorkflowListResponse: 公開ワークフロー一覧
    """
    supabase = get_supabase()

    try:
        response = (
            supabase.table("user_workflows")
            .select("id, name, description, is_public, thumbnail_url, updated_at")
            .eq("is_public", True)
            .order("updated_at", desc=True)
            .limit(50)
            .execute()
        )
        return WorkflowListResponse(
            workflows=[WorkflowListItem(**w) for w in response.data],
            total=len(response.data),
        )
    except Exception as e:
        logger.error(f"Failed to list public workflows: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="公開ワークフロー一覧の取得に失敗しました"
        )


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """
    ワークフローを取得

    自分のワークフローまたは公開ワークフローのみ閲覧可能。
    nodes/edgesを含む完全なデータを返す。

    Args:
        workflow_id: ワークフローID

    Returns:
        WorkflowResponse: ワークフロー詳細

    Raises:
        404: ワークフローが見つからない
        403: アクセス権限がない
    """
    user_id = current_user["user_id"]
    supabase = get_supabase()

    try:
        response = (
            supabase.table("user_workflows")
            .select("*")
            .eq("id", str(workflow_id))
            .single()
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to get workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    workflow = response.data
    # 自分のワークフローまたは公開ワークフローのみ閲覧可能
    if workflow["user_id"] != user_id and not workflow["is_public"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="このワークフローへのアクセス権限がありません"
        )

    return WorkflowResponse(**workflow)


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    data: WorkflowCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    ワークフローを作成

    React Flowのnodes/edgesをJSONBとして保存。
    作成後は非公開状態（is_public=false）がデフォルト。

    Args:
        data: ワークフロー作成データ

    Returns:
        WorkflowResponse: 作成されたワークフロー
    """
    user_id = current_user["user_id"]
    supabase = get_supabase()

    try:
        response = (
            supabase.table("user_workflows")
            .insert(
                {
                    "user_id": user_id,
                    "name": data.name,
                    "description": data.description,
                    "nodes": data.nodes,
                    "edges": data.edges,
                    "is_public": data.is_public,
                }
            )
            .execute()
        )
        return WorkflowResponse(**response.data[0])
    except Exception as e:
        logger.error(f"Failed to create workflow for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ワークフローの作成に失敗しました"
        )


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID,
    data: WorkflowUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    ワークフローを更新

    自分が所有するワークフローのみ更新可能。
    指定されたフィールドのみ更新（パーシャルアップデート）。

    Args:
        workflow_id: ワークフローID
        data: 更新データ

    Returns:
        WorkflowResponse: 更新されたワークフロー

    Raises:
        404: ワークフローが見つからない、またはアクセス権限がない
        400: 更新するフィールドがない
    """
    user_id = current_user["user_id"]
    supabase = get_supabase()

    # 所有権確認
    try:
        existing = (
            supabase.table("user_workflows")
            .select("user_id")
            .eq("id", str(workflow_id))
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    if not existing.data or existing.data["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    # 更新データを構築（Noneでないフィールドのみ）
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="更新するフィールドがありません"
        )

    try:
        response = (
            supabase.table("user_workflows")
            .update(update_data)
            .eq("id", str(workflow_id))
            .execute()
        )
        return WorkflowResponse(**response.data[0])
    except Exception as e:
        logger.error(f"Failed to update workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ワークフローの更新に失敗しました"
        )


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """
    ワークフローを削除

    自分が所有するワークフローのみ削除可能。
    削除は物理削除。

    Args:
        workflow_id: ワークフローID

    Raises:
        404: ワークフローが見つからない、またはアクセス権限がない
    """
    user_id = current_user["user_id"]
    supabase = get_supabase()

    # 所有権確認
    try:
        existing = (
            supabase.table("user_workflows")
            .select("user_id")
            .eq("id", str(workflow_id))
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    if not existing.data or existing.data["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    try:
        supabase.table("user_workflows").delete().eq("id", str(workflow_id)).execute()
    except Exception as e:
        logger.error(f"Failed to delete workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ワークフローの削除に失敗しました"
        )


@router.post("/{workflow_id}/duplicate", response_model=WorkflowResponse)
async def duplicate_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """
    ワークフローを複製

    公開ワークフローまたは自分のワークフローを複製して
    自分のライブラリにコピーする。
    複製されたワークフローは非公開状態で作成される。

    Args:
        workflow_id: 複製元ワークフローID

    Returns:
        WorkflowResponse: 複製されたワークフロー

    Raises:
        404: ワークフローが見つからない
        403: 複製権限がない（非公開かつ他人のワークフロー）
    """
    user_id = current_user["user_id"]
    supabase = get_supabase()

    # 元のワークフローを取得
    try:
        original = (
            supabase.table("user_workflows")
            .select("*")
            .eq("id", str(workflow_id))
            .single()
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to get workflow for duplication {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    if not original.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません"
        )

    workflow = original.data
    # 公開ワークフローまたは自分のワークフローのみ複製可能
    if workflow["user_id"] != user_id and not workflow["is_public"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="このワークフローを複製する権限がありません"
        )

    # 複製を作成
    try:
        response = (
            supabase.table("user_workflows")
            .insert(
                {
                    "user_id": user_id,
                    "name": f"{workflow['name']} (コピー)",
                    "description": workflow["description"],
                    "nodes": workflow["nodes"],
                    "edges": workflow["edges"],
                    "is_public": False,  # 複製は非公開
                }
            )
            .execute()
        )
        return WorkflowResponse(**response.data[0])
    except Exception as e:
        logger.error(f"Failed to duplicate workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ワークフローの複製に失敗しました"
        )
