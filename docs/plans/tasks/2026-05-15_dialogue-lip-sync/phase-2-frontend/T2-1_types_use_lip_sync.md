---
id: T2-1
phase: 2
title: "lib/types/node-editor.ts 拡張 — DialogueNodeData に useLipSync 追加"
depends_on:
  - T1-6
estimated_effort: S
files_touched:
  - movie-maker/lib/types/node-editor.ts
---

## 目的

`DialogueNodeData` interface に `useLipSync: boolean` を追加し、`createDefaultNodeData` の `'dialogue'` ケースに `useLipSync: false` を追加する。B1 / N1 制約を厳守する。

## 前提

- Phase 1 (T1-1〜T1-6) 完了済
- `movie-maker/lib/types/node-editor.ts:177-191` の現状 `DialogueNodeData` を把握していること (Design Doc §6-1 参照)
- `BaseNodeData` の定義を確認し、`errorMessage` が既に定義済であることを確認していること

## 変更内容

### `lib/types/node-editor.ts`

#### 変更 1: `DialogueNodeData` interface 拡張

`speed` フィールドの直後に `useLipSync: boolean` を追加する:

```typescript
export interface DialogueNodeData extends BaseNodeData {
  type: 'dialogue';
  text: string;
  voiceId: string | null;
  language: 'ja';
  speed: number;
  // 追加: リップシンク (1 フィールドのみ)
  useLipSync: boolean;          // default false
  // 実行状態 (既存)
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  generationId: string | null;
  outputVideoUrl: string | null;
  // errorMessage は BaseNodeData から継承 — 重複宣言しないこと。
}
```

**B1 制約 (必須)**: `errorMessage` を `DialogueNodeData` で再宣言しない。`BaseNodeData` から継承される `string | undefined` をそのまま使う。

**N1 制約 (必須)**: `lipSyncGenerationId` フィールドをここで追加しない。バックエンドのデバッグ用 FK はフロントに露出しない (YAGNI)。

#### 変更 2: `createDefaultNodeData` の `'dialogue'` ケース

`speed: 1.0` の直後 (または `status: 'idle'` の直前) に `useLipSync: false` を追加:

```typescript
case 'dialogue':
  return {
    type: 'dialogue',
    isValid: true,
    text: '',
    voiceId: null,
    language: 'ja',
    speed: 1.0,
    useLipSync: false,             // 追加
    status: 'idle',
    progress: 0,
    generationId: null,
    outputVideoUrl: null,
  };
```

`errorMessage: undefined` や `errorMessage: null` はセットしない (継承の `undefined` 状態を保つ)。

## 完了条件 (AC)

- [x] `DialogueNodeData` に `useLipSync: boolean` フィールドが存在する
- [x] `DialogueNodeData` に `errorMessage` フィールドが存在しない (BaseNodeData 継承のため再宣言禁止):
  ```bash
  grep -n 'errorMessage' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/types/node-editor.ts | grep -A2 -B2 'DialogueNodeData'
  # DialogueNodeData のブロック内に errorMessage が出現しないこと
  ```
- [x] `DialogueNodeData` に `lipSyncGenerationId` フィールドが存在しない (N1 / YAGNI):
  ```bash
  grep -n 'lipSyncGenerationId' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/types/node-editor.ts
  # 出力が空 (ゼロ行) であること
  ```
- [x] `createDefaultNodeData` の `'dialogue'` ケースに `useLipSync: false` が含まれる:
  ```bash
  grep -n 'useLipSync' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/types/node-editor.ts
  # 2 行以上ヒット: interface 定義 + createDefaultNodeData
  ```
- [x] `createDefaultNodeData` の `'dialogue'` ケースに `errorMessage:` が含まれない
- [x] TypeScript 型チェックが通ること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npx tsc --noEmit 2>&1 | head -20
  # エラーなし
  ```

## テスト

型チェックのみ (上記 `tsc --noEmit`)。DialogueNode.tsx のテストは T2-5 で行う。

## ロールバック

`DialogueNodeData` から `useLipSync: boolean` 行を削除し、`createDefaultNodeData` の `'dialogue'` ケースから `useLipSync: false` 行を削除する。

## 参照

- Design Doc §6-1 型定義変更 (before/after コード全文)
- Design Doc §6-1 B1 修正・N1 修正の注記
- `movie-maker/lib/types/node-editor.ts:177-191` (既存 DialogueNodeData)
- `movie-maker/lib/types/node-editor.ts` の `BaseNodeData` 定義 (errorMessage の確認)
