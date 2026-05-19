import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import { useWorkflowValidation } from './useWorkflowValidation';
import type {
  WorkflowNode,
  ImageInputNodeData,
  PromptNodeData,
  ProviderNodeData,
  GenerateNodeData,
  KlingElementsNodeData,
  ActTwoNodeData,
  OmniReferenceNodeData,
} from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

// ========== テスト用ノード/エッジ生成ヘルパー ==========

function createImageInputNode(opts: { id?: string; imageUrl?: string } = {}): WorkflowNode {
  const imageUrl = opts.imageUrl ?? 'https://example.com/img.jpg';
  return {
    id: opts.id ?? 'imageInput-1',
    type: 'imageInput',
    position: { x: 0, y: 0 },
    data: {
      type: 'imageInput',
      isValid: !!imageUrl,
      imageUrl,
      imagePreview: imageUrl,
    } satisfies ImageInputNodeData,
  };
}

function createPromptNode(opts: { id?: string; englishPrompt?: string } = {}): WorkflowNode {
  const englishPrompt = opts.englishPrompt ?? 'test prompt';
  return {
    id: opts.id ?? 'prompt-1',
    type: 'prompt',
    position: { x: 100, y: 0 },
    data: {
      type: 'prompt',
      isValid: !!englishPrompt,
      japanesePrompt: '',
      englishPrompt,
      isTranslating: false,
      subjectType: 'person',
    } satisfies PromptNodeData,
  };
}

function createProviderNode(opts: {
  id?: string;
  provider?: ProviderNodeData['provider'];
} = {}): WorkflowNode {
  return {
    id: opts.id ?? 'provider-1',
    type: 'provider',
    position: { x: 200, y: 0 },
    data: {
      type: 'provider',
      isValid: true,
      provider: opts.provider ?? 'runway',
      aspectRatio: '9:16',
      duration: null,
    } satisfies ProviderNodeData,
  };
}

function createGenerateNode(opts: { id?: string } = {}): WorkflowNode {
  return {
    id: opts.id ?? 'generate-1',
    type: 'generate',
    position: { x: 300, y: 0 },
    data: {
      type: 'generate',
      isValid: true,
      isGenerating: false,
      progress: 0,
      videoUrl: null,
      error: null,
    } satisfies GenerateNodeData,
  };
}

function createKlingElementsNode(opts: {
  id?: string;
  elementImages?: string[];
} = {}): WorkflowNode {
  return {
    id: opts.id ?? 'klingElements-1',
    type: 'klingElements',
    position: { x: 0, y: 100 },
    data: {
      type: 'klingElements',
      isValid: true,
      elementImages: opts.elementImages ?? [],
    } satisfies KlingElementsNodeData,
  };
}

function createActTwoNode(opts: {
  id?: string;
  useActTwo?: boolean;
} = {}): WorkflowNode {
  return {
    id: opts.id ?? 'actTwo-1',
    type: 'actTwo',
    position: { x: 0, y: 200 },
    data: {
      type: 'actTwo',
      isValid: true,
      useActTwo: opts.useActTwo ?? true,
      motionType: null,
      expressionIntensity: 3,
      bodyControl: false,
    } satisfies ActTwoNodeData,
  };
}

function createEdge(opts: {
  source: string;
  target: string;
  targetHandle?: string;
}): Edge {
  return {
    id: `edge-${opts.source}-${opts.target}-${opts.targetHandle ?? 'default'}`,
    source: opts.source,
    target: opts.target,
    targetHandle: opts.targetHandle,
  };
}

// ========== テスト ==========

