---
id: T2-3
phase: 2
title: KlingElementsNode に Provider 警告追加 (useNodes 全ノードスキャン / B2 解決)
depends_on:
  - T2-1
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/KlingElementsNode.tsx
---

## 目的

ProviderNode の `provider` フィールドが `piapi_kling` 以外の場合（または ProviderNode が未配置の場合）に「⚠ Kling 専用ノードです」警告を表示する。

**B2 解決 (必須)**: KlingElementsNode は source-only のため 1-hop edge 検索では ProviderNode に到達できない。`useNodes()` でグラフ全体をスキャンして全 ProviderNode を探す方式を採用する。

## 前提

- T2-1 完了済み
- T2-2 と並行して実装可能 (同じファイルだが diff の位置が異なる)
- `@xyflow/react` の `useNodes` は既にプロジェクトで使用されている
- `useMemo` は `react` から import 済みであること (未追加なら追加する)

## 変更内容

### 1. import 追加 (L1-14 付近)

```tsx
// 修正前
import { useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// 修正後
import { useCallback, useState, useMemo } from 'react';
import { useNodes, Handle, Position, NodeProps } from '@xyflow/react';
import type { ProviderNodeData, WorkflowNode } from '@/lib/types/node-editor';
```

> `ProviderNodeData` と `WorkflowNode` が `node-editor.ts` にエクスポートされているか確認し、なければ適切な型を使用する。

### 2. `isKlingProvider` の useMemo 追加 (コンポーネント内、return の直前)

**B2 解決**: グラフ全体から全 ProviderNode を探し `provider === 'piapi_kling'` を any() 判定する。

```tsx
const nodes = useNodes<WorkflowNode>();

// B2 修正: グラフ内の全 ProviderNode を useNodes() で走査
// 1-hop search ではなく全ノードスキャンで ProviderNode を探す (Design Doc §7-1 B2 解決)
const isKlingProvider = useMemo(() => {
  const providerNodes = nodes.filter((n) => n.data.type === 'provider');
  if (providerNodes.length === 0) return null; // Provider 未配置 → 警告非表示
  return providerNodes.some(
    (n) => (n.data as ProviderNodeData).provider === 'piapi_kling'
  );
}, [nodes]);
```

### 3. 警告 UI の追加 (BaseNode の子要素先頭、`{/* アップロード済み画像 */}` の直前)

```tsx
{/* ▼ NEW: Provider 警告 (B2 解決: useNodes 全ノードスキャン) */}
{isKlingProvider === false && (
  <div className="mb-2 p-2 rounded bg-[#2a2a2a] border border-yellow-600/40">
    <p className="text-[10px] text-yellow-400">
      ⚠ Kling 専用ノードです。他プロバイダー時は無視されます
    </p>
  </div>
)}
```

## 完了条件 (AC)

- [x] **B2 解決の grep 確認** (最重要):
  ```bash
  grep -n "useNodes\|filter.*type.*provider\|providerNodes" \
    movie-maker/components/node-editor/nodes/KlingElementsNode.tsx
  ```
  以下の 3 行が全て確認できること:
  1. `useNodes` の import
  2. `nodes.filter((n) => n.data.type === 'provider')` でのフィルタリング
  3. `providerNodes.some(...)` での any() 判定
- [x] `grep -n "useMemo" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` で `isKlingProvider` の memoize が確認できる
- [x] `grep -n "isKlingProvider === false" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` で警告 UI のレンダリング条件が確認できる
- [x] `grep -n "Kling 専用ノード" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` で警告テキストが確認できる
- [x] `cd movie-maker && npm run build` が成功する

## テスト

正式テストは T2-5 のケース 4 (Provider 警告) で実施。

```bash
cd movie-maker
npm run build 2>&1 | tail -5
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §7-1: 修正 4 (Provider 警告の追加)
- Design Doc §14: リスク — Provider 警告のロジック (B2 解決)
- Design Doc §16: インテグレーションポイント 5 (ProviderNode read-only 参照)
- `movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` L1-14 (imports), L92-154 (return 内)
