import type { Edge } from '@xyflow/react';
import type { WorkflowNode, SavedWorkflow, WorkflowListItem } from '@/lib/types/node-editor';

// ========== ストレージキー定義 ==========
const WORKFLOWS_KEY = 'node-editor-workflows';
const CURRENT_WORKFLOW_KEY = 'node-editor-current-workflow-id';
const LEGACY_STORAGE_KEY = 'node-editor-workflow'; // 旧バージョンとの互換性
const MAX_WORKFLOWS = 10; // ローカル保存の上限

// ========== エラー型定義 ==========

export type SaveResult =
  | { success: true; workflow: SavedWorkflow }
  | { success: false; error: string };

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
