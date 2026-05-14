---
id: T2-A-3
step: 2
node: A
title: "Wiring: NodeEditor.tsx に handleStartGetVideoFrame 追加 + lib/api/client.ts に utilityApi.extractFrame 追加"
depends_on: [T2-A-1, T2-A-2]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/NodeEditor.tsx
  - movie-maker/lib/api/client.ts
---

## 目的

`GetVideoFrameNode` (T2-A-2) が dispatch する `startGetVideoFrame` カスタムイベントを受け取り、BE API (T2-A-1) を呼び出して結果を反映するハンドラを `NodeEditor.tsx` に追加する。API client にも `utilityApi.extractFrame` を追加する。

## 前提

- Design Doc §5.4 に準拠。
- T2-A-1 (BE エンドポイント) と T2-A-2 (FE ノード) が**両方マージ済み**であること。
- **B4 パターン必須**: `handleStartGetVideoFrame` は `useEffect` 内に定義し、`edges` / `nodes` の closure が stale にならないようにする。`useEffect` の依存配列に `edges`, `nodes` を含めるか、`useRef` で最新値を保持するパターン (既存 `handleStartDialogue` L427 に準拠) を採用する。
- 競合リスクファイル: `NodeEditor.tsx`, `client.ts` は T2-B-3 / T2-C-3 とも編集が重なる。**順次マージ**戦略を採用 (3 並列マージ禁止)。

## 変更内容

### 1. `lib/api/client.ts` への追加 (Design Doc §4.4)

```typescript
export type ExtractFrameRequest = {
  video_url: string
  direction: 'first' | 'last'
}

export type ExtractFrameResponse = {
  image_url: string
}

// 既存に `utilityApi` がなければ新規作成、あれば追記
export const utilityApi = {
  extractFrame: (req: ExtractFrameRequest): Promise<ExtractFrameResponse> =>
    apiClient.post('/api/v1/videos/extract-frame', req),
  // 他の utilityApi メソッドは T2-B-3 / T2-C-3 で追加される
}
```

**注意**: T2-B-3 / T2-C-3 と同じ `utilityApi` object を共有する。先に T2-A-3 がマージされた場合、T2-B-3 / T2-C-3 は同 object に追記するだけになる。

### 2. `NodeEditor.tsx` への handler 追加 (Design Doc §5.4)

`useEffect` 内 (既存 `handleStartDialogue` L427 の直後) に追加:

```typescript
const handleStartGetVideoFrame = async (e: Event) => {
  const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail

  const dispatchUpdate = (updates: Partial<GetVideoFrameNodeData>) =>
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', { detail: { nodeId, updates } }))

  // 1. upstream edge から video URL を取得
  const upstreamEdge = edges.find(
    (edge) => edge.target === nodeId && edge.targetHandle === HANDLE_IDS.GET_VIDEO_FRAME_VIDEO_INPUT
  )
  if (!upstreamEdge) {
    dispatchUpdate({ status: 'failed', errorMessage: '動画ノードを接続してください' })
    return
  }

  // 2. upstream ノードから getNodeVideoOutput で video URL を取得
  const upstreamNode = nodes.find((n) => n.id === upstreamEdge.source)
  const videoUrl = getNodeVideoOutput(upstreamNode?.data)
  if (!videoUrl) {
    dispatchUpdate({ status: 'failed', errorMessage: '動画 URL が取得できませんでした' })
    return
  }

  // 3. status = processing
  dispatchUpdate({ status: 'processing' })

  // 4. API 呼び出し
  try {
    const direction = (nodes.find((n) => n.id === nodeId)?.data as GetVideoFrameNodeData).direction
    const res = await utilityApi.extractFrame({ video_url: videoUrl, direction })
    dispatchUpdate({ status: 'completed', outputImageUrl: res.image_url })
  } catch (err) {
    dispatchUpdate({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'フレームの抽出に失敗しました',
    })
  }
}

window.addEventListener('startGetVideoFrame', handleStartGetVideoFrame)
// cleanup
return () => {
  window.removeEventListener('startGetVideoFrame', handleStartGetVideoFrame)
  // ... 既存の他の cleanup ...
}
```

### 3. import 文の更新

`NodeEditor.tsx` の import に以下を追加:
- `GetVideoFrameNodeData` (from `@/lib/types/node-editor`)
- `utilityApi` (from `@/lib/api/client`)
- (既存) `HANDLE_IDS`, `getNodeVideoOutput`

## 完了条件 (AC)

- [x] `utilityApi.extractFrame` が `lib/api/client.ts` に追加されている (`grep -n "extractFrame:" movie-maker/lib/api/client.ts` でヒット)
- [x] `handleStartGetVideoFrame` が `NodeEditor.tsx` の `useEffect` 内に定義されている (`grep -n "handleStartGetVideoFrame" movie-maker/components/node-editor/NodeEditor.tsx` でヒット)
- [x] `window.addEventListener('startGetVideoFrame', ...)` と対応する `removeEventListener` が cleanup 関数に含まれる
- [x] **B4 パターン遵守**: `handleStartGetVideoFrame` が `useEffect` の**内側**で定義されている (外側のトップレベル関数として定義していない)
- [x] エラー処理が 3 パターン以上カバーされている: (i) upstream edge なし, (ii) videoUrl 取得失敗, (iii) API 例外
- [x] `pnpm typecheck` が error 0
- [x] `pnpm lint` が clean
- [x] 既存 `handleStartDialogue` などの既存 handler に**触れていない** (`git diff` で確認)

## テスト

- 単体テスト: NodeEditor.tsx 全体の単体テストは複雑なため、本タスクでは省略 (T3-1 で結合確認)
- 結合確認: T3-1 (E2E) で BE と接続して 1 シナリオ通すこと

## ロールバック

- `NodeEditor.tsx` と `client.ts` の追加分のみ `git revert` で元に戻せる。
- 既存 handler に触れていないため既存ノードへの影響なし。

## 参照

- Design Doc §4.4 lib/api/client.ts への追加 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 427-486
- Design Doc §5.4 NodeEditor.tsx への handler 追加 — 行 648-675 (B4 パターン明記)
- 既存パターン: `movie-maker/components/node-editor/NodeEditor.tsx` の `handleStartDialogue` (L427 周辺)
- README.md §5 競合リスクファイル: `NodeEditor.tsx`, `client.ts` の順次マージ戦略
