import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/lib/types/node-editor';
import { createDefaultNodeData as createData } from '@/lib/types/node-editor';

/**
 * デフォルトワークフローの初期配置
 * ハブ＆スポーク型:
 *
 * [ImageInput] ────────┐
 *                      │
 * [Prompt] ────────────┼───→ [Generate] ───→ 出力
 *                      │
 * [Provider] ──→ [CameraWork] ─┘
 */
export function createDefaultWorkflow(): { nodes: WorkflowNode[]; edges: Edge[] } {
  const nodes: WorkflowNode[] = [
    {
      id: 'imageInput-1',
      type: 'imageInput',
      position: { x: 50, y: 50 },
      data: createData('imageInput'),
    },
    {
      id: 'prompt-1',
      type: 'prompt',
      position: { x: 50, y: 250 },
      data: createData('prompt'),
    },
    {
      id: 'provider-1',
      type: 'provider',
      position: { x: 50, y: 500 },
      data: createData('provider'),
    },
    {
      id: 'cameraWork-1',
      type: 'cameraWork',
      position: { x: 350, y: 500 },
      data: createData('cameraWork'),
    },
    {
      id: 'generate-1',
      type: 'generate',
      position: { x: 650, y: 200 },
      data: createData('generate'),
    },
  ];

  const edges: Edge[] = [
    {
      id: 'e-imageInput-generate',
      source: 'imageInput-1',
      sourceHandle: 'image_url',
      target: 'generate-1',
      targetHandle: 'image_url',
      animated: true,
    },
    {
      id: 'e-prompt-generate',
      source: 'prompt-1',
      sourceHandle: 'story_text',
      target: 'generate-1',
      targetHandle: 'story_text',
      animated: true,
    },
    {
      id: 'e-provider-cameraWork',
      source: 'provider-1',
      sourceHandle: 'config',
      target: 'cameraWork-1',
      targetHandle: 'provider',
      animated: true,
    },
    {
      id: 'e-provider-generate',
      source: 'provider-1',
      sourceHandle: 'config',
      target: 'generate-1',
      targetHandle: 'config',
      animated: true,
    },
    {
      id: 'e-cameraWork-generate',
      source: 'cameraWork-1',
      sourceHandle: 'camera_work',
      target: 'generate-1',
      targetHandle: 'camera_work',
      animated: true,
    },
  ];

  return { nodes, edges };
}

/**
 * 空のワークフロー（ユーザーが一から構築する場合）
 */
export function createEmptyWorkflow(): { nodes: WorkflowNode[]; edges: Edge[] } {
  return { nodes: [], edges: [] };
}

/**
 * ワークフローのローカルストレージキー
 */
export const WORKFLOW_STORAGE_KEY = 'node-editor-workflow';

/**
 * ワークフローをローカルストレージに保存
 */
export function saveWorkflowToStorage(nodes: WorkflowNode[], edges: Edge[]): void {
  try {
    const data = JSON.stringify({ nodes, edges, savedAt: new Date().toISOString() });
    localStorage.setItem(WORKFLOW_STORAGE_KEY, data);
  } catch (error) {
    console.error('Failed to save workflow:', error);
  }
}

/**
 * ワークフローをローカルストレージから読み込み
 */
export function loadWorkflowFromStorage(): { nodes: WorkflowNode[]; edges: Edge[] } | null {
  try {
    const data = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch (error) {
    console.error('Failed to load workflow:', error);
    return null;
  }
}

/**
 * ワークフローをローカルストレージから削除
 */
export function clearWorkflowStorage(): void {
  try {
    localStorage.removeItem(WORKFLOW_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear workflow:', error);
  }
}
