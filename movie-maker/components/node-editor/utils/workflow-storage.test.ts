import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Edge } from '@xyflow/react';
import {
  saveLocalWorkflow,
  getLocalWorkflow,
  resetOmniReferenceConsent,
  clearAllLocalWorkflows,
} from './workflow-storage';
import type {
  WorkflowNode,
  OmniReferenceNodeData,
  PromptNodeData,
} from '@/lib/types/node-editor';
import { createOmniReferenceNodeData } from '@/lib/types/node-editor';

// crypto.randomUUID は jsdom にあるが、無い環境でも動くようガード
beforeEach(() => {
  localStorage.clear();
  if (!('randomUUID' in crypto)) {
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => 'test-uuid-' + Math.random().toString(36).slice(2),
    });
  }
});

function buildOmniNode(consentAccepted: boolean): WorkflowNode {
  const data: OmniReferenceNodeData = {
    ...createOmniReferenceNodeData(),
    consentAccepted,
  };
  return {
    id: 'omni-1',
    type: 'omniReference',
    position: { x: 0, y: 0 },
    data,
  };
}

function buildPromptNode(): WorkflowNode {
  const data: PromptNodeData = {
    type: 'prompt',
    isValid: true,
    japanesePrompt: 'テスト',
    englishPrompt: 'test',
    isTranslating: false,
    subjectType: 'person',
  };
  return {
    id: 'prompt-1',
    type: 'prompt',
    position: { x: 100, y: 0 },
    data,
  };
}

describe('resetOmniReferenceConsent', () => {
  it('OmniReferenceNode の consentAccepted を強制的に false にする', () => {
    const nodes: WorkflowNode[] = [buildOmniNode(true)];
    const result = resetOmniReferenceConsent(nodes);
    const omniData = result[0].data as OmniReferenceNodeData;
    expect(omniData.consentAccepted).toBe(false);
  });

  it('OmniReference 以外のノードはそのまま返す', () => {
    const promptNode = buildPromptNode();
    const result = resetOmniReferenceConsent([promptNode]);
    expect(result[0]).toEqual(promptNode);
  });

  it('OmniReference ノードの他のフィールドは保持される', () => {
    const original = buildOmniNode(true);
    const result = resetOmniReferenceConsent([original]);
    const resetData = result[0].data as OmniReferenceNodeData;
    const originalData = original.data as OmniReferenceNodeData;
    expect(resetData.imageSlots).toEqual(originalData.imageSlots);
    expect(resetData.videoSlots).toEqual(originalData.videoSlots);
    expect(resetData.audioSlots).toEqual(originalData.audioSlots);
    expect(resetData.type).toBe('omniReference');
  });

  it('元の nodes 配列は破壊しない (immutable)', () => {
    const original = buildOmniNode(true);
    const originalNodes = [original];
    resetOmniReferenceConsent(originalNodes);
    const originalData = originalNodes[0].data as OmniReferenceNodeData;
    expect(originalData.consentAccepted).toBe(true);
  });
});

describe('saveLocalWorkflow + getLocalWorkflow consent リセット', () => {
  it('保存時に consentAccepted=true でも false で書き出す', () => {
    const nodes: WorkflowNode[] = [buildOmniNode(true)];
    const edges: Edge[] = [];

    const result = saveLocalWorkflow('test-workflow', nodes, edges);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // 直接 localStorage から読み出して raw データの consent を確認
    const raw = localStorage.getItem('node-editor-workflows');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    const savedOmni = parsed[0].nodes.find(
      (n: WorkflowNode) => n.data?.type === 'omniReference'
    );
    expect((savedOmni.data as OmniReferenceNodeData).consentAccepted).toBe(false);
  });

  it('読込時に consentAccepted=true が格納されていても false で返す (旧データ互換)', () => {
    // 旧バージョン: consent=true の状態で永続化されたデータを再現
    const legacyWorkflow = {
      id: 'legacy-1',
      name: 'legacy',
      nodes: [buildOmniNode(true)],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(
      'node-editor-workflows',
      JSON.stringify([legacyWorkflow])
    );

    const loaded = getLocalWorkflow('legacy-1');
    expect(loaded).not.toBeNull();
    const omni = loaded!.nodes.find(
      (n) => n.data?.type === 'omniReference'
    );
    expect(omni).toBeDefined();
    expect((omni!.data as OmniReferenceNodeData).consentAccepted).toBe(false);
  });

  it('save → load 往復で consent は常に false', () => {
    const nodes: WorkflowNode[] = [buildOmniNode(true), buildPromptNode()];
    const edges: Edge[] = [];

    const saveResult = saveLocalWorkflow('roundtrip', nodes, edges);
    expect(saveResult.success).toBe(true);
    if (!saveResult.success) return;

    const loaded = getLocalWorkflow(saveResult.workflow.id);
    expect(loaded).not.toBeNull();
    const omni = loaded!.nodes.find((n) => n.data?.type === 'omniReference');
    expect((omni!.data as OmniReferenceNodeData).consentAccepted).toBe(false);

    // 既存の他ノードは保持
    const prompt = loaded!.nodes.find((n) => n.data?.type === 'prompt');
    expect(prompt).toBeDefined();
  });

  it('OmniReference ノードを含まないワークフローも正常に保存/読込できる (回帰なし)', () => {
    const nodes: WorkflowNode[] = [buildPromptNode()];
    const edges: Edge[] = [];

    const saveResult = saveLocalWorkflow('no-omni', nodes, edges);
    expect(saveResult.success).toBe(true);
    if (!saveResult.success) return;

    const loaded = getLocalWorkflow(saveResult.workflow.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes).toHaveLength(1);
    expect(loaded!.nodes[0].data?.type).toBe('prompt');
  });
});

describe('clearAllLocalWorkflows', () => {
  it('全ワークフローを削除できる', () => {
    saveLocalWorkflow('w1', [buildPromptNode()], []);
    clearAllLocalWorkflows();
    expect(localStorage.getItem('node-editor-workflows')).toBeNull();
  });
});
