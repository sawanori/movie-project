# ノードエディタ Phase 4 実装計画書 v2

## 概要

Phase 4では、ワークフローの保存・読み込み・共有機能を実装する。

---

## 目標

- **Phase 4.1**: LocalStorage機能強化（複数ワークフロー管理）
- **Phase 4.2**: Supabase永続化（クラウド保存・同期）
- **Phase 4.3**: ワークフローマネージャーUI

---

## 現在の実装状況

| 機能 | 状況 | ファイル |
|------|------|----------|
| 単一ワークフローのLocalStorage保存 | ✅ 実装済み | `utils/default-workflow.ts` |
| 自動保存（ノード変更時） | ✅ 実装済み | `NodeEditor.tsx` |
| ワークフローリセット | ✅ 実装済み | `NodeEditor.tsx` |
| 既存ストレージキー | `'node-editor-workflow'` | `default-workflow.ts:105` |

### 既存の型定義確認

`lib/types/node-editor.ts` に既存の `Workflow` 型が定義済み（行162-169）:

```typescript
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
}
```

**重要**: 新しい型は既存型を継承して拡張する。

---

## Phase 4.1: LocalStorage機能強化

### 4.1.1 型定義の追加（既存型を継承）

**更新ファイル**: `lib/types/node-editor.ts`

```typescript
// ========== ワークフロー管理（Phase 4追加） ==========

/**
 * ローカル保存用ワークフロー（既存Workflow型を継承）
 */
export interface SavedWorkflow extends Workflow {
  thumbnail?: string; // Base64エンコードされたプレビュー画像（オプション）
}

/**
 * ワークフロー一覧表示用の軽量型
 */
export interface WorkflowListItem {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
}

/**
 * クラウド保存用の追加メタデータ
 */
export interface CloudWorkflowMetadata {
  description?: string;
  isPublic: boolean;
  thumbnailUrl?: string;
}
```

### 4.1.2 ストレージ関数（マイグレーション対応）

**新規ファイル**: `components/node-editor/utils/workflow-storage.ts`

```typescript
import type { Edge } from '@xyflow/react';
import type { WorkflowNode, SavedWorkflow, WorkflowListItem } from '@/lib/types/node-editor';

// ========== ストレージキー定義 ==========
const WORKFLOWS_KEY = 'node-editor-workflows';
const CURRENT_WORKFLOW_KEY = 'node-editor-current-workflow-id';
const LEGACY_STORAGE_KEY = 'node-editor-workflow'; // 旧バージョンとの互換性
const MAX_WORKFLOWS = 10; // ローカル保存の上限

// ========== マイグレーション（既存データ移行） ==========

/**
 * 旧バージョンのLocalStorageデータを新形式に移行
 * @returns 移行が行われた場合true
 */
export function migrateFromLegacyStorage(): boolean {
  try {
    const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyData) return false;

    const parsed = JSON.parse(legacyData);
    if (parsed.nodes && parsed.edges) {
      const name = `マイグレーション済み (${new Date().toLocaleDateString('ja-JP')})`;
      const result = saveLocalWorkflow(name, parsed.nodes, parsed.edges);
      if (result.success) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        console.log('Legacy workflow migrated successfully');
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

// ========== エラー型定義 ==========

type SaveResult =
  | { success: true; workflow: SavedWorkflow }
  | { success: false; error: string };

// ========== CRUD操作 ==========

/**
 * 全ワークフローリストを取得
 */
export function listLocalWorkflows(): WorkflowListItem[] {
  try {
    const data = localStorage.getItem(WORKFLOWS_KEY);
    if (!data) return [];
    const workflows: SavedWorkflow[] = JSON.parse(data);
    return workflows
      .map((w) => ({
        id: w.id,
        name: w.name,
        updatedAt: w.updatedAt,
        thumbnail: w.thumbnail,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

/**
 * ワークフローを取得
 */
export function getLocalWorkflow(id: string): SavedWorkflow | null {
  try {
    const data = localStorage.getItem(WORKFLOWS_KEY);
    if (!data) return null;
    const workflows: SavedWorkflow[] = JSON.parse(data);
    return workflows.find((w) => w.id === id) || null;
  } catch {
    return null;
  }
}

/**
 * ワークフローを保存（新規または更新）
 * エラーハンドリング強化版
 */
export function saveLocalWorkflow(
  name: string,
  nodes: WorkflowNode[],
  edges: Edge[],
  id?: string
): SaveResult {
  try {
    const workflows = getAllLocalWorkflows();
    const now = new Date().toISOString();

    // 更新の場合
    if (id) {
      const index = workflows.findIndex((w) => w.id === id);
      if (index !== -1) {
        workflows[index] = {
          ...workflows[index],
          name,
          nodes,
          edges,
          updatedAt: now,
        };
        localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));
        return { success: true, workflow: workflows[index] };
      }
    }

    // 新規作成
    const newWorkflow: SavedWorkflow = {
      id: crypto.randomUUID(),
      name,
      nodes,
      edges,
      createdAt: now,
      updatedAt: now,
    };

    // 上限チェック（古いものから削除）
    if (workflows.length >= MAX_WORKFLOWS) {
      workflows.sort(
        (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );
      workflows.shift();
    }

    workflows.push(newWorkflow);
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));

    return { success: true, workflow: newWorkflow };
  } catch (error) {
    // QuotaExceededError対応
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      return {
        success: false,
        error: 'ストレージ容量が不足しています。古いワークフローを削除してください。',
      };
    }
    console.error('Failed to save workflow:', error);
    return { success: false, error: '保存に失敗しました' };
  }
}

/**
 * ワークフローを削除
 */
export function deleteLocalWorkflow(id: string): boolean {
  try {
    const workflows = getAllLocalWorkflows();
    const filtered = workflows.filter((w) => w.id !== id);
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * 現在のワークフローIDを取得
 */
export function getCurrentWorkflowId(): string | null {
  return localStorage.getItem(CURRENT_WORKFLOW_KEY);
}

/**
 * 現在のワークフローIDを設定
 */
export function setCurrentWorkflowId(id: string | null): void {
  if (id) {
    localStorage.setItem(CURRENT_WORKFLOW_KEY, id);
  } else {
    localStorage.removeItem(CURRENT_WORKFLOW_KEY);
  }
}

/**
 * 全ワークフローをクリア（デバッグ用）
 */
export function clearAllLocalWorkflows(): void {
  localStorage.removeItem(WORKFLOWS_KEY);
  localStorage.removeItem(CURRENT_WORKFLOW_KEY);
}

// ========== 内部ヘルパー ==========

function getAllLocalWorkflows(): SavedWorkflow[] {
  try {
    const data = localStorage.getItem(WORKFLOWS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}
```

