---
id: T2-12
phase: 2
title: ProviderNode handle + NodeEditor 接続 guard + useWorkflowValidation (H-3, M-2)
depends_on: [T1-9, T2-13, T2-14]
parallel_with: []
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/ProviderNode.tsx
  - movie-maker/components/node-editor/NodeEditor.tsx
  - movie-maker/components/node-editor/hooks/useWorkflowValidation.ts
  - movie-maker/components/node-editor/nodes/__tests__/ProviderNode.test.tsx
wave: 9
agent: frontend
---

## 目的

v3 計画書 §6.7 / §15.2 F-12, F-13 に従い、以下を実装 (H-3 解消):

1. `ProviderNode.tsx` に `OMNI_REFERENCE_INPUT` handle 追加 (seedance のみ表示)
2. `NodeEditor.tsx` に omniReference → ProviderNode 接続 guard (seedance 以外への接続拒否)
3. `useWorkflowValidation.ts` に `consentAccepted === false` の検証 (M-2 対応、Generate ボタン disable 連動)

## 前提

- 依存タスク:
  - T1-9 (HANDLE_IDS)
  - T2-13 (graph-to-api 完成、validation 連携先)
  - T2-14 (NodePalette 完成、UI 配置順整合)
- 並列実行可: なし
- 参照箇所: v3 計画書 §6.7, §15.2

## 変更内容

### `ProviderNode.tsx`

```tsx
import { HANDLE_IDS } from '@/lib/types/node-editor';

// provider が seedance なら handle 表示
{provider === 'seedance' && (
  <Handle
    type="target"
    position={Position.Left}
    id={HANDLE_IDS.OMNI_REFERENCE_INPUT}
    style={{ top: 80 }}
  />
)}
```

### `NodeEditor.tsx`

接続時の guard:

```tsx
const isValidConnection: IsValidConnection = useCallback(
  (conn) => {
    if (conn.targetHandle === HANDLE_IDS.OMNI_REFERENCE_INPUT) {
      const targetNode = getNode(conn.target);
      const providerData = targetNode?.data as ProviderNodeData | undefined;
      return providerData?.provider === 'seedance';
    }
    // ... 既存 guards
    return true;
  },
  [getNode],
);
```

### `useWorkflowValidation.ts` (M-2)

```ts
// OmniReferenceNode が存在しかつ接続済で consentAccepted=false なら invalid
const omniNode = nodes.find(n => n.data.type === 'omniReference');
if (omniNode) {
  const connected = edges.some(
    e => e.source === omniNode.id &&
         e.sourceHandle === HANDLE_IDS.OMNI_REFERENCE_OUTPUT
  );
  if (connected && !(omniNode.data as OmniReferenceNodeData).consentAccepted) {
    issues.push({
      level: 'error',
      message: 'OmniReference: 著作権同意が必要です',
    });
  }
}
```

### テスト: `ProviderNode.test.tsx`

| # | テスト |
|---|--------|
| F-12 | provider=seedance → OMNI_REFERENCE_INPUT handle 表示 |
| F-13 | provider != seedance → handle 非表示 |

`useWorkflowValidation.test.ts` 拡張 (新規 or 既存に追加):

| # | テスト |
|---|--------|
| V-1 | OmniReferenceNode 接続済 + consent=false → error issue |
| V-2 | OmniReferenceNode 接続済 + consent=true → no issue |
| V-3 | OmniReferenceNode 未接続 → consent 状態問わず no issue |

## 完了条件 (AC)

- [x] ProviderNode に OMNI_REFERENCE_INPUT handle 実装 (seedance 限定)
- [x] NodeEditor で omniReference → seedance 以外接続拒否
- [x] useWorkflowValidation で consent=false を error 検出
- [x] `npm run test ProviderNode useWorkflowValidation` 全 pass
- [x] AC-5 (seedance 接続後 Generate) を補強

## H-3, M-2 解消

- H-3: ProviderNode の handle 追加と Editor guard を本タスクで同時実装
- M-2: consent false の workflow validation を明示追加

## ロールバック

handle 追加 / Editor guard / validation 削除。

## 参照

- v3 計画書 §6.7 (HANDLE_IDS), §6.8 (UI), §15.2 F-12/F-13
- H-3 解消, M-2 対応
