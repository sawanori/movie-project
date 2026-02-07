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

interface ValidationResult {
  errors: ValidationError[];
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

    // 生成可能かどうかの判定（致命的なエラーがないか）
    const canGenerate =
      !!imageInputResult?.data.imageUrl &&
      !!(promptResult?.data.englishPrompt || promptResult?.data.japanesePrompt) &&
      !!generateResult;

    return {
      errors,
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
