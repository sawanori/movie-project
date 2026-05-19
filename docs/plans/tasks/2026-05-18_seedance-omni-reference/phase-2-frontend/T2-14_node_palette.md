---
id: T2-14
phase: 2
title: NodePalette + useNodesAvailability (omniReference を seedance 限定で表示)
depends_on: [T1-9]
parallel_with: [T2-11, T2-13]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/NodePalette.tsx
  - movie-maker/components/node-editor/hooks/useNodesAvailability.ts
wave: 8
agent: frontend
---

## 目的

v3 計画書 §4.1 に従い、NodePalette に `omniReference` 項目を追加し、`useNodesAvailability` で `availableFor: ['seedance']` 制約を設定する。Provider が seedance 以外のとき palette から非表示 (or disabled) にする。

## 前提

- 依存タスク: T1-9 (NodeType に omniReference 追加済)
- 並列実行可: T2-11, T2-13
- 参照箇所: v3 計画書 §4.1, `components/node-editor/NodePalette.tsx`, `hooks/useNodesAvailability.ts`

## 変更内容

### `components/node-editor/hooks/useNodesAvailability.ts`

既存 availability map に追加:

```ts
const NODE_AVAILABILITY = {
  // ... 既存
  omniReference: { availableFor: ['seedance'] as const },
};
```

### `components/node-editor/NodePalette.tsx`

palette 項目に追加:

```tsx
{
  type: 'omniReference',
  label: 'Omni Reference',
  description: 'Seedance 用: 画像/動画/音声参照素材を mix',
  icon: <ReferenceIcon />,
  createData: createOmniReferenceNodeData,  // T1-9 で定義
}
```

availability チェックで非対応 provider なら disable or 非表示 (既存パターン踏襲)。

## 完了条件 (AC)

- [x] NodePalette に `omniReference` 項目追加
- [x] `useNodesAvailability` に `omniReference: { availableFor: ['seedance'] }` 追加
- [x] Provider=seedance 以外で palette 非表示 or disabled
- [x] `npm run test NodePalette` `npm run test useNodesAvailability` 既存 + 新 pass
- [x] `npx tsc --noEmit` pass
- [x] 他 Node の availability 設定は変更なし

## ロールバック

追加項目 / availability 設定削除。

## 参照

- v3 計画書 §4.1 (NodePalette, useNodesAvailability)