### 4.1.3 ワークフローマネージャーフック（依存配列修正版）

**新規ファイル**: `components/node-editor/hooks/useWorkflowManager.ts`

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode, SavedWorkflow, WorkflowListItem } from '@/lib/types/node-editor';
import {
  listLocalWorkflows,
  getLocalWorkflow,
  saveLocalWorkflow,
  deleteLocalWorkflow,
  getCurrentWorkflowId,
  setCurrentWorkflowId,
  migrateFromLegacyStorage,
} from '../utils/workflow-storage';
import { createDefaultWorkflow } from '../utils/default-workflow';

interface UseWorkflowManagerReturn {
  // 状態
  workflowList: WorkflowListItem[];
  currentWorkflowId: string | null;
  currentWorkflowName: string;
  isUnsaved: boolean;
  saveError: string | null;

  // アクション
  loadWorkflow: (id: string) => boolean;
  saveWorkflow: (name?: string) => boolean;
  saveAsNewWorkflow: (name: string) => boolean;
  deleteWorkflow: (id: string) => boolean;
  createNewWorkflow: () => void;
  refreshList: () => void;
  clearSaveError: () => void;

  // ノード変更通知
  markAsUnsaved: () => void;
}

export function useWorkflowManager(
  nodes: WorkflowNode[],
  edges: Edge[],
  setNodes: (nodes: WorkflowNode[]) => void,
  setEdges: (edges: Edge[]) => void
): UseWorkflowManagerReturn {
  const [workflowList, setWorkflowList] = useState<WorkflowListItem[]>([]);
  const [currentWorkflowId, setCurrentId] = useState<string | null>(null);
  const [currentWorkflowName, setCurrentWorkflowName] = useState('無題のワークフロー');
  const [isUnsaved, setIsUnsaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 初回マウント時のみ実行するためのref
  const isInitialized = useRef(false);

  // 初期化（マイグレーション + 読み込み）
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // レガシーデータのマイグレーション
    migrateFromLegacyStorage();

    // リスト更新
    setWorkflowList(listLocalWorkflows());

    // 保存されていた現在のワークフローを読み込み
    const savedId = getCurrentWorkflowId();
    if (savedId) {
      const workflow = getLocalWorkflow(savedId);
      if (workflow) {
        setNodes(workflow.nodes);
        setEdges(workflow.edges);
        setCurrentId(savedId);
        setCurrentWorkflowName(workflow.name);
        setIsUnsaved(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回のみ実行

  const refreshList = useCallback(() => {
    setWorkflowList(listLocalWorkflows());
  }, []);

  const loadWorkflow = useCallback(
    (id: string): boolean => {
      const workflow = getLocalWorkflow(id);
      if (!workflow) return false;

      setNodes(workflow.nodes);
      setEdges(workflow.edges);
      setCurrentId(id);
      setCurrentWorkflowId(id);
      setCurrentWorkflowName(workflow.name);
      setIsUnsaved(false);
      setSaveError(null);
      return true;
    },
    [setNodes, setEdges]
  );

  const saveWorkflow = useCallback(
    (name?: string): boolean => {
      const workflowName = name || currentWorkflowName;
      const result = saveLocalWorkflow(
        workflowName,
        nodes,
        edges,
        currentWorkflowId || undefined
      );

      if (result.success) {
        setCurrentId(result.workflow.id);
        setCurrentWorkflowId(result.workflow.id);
        setCurrentWorkflowName(result.workflow.name);
        setIsUnsaved(false);
        setSaveError(null);
        refreshList();
        return true;
      } else {
        setSaveError(result.error);
        return false;
      }
    },
    [nodes, edges, currentWorkflowId, currentWorkflowName, refreshList]
  );

  const saveAsNewWorkflow = useCallback(
    (name: string): boolean => {
      const result = saveLocalWorkflow(name, nodes, edges);

      if (result.success) {
        setCurrentId(result.workflow.id);
        setCurrentWorkflowId(result.workflow.id);
        setCurrentWorkflowName(result.workflow.name);
        setIsUnsaved(false);
        setSaveError(null);
        refreshList();
        return true;
      } else {
        setSaveError(result.error);
        return false;
      }
    },
    [nodes, edges, refreshList]
  );

  const deleteWorkflowById = useCallback(
    (id: string): boolean => {
      const success = deleteLocalWorkflow(id);
      if (success) {
        refreshList();
        if (id === currentWorkflowId) {
          setCurrentId(null);
          setCurrentWorkflowId(null);
          setCurrentWorkflowName('無題のワークフロー');
        }
      }
      return success;
    },
    [currentWorkflowId, refreshList]
  );

  const createNewWorkflow = useCallback(() => {
    const { nodes: defaultNodes, edges: defaultEdges } = createDefaultWorkflow();
    setNodes(defaultNodes);
    setEdges(defaultEdges);
    setCurrentId(null);
    setCurrentWorkflowId(null);
    setCurrentWorkflowName('無題のワークフロー');
    setIsUnsaved(true);
    setSaveError(null);
  }, [setNodes, setEdges]);

  const markAsUnsaved = useCallback(() => {
    setIsUnsaved(true);
  }, []);

  const clearSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  return {
    workflowList,
    currentWorkflowId,
    currentWorkflowName,
    isUnsaved,
    saveError,
    loadWorkflow,
    saveWorkflow,
    saveAsNewWorkflow,
    deleteWorkflow: deleteWorkflowById,
    createNewWorkflow,
    refreshList,
    clearSaveError,
    markAsUnsaved,
  };
}
```

### 4.1.4 NodeEditor.tsx との統合パターン

**更新ファイル**: `components/node-editor/NodeEditor.tsx`

既存の自動保存ロジックを`useWorkflowManager`に統合する方法:

```typescript
// NodeEditor.tsx 内での使用例

import { useWorkflowManager } from './hooks/useWorkflowManager';

export function NodeEditor({ onVideoGenerated }: NodeEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ワークフローマネージャーの初期化
  const {
    workflowList,
    currentWorkflowId,
    currentWorkflowName,
    isUnsaved,
    saveError,
    loadWorkflow,
    saveWorkflow,
    saveAsNewWorkflow,
    deleteWorkflow,
    createNewWorkflow,
    markAsUnsaved,
    clearSaveError,
  } = useWorkflowManager(nodes, edges, setNodes, setEdges);

  // ノード変更時に未保存フラグを立てる
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      markAsUnsaved();
    },
    [onNodesChange, markAsUnsaved]
  );

  // エッジ変更時に未保存フラグを立てる
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      markAsUnsaved();
    },
    [onEdgesChange, markAsUnsaved]
  );

  // 自動保存（10秒間隔、現在のワークフローがある場合のみ）
  useEffect(() => {
    const interval = setInterval(() => {
      if (nodes.length > 0 && currentWorkflowId && isUnsaved) {
        saveWorkflow();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [nodes.length, currentWorkflowId, isUnsaved, saveWorkflow]);

  // 既存のロジックは削除して useWorkflowManager に委譲
  // ...
}
```

**削除すべき既存コード**（`NodeEditor.tsx`から）:

```typescript
// 以下のuseEffectを削除（useWorkflowManagerに移行）
useEffect(() => {
  const savedWorkflow = loadWorkflowFromStorage();
  // ...
}, []);

useEffect(() => {
  const interval = setInterval(() => {
    if (nodes.length > 0) {
      saveWorkflowToStorage(nodes, edges);
    }
  }, 10000);
  // ...
}, [nodes, edges]);
```

---

## Phase 4.2: Supabase永続化

### 4.2.1 データベースマイグレーション（RLSポリシー名修正版）

**ファイル**: `docs/migrations/20260205_user_workflows.sql`

```sql
-- ユーザーワークフローテーブル
CREATE TABLE user_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  thumbnail_url TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 制約
  CONSTRAINT name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT description_length CHECK (description IS NULL OR char_length(description) <= 500)
);

-- インデックス
CREATE INDEX idx_user_workflows_user_id ON user_workflows(user_id);
CREATE INDEX idx_user_workflows_is_public ON user_workflows(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_user_workflows_updated_at ON user_workflows(updated_at DESC);

-- RLS有効化
ALTER TABLE user_workflows ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（明確な命名）
CREATE POLICY "users_select_own_workflows" ON user_workflows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_workflows" ON user_workflows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_workflows" ON user_workflows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_workflows" ON user_workflows
  FOR DELETE USING (auth.uid() = user_id);

-- 公開ワークフローは誰でも閲覧可能
CREATE POLICY "anon_select_public_workflows" ON user_workflows
  FOR SELECT USING (is_public = TRUE);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_user_workflows_updated_at
  BEFORE UPDATE ON user_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_user_workflows_updated_at();
```

### 4.2.2 バックエンドスキーマ定義

**新規ファイル**: `movie-maker-api/app/workflows/schemas.py`

```python
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
```

### 4.2.3 バックエンドAPI実装

**新規ファイル**: `movie-maker-api/app/workflows/router.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from app.core.auth import get_current_user
from app.core.database import get_supabase
from .schemas import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowListItem,
    WorkflowListResponse,
)

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(user=Depends(get_current_user)):
    """自分のワークフロー一覧を取得"""
    supabase = get_supabase()
    response = (
        supabase.table("user_workflows")
        .select("id, name, description, is_public, thumbnail_url, updated_at")
        .eq("user_id", str(user.id))
        .order("updated_at", desc=True)
        .execute()
    )
    return WorkflowListResponse(
        workflows=[WorkflowListItem(**w) for w in response.data],
        total=len(response.data),
    )


@router.get("/public", response_model=WorkflowListResponse)
async def list_public_workflows():
    """公開ワークフロー一覧を取得"""
    supabase = get_supabase()
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


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: UUID, user=Depends(get_current_user)):
    """ワークフローを取得"""
    supabase = get_supabase()
    response = (
        supabase.table("user_workflows")
        .select("*")
        .eq("id", str(workflow_id))
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = response.data
    # 自分のワークフローまたは公開ワークフローのみ閲覧可能
    if workflow["user_id"] != str(user.id) and not workflow["is_public"]:
        raise HTTPException(status_code=403, detail="Access denied")

    return WorkflowResponse(**workflow)


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(data: WorkflowCreate, user=Depends(get_current_user)):
    """ワークフローを作成"""
    supabase = get_supabase()
    response = (
        supabase.table("user_workflows")
        .insert(
            {
                "user_id": str(user.id),
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


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID, data: WorkflowUpdate, user=Depends(get_current_user)
):
    """ワークフローを更新"""
    supabase = get_supabase()

    # 所有権確認
    existing = (
        supabase.table("user_workflows")
        .select("user_id")
        .eq("id", str(workflow_id))
        .single()
        .execute()
    )
    if not existing.data or existing.data["user_id"] != str(user.id):
        raise HTTPException(status_code=404, detail="Workflow not found")

    # 更新
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    response = (
        supabase.table("user_workflows")
        .update(update_data)
        .eq("id", str(workflow_id))
        .execute()
    )
    return WorkflowResponse(**response.data[0])


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(workflow_id: UUID, user=Depends(get_current_user)):
    """ワークフローを削除"""
    supabase = get_supabase()

    # 所有権確認
    existing = (
        supabase.table("user_workflows")
        .select("user_id")
        .eq("id", str(workflow_id))
        .single()
        .execute()
    )
    if not existing.data or existing.data["user_id"] != str(user.id):
        raise HTTPException(status_code=404, detail="Workflow not found")

    supabase.table("user_workflows").delete().eq("id", str(workflow_id)).execute()


@router.post("/{workflow_id}/duplicate", response_model=WorkflowResponse)
async def duplicate_workflow(workflow_id: UUID, user=Depends(get_current_user)):
    """ワークフローを複製（公開ワークフローを自分のライブラリにコピー）"""
    supabase = get_supabase()

    # 元のワークフローを取得
    original = (
        supabase.table("user_workflows")
        .select("*")
        .eq("id", str(workflow_id))
        .single()
        .execute()
    )
    if not original.data:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = original.data
    # 公開ワークフローまたは自分のワークフローのみ複製可能
    if workflow["user_id"] != str(user.id) and not workflow["is_public"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # 複製
    response = (
        supabase.table("user_workflows")
        .insert(
            {
                "user_id": str(user.id),
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
```

### 4.2.4 APIクライアント拡張（型修正版）

**更新ファイル**: `lib/api/client.ts`

```typescript
// ========== ワークフローAPI（Phase 4追加） ==========

/**
 * クラウドワークフロー型
 * Note: nodes/edgesはJSONBとして保存されるためobject[]を使用
 */
export interface CloudWorkflow {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  nodes: object[];
  edges: object[];
  thumbnail_url?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface CloudWorkflowListItem {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  thumbnail_url?: string;
  updated_at: string;
}

export interface CloudWorkflowListResponse {
  workflows: CloudWorkflowListItem[];
  total: number;
}

export interface WorkflowCreateRequest {
  name: string;
  description?: string;
  nodes: object[];
  edges: object[];
  is_public?: boolean;
}

export interface WorkflowUpdateRequest {
  name?: string;
  description?: string;
  nodes?: object[];
  edges?: object[];
  is_public?: boolean;
}

export const workflowsApi = {
  // 自分のワークフロー一覧
  list: (): Promise<CloudWorkflowListResponse> =>
    fetchWithAuth('/api/v1/workflows'),

  // 公開ワークフロー一覧
  listPublic: (): Promise<CloudWorkflowListResponse> =>
    fetchWithAuth('/api/v1/workflows/public'),

  // ワークフロー取得
  get: (id: string): Promise<CloudWorkflow> =>
    fetchWithAuth(`/api/v1/workflows/${id}`),

  // ワークフロー作成
  create: (data: WorkflowCreateRequest): Promise<CloudWorkflow> =>
    fetchWithAuth('/api/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ワークフロー更新
  update: (id: string, data: WorkflowUpdateRequest): Promise<CloudWorkflow> =>
    fetchWithAuth(`/api/v1/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ワークフロー削除
  delete: (id: string): Promise<void> =>
    fetchWithAuth(`/api/v1/workflows/${id}`, {
      method: 'DELETE',
    }),

  // ワークフロー複製
  duplicate: (id: string): Promise<CloudWorkflow> =>
    fetchWithAuth(`/api/v1/workflows/${id}/duplicate`, {
      method: 'POST',
    }),
};
```

---

## Phase 4.3: ワークフローマネージャーUI

### 4.3.1 コンポーネント構成

```
components/node-editor/
├── WorkflowManager/
│   ├── index.ts                     # エクスポート
│   ├── WorkflowToolbar.tsx          # ツールバー（保存/読み込み/新規）
│   ├── WorkflowList.tsx             # ワークフロー一覧
│   ├── WorkflowCard.tsx             # ワークフローカード（オプション）
│   ├── SaveWorkflowModal.tsx        # 保存モーダル
│   └── OpenWorkflowModal.tsx        # 開くモーダル
```

### 4.3.2 WorkflowToolbar

**ファイル**: `components/node-editor/WorkflowManager/WorkflowToolbar.tsx`

```typescript
'use client';

import { Save, FolderOpen, FilePlus, Cloud, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowToolbarProps {
  workflowName: string;
  isUnsaved: boolean;
  isCloudSynced: boolean;
  saveError: string | null;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
  onClearError: () => void;
}

export function WorkflowToolbar({
  workflowName,
  isUnsaved,
  isCloudSynced,
  saveError,
  onSave,
  onSaveAs,
  onOpen,
  onNew,
  onClearError,
}: WorkflowToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border-b border-[#404040]">
      {/* ワークフロー名 */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-white truncate max-w-[200px]">
          {workflowName}
        </span>
        {isUnsaved && (
          <span className="text-xs text-yellow-500 shrink-0">（未保存）</span>
        )}
        {isCloudSynced ? (
          <Cloud className="w-4 h-4 text-green-500 shrink-0" title="クラウド同期済み" />
        ) : (
          <HardDrive className="w-4 h-4 text-gray-500 shrink-0" title="ローカル保存" />
        )}
      </div>

      {/* エラー表示 */}
      {saveError && (
        <div className="flex items-center gap-2 px-2 py-1 bg-red-500/20 rounded text-xs text-red-400">
          <span>{saveError}</span>
          <button onClick={onClearError} className="hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onNew}
          className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
          title="新規ワークフロー"
        >
          <FilePlus className="w-4 h-4" />
        </button>
        <button
          onClick={onOpen}
          className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
          title="ワークフローを開く"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          onClick={onSave}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isUnsaved
              ? 'bg-[#fce300]/20 text-[#fce300] hover:bg-[#fce300]/30'
              : 'hover:bg-[#2a2a2a] text-gray-400 hover:text-white'
          )}
          title="保存 (Ctrl+S)"
        >
          <Save className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

### 4.3.3 SaveWorkflowModal

**ファイル**: `components/node-editor/WorkflowManager/SaveWorkflowModal.tsx`

```typescript
'use client';

import { useState } from 'react';
import { X, Save, Cloud, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onSaveLocal: (name: string) => boolean;
  onSaveCloud: (name: string, isPublic: boolean) => Promise<boolean>;
  isLoggedIn: boolean;
  isSaving: boolean;
}

export function SaveWorkflowModal({
  isOpen,
  onClose,
  currentName,
  onSaveLocal,
  onSaveCloud,
  isLoggedIn,
  isSaving,
}: SaveWorkflowModalProps) {
  const [name, setName] = useState(currentName);
  const [saveLocation, setSaveLocation] = useState<'local' | 'cloud'>('local');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('ワークフロー名を入力してください');
      return;
    }

    setError(null);

    if (saveLocation === 'local') {
      const success = onSaveLocal(name);
      if (success) {
        onClose();
      } else {
        setError('保存に失敗しました');
      }
    } else {
      const success = await onSaveCloud(name, isPublic);
      if (success) {
        onClose();
      } else {
        setError('クラウド保存に失敗しました');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#2a2a2a] rounded-xl border border-[#404040] p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">ワークフローを保存</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ワークフロー名 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">ワークフロー名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ワークフロー名を入力"
            maxLength={100}
            disabled={isSaving}
            className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white focus:border-[#fce300] focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* 保存先選択 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">保存先</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSaveLocation('local')}
              disabled={isSaving}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                saveLocation === 'local'
                  ? 'border-[#fce300] bg-[#fce300]/10 text-[#fce300]'
                  : 'border-[#404040] text-gray-400 hover:border-[#505050]',
                isSaving && 'opacity-50 cursor-not-allowed'
              )}
            >
              <HardDrive className="w-4 h-4" />
              <span>ローカル</span>
            </button>
            <button
              onClick={() => setSaveLocation('cloud')}
              disabled={!isLoggedIn || isSaving}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                saveLocation === 'cloud'
                  ? 'border-[#fce300] bg-[#fce300]/10 text-[#fce300]'
                  : 'border-[#404040] text-gray-400 hover:border-[#505050]',
                (!isLoggedIn || isSaving) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Cloud className="w-4 h-4" />
              <span>クラウド</span>
            </button>
          </div>
          {!isLoggedIn && (
            <p className="mt-2 text-xs text-gray-500">
              クラウド保存にはログインが必要です
            </p>
          )}
        </div>

        {/* 公開設定（クラウド保存時のみ） */}
        {saveLocation === 'cloud' && isLoggedIn && (
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isSaving}
                className="w-4 h-4 rounded border-[#404040] bg-[#1a1a1a] text-[#fce300] focus:ring-[#fce300]"
              />
              <span className="text-sm text-gray-300">公開ワークフローとして共有</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              公開すると他のユーザーがこのワークフローを使用できます
            </p>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-4 py-2 border border-[#404040] rounded-lg text-gray-300 hover:bg-[#333333] transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#fce300] text-[#212121] font-medium rounded-lg hover:bg-[#e5cf00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 4.3.4 WorkflowList

**ファイル**: `components/node-editor/WorkflowManager/WorkflowList.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Trash2, Cloud, HardDrive, Clock, Copy, Loader2 } from 'lucide-react';
import type { WorkflowListItem } from '@/lib/types/node-editor';
import type { CloudWorkflowListItem } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface WorkflowListProps {
  localWorkflows: WorkflowListItem[];
  cloudWorkflows: CloudWorkflowListItem[];
  isLoadingCloud: boolean;
  onLoadLocal: (id: string) => void;
  onLoadCloud: (id: string) => void;
  onDeleteLocal: (id: string) => void;
  onDeleteCloud: (id: string) => void;
  onDuplicateCloud: (id: string) => void;
  onClose: () => void;
}

export function WorkflowList({
  localWorkflows,
  cloudWorkflows,
  isLoadingCloud,
  onLoadLocal,
  onLoadCloud,
  onDeleteLocal,
  onDeleteCloud,
  onDuplicateCloud,
  onClose,
}: WorkflowListProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDelete = (id: string, isCloud: boolean) => {
    if (!confirm('このワークフローを削除しますか？')) return;
    setDeletingId(id);
    if (isCloud) {
      onDeleteCloud(id);
    } else {
      onDeleteLocal(id);
    }
    setDeletingId(null);
  };

  const workflows = activeTab === 'local' ? localWorkflows : cloudWorkflows;
  const onLoad = activeTab === 'local' ? onLoadLocal : onLoadCloud;

  return (
    <div className="flex flex-col h-full max-h-[60vh]">
      {/* タブ */}
      <div className="flex border-b border-[#404040] shrink-0">
        <button
          onClick={() => setActiveTab('local')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors',
            activeTab === 'local'
              ? 'text-[#fce300] border-b-2 border-[#fce300]'
              : 'text-gray-400 hover:text-white'
          )}
        >
          <HardDrive className="w-4 h-4" />
          ローカル ({localWorkflows.length})
        </button>
        <button
          onClick={() => setActiveTab('cloud')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors',
            activeTab === 'cloud'
              ? 'text-[#fce300] border-b-2 border-[#fce300]'
              : 'text-gray-400 hover:text-white'
          )}
        >
          <Cloud className="w-4 h-4" />
          クラウド ({cloudWorkflows.length})
        </button>
      </div>

      {/* リスト */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'cloud' && isLoadingCloud ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#fce300]" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {activeTab === 'local'
              ? '保存されたワークフローがありません'
              : 'クラウドにワークフローがありません'}
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="group flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#404040] hover:border-[#505050] cursor-pointer transition-colors"
                onClick={() => {
                  onLoad(workflow.id);
                  onClose();
                }}
              >
                {/* サムネイル */}
                <div className="w-12 h-12 rounded-lg bg-[#2a2a2a] flex items-center justify-center overflow-hidden shrink-0">
                  {('thumbnail' in workflow && workflow.thumbnail) ||
                  ('thumbnail_url' in workflow && workflow.thumbnail_url) ? (
                    <img
                      src={
                        'thumbnail' in workflow
                          ? workflow.thumbnail
                          : workflow.thumbnail_url
                      }
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-600 text-[10px]">No Preview</div>
                  )}
                </div>

                {/* 情報 */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{workflow.name}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {formatDate(workflow.updatedAt)}
                  </div>
                </div>

                {/* アクション */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {activeTab === 'cloud' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateCloud(workflow.id);
                      }}
                      className="p-1.5 rounded hover:bg-[#2a2a2a] text-gray-400 hover:text-white"
                      title="複製"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(workflow.id, activeTab === 'cloud');
                    }}
                    disabled={deletingId === workflow.id}
                    className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 disabled:opacity-50"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 実装タスク一覧

### Phase 4.1: LocalStorage機能強化

| # | タスク | ファイル | 依存 |
|---|--------|----------|------|
| 1 | 型定義追加（SavedWorkflow継承、WorkflowListItem） | `lib/types/node-editor.ts` | - |
| 2 | workflow-storage.ts作成（マイグレーション対応） | `utils/workflow-storage.ts` | 1 |
| 3 | useWorkflowManagerフック作成 | `hooks/useWorkflowManager.ts` | 2 |
| 4 | WorkflowToolbar作成 | `WorkflowManager/WorkflowToolbar.tsx` | - |
| 5 | SaveWorkflowModal作成 | `WorkflowManager/SaveWorkflowModal.tsx` | - |
| 6 | WorkflowList作成 | `WorkflowManager/WorkflowList.tsx` | - |
| 7 | NodeEditor統合（既存自動保存置き換え） | `NodeEditor.tsx` | 3,4,5,6 |
| 8 | テスト作成 | `tests/workflow-storage.test.ts` | 7 |

### Phase 4.2: Supabase永続化

| # | タスク | ファイル | 依存 |
|---|--------|----------|------|
| 9 | DBマイグレーション実行 | Supabase MCP | - |
| 10 | バックエンドschemas.py作成 | `app/workflows/schemas.py` | 9 |
| 11 | バックエンドrouter.py作成 | `app/workflows/router.py` | 10 |
| 12 | main.pyにルーター登録 | `app/main.py` | 11 |
| 13 | APIクライアント拡張 | `lib/api/client.ts` | 11 |
| 14 | useWorkflowManagerにクラウド機能追加 | `hooks/useWorkflowManager.ts` | 13 |
| 15 | UIにクラウド保存オプション追加 | モーダル各種 | 14 |

### Phase 4.3: 統合テスト

| # | タスク | 説明 |
|---|--------|------|
| 16 | ユニットテスト | workflow-storage, useWorkflowManager |
| 17 | ビルド検証 | `npm run build` 成功確認 |
| 18 | 手動テスト | 全機能の動作確認 |

---

## 検証方法

### ユニットテスト

```bash
npm test -- --run workflow
```

テストファイル構造:

```
tests/
├── node-editor/
│   ├── workflow-storage.test.ts     # LocalStorage関数のユニットテスト
│   ├── useWorkflowManager.test.ts   # フックのテスト
│   └── WorkflowToolbar.test.tsx     # コンポーネントテスト
```

### 手動テスト手順

1. `/generate/story` にアクセス、ノードモードに切り替え
2. ノードを追加・配置・接続
3. ツールバーの「保存」ボタンクリック
4. ワークフロー名を入力して保存
5. ページリロード → 保存したワークフローが復元されることを確認
6. 「ワークフローを開く」から別のワークフローを選択
7. 「新規」で新しいワークフローを作成
8. ログイン後、クラウド保存を実行
9. 別デバイス/ブラウザでクラウドからワークフローを読み込み

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| LocalStorage上限（5MB） | ワークフロー保存失敗 | MAX_WORKFLOWS=10制限、QuotaExceededError対応、エラーUI表示 |
| レガシーデータ移行失敗 | 既存ユーザーのデータ喪失 | `migrateFromLegacyStorage()`で安全に移行、失敗時はログ出力 |
| JSONB大きすぎる | DB挿入失敗 | ノード数上限設定（100ノード）、バリデーション追加 |
| 同期競合 | データ不整合 | 楽観的ロック（updated_at比較）、競合UI追加（将来検討） |

---

## 修正履歴

### v2 (2026-02-05)

- 既存`Workflow`型との命名衝突を解消（`SavedWorkflow`を継承型に変更）
- LocalStorageマイグレーション関数`migrateFromLegacyStorage()`追加
- `useEffect`依存配列をReact 19対応に修正（`useRef`パターン採用）
- APIクライアントの型を`object[]`に修正（`Edge`型インポート不要に）
- RLSポリシー名を明確化（`users_select_own_workflows`等）
- LocalStorage容量超過時のエラーハンドリング追加（`QuotaExceededError`対応）
- バックエンドPydanticスキーマ定義を追加（`schemas.py`詳細）
- NodeEditor.tsxとの統合パターンを明記

---

## 次フェーズへの展望

Phase 4完了後の追加機能候補:

- **ワークフローテンプレート**: 公式テンプレートギャラリー
- **バージョン履歴**: ワークフローの変更履歴管理
- **インポート/エクスポート**: JSON形式でのワークフロー共有
- **サムネイル自動生成**: html2canvasによるキャンバスキャプチャ
- **コラボレーション**: リアルタイム共同編集（将来検討）
