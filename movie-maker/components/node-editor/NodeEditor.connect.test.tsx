/**
 * NodeEditor 接続 guard (isConnectionAllowed) のテスト
 * H-3 解消: OmniReference → ProviderNode 接続制約
 *
 * NodeEditor.tsx は @xyflow/react に強く依存するため、ここでは
 * 純粋関数 isConnectionAllowed を切り出してロジックを検証する。
 */
import { describe, it, expect } from 'vitest';
import type { Edge, Connection } from '@xyflow/react';
import { isConnectionAllowed } from './utils/connection-guards';
import type {
  WorkflowNode,
  ProviderNodeData,
  OmniReferenceNodeData,
  KlingElementsNodeData,
} from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

function createProviderNode(opts: {
  id: string;
  provider: ProviderNodeData['provider'];
}): WorkflowNode {
  return {
    id: opts.id,
    type: 'provider',
    position: { x: 0, y: 0 },
    data: {
      type: 'provider',
      isValid: true,
      provider: opts.provider,
      aspectRatio: '9:16',
      duration: null,
    } satisfies ProviderNodeData,
  };
}

function createOmniReferenceNode(opts: { id: string }): WorkflowNode {
  return {
    id: opts.id,
    type: 'omniReference',
    position: { x: 0, y: 0 },
    data: {
      type: 'omniReference',
      isValid: true,
      imageSlots: [],
      videoSlots: [
        { assetId: null, mediaType: 'video' },
        { assetId: null, mediaType: 'video' },
        { assetId: null, mediaType: 'video' },
      ],
      audioSlots: [
        { assetId: null, mediaType: 'audio' },
        { assetId: null, mediaType: 'audio' },
        { assetId: null, mediaType: 'audio' },
      ],
      consentAccepted: true,
    } satisfies OmniReferenceNodeData,
  };
}

function createKlingElementsNode(opts: { id: string }): WorkflowNode {
  return {
    id: opts.id,
    type: 'klingElements',
    position: { x: 0, y: 0 },
    data: {
      type: 'klingElements',
      isValid: true,
      elementImages: [],
    } satisfies KlingElementsNodeData,
  };
}

describe('isConnectionAllowed: OmniReference → ProviderNode guard (H-3)', () => {
  it('seedance ProviderNode への OmniReference 接続を許可する', () => {
    const provider = createProviderNode({ id: 'prov-1', provider: 'seedance' });
    const omni = createOmniReferenceNode({ id: 'omni-1' });
    const connection: Connection = {
      source: omni.id,
      target: provider.id,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    };

    expect(isConnectionAllowed(connection, [provider, omni], [])).toBe(true);
  });

  it('runway ProviderNode への OmniReference 接続を拒否する', () => {
    const provider = createProviderNode({ id: 'prov-1', provider: 'runway' });
    const omni = createOmniReferenceNode({ id: 'omni-1' });
    const connection: Connection = {
      source: omni.id,
      target: provider.id,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    };

    expect(isConnectionAllowed(connection, [provider, omni], [])).toBe(false);
  });

  it('piapi_kling ProviderNode への OmniReference 接続を拒否する', () => {
    const provider = createProviderNode({ id: 'prov-1', provider: 'piapi_kling' });
    const omni = createOmniReferenceNode({ id: 'omni-1' });
    const connection: Connection = {
      source: omni.id,
      target: provider.id,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    };

    expect(isConnectionAllowed(connection, [provider, omni], [])).toBe(false);
  });

  it('1 対 1 制約: 既に別 OmniReferenceNode が接続済の ProviderNode への追加接続を拒否する', () => {
    const provider = createProviderNode({ id: 'prov-1', provider: 'seedance' });
    const omniA = createOmniReferenceNode({ id: 'omni-A' });
    const omniB = createOmniReferenceNode({ id: 'omni-B' });
    const existingEdge: Edge = {
      id: 'edge-existing',
      source: omniA.id,
      target: provider.id,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    };
    const newConnection: Connection = {
      source: omniB.id,
      target: provider.id,
      sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
      targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
    };

    expect(
      isConnectionAllowed(newConnection, [provider, omniA, omniB], [existingEdge]),
    ).toBe(false);
  });

  it('OMNI_REFERENCE_INPUT 以外の Handle 接続には影響しない (既存 Kling 系 guard)', () => {
    const provider = createProviderNode({ id: 'prov-1', provider: 'piapi_kling' });
    const kling = createKlingElementsNode({ id: 'kling-1' });
    const connection: Connection = {
      source: kling.id,
      target: provider.id,
      sourceHandle: HANDLE_IDS.KLING_ELEMENTS_OUTPUT,
      targetHandle: HANDLE_IDS.KLING_ELEMENTS_INPUT,
    };

    expect(isConnectionAllowed(connection, [provider, kling], [])).toBe(true);
  });

  it('CONFIG_INPUT 等の管理外 Handle はそのまま許可する', () => {
    const provider = createProviderNode({ id: 'prov-1', provider: 'seedance' });
    const connection: Connection = {
      source: provider.id,
      target: 'gen-1',
      sourceHandle: HANDLE_IDS.CONFIG_OUTPUT,
      targetHandle: HANDLE_IDS.CONFIG_INPUT,
    };

    expect(isConnectionAllowed(connection, [provider], [])).toBe(true);
  });
});
