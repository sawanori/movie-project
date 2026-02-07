from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from uuid import UUID


class WorkflowBase(BaseModel):
    """ワークフロー基本スキーマ"""
    name: str = Field(..., min_length=1, max_length=100, description="ワークフロー名")
    description: Optional[str] = Field(None, max_length=500, description="説明")
    is_public: bool = Field(False, description="公開フラグ")


class WorkflowCreate(WorkflowBase):
    """ワークフロー作成リクエスト"""
    nodes: List[Any] = Field(..., description="React Flow nodes (JSONB)")
    edges: List[Any] = Field(..., description="React Flow edges (JSONB)")


class WorkflowUpdate(BaseModel):
    """ワークフロー更新リクエスト"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    nodes: Optional[List[Any]] = None
    edges: Optional[List[Any]] = None
    is_public: Optional[bool] = None


class WorkflowResponse(WorkflowBase):
    """ワークフローレスポンス"""
    id: UUID
    user_id: UUID
    nodes: List[Any]
    edges: List[Any]
    thumbnail_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowListItem(BaseModel):
    """ワークフロー一覧アイテム（軽量版）"""
    id: UUID
    name: str
    description: Optional[str] = None
    is_public: bool
    thumbnail_url: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    """ワークフロー一覧レスポンス"""
    workflows: List[WorkflowListItem]
    total: int
