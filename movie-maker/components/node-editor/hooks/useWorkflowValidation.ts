import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import type {
  WorkflowNode,
  WorkflowNodeData,
  ValidationError,
  ImageInputNodeData,
  PromptNodeData,
  ProviderNodeData,
  KlingElementsNodeData,
  ActTwoNodeData,
} from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
  isValid: boolean;
  canGenerate: boolean;
}

/**
 * ワークフロー全体のバリデーションフック
 */
export function useWorkflowValidation(
  nodes: WorkflowNode[],
  edges: Edge[]
): ValidationResult {
  return useMemo(() => {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // ヘルパー: ノードタイプで検索
    const findNode = <T extends WorkflowNodeData>(
      type: T['type']
    ): { node: WorkflowNode; data: T } | undefined => {
      const node = nodes.find((n) => (n.data as WorkflowNodeData).type === type);
      if (!node) return undefined;
      return { node, data: node.data as T };
    };

    // 1. 必須ノード存在チェック
    const imageInputResult = findNode<ImageInputNodeData>('imageInput');
    const promptResult = findNode<PromptNodeData>('prompt');
    const generateResult = findNode<WorkflowNodeData>('generate');

    if (!imageInputResult) {
      errors.push({
        type: 'missing_node',
        message: '画像入力ノードが必要です',
      });
    }

    if (!promptResult) {
      errors.push({
        type: 'missing_node',
        message: 'プロンプトノードが必要です',
      });
    }

    if (!generateResult) {
      errors.push({
        type: 'missing_node',
        message: '生成ノードが必要です',
      });
    }

    // 2. 画像入力ノードのバリデーション
    if (imageInputResult && !imageInputResult.data.imageUrl) {
      errors.push({
        type: 'invalid_value',
        nodeId: imageInputResult.node.id,
        message: '画像を選択してください',
      });
    }

    // 3. プロンプトノードのバリデーション
    if (promptResult) {
      const { japanesePrompt, englishPrompt } = promptResult.data;
      if (!japanesePrompt && !englishPrompt) {
        errors.push({
          type: 'invalid_value',
          nodeId: promptResult.node.id,
          message: 'プロンプトを入力してください',
        });
      }
    }

    // 4. 生成ノードへの接続チェック
    if (generateResult) {
      const incomingEdges = edges.filter(
        (e) => e.target === generateResult.node.id
      );

      // 必要な入力ハンドルへの接続チェック
      const hasImageConnection = incomingEdges.some(
        (e) => e.targetHandle === 'image_url'
      );
      const hasPromptConnection = incomingEdges.some(
        (e) => e.targetHandle === 'story_text'
      );

      if (!hasImageConnection && imageInputResult) {
        errors.push({
          type: 'disconnected',
          nodeId: generateResult.node.id,
          message: '画像入力ノードを生成ノードに接続してください',
        });
      }

      if (!hasPromptConnection && promptResult) {
        errors.push({
          type: 'disconnected',
          nodeId: generateResult.node.id,
          message: 'プロンプトノードを生成ノードに接続してください',
        });
      }
    }

    // 5. プロバイダー固有ノードのバリデーション
    const providerResult = findNode<ProviderNodeData>('provider');
    const selectedProvider = providerResult?.data.provider;

    // Kling要素画像の枚数チェック
    const klingElementsResult = findNode<KlingElementsNodeData>('klingElements');
    if (klingElementsResult) {
      if (selectedProvider !== 'piapi_kling') {
        errors.push({
          type: 'provider_mismatch',
          nodeId: klingElementsResult.node.id,
          message: 'Kling要素画像ノードはKlingプロバイダー専用です',
        });
      }
      if (klingElementsResult.data.elementImages.length > 3) {
        errors.push({
          type: 'invalid_value',
          nodeId: klingElementsResult.node.id,
          message: '要素画像は最大3枚までです',
        });
      }
    }

    // Act-Twoの条件チェック
    const actTwoResult = findNode<ActTwoNodeData>('actTwo');
    if (actTwoResult && actTwoResult.data.useActTwo) {
      if (selectedProvider !== 'runway') {
        errors.push({
          type: 'provider_mismatch',
          nodeId: actTwoResult.node.id,
          message: 'Act-TwoはRunwayプロバイダー専用です',
        });
      }
      const subjectType = promptResult?.data.subjectType;
      if (subjectType && subjectType !== 'person' && subjectType !== 'animation') {
        errors.push({
          type: 'provider_mismatch',
          nodeId: actTwoResult.node.id,
          message: 'Act-Twoはpersonまたはanimationタイプでのみ使用可能です',
        });
      }
    }

    // 6. エッジ接続ベースの provider_mismatch チェック + multiple_provider_connection
    for (const genNode of nodes.filter(n => (n.data as WorkflowNodeData).type === 'generate')) {
      // CONFIG_INPUT に複数 ProviderNode 接続チェック
      const multiProvEdges = edges.filter(
        e => e.target === genNode.id && e.targetHandle === HANDLE_IDS.CONFIG_INPUT
      );
      if (multiProvEdges.length > 1) {
        errors.push({
          type: 'multiple_provider_connection',
          nodeId: genNode.id,
          message: 'GenerateNode の CONFIG_INPUT に複数の ProviderNode が接続されています',
        });
      }

      const configEdge = edges.find(
        e => e.target === genNode.id && e.targetHandle === HANDLE_IDS.CONFIG_INPUT
      );
      if (!configEdge) continue;
      const provNode = nodes.find(n => n.id === configEdge.source);
      if (!provNode) continue;
      const provData = provNode.data as ProviderNodeData;

      // ActTwoNode が非 runway Provider にエッジ接続されている場合
      const actTwoEdge = edges.find(
        e => e.target === provNode.id && e.targetHandle === HANDLE_IDS.ACT_TWO_INPUT
      );
      if (actTwoEdge && provData.provider !== 'runway') {
        const actTwoNode = nodes.find(n => n.id === actTwoEdge.source);
        if (actTwoNode) {
          errors.push({
            type: 'provider_mismatch',
            nodeId: actTwoNode.id,
            message: 'Act-TwoはRunwayプロバイダー専用です (エッジ接続不整合)',
          });
        }
      }

      // KlingElementsNode が非 piapi_kling Provider にエッジ接続されている場合
      const klingElemEdge = edges.find(
        e => e.target === provNode.id && e.targetHandle === HANDLE_IDS.KLING_ELEMENTS_INPUT
      );
      if (klingElemEdge && provData.provider !== 'piapi_kling') {
        const klingElemNode = nodes.find(n => n.id === klingElemEdge.source);
        if (klingElemNode) {
          errors.push({
            type: 'provider_mismatch',
            nodeId: klingElemNode.id,
            message: 'Kling要素画像ノードはKlingプロバイダー専用です (エッジ接続不整合)',
          });
        }
      }
    }

    // 7. disconnected_optional warning: 設定ノードが ProviderNode に未接続
    const providerSpecificTypes: WorkflowNodeData['type'][] = [
      'klingMode', 'klingElements', 'klingEndFrame',
      'klingCameraControl', 'actTwo', 'hailuoEndFrame',
    ];
    for (const nodeType of providerSpecificTypes) {
      const specNodes = nodes.filter(n => (n.data as WorkflowNodeData).type === nodeType);
      for (const specNode of specNodes) {
        const isConnectedToProvider = edges.some(
          e => e.source === specNode.id && nodes.some(
            n => n.id === e.target && (n.data as WorkflowNodeData).type === 'provider'
          )
        );
        if (!isConnectedToProvider) {
          warnings.push({
            type: 'disconnected_optional',
            nodeId: specNode.id,
            message: `${nodeType} が ProviderNode に未接続。グラフ全体から自動採用されています (将来この自動採用は削除予定)`,
          });
        }
      }
    }

    // 8. ambiguous_provider warning: 複数 ProviderNode + CONFIG_INPUT 未接続 GenerateNode
    const providerNodes = nodes.filter(n => (n.data as WorkflowNodeData).type === 'provider');
    if (providerNodes.length > 1) {
      for (const genNode of nodes.filter(n => (n.data as WorkflowNodeData).type === 'generate')) {
        const isConnected = edges.some(
          e => e.target === genNode.id && e.targetHandle === HANDLE_IDS.CONFIG_INPUT
        );
        if (!isConnected) {
          warnings.push({
            type: 'ambiguous_provider',
            nodeId: genNode.id,
            message: 'グラフに複数の ProviderNode が存在し、この GenerateNode は ProviderNode に未接続です。findNode フォールバックで先頭の ProviderNode が採用されますが、意図と異なる可能性があります。',
          });
        }
      }
    }

    // 生成可能かどうかの判定（致命的なエラーがないか）
    const canGenerate =
      !!imageInputResult?.data.imageUrl &&
      !!(promptResult?.data.englishPrompt || promptResult?.data.japanesePrompt) &&
      !!generateResult;

    return {
      errors,
      warnings,
      isValid: errors.length === 0,
      canGenerate,
    };
  }, [nodes, edges]);
}

/**
 * 特定ノードのエラーを取得
 */
export function useNodeErrors(
  nodeId: string,
  errors: ValidationError[]
): ValidationError[] {
  return useMemo(() => {
    return errors.filter((e) => e.nodeId === nodeId);
  }, [nodeId, errors]);
}
