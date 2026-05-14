---
id: T2-D-1
step: 2
node: D
title: "FE: StickyNoteNode.tsx 新規実装 + 単体テスト (BE 不要、wiring 不要)"
depends_on: [T1-common-1, T1-common-2, T1-common-3, T1-common-4]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/nodes/StickyNoteNode.tsx (T1-common-4 の stub を上書き)
  - movie-maker/components/node-editor/nodes/__tests__/StickyNoteNode.test.tsx (新規)
---

## 目的

ワークフローへの注釈用の **付箋ノード** を実装する。ハンドルなし、バックエンド連携なし、wiring なしで完結する。`BGMNode` の Source-only パターンを踏襲した独自スタイル (付箋らしい見た目)。

## 前提

- Design Doc §8.1〜§8.3 に準拠。
- T1-common-1〜4 がマージ済みで、`StickyNoteNodeData` (text, color, isValid=true) が利用可能。
- T1-common-4 の stub ファイルを本実装で上書きする。
- **BE 不要**, **NodeEditor.tsx 編集不要** (FE 単独で完結)。
- ワークフロー JSON への保存は既存の保存機構 (`WorkflowNode[]`) でそのまま動作 (Design Doc §11.3)。
- 推奨上限: 500 文字 (`textarea maxLength={500}`) — Design Doc §8.3。

## 変更内容

### 1. `StickyNoteNode.tsx` を完全実装で上書き

Design Doc §8.2 のシグネチャに準拠。**BaseNode を使わず独自スタイル** (付箋らしい見た目):

```typescript
'use client'
import { useCallback } from 'react'
import { type NodeProps } from '@xyflow/react'
import { StickyNote } from 'lucide-react'  // または MessageSquare
import { cn } from '@/lib/utils'
import type { StickyNoteNodeData } from '@/lib/types/node-editor'

type StickyNoteNodeProps = NodeProps & {
  data: StickyNoteNodeData
  selected: boolean
}

const COLOR_CLASSES: Record<StickyNoteNodeData['color'], { bg: string; border: string; text: string }> = {
  yellow: { bg: 'bg-yellow-900/30', border: 'border-yellow-600/50', text: 'text-yellow-200' },
  pink:   { bg: 'bg-pink-900/30',   border: 'border-pink-600/50',   text: 'text-pink-200' },
  blue:   { bg: 'bg-blue-900/30',   border: 'border-blue-600/50',   text: 'text-blue-200' },
}

export function StickyNoteNode({ data, selected, id }: StickyNoteNodeProps) {
  const colors = COLOR_CLASSES[data.color]

  const updateNodeData = useCallback(
    (updates: Partial<StickyNoteNodeData>) => {
      window.dispatchEvent(new CustomEvent('nodeDataUpdate', { detail: { nodeId: id, updates } }))
    },
    [id]
  )

  return (
    <div
      className={cn(
        'relative rounded-xl p-4 min-w-[200px] max-w-[300px] transition-all border',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-[#fce300]'
      )}
    >
      {/* ヘッダー: 色選択ボタン */}
      <div className="flex items-center gap-2 mb-2">
        <StickyNote className={cn('w-4 h-4', colors.text)} />
        <div className="flex gap-1 ml-auto">
          {(['yellow', 'pink', 'blue'] as const).map((c) => (
            <button
              key={c}
              onClick={() => updateNodeData({ color: c })}
              aria-label={`色を${c}に変更`}
              className={cn(
                'w-3 h-3 rounded-full border',
                c === 'yellow' && 'bg-yellow-400',
                c === 'pink' && 'bg-pink-400',
                c === 'blue' && 'bg-blue-400',
                data.color === c && 'ring-2 ring-white ring-offset-1 ring-offset-black'
              )}
            />
          ))}
        </div>
      </div>

      {/* テキスト入力 */}
      <textarea
        value={data.text}
        onChange={(e) => updateNodeData({ text: e.target.value })}
        placeholder="メモを入力..."
        rows={4}
        maxLength={500}
        className={cn(
          'w-full bg-transparent resize-none text-sm leading-relaxed',
          'focus:outline-none placeholder-gray-600',
          colors.text
        )}
      />
    </div>
  )
}
```

### 2. 単体テスト (`__tests__/StickyNoteNode.test.tsx` 新規)

Design Doc §10.1 に準拠。最低 4 ケース:

| テストケース | 確認内容 |
|-------------|---------|
| テキスト入力 | `textarea` に入力された文字が `nodeDataUpdate` CustomEvent で `{ text }` で dispatch される |
| 色変更 (pink) | pink ボタン押下で `nodeDataUpdate` が `{ color: 'pink' }` で dispatch される |
| **ハンドルなし**: Handle コンポーネントが DOM に存在しない | `container.querySelector('.react-flow__handle')` が `null` (DOM に xyflow の Handle が存在しないこと) |
| **maxLength**: 501 文字目が入力できない | `textarea` の `maxLength` 属性が `500` |

## 完了条件 (AC)

- [x] `StickyNoteNode.tsx` が完全実装で上書きされている (stub が消えている)
- [x] **ハンドルなし**: `<Handle>` コンポーネントが DOM に存在しない (`grep -c "<Handle" movie-maker/components/node-editor/nodes/StickyNoteNode.tsx` が 0)
- [x] `BaseNode` を使わず独自 `<div>` で実装されている (付箋らしい見た目)
- [x] 3 色 (`yellow`, `pink`, `blue`) の色変更ボタンが存在し、`data.color` を更新する
- [x] `<textarea>` に `maxLength={500}` が設定されている (`grep -n "maxLength={500}" movie-maker/components/node-editor/nodes/StickyNoteNode.tsx` でヒット)
- [x] `data.text` が `textarea` の `value` にバインドされている
- [x] `selected={true}` のとき `ring-2 ring-[#fce300]` クラスが付与される
- [x] 単体テスト 4 ケース最低が green (`cd movie-maker && pnpm test StickyNoteNode`)
- [x] `pnpm typecheck` が error 0
- [x] `pnpm lint` が clean

## テスト

- 単体テスト: 上記 4 ケース最低 (TDD)
- 結合テスト: T3-1 (E2E) でワークフロー保存・復元時に `text`, `color` が保持されることを確認

## ロールバック

- `StickyNoteNode.tsx` を T1-common-4 の stub に戻す。
- テストファイル削除のみで完了。
- BE / NodeEditor.tsx に触れていないためロールバックリスクなし。

## 参照

- Design Doc §8.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 1134-1141
- Design Doc §8.2 FE コンポーネント骨格 — 行 1143-1224
- Design Doc §8.3 ワークフロー保存サイズ考慮 (maxLength=500) — 行 1226-1232
- Design Doc §10.1 単体テスト方針 (Sticky Note テスト表) — 行 1299-1306
- Design Doc §11.3 DB マイグレーション不要 — 行 1362-1364
- 参考実装: `movie-maker/components/node-editor/nodes/BGMNode.tsx` (Source-only パターン)
