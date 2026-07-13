from pydantic import BaseModel, Field
from typing import Optional, List, Any, Literal
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


# ---------------------------------------------------------------------------
# ワークフロー実行 (server-side run) スキーマ (task_006)
# ---------------------------------------------------------------------------
class ExecuteRequest(BaseModel):
    """ワークフロー実行リクエスト。

    ``input_image_urls`` が指定されると、その件数分のバッチ実行になる
    (各 run の ImageInput 画像 URL を差し替える)。未指定なら単発実行 (置換なし)。
    ``video_provider`` / ``selection_priority`` は実行時の解決に使う (任意)。
    """
    input_image_urls: Optional[List[str]] = Field(
        None, description="バッチ実行用の入力画像 URL 群 (件数=バッチ数)"
    )
    video_provider: Optional[str] = Field(None, description="動画プロバイダの明示指定")
    selection_priority: Optional[Literal["quality", "speed", "cost"]] = Field(
        None, description="プロバイダ選択優先度"
    )


class ExecuteResponse(BaseModel):
    """ワークフロー実行レスポンス (202)。"""
    batch_id: UUID
    run_ids: List[UUID]


class RunResponse(BaseModel):
    """ワークフロー実行 (run) レスポンス。"""
    id: UUID
    workflow_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None
    status: Literal[
        "pending", "submitting", "processing", "completed", "failed", "canceled"
    ]
    progress: int = Field(0, description="進捗率 (0-100)")
    final_output_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StepStatus(BaseModel):
    """1 ステップの実行状態 (run 詳細で返す)。"""
    node_id: str
    node_type: str
    status: Literal[
        "pending", "submitting", "processing", "completed", "failed", "skipped"
    ]
    output_url: Optional[str] = None
    error_message: Optional[str] = None
    provider_used: Optional[str] = None


class RunDetailResponse(RunResponse):
    """ワークフロー実行 (run) 詳細レスポンス (ステップ内訳つき)。"""
    steps: List[StepStatus] = Field(default_factory=list)


class RunListResponse(BaseModel):
    """ワークフロー実行 (run) 一覧レスポンス。"""
    runs: List[RunResponse]
    total: int
    page: int
    per_page: int
