---
id: T2-C-3
step: 2
node: C
title: "Wiring: NodeEditor.tsx に handleStartStitchVideos + ポーリング (5s × 120 回 = 10 min) 追加 + lib/api/client.ts に utilityApi.stitchVideos / getStitchStatus 追加"
depends_on: [T2-C-1, T2-C-2]
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/NodeEditor.tsx
  - movie-maker/lib/api/client.ts
---

## 目的

`StitchVideosNode` (T2-C-2) が dispatch する `startStitchVideos` カスタムイベントを受け取り、BE API (T2-C-1) を呼び出して**非同期ポーリング** (5 秒 × 120 回 = 最大 10 分) で結果を反映するハンドラを `NodeEditor.tsx` に追加する。

## 前提

- Design Doc §7.5 に準拠。
- T2-C-1 (BE エンドポイント) と T2-C-2 (FE ノード) が**両方マージ済み**であること。
- **B4 パターン必須**: `handleStartStitchVideos` は `useEffect` 内に定義し、edges/nodes が stale にならないようにする。
- 既存 `DialogueNode` のポーリングパターン (`movie-maker/components/node-editor/NodeEditor.tsx` L489-534 周辺) を踏襲。
- 競合リスクファイル: `NodeEditor.tsx`, `client.ts` は T2-A-3 / T2-B-3 とも編集が重なる。**順次マージ**戦略。

## 変更内容

### 1. `lib/api/client.ts` への追加 (Design Doc §4.4)

```typescript
export type StitchVideosRequest = {
  video_urls: string[]
  transition: 'none' | 'crossfade'
}

export type StitchVideosResponse = {
  id: string
  status: 'pending'
}

export type StitchStatusResponse = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  output_video_url: string | null
  error_message: string | null
}

// 既存 utilityApi に追加
export const utilityApi = {
  // ... extractFrame, trimVideo (T2-A-3 / T2-B-3) ...
  stitchVideos: (req: StitchVideosRequest): Promise<StitchVideosResponse> =>
    apiClient.post('/api/v1/videos/stitch', req),

  getStitchStatus: (id: string): Promise<StitchStatusResponse> =>
    apiClient.get(`/api/v1/videos/stitch/${id}`),
}
```

### 2. `NodeEditor.tsx` のポーリング定数追加

既存の DIALOGUE 定数 (L48-54 周辺) と同じ場所に追加:

```typescript
const STITCH_MAX_POLLING_ATTEMPTS = 120    // 5 秒 × 120 回 = 最大 10 分
const STITCH_POLLING_INTERVAL_MS = 5000
```

### 3. `NodeEditor.tsx` への handler 追加

`useEffect` 内 (`handleStartTrimVideo` の直後) に追加:

```typescript
const STITCH_INPUT_HANDLE_IDS = [
  HANDLE_IDS.STITCH_VIDEO_1,
  HANDLE_IDS.STITCH_VIDEO_2,
  HANDLE_IDS.STITCH_VIDEO_3,
  HANDLE_IDS.STITCH_VIDEO_4,
  HANDLE_IDS.STITCH_VIDEO_5,
]

const handleStartStitchVideos = async (e: Event) => {
  const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail

  const dispatchUpdate = (updates: Partial<StitchVideosNodeData>) =>
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', { detail: { nodeId, updates } }))

  // 1. このノードへの incoming edges から video URL を収集
  const incomingEdges = edges
    .filter((edge) => edge.target === nodeId && STITCH_INPUT_HANDLE_IDS.includes(edge.targetHandle ?? ''))
    .sort((a, b) => {
      // targetHandle を 'video_1' → 1 で数値ソート
      const idxA = STITCH_INPUT_HANDLE_IDS.indexOf(a.targetHandle ?? '')
      const idxB = STITCH_INPUT_HANDLE_IDS.indexOf(b.targetHandle ?? '')
      return idxA - idxB
    })

  if (incomingEdges.length < 2) {
    dispatchUpdate({ status: 'failed', errorMessage: '2本以上の動画を接続してください' })
    return
  }

  // 2. 各 upstream ノードから videoUrl を取得
  const videoUrls: string[] = []
  for (const [i, edge] of incomingEdges.entries()) {
    const upstreamNode = nodes.find((n) => n.id === edge.source)
    const url = getNodeVideoOutput(upstreamNode?.data)
    if (!url) {
      dispatchUpdate({
        status: 'failed',
        errorMessage: `動画${i + 1}の生成が完了していません`,
      })
      return
    }
    videoUrls.push(url)
  }

  // 3. POST /stitch
  dispatchUpdate({ status: 'pending', progress: 0 })
  let stitchId: string
  try {
    const res = await utilityApi.stitchVideos({
      video_urls: videoUrls,
      transition: 'none',
    })
    stitchId = res.id
    dispatchUpdate({ stitchId, status: 'processing' })
  } catch (err) {
    dispatchUpdate({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'スティッチの開始に失敗しました',
    })
    return
  }

  // 4. ポーリングループ (DialogueNode の L489-534 パターン踏襲)
  for (let attempt = 0; attempt < STITCH_MAX_POLLING_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, STITCH_POLLING_INTERVAL_MS))

    try {
      const status = await utilityApi.getStitchStatus(stitchId)

      if (status.status === 'completed' && status.output_video_url) {
        dispatchUpdate({
          status: 'completed',
          progress: 100,
          outputVideoUrl: status.output_video_url,
        })
        return
      }

      if (status.status === 'failed') {
        dispatchUpdate({
          status: 'failed',
          errorMessage: status.error_message ?? 'スティッチに失敗しました',
        })
        return
      }

      // pending or processing
      dispatchUpdate({ status: 'processing', progress: status.progress })
    } catch (err) {
      // ポーリング 1 回失敗は許容、次の試行へ (DialogueNode と同じパターン)
      console.warn('[stitch] polling error:', err)
    }
  }

  // 5. タイムアウト
  dispatchUpdate({
    status: 'failed',
    errorMessage: 'タイムアウトしました (10分)。再試行してください',
  })
}

window.addEventListener('startStitchVideos', handleStartStitchVideos)
// cleanup に removeEventListener を追加
```

