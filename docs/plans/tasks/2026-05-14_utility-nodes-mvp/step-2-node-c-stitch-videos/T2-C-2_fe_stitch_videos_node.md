---
id: T2-C-2
step: 2
node: C
title: "FE: StitchVideosNode.tsx 新規実装 (動的 Handle + useUpdateNodeInternals 必須) + 単体テスト 4 ケース最低"
depends_on: [T1-common-1, T1-common-2, T1-common-3, T1-common-4]
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/StitchVideosNode.tsx (T1-common-4 の stub を上書き)
  - movie-maker/components/node-editor/nodes/__tests__/StitchVideosNode.test.tsx (新規)
---

## 目的

2〜5 本の動画 URL を受け取り、連結動画 URL を出力する React Flow ノードを実装する。**Krea スタイルの動的 Handle** (接続された数だけ Handle を表示) を採用する。

## 前提

- Design Doc §7.2 + §7.4 に準拠。
- **B1 修正 (重要・必須)**: 動的 Handle の追加時、React Flow に Handle DOM の変化を明示通知するため **`useUpdateNodeInternals` フックの呼び出しが必須**。これを忘れると新規に追加された Handle にエッジを接続できず、サイレントに失敗する。
  - 公式ドキュメント: https://reactflow.dev/api-reference/hooks/use-update-node-internals
- T1-common-1〜4 がマージ済みで、`StitchVideosNodeData`, `HANDLE_IDS.STITCH_VIDEO_1〜5`, `STITCH_VIDEO_OUTPUT`, `getInputHandleClass`, `getOutputHandleClass` が利用可能。
- T1-common-4 の stub ファイルを本実装で上書きする。

## 変更内容

### 1. `StitchVideosNode.tsx` を完全実装で上書き

Design Doc §7.4 のシグネチャに準拠。**B1 修正必須**:

```typescript
'use client'
import { useCallback, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useEdges, useUpdateNodeInternals } from '@xyflow/react'  // ★ B1: useUpdateNodeInternals 必須
import { Link, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import {
  BaseNode,
  getInputHandleClass,
  getOutputHandleClass,
  nodeLabelClassName,
} from './BaseNode'
import type { StitchVideosNodeData } from '@/lib/types/node-editor'
import { HANDLE_IDS } from '@/lib/types/node-editor'

const STITCH_HANDLE_IDS = [
  HANDLE_IDS.STITCH_VIDEO_1,
  HANDLE_IDS.STITCH_VIDEO_2,
  HANDLE_IDS.STITCH_VIDEO_3,
  HANDLE_IDS.STITCH_VIDEO_4,
  HANDLE_IDS.STITCH_VIDEO_5,
] as const

export function StitchVideosNode({ data, selected, id }: StitchVideosNodeProps) {
  const edges = useEdges()
  const updateNodeInternals = useUpdateNodeInternals()  // ★ B1

  // 接続済み handle を算出
  const connectedHandleIds = edges
    .filter((e) => e.target === id)
    .map((e) => e.targetHandle)
    .filter((h): h is string => Boolean(h))
  const connectedCount = connectedHandleIds.length

  // 次の空き handle まで表示 (最大 5)
  const visibleHandleCount = Math.min(connectedCount + 1, 5)

  // ★ B1: Handle 数が変化したら React Flow に明示通知
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, visibleHandleCount, updateNodeInternals])

  // 実行ボタン handler
  const handleExecute = useCallback(() => {
    window.dispatchEvent(new CustomEvent('startStitchVideos', { detail: { nodeId: id } }))
  }, [id])

  const isProcessing = data.status === 'pending' || data.status === 'processing'
  const canExecute = !isProcessing && connectedCount >= 2

  return (
    <BaseNode
      title="スティッチ"
      icon={<Link className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={connectedCount < 2 ? '2本以上の動画を接続してください' : data.errorMessage}
      className="min-w-[220px]"
    >
      {/* 動的入力ハンドル (Video=緑) */}
      {STITCH_HANDLE_IDS.slice(0, visibleHandleCount).map((handleId, index) => (
        <div key={handleId} className="flex items-center gap-2 relative">
          <Handle
            type="target"
            position={Position.Left}
            id={handleId}
            className={getInputHandleClass('video')}
            style={{ top: `${20 + index * 28}px` }}
          />
          <span className="text-xs text-gray-500 ml-4">動画 {index + 1}</span>
        </div>
      ))}

      {/* トランジション (Phase 1 は固定 none) */}
      <div>
        <label className={nodeLabelClassName}>トランジション</label>
        <p className="text-xs text-gray-500">カット (Phase 1 のみ)</p>
      </div>

      {/* ステータス表示 / 実行ボタン: DialogueNode の renderStatusArea パターンを踏襲 */}
      {/* TODO: 進捗バー (data.progress) を表示 */}
      {/* TODO: data.outputVideoUrl があれば <video> プレビュー */}

      {/* 出力ハンドル (Video=緑) */}
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.STITCH_VIDEO_OUTPUT}
        className={getOutputHandleClass('video')}
      />
    </BaseNode>
  )
}
```

