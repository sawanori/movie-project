/**
 * NodeEditor 接続イベント (onConnect / isValidConnection) で使用する
 * pure な guard 関数群。React に依存しない形で純粋関数として切り出すことで、
 * 単体テストでの検証を容易にする。
 */
import type { Edge, Connection } from '@xyflow/react';
import type { WorkflowNode, WorkflowNodeData, ProviderNodeData } from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

/**
 * 1 つの接続が許可されるかを判定する。
 *
 * 拒否ケース:
 *  - 既存 Kling/Runway/Hailuo 系 Handle に対する source ノードタイプ不一致
 *  - OmniReference → ProviderNode 接続で provider != seedance
 *  - OmniReference → ProviderNode 接続で既に同じ ProviderNode に別の
 *    OmniReferenceNode が接続済 (1 対 1 制約)
 */
export function isConnectionAllowed(
  connection: Edge | Connection,
  nodes: WorkflowNode[],
  edges: Edge[],
): boolean {
  const HANDLE_TO_NODE_TYPE: Partial<Record<string, WorkflowNodeData['type']>> = {
    [HANDLE_IDS.KLING_MODE_INPUT]: 'klingMode',
    [HANDLE_IDS.KLING_ELEMENTS_INPUT]: 'klingElements',
    [HANDLE_IDS.KLING_END_FRAME_INPUT]: 'klingEndFrame',
    [HANDLE_IDS.KLING_CAMERA_CONTROL_INPUT]: 'klingCameraControl',
    [HANDLE_IDS.ACT_TWO_INPUT]: 'actTwo',
    [HANDLE_IDS.HAILUO_END_FRAME_INPUT]: 'hailuoEndFrame',
  };

  const targetHandle = connection.targetHandle ?? '';

  // Omni Reference 接続専用 guard
  if (targetHandle === HANDLE_IDS.OMNI_REFERENCE_INPUT) {
    if (!connection.target) return false;
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!targetNode) return false;
    const providerData = targetNode.data as ProviderNodeData;
    if (providerData?.type !== 'provider' || providerData.provider !== 'seedance') {
      return false;
    }
    // 1 対 1 制約: 同 ProviderNode に既存の OmniReference 接続があれば拒否
    const alreadyConnected = edges.some(
      (e) =>
        e.target === connection.target &&
        e.targetHandle === HANDLE_IDS.OMNI_REFERENCE_INPUT,
    );
    if (alreadyConnected) return false;
    return true;
  }

  const expectedType = HANDLE_TO_NODE_TYPE[targetHandle];
  if (!expectedType) return true;

  const sourceNode = nodes.find((n) => n.id === connection.source);
  if (!sourceNode) return false;
  return (sourceNode.data as WorkflowNodeData).type === expectedType;
}
