---
id: T2-4
phase: 2
title: "nodes/index.ts と node-types.ts への DialogueNode export / 登録追加"
depends_on:
  - T2-3
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/nodes/index.ts
  - movie-maker/components/node-editor/utils/node-types.ts
---

## 目的

`DialogueNode` を `@xyflow/react` の `nodeTypes` マップに登録し、ノードエディタが `type: 'dialogue'` ノードを
レンダリングできるようにする。T2-5 (パレット登録) と並行実行可能。

## 前提

- T2-3 完了: `DialogueNode` コンポーネントが実装済みであること
- `nodes/index.ts` と `utils/node-types.ts` の現在の内容を確認しておくこと
  - `nodes/index.ts` L18-21: Phase 3 後処理ノードの export パターン
  - `utils/node-types.ts` L25-44: `nodeTypes` マップ登録パターン

## 変更内容

### 1. `nodes/index.ts` への追加

Design Doc §6-3 通り、`OverlayNode` export の直後 (L21 付近) に追加:

```typescript
// Phase 4: Dialogue ノード (Pipeline 型)
export { DialogueNode } from './DialogueNode'
```

### 2. `utils/node-types.ts` への追加

Design Doc §6-4 通り、`overlay` エントリの次行 (L43 付近) に追加:

```typescript
import { DialogueNode } from '../nodes/DialogueNode'

// nodeTypes マップ内:
// Phase 4: Dialogue ノード
dialogue: DialogueNode,
```

`import` 文は既存の import 群の末尾に追加する。

## 完了条件 (AC)

- [x] `nodes/index.ts` に `export { DialogueNode }` が追加されている
- [x] `utils/node-types.ts` の `nodeTypes` に `dialogue: DialogueNode` が追加されている
- [x] `npm run build` (または `tsc --noEmit`) がエラーなし
- [x] 既存の `nodeTypes` エントリ (generate, bgm, overlay 等) が変更されていない

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | head -30
```

既存テストへの影響確認:
```bash
npm test -- --watchAll=false 2>&1 | tail -20
```

## ロールバック

`nodes/index.ts` から `DialogueNode` の export 行を削除する。
`utils/node-types.ts` から `dialogue: DialogueNode` 行と関連 import を削除する。

## 参照

- Design Doc §6-3 (nodes/index.ts への追加)
- Design Doc §6-4 (node-types.ts への登録)
- Design Doc §7 (変更影響マップ)
- `movie-maker/components/node-editor/nodes/index.ts` L18-21
- `movie-maker/components/node-editor/utils/node-types.ts` L25-44
