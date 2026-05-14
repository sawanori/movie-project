---
id: T2-B-3
step: 2
node: B
title: "Wiring: NodeEditor.tsx に handleStartTrimVideo 追加 + lib/api/client.ts に utilityApi.trimVideo 追加"
depends_on: [T2-B-1, T2-B-2]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/NodeEditor.tsx
  - movie-maker/lib/api/client.ts
---

## 目的

`TrimVideoNode` (T2-B-2) が dispatch する `startTrimVideo` カスタムイベントを受け取り、BE API (T2-B-1) を呼び出して結果を反映するハンドラを `NodeEditor.tsx` に追加する。

## 前提

- Design Doc §4.4 + §5.4 の `handleStartGetVideoFrame` パターンを Trim 用に踏襲。
- T2-B-1 (BE エンドポイント) と T2-B-2 (FE ノード) が**両方マージ済み**であること。
- **B4 パターン必須**: `handleStartTrimVideo` は `useEffect` 内に定義し、edges/nodes が stale にならないようにする。
- 競合リスクファイル: `NodeEditor.tsx`, `client.ts` は T2-A-3 / T2-C-3 とも編集が重なる。**順次マージ**戦略。

## 変更内容

### 1. `lib/api/client.ts` への追加 (Design Doc §4.4)

```typescript
export type TrimVideoRequest = {
  video_url: string
  start_seconds: number
  end_seconds: number | null
}

export type TrimVideoResponse = {
  output_video_url: string
}

// 既存 utilityApi に追加 (T2-A-3 で先に作成済みの可能性あり)
export const utilityApi = {
  // ... extractFrame (T2-A-3) ...
  trimVideo: (req: TrimVideoRequest): Promise<TrimVideoResponse> =>
    apiClient.post('/api/v1/videos/trim', req),
}
```

### 2. `NodeEditor.tsx` への handler 追加

`useEffect` 内 (`handleStartGetVideoFrame` の直後) に追加:

```typescript
const handleStartTrimVideo = async (e: Event) => {
  const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail

  const dispatchUpdate = (updates: Partial<TrimVideoNodeData>) =>
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', { detail: { nodeId, updates } }))

  // 1. upstream edge から video URL を取得
  const upstreamEdge = edges.find(
    (edge) => edge.target === nodeId && edge.targetHandle === HANDLE_IDS.TRIM_VIDEO_INPUT
  )
  if (!upstreamEdge) {
    dispatchUpdate({ status: 'failed', errorMessage: '動画ノードを接続してください' })
    return
  }

  const upstreamNode = nodes.find((n) => n.id === upstreamEdge.source)
  const videoUrl = getNodeVideoOutput(upstreamNode?.data)
  if (!videoUrl) {
    dispatchUpdate({ status: 'failed', errorMessage: '動画 URL が取得できませんでした' })
    return
  }

  // 2. 自ノードの startSeconds / endSeconds 取得
  const selfNode = nodes.find((n) => n.id === nodeId)
  const data = selfNode?.data as TrimVideoNodeData

  // 3. status = processing
  dispatchUpdate({ status: 'processing' })

  try {
    const res = await utilityApi.trimVideo({
      video_url: videoUrl,
      start_seconds: data.startSeconds,
      end_seconds: data.endSeconds,
    })
    dispatchUpdate({ status: 'completed', outputVideoUrl: res.output_video_url })
  } catch (err) {
    dispatchUpdate({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : '動画のトリムに失敗しました',
    })
  }
}

window.addEventListener('startTrimVideo', handleStartTrimVideo)
// cleanup に removeEventListener を追加
```

### 3. import 文の更新

`NodeEditor.tsx` の import に以下を追加:
- `TrimVideoNodeData` (from `@/lib/types/node-editor`)
- (既存 import を再利用) `utilityApi`, `HANDLE_IDS`, `getNodeVideoOutput`

## 完了条件 (AC)

- [x] `utilityApi.trimVideo` が `lib/api/client.ts` に追加されている (`grep -n "trimVideo:" movie-maker/lib/api/client.ts` でヒット)
- [x] `handleStartTrimVideo` が `NodeEditor.tsx` の `useEffect` 内に定義されている (`grep -n "handleStartTrimVideo" movie-maker/components/node-editor/NodeEditor.tsx` でヒット)
- [x] `window.addEventListener('startTrimVideo', ...)` と対応する `removeEventListener` が cleanup 関数に含まれる
- [x] **B4 パターン遵守**: `handleStartTrimVideo` が `useEffect` の**内側**で定義されている
- [x] エラー処理が 3 パターン以上カバーされている: (i) upstream edge なし, (ii) videoUrl 取得失敗, (iii) API 例外
- [x] `pnpm typecheck` が error 0
- [x] `pnpm lint` が clean
- [x] T2-A-3 でマージ済みの `handleStartGetVideoFrame` を**壊していない** (`git diff` で既存 handler 変更なし確認)

## テスト

- 単体テスト省略 (NodeEditor.tsx 全体テストは複雑)
- 結合確認: T3-1 (E2E) で実 API と接続して動作確認

## ロールバック

- `NodeEditor.tsx` と `client.ts` の追加分のみ `git revert` で元に戻せる。

## 参照

- Design Doc §4.4 lib/api/client.ts への追加 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 427-486
- Design Doc §5.4 NodeEditor.tsx への handler 追加 (B4 パターン) — 行 648-675
- Design Doc §6 Trim Video 全体 — 行 679-861
- 参考: `T2-A-3_wiring_node_editor.md` (同じパターン)
- README.md §5 競合リスクファイル: `NodeEditor.tsx`, `client.ts` の順次マージ戦略
