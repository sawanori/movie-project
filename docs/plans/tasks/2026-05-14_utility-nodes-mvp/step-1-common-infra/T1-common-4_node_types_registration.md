---
id: T1-common-4
step: 1
node: common
title: "utils/node-types.ts に 4 ノードを登録 (stub コンポーネント許容、Step 2 で実体上書き)"
depends_on: [T1-common-1]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/utils/node-types.ts
  - movie-maker/components/node-editor/nodes/GetVideoFrameNode.tsx (stub 作成許容)
  - movie-maker/components/node-editor/nodes/TrimVideoNode.tsx (stub 作成許容)
  - movie-maker/components/node-editor/nodes/StitchVideosNode.tsx (stub 作成許容)
  - movie-maker/components/node-editor/nodes/StickyNoteNode.tsx (stub 作成許容)
---

## 目的

React Flow が新規 4 ノード型を認識できるように、`nodeTypes` レコードに 4 エントリを登録する。Step 2 で各ノード実体が完成する前に**先行登録**することで、Step 2 タスクが同じファイル (`node-types.ts`) で競合しないようにする。

## 前提

- Design Doc §4.3 に準拠。
- 本タスクで stub コンポーネントを作成することは許容するが、Step 2 で実体実装が**同名ファイルを上書きする**前提。
- stub の中身は「React Flow から見える最小の関数コンポーネント」(例: `<div>Coming soon</div>`) で構わない。
- 競合リスクファイル `node-types.ts` を Step 1 で確定させることが本タスクの本質。

## 変更内容

### 1. stub コンポーネントの作成 (4 ファイル, 任意で可)

以下の 4 ファイルを**最小実装**として作成 (Step 2 で完全実装に置き換えられる):

`movie-maker/components/node-editor/nodes/GetVideoFrameNode.tsx`:
```typescript
'use client'
import { type NodeProps } from '@xyflow/react'

export function GetVideoFrameNode(_props: NodeProps) {
  return <div data-testid="get-video-frame-node-stub">GetVideoFrame (stub)</div>
}
```

`TrimVideoNode.tsx`, `StitchVideosNode.tsx`, `StickyNoteNode.tsx` も同様の stub を作成。

### 2. `node-types.ts` に 4 エントリ追加 (Design Doc §4.3)

```typescript
// Phase 5: Utility ノード
import { GetVideoFrameNode } from '../nodes/GetVideoFrameNode';
import { TrimVideoNode }     from '../nodes/TrimVideoNode';
import { StitchVideosNode }  from '../nodes/StitchVideosNode';
import { StickyNoteNode }    from '../nodes/StickyNoteNode';

export const nodeTypes: NodeTypes = {
  // ... 既存 ...
  // Phase 5
  getVideoFrame:  GetVideoFrameNode,
  trimVideo:      TrimVideoNode,
  stitchVideos:   StitchVideosNode,
  stickyNote:     StickyNoteNode,
};
```

## 完了条件 (AC)

- [x] `nodeTypes` レコードに `getVideoFrame`, `trimVideo`, `stitchVideos`, `stickyNote` の 4 キーが含まれる (`grep -n "getVideoFrame:\|trimVideo:\|stitchVideos:\|stickyNote:" movie-maker/components/node-editor/utils/node-types.ts` で 4 件ヒット)
- [x] 4 つのコンポーネント (`GetVideoFrameNode`, `TrimVideoNode`, `StitchVideosNode`, `StickyNoteNode`) が import されている
- [x] 4 つの stub コンポーネントファイルが存在する (`ls movie-maker/components/node-editor/nodes/GetVideoFrameNode.tsx movie-maker/components/node-editor/nodes/TrimVideoNode.tsx movie-maker/components/node-editor/nodes/StitchVideosNode.tsx movie-maker/components/node-editor/nodes/StickyNoteNode.tsx` で 4 ファイル存在確認)
- [x] `pnpm typecheck` が error 0
- [x] `pnpm lint` が clean (新規ファイルに新規エラーなし; 3 エラーは既存ファイルの既存問題)
- [x] 既存 `nodeTypes` のエントリが**変更されていない** (`git diff` で確認)

## テスト

- 本タスク単独のテスト不要 (Step 2 で各ノードのテストが追加される)。
- 既存の NodeEditor 単体テストが壊れていないこと (`pnpm test` で確認)。

## ロールバック

- 該当の追加分 (4 stub ファイル + node-types.ts の 4 エントリ) のみ `git revert` で元に戻せる。
- 既存 `nodeTypes` レコードのエントリに触れていないため既存ノードへの影響なし。

## 参照

- Design Doc §4.3 node-types.ts への追加 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 408-425
- 既存ファイル: `movie-maker/components/node-editor/utils/node-types.ts`
- README.md §5 競合リスクファイル: `node-types.ts` を Step 1 で先行登録する戦略
