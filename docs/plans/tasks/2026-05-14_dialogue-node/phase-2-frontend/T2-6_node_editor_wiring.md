---
id: T2-6
phase: 2
title: "NodeEditor.tsx に handleStartDialogue リスナー + ポーリングロジック追加"
depends_on:
  - T2-4
  - T2-5
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/NodeEditor.tsx
---

## 目的

`NodeEditor.tsx` に `startDialogue` イベントリスナーを追加し、upstream ノードの動画 URL を取得して
`dialogueApi.create()` を呼び出し、ポーリングで完了を待って `nodeDataUpdate` で DialogueNode を更新する。
これで DialogueNode の実行フローが完成する。

## 前提

- T2-4 完了: `DialogueNode` が `nodeTypes` に登録されていること
- T2-5 完了: パレットエントリが追加されていること
- `NodeEditor.tsx` の既存 useEffect (L421-430) を確認しておくこと
  - `handleStartGeneration` のパターンを理解してから実装する
  - 依存配列 `[nodes, edges, setNodes, onVideoGenerated]` を確認する
- T2-1 の `getNodeVideoOutput` が定義されていること

## 変更内容

### `NodeEditor.tsx` の既存 useEffect への追加

**重要**: 既存の `startGeneration` リスナーが登録されている `useEffect` ブロック (L421-430 付近) **の中**に `handleStartDialogue` を追加する。**新規の `useEffect(() => {}, [])` は作らない** — `edges` が stale になり upstream 検索が失敗する (B4 解決)。

#### `handleStartDialogue` 実装

Design Doc §6-2 (B4 解決 コードスニペット) に従う:

```typescript
const handleStartDialogue = async (e: Event) => {
  const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail

  // 1. upstream edge を検索
  const upstreamEdge = edges.find(
    (edge) => edge.target === nodeId && edge.targetHandle === 'dialogue_video_input'
  )
  if (!upstreamEdge) {
    // 動画未接続エラー
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: {
        nodeId,
        updates: {
          errorMessage: '動画ノードを接続してください',
          status: 'failed',
        },
      },
    }))
    return
  }

  // 2. upstream ノードの動画 URL を取得 (HasVideoOutput 共通インターフェース使用)
  const upstreamNode = nodes.find((n) => n.id === upstreamEdge.source)
  const videoUrl = getNodeVideoOutput(upstreamNode?.data)
  if (!videoUrl) {
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: {
        nodeId,
        updates: {
          errorMessage: '動画の生成が完了していません。先に動画を生成してください',
          status: 'failed',
        },
      },
    }))
    return
  }

  // 3. DialogueNode データを取得 (text, voiceId, speed)
  const dialogueNode = nodes.find((n) => n.id === nodeId)
  const dialogueData = dialogueNode?.data as DialogueNodeData | undefined
  if (!dialogueData?.text || !dialogueData?.voiceId) {
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: {
        nodeId,
        updates: {
          errorMessage: 'セリフと声を入力してください',
          status: 'failed',
        },
      },
    }))
    return
  }

  // 4. pending 状態に更新
  window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
    detail: { nodeId, updates: { status: 'pending', errorMessage: null } },
  }))

  try {
    // 5. dialogueApi.create() を呼び出し
    const result = await dialogueApi.create({
      video_url: videoUrl,
      text: dialogueData.text,
      voice_id: dialogueData.voiceId,
      speed: dialogueData.speed,
    })
    const generationId = result.id

    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: { nodeId, updates: { generationId, status: 'processing' } },
    }))

    // 6. ポーリング (最大 MAX_POLLING_ATTEMPTS 回)
    for (let attempt = 0; attempt < MAX_POLLING_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS))
      const status = await dialogueApi.getStatus(generationId)

      const progress = Math.min(Math.round((attempt / MAX_POLLING_ATTEMPTS) * 100), 99)
      window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
        detail: { nodeId, updates: { progress } },
      }))

      if (status.status === 'completed') {
        window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
          detail: {
            nodeId,
            updates: {
              status: 'completed',
              outputVideoUrl: status.output_video_url,
              progress: 100,
            },
          },
        }))
        return
      }
      if (status.status === 'failed') {
        window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
          detail: {
            nodeId,
            updates: {
              status: 'failed',
              errorMessage: status.error_message ?? '処理に失敗しました',
            },
          },
        }))
        return
      }
    }

    // ポーリングタイムアウト
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: {
        nodeId,
        updates: {
          status: 'failed',
          errorMessage: 'タイムアウトしました (15 分)。再試行してください',
        },
      },
    }))
  } catch (err) {
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: {
        nodeId,
        updates: {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : '予期しないエラーが発生しました',
        },
      },
    }))
  }
}
```

定数 `MAX_POLLING_ATTEMPTS = 180` と `POLLING_INTERVAL_MS = 5000` は `NodeEditor.tsx` のファイル先頭付近に定義する (既存の類似定数があればその近くに配置)。

#### イベントリスナー登録と cleanup

**既存の useEffect 内**に追加:
```typescript
window.addEventListener('startDialogue', handleStartDialogue)

// return の cleanup 関数に追加:
return () => {
  // 既存の removeEventListener...
  window.removeEventListener('startDialogue', handleStartDialogue)
}
```

#### 必要な import 追加

```typescript
import { getNodeVideoOutput } from '@/lib/types/node-editor'
import type { DialogueNodeData } from '@/lib/types/node-editor'
import { dialogueApi } from '@/lib/api/client'
```

## 完了条件 (AC)

- [x] `handleStartDialogue` が既存の useEffect ブロック内に追加されている (別 useEffect ではない)
- [x] `window.addEventListener('startDialogue', handleStartDialogue)` が追加されている
- [x] cleanup 関数に `window.removeEventListener('startDialogue', handleStartDialogue)` が追加されている
- [x] `getNodeVideoOutput` を使って upstream ノードの動画 URL を取得している
- [x] 動画未接続の場合に `errorMessage` が設定される
- [x] ポーリングタイムアウトの場合に `errorMessage` が設定される
- [x] `npm run build` がエラーなし
- [x] 既存の `startGeneration` ハンドラの動作が変わっていないこと (既存テストが通ること)

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | head -30
npm run build 2>&1 | tail -20
```

既存テスト確認:
```bash
npm test -- --watchAll=false 2>&1 | tail -30
```

手動確認 (Phase 2 L1 検証):
1. ローカルで Next.js を起動
2. ノードエディタを開く
3. GenerateNode を配置し、動画を生成 (または動画 URL をモックで設定)
4. DialogueNode を配置してパレットから追加
5. GenerateNode の output → DialogueNode の input を接続
6. セリフを入力し、声を選択して実行ボタンを押す
7. ポーリング後に `outputVideoUrl` が更新されることを確認

## ロールバック

`NodeEditor.tsx` から `handleStartDialogue` ハンドラと関連コードを削除する。
cleanup 関数から `removeEventListener` 行を削除する。
追加した import を削除する。

## 参照

- Design Doc §6-2 (handleStartDialogue 実装、B2/B4 解決 コードスニペット)
- Design Doc §16 (インテグレーションポイント 2)
- Design Doc §17 (コンポーネント階層とデータフロー図)
- `movie-maker/components/node-editor/NodeEditor.tsx` L247-430 (handleStartGeneration 参考)