### 4. import 文の更新

`NodeEditor.tsx` の import に以下を追加:
- `StitchVideosNodeData` (from `@/lib/types/node-editor`)
- (既存) `utilityApi`, `HANDLE_IDS`, `getNodeVideoOutput`

## 完了条件 (AC)

- [x] `utilityApi.stitchVideos` および `utilityApi.getStitchStatus` が `lib/api/client.ts` に追加されている (`grep -n "stitchVideos:\|getStitchStatus:" movie-maker/lib/api/client.ts` で 2 件ヒット)
- [x] `STITCH_MAX_POLLING_ATTEMPTS = 120` と `STITCH_POLLING_INTERVAL_MS = 5000` の定数が `NodeEditor.tsx` に追加されている (`grep -n "STITCH_MAX_POLLING_ATTEMPTS\|STITCH_POLLING_INTERVAL_MS" movie-maker/components/node-editor/NodeEditor.tsx` で 4 件以上)
- [x] `handleStartStitchVideos` が `NodeEditor.tsx` の `useEffect` 内に定義されている
- [x] **B4 パターン遵守**: `handleStartStitchVideos` が `useEffect` の**内側**で定義されている
- [x] `window.addEventListener('startStitchVideos', ...)` と対応する `removeEventListener` が cleanup 関数に含まれる
- [x] ポーリングループが for ループ (`STITCH_MAX_POLLING_ATTEMPTS` 回上限) で実装され、`setTimeout` で 5 秒間隔
- [x] ポーリング中に completed/failed を検知して return する
- [x] タイムアウト時に「タイムアウトしました (10分)。再試行してください」を `errorMessage` に設定
- [x] エラー処理が 4 パターン以上カバーされている: (i) 接続 < 2 本, (ii) videoUrl 未生成, (iii) POST 失敗, (iv) ポーリングタイムアウト
- [x] `pnpm typecheck` が error 0
- [x] `pnpm lint` が clean
- [x] T2-A-3 / T2-B-3 でマージ済みの handler を**壊していない** (`git diff` で既存 handler 変更なし確認)

## テスト

- 単体テスト省略 (NodeEditor.tsx 全体テストは複雑、ポーリングモックも煩雑)
- 結合確認: T3-1 (E2E) で実 API と接続して 2 本 → 1 本にスティッチする 1 シナリオ通すこと

## ロールバック

- `NodeEditor.tsx` と `client.ts` の追加分のみ `git revert` で元に戻せる。
- 既存 handler / 既存ポーリング (DIALOGUE 系) に触れていないため影響なし。

## 参照

- Design Doc §4.4 lib/api/client.ts への追加 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 427-486
- Design Doc §7.5 NodeEditor.tsx への handler 追加 (ポーリングパターン) — 行 1094-1127
- Design Doc §9.1 エラーハンドリング表 (Stitch のエラー文言) — 行 1249-1253
- 参考実装: `movie-maker/components/node-editor/NodeEditor.tsx` 内の DialogueNode ポーリングロジック (L489-534 周辺)
- README.md §5 競合リスクファイル: `NodeEditor.tsx`, `client.ts` の順次マージ戦略
