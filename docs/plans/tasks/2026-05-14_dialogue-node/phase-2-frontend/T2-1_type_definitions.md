---
id: T2-1
phase: 2
title: "lib/types/node-editor.ts に DialogueNodeData, HasVideoOutput, HANDLE_IDS, NodeType 追加"
depends_on:
  - T1-5
estimated_effort: S
files_touched:
  - movie-maker/lib/types/node-editor.ts
---

## 目的

フロントエンドの型基盤を整える。`DialogueNodeData` インターフェース、`HasVideoOutput` ユーティリティ型、
`getNodeVideoOutput` 型ガード関数、`HANDLE_IDS` 定数、`NodeType` union への追加を一括で行う。
後続タスク (T2-2〜T2-6) が全てこのファイルの型に依存するため、最初に実装する。

## 前提

- Phase 1 (T1-5) が完了し、バックエンドエンドポイントが存在すること
- `movie-maker/lib/types/node-editor.ts` の現在の構造を確認しておくこと
  - L9-29: `NodeType` union
  - L140-183: 後処理ノード型定義
  - L221-348: `createDefaultNodeData`
  - L352-386: `HANDLE_IDS`
  - L408 付近: `NODE_CATEGORIES`

## 変更内容

### 1. `NodeType` union に追加 (L9-29 付近)

```typescript
| 'dialogue'  // Pipeline 型: 動画 + TTS ミックス
```

### 2. `DialogueNodeData` インターフェース追加

`OverlayNodeData` の直後 (L163 付近) に追加:

```typescript
export interface DialogueNodeData extends BaseNodeData {
  type: 'dialogue'
  // 入力設定
  text: string
  voiceId: string | null
  language: 'ja'       // 固定
  speed: number        // デフォルト 1.0
  // 実行状態
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'
  progress: number     // 0-100 (UI 表示用、ポーリング回数ベース)
  generationId: string | null
  // 出力
  outputVideoUrl: string | null
  errorMessage: string | null
}
```

### 3. `WorkflowNodeData` union に追加 (L167-183 付近)

```typescript
| DialogueNodeData
```

### 4. `HasVideoOutput` インターフェースと `getNodeVideoOutput` 関数追加

Design Doc §6-2 (B2 解決):

```typescript
export interface HasVideoOutput {
  videoUrl?: string | null
  outputVideoUrl?: string | null
}

export function getNodeVideoOutput(data: unknown): string | null {
  const d = data as HasVideoOutput
  return d?.outputVideoUrl ?? d?.videoUrl ?? null
}
```

配置場所: `WorkflowNodeData` union の直後が推奨。

### 5. `HANDLE_IDS` に追加 (L352-386 付近)

```typescript
// Dialogue
DIALOGUE_VIDEO_INPUT: 'dialogue_video_input',
DIALOGUE_VIDEO_OUTPUT: 'dialogue_video_output',
```

### 6. `NODE_CATEGORIES` の `post-processing.nodes` に `'dialogue'` を追加 (L408 付近)

### 7. `createDefaultNodeData` の switch に追加 (L221 以降)

```typescript
case 'dialogue':
  return {
    type: 'dialogue',
    isValid: true,
    text: '',
    voiceId: null,
    language: 'ja',
    speed: 1.0,
    status: 'idle',
    progress: 0,
    generationId: null,
    outputVideoUrl: null,
    errorMessage: null,
  }
```

## 完了条件 (AC)

- [x] `NodeType` union に `'dialogue'` が含まれる
- [x] `DialogueNodeData` インターフェースが export されている
- [x] `WorkflowNodeData` union に `DialogueNodeData` が含まれる
- [x] `HasVideoOutput` インターフェースが export されている
- [x] `getNodeVideoOutput` 関数が export されている
- [x] `HANDLE_IDS.DIALOGUE_VIDEO_INPUT` と `HANDLE_IDS.DIALOGUE_VIDEO_OUTPUT` が定義されている
- [x] `createDefaultNodeData('dialogue')` を呼び出すと期待するデフォルト値が返る
- [x] `npm run build` (または `tsc --noEmit`) がエラーなし

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | head -30
```

型チェックのみで実行時テストは不要 (型ファイルのみの変更)。

## ロールバック

`node-editor.ts` から追加した型・定数・case を削除する。
他ファイルへの変更はないため影響は限定的。

## 参照

- Design Doc §6-1 (型定義)
- Design Doc §6-2 (HasVideoOutput, getNodeVideoOutput — B2 解決)
- Design Doc §8 (接続 Handle 設計)
- `movie-maker/lib/types/node-editor.ts` L9-29, L140-183, L221-348, L352-386, L408