describe('useWorkflowValidation', () => {
  it('ActTwoNode が piapi_kling Provider に接続されている場合、provider_mismatch error が発生する', () => {
    const provId = crypto.randomUUID();
    const actTwoId = crypto.randomUUID();
    const genId = crypto.randomUUID();

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provId, provider: 'piapi_kling' }),
      createActTwoNode({ id: actTwoId, useActTwo: true }),
      createGenerateNode({ id: genId }),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      createEdge({ source: provId, target: genId, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      createEdge({ source: actTwoId, target: provId, targetHandle: HANDLE_IDS.ACT_TWO_INPUT }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    expect(result.current.errors.some(e => e.type === 'provider_mismatch')).toBe(true);
  });

  it('設定ノードが未接続の場合、disconnected_optional warning が発生する', () => {
    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: [] }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.warnings.some(w => w.type === 'disconnected_optional')).toBe(true);
  });

  it('複数 Provider + CONFIG_INPUT 未接続の GenerateNode で ambiguous_provider warning が発生する', () => {
    const nodes: WorkflowNode[] = [
      createProviderNode({ id: crypto.randomUUID(), provider: 'piapi_kling' }),
      createProviderNode({ id: crypto.randomUUID(), provider: 'runway' }),
      createGenerateNode(),  // CONFIG_INPUT 未接続
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.warnings.some(w => w.type === 'ambiguous_provider')).toBe(true);
  });

  it('全エッジ正常 (単一 Generate + 単一 Provider) で provider 関連 errors / warnings が空', () => {
    const provA = crypto.randomUUID();
    const genA = crypto.randomUUID();

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provA, provider: 'piapi_kling' }),
      createGenerateNode({ id: genA }),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      createEdge({ source: provA, target: genA, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    // provider 関連のエラーがないことを確認 (missing_node / invalid_value 等は別軸)
    expect(result.current.errors.filter(e =>
      e.type === 'provider_mismatch' || e.type === 'multiple_provider_connection'
    )).toHaveLength(0);
    expect(result.current.warnings.filter(w =>
      w.type === 'ambiguous_provider' || w.type === 'disconnected_optional'
    )).toHaveLength(0);
  });

  it('CONFIG_INPUT に複数 Provider 接続で multiple_provider_connection error が発生する', () => {
    const provA = crypto.randomUUID();
    const provB = crypto.randomUUID();
    const genId = crypto.randomUUID();

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provA, provider: 'piapi_kling' }),
      createProviderNode({ id: provB, provider: 'runway' }),
      createGenerateNode({ id: genId }),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      createEdge({ source: provA, target: genId, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
      createEdge({ source: provB, target: genId, targetHandle: HANDLE_IDS.CONFIG_INPUT }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    expect(result.current.errors.some(e => e.type === 'multiple_provider_connection')).toBe(true);
  });

  // ========== unused_image_input warning テスト ==========

  it('ケース1: KlingElements (画像あり) + ImageInput (画像あり) + piapi_kling → unused_image_input warning 発生', () => {
    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: ['https://example.com/e1.jpg'] }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.warnings.some(w => w.type === 'unused_image_input')).toBe(true);
    const warning = result.current.warnings.find(w => w.type === 'unused_image_input');
    expect(warning?.nodeId).toBe('imageInput-1');
  });

  it('ケース2: KlingElements (画像なし) + ImageInput (画像あり) → unused_image_input warning なし', () => {
    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: [] }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.warnings.some(w => w.type === 'unused_image_input')).toBe(false);
  });

  it('ケース3: KlingElements (画像あり) only で ImageInput/VideoInput なし → warning なし、エラーもなし (バリデーション緩和)', () => {
    // useWorkflowValidation は ImageInput 必須チェックを持つが、
    // graph-to-api の validateGraphForGeneration 側でバリデーション緩和済み
    // このフックでは ImageInput なしでも unused_image_input warning は発生しない
    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'piapi_kling' }),
      createKlingElementsNode({ elementImages: ['https://example.com/e1.jpg'] }),
      createGenerateNode(),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.warnings.some(w => w.type === 'unused_image_input')).toBe(false);
  });

  // ========== OmniReference consent_required テスト (M-2) ==========

  function createOmniReferenceNode(opts: {
    id?: string;
    consentAccepted?: boolean;
  } = {}): WorkflowNode {
    return {
      id: opts.id ?? 'omni-1',
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
        consentAccepted: opts.consentAccepted ?? false,
      } satisfies OmniReferenceNodeData,
    };
  }

  it('V-1: OmniReferenceNode が seedance Provider の OMNI_REFERENCE_INPUT に接続済 + consent=false → consent_required error 発生 + canGenerate=false', () => {
    const provId = 'prov-seedance';
    const omniId = 'omni-1';

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provId, provider: 'seedance' }),
      createOmniReferenceNode({ id: omniId, consentAccepted: false }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-omni',
        source: omniId,
        target: provId,
        sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
        targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
      },
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    const consentErr = result.current.errors.find(
      (e) => e.type === 'consent_required',
    );
    expect(consentErr).toBeDefined();
    expect(consentErr?.nodeId).toBe(omniId);
    expect(consentErr?.message).toContain('著作権同意');
    expect(result.current.canGenerate).toBe(false);
  });

  it('V-2: OmniReferenceNode が seedance Provider の OMNI_REFERENCE_INPUT に接続済 + consent=true → consent_required error なし', () => {
    const provId = 'prov-seedance';
    const omniId = 'omni-1';

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provId, provider: 'seedance' }),
      createOmniReferenceNode({ id: omniId, consentAccepted: true }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-omni',
        source: omniId,
        target: provId,
        sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
        targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
      },
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    expect(result.current.errors.some((e) => e.type === 'consent_required')).toBe(
      false,
    );
  });

  it('V-4: OmniReferenceNode の出力 edge が seedance 以外の Provider (piapi_kling) に接続 + consent=false → consent_required 発火しない (誤接続 = 二重防御)', () => {
    const provId = 'prov-kling';
    const omniId = 'omni-1';

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provId, provider: 'piapi_kling' }),
      createOmniReferenceNode({ id: omniId, consentAccepted: false }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-omni',
        source: omniId,
        target: provId,
        sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
        targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
      },
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    expect(result.current.errors.some((e) => e.type === 'consent_required')).toBe(
      false,
    );
  });

  it('V-5: OmniReferenceNode の出力 edge が seedance Provider に接続されているが targetHandle が OMNI_REFERENCE_INPUT 以外 → consent_required 発火しない (残骸 edge)', () => {
    const provId = 'prov-seedance';
    const omniId = 'omni-1';

    const nodes: WorkflowNode[] = [
      createProviderNode({ id: provId, provider: 'seedance' }),
      createOmniReferenceNode({ id: omniId, consentAccepted: false }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-omni-misrouted',
        source: omniId,
        target: provId,
        sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
        targetHandle: HANDLE_IDS.ACT_TWO_INPUT, // OMNI_REFERENCE_INPUT 以外
      },
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    expect(result.current.errors.some((e) => e.type === 'consent_required')).toBe(
      false,
    );
  });

  it('V-6: OmniReferenceNode の出力 edge の target が Provider ノード以外 (例: GenerateNode) → consent_required 発火しない', () => {
    const genId = 'gen-1';
    const omniId = 'omni-1';

    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'seedance' }),
      createOmniReferenceNode({ id: omniId, consentAccepted: false }),
      createGenerateNode({ id: genId }),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-omni-wrong-target',
        source: omniId,
        target: genId,
        sourceHandle: HANDLE_IDS.OMNI_REFERENCE_OUTPUT,
        targetHandle: HANDLE_IDS.OMNI_REFERENCE_INPUT,
      },
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));
    expect(result.current.errors.some((e) => e.type === 'consent_required')).toBe(
      false,
    );
  });

  it('V-3: OmniReferenceNode 未接続 → consent 状態問わず consent_required error なし', () => {
    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'piapi_kling' }),
      createOmniReferenceNode({ consentAccepted: false }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.errors.some((e) => e.type === 'consent_required')).toBe(
      false,
    );
  });

  it('ケース4: KlingElements (画像あり) + ImageInput (画像あり) + Runway Provider → unused_image_input warning なし', () => {
    const nodes: WorkflowNode[] = [
      createProviderNode({ provider: 'runway' }),
      createKlingElementsNode({ elementImages: ['https://example.com/e1.jpg'] }),
      createGenerateNode(),
      createImageInputNode({ imageUrl: 'https://example.com/img.jpg' }),
      createPromptNode({ englishPrompt: 'test' }),
    ];

    const { result } = renderHook(() => useWorkflowValidation(nodes, []));
    expect(result.current.warnings.some(w => w.type === 'unused_image_input')).toBe(false);
  });
});
