import { useMemo } from 'react';
import type { NodeType, VideoProvider, SubjectType } from '@/lib/types/node-editor';

interface NodesAvailabilityOptions {
  selectedProvider: VideoProvider | null;
  subjectType: SubjectType | null;
}

interface NodesAvailabilityResult {
  isNodeAvailable: (nodeType: NodeType) => boolean;
  availableNodes: NodeType[];
  unavailableNodes: NodeType[];
}

/**
 * プロバイダー別ノード利用可否マップ
 */
const PROVIDER_SPECIFIC_NODES: Record<VideoProvider, NodeType[]> = {
  runway: ['actTwo'],
  piapi_kling: ['klingMode', 'klingElements', 'klingEndFrame'],
  veo: [],
  domoai: [],
  hailuo: ['hailuoEndFrame'],
};

/**
 * 常に利用可能なノード
 */
const ALWAYS_AVAILABLE_NODES: NodeType[] = [
  'imageInput',
  'prompt',
  'provider',
  'cameraWork',
  'generate',
  'bgm',
  'filmGrain',
  'lut',
  'overlay',
];

/**
 * Act-Two対応のサブジェクトタイプ
 */
const ACT_TWO_COMPATIBLE_SUBJECTS: SubjectType[] = ['person', 'animation'];

/**
 * 条件付きノード表示フック
 * 選択されたプロバイダーに応じて利用可能なノードを制御
 */
export function useNodesAvailability({
  selectedProvider,
  subjectType,
}: NodesAvailabilityOptions): NodesAvailabilityResult {
  return useMemo(() => {
    const isNodeAvailable = (nodeType: NodeType): boolean => {
      // 常に利用可能なノード
      if (ALWAYS_AVAILABLE_NODES.includes(nodeType)) {
        return true;
      }

      // プロバイダー未選択の場合、プロバイダー固有ノードは非表示
      if (!selectedProvider) {
        return false;
      }

      // プロバイダー固有ノードのチェック
      const providerNodes = PROVIDER_SPECIFIC_NODES[selectedProvider] || [];

      // Act-Two は追加条件あり
      if (nodeType === 'actTwo') {
        return (
          selectedProvider === 'runway' &&
          subjectType !== null &&
          ACT_TWO_COMPATIBLE_SUBJECTS.includes(subjectType)
        );
      }

      return providerNodes.includes(nodeType);
    };

    const allNodeTypes: NodeType[] = [
      ...ALWAYS_AVAILABLE_NODES,
      'klingMode',
      'klingElements',
      'klingEndFrame',
      'actTwo',
      'hailuoEndFrame',
    ];

    const availableNodes = allNodeTypes.filter(isNodeAvailable);
    const unavailableNodes = allNodeTypes.filter((n) => !isNodeAvailable(n));

    return {
      isNodeAvailable,
      availableNodes,
      unavailableNodes,
    };
  }, [selectedProvider, subjectType]);
}