### 2. 単体テスト (`__tests__/StitchVideosNode.test.tsx` 新規)

Design Doc §7.2 と §10.1 に準拠。**最低 4 ケース** (動的 Handle の境界値 + 接続可能性):

| テストケース | 確認内容 |
|-------------|---------|
| **接続 0 本**: handle 1 のみ表示 | DOM に `id="video_1"` の Handle が 1 つだけ存在、`video_2` 以降は存在しない |
| **接続 1 本**: handle 1, 2 表示 | `useEdges` モックで edge を 1 つ返したとき、`video_1`, `video_2` の Handle が表示される。**新規追加された `video_2` Handle にエッジが接続可能**であること |
| **接続 5 本**: handle 1〜5 のみ表示 (handle 6 は表示されない) | 5 個の Handle 表示で 6 個目が表示されない |
| **`useUpdateNodeInternals` 呼び出し確認**: Handle 数変化時に React Flow へ通知される | `useUpdateNodeInternals` の返り値関数 (モック) が `visibleHandleCount` 変化のたびに呼ばれる (Design Doc §7.2 の B1 修正検証) |
| (追加) 接続 1 本以下で実行ボタン disabled | `connectedCount < 2` で実行ボタンが `disabled` |
| (追加) 接続 2 本以上で実行ボタン enabled | `connectedCount >= 2` で実行ボタンが押せる |
| (追加) 実行ボタンクリック | `startStitchVideos` CustomEvent が dispatch される |
| (追加) processing 中の UI | `data.status='processing'` で Loader2 + 進捗バー (`data.progress`) 表示 |

**重要**: 「**`useUpdateNodeInternals` 呼び出しがされていないと最後のテストが失敗する**」(Design Doc §7.2 行 936)。本テストで B1 修正の有効性を担保する。

## 完了条件 (AC)

- [x] `StitchVideosNode.tsx` が完全実装で上書きされている (stub が消えている)
- [x] **B1 修正反映 (必須)**: `useUpdateNodeInternals` が `@xyflow/react` から import されている (`grep -n "useUpdateNodeInternals" movie-maker/components/node-editor/nodes/StitchVideosNode.tsx` でヒット)
- [x] **B1 修正反映 (必須)**: `useEffect` 内で `updateNodeInternals(id)` が呼ばれており、依存配列に `visibleHandleCount` が含まれている (`grep -B2 -A4 "updateNodeInternals(id)" movie-maker/components/node-editor/nodes/StitchVideosNode.tsx` で `useEffect` ブロック確認)
- [x] 動的 Handle が `connectedCount + 1` 個 (max 5) 表示される (テストで境界値 0/1/5 を確認)
- [x] 出力ハンドル (Video=緑) と入力ハンドル (Video=緑) のクラスがそれぞれ `getOutputHandleClass('video')` / `getInputHandleClass('video')` で付与されている
- [x] `connectedCount < 2` のとき実行ボタンが `disabled`
- [x] `'startStitchVideos'` の CustomEvent dispatch が実行ボタンクリック時に発火
- [x] 単体テスト 4 ケース最低が green (接続 0/1/5 + useUpdateNodeInternals 呼び出し検証) (`cd movie-maker && pnpm test StitchVideosNode`) — 15 件 PASSED
- [x] `pnpm typecheck` が error 0 (npx tsc --noEmit: 0 errors)
- [ ] `pnpm lint` が clean

## テスト

- 単体テスト: **必須 4 ケース** (動的 Handle の境界 0/1/5 接続 + B1 検証) + 追加 4 ケース (実行ボタン + ステータス)
- 結合テスト: T3-1 (E2E) で実 API と接続して動作確認

## ロールバック

- `StitchVideosNode.tsx` を T1-common-4 の stub に戻す。
- テストファイル削除のみで完了。

## 参照

- Design Doc §7.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 866-874
- Design Doc §7.2 動的 Handle 設計 (B1 修正の核心) — 行 876-937
- Design Doc §7.4 FE コンポーネント骨格 — 行 986-1092
- Design Doc §10.1 単体テスト方針 (Stitch Videos テスト表) — 行 1289-1297
- xyflow 公式: https://reactflow.dev/api-reference/hooks/use-update-node-internals
- xyflow 公式: https://reactflow.dev/learn/customization/handles
- 参考実装: `movie-maker/components/node-editor/nodes/DialogueNode.tsx` (ポーリング UI + 進捗バーの参考)
