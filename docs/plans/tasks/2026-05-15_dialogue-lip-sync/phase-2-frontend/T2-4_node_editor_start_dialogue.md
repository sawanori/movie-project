---
id: T2-4
phase: 2
title: "NodeEditor.tsx 拡張 — handleStartDialogue に use_lip_sync を渡す"
depends_on:
  - T2-1
  - T2-2
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/NodeEditor.tsx
---

## 目的

`NodeEditor.tsx` の `handleStartDialogue` 内で `dialogueApi.create` を呼ぶ際に `use_lip_sync: dialogueData.useLipSync` を追加する。B4 解決パターン踏襲: 別の `useEffect` を追加せず既存リスナー内の 1 行追加のみ。

## 前提

- T2-1 (型定義拡張) 完了済 — `DialogueNodeData.useLipSync` が型安全に参照できること
- T2-2 (API クライアント型拡張) 完了済 — `DialogueCreatePayload.use_lip_sync` が型安全に渡せること
- `NodeEditor.tsx` の `'startDialogue'` イベントリスナーと `handleStartDialogue` の現状実装を把握していること (Design Doc §6-4 参照)

## 変更内容

### `components/node-editor/NodeEditor.tsx`

`handleStartDialogue` 内の `dialogueApi.create` 呼び出しに `use_lip_sync: dialogueData.useLipSync` を追加:

**変更前**:
```typescript
const result = await dialogueApi.create({
  video_url: videoUrl,
  text: dialogueData.text,
  voice_id: dialogueData.voiceId!,
  speed: dialogueData.speed,
});
```

**変更後**:
```typescript
const result = await dialogueApi.create({
  video_url: videoUrl,
  text: dialogueData.text,
  voice_id: dialogueData.voiceId!,
  speed: dialogueData.speed,
  use_lip_sync: dialogueData.useLipSync,  // 追加
});
```

他の箇所 (ポーリング設定、エラーハンドリング、useEffect の構造) は変更しない。

**ポーリング設定の確認** (変更不要): 既存 `DIALOGUE_MAX_POLLING_ATTEMPTS=180` × `POLLING_INTERVAL_MS=5000` = 最大 15 分。Hedra ポーリングは最大 6 分なので収まる (Design Doc §6-4)。

## 完了条件 (AC)

- [x] `handleStartDialogue` 内の `dialogueApi.create` 呼び出しに `use_lip_sync: dialogueData.useLipSync` が含まれる:
  ```bash
  grep -n 'use_lip_sync' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/components/node-editor/NodeEditor.tsx
  # 1 行ヒット (handleStartDialogue 内)
  ```
- [x] 既存の引数 (`video_url`, `text`, `voice_id`, `speed`) に変更がない
- [x] `useEffect` の追加・変更がない (B4: 別 useEffect 禁止):
  ```bash
  # git diff で useEffect の変更がないことを確認
  git diff movie-maker/components/node-editor/NodeEditor.tsx | grep 'useEffect'
  # 出力が空であること
  ```
- [x] TypeScript 型チェックが通ること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npx tsc --noEmit 2>&1 | head -20
  ```
- [x] ブラウザの Network タブで `POST /api/v1/dialogue` のリクエストボディに `use_lip_sync: true` が含まれること (手動確認):
  1. ノードエディタを開く
  2. DialogueNode の「口を動かす (リップシンク)」チェックボックスを ON
  3. 実行ボタン「リップシンク合成する」を押す
  4. DevTools Network タブでリクエスト body に `"use_lip_sync": true` を確認

## テスト

TypeScript チェックと手動 Network タブ確認。自動テストは T2-5 で行う。

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | grep error | head -10
```

## ロールバック

`dialogueApi.create` 呼び出しから `use_lip_sync: dialogueData.useLipSync` 行を削除する。

## 参照

- Design Doc §6-4 NodeEditor.tsx の handleStartDialogue 変更 (before/after コード)
- Design Doc §6-4 B4 解決パターン (別 useEffect 禁止)
- Design Doc §6-4 ポーリング設定の確認 (変更不要の根拠)
- `movie-maker/components/node-editor/NodeEditor.tsx` の `handleStartDialogue` 実装
