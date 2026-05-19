---
id: T1-9
phase: 1
title: types/node-editor.ts + HANDLE_IDS 拡張 (Wave 5 → Wave 1 前倒し)
depends_on: []
parallel_with: [T1-1, T1-2]
estimated_effort: S
files_touched:
  - movie-maker/lib/types/node-editor.ts
wave: 1
agent: frontend
---

## 目的

v3 計画書 §6.7 に従い、`lib/types/node-editor.ts` に OmniReferenceNode 用の型と HANDLE_IDS を追加する。Frontend 型定義は backend と独立しているため Wave 1 に前倒しし、後続 Frontend タスクの並列度を上げる。

## 前提

- 依存タスク: なし (Wave 1)
- 並列実行可: T1-1, T1-2 (Backend と独立)
- 参照箇所: v3 計画書 §6.7 (Frontend 型定義)
- 配置先: `movie-maker/lib/types/node-editor.ts`

## 変更内容

### `movie-maker/lib/types/node-editor.ts`

```ts
// 既存の NodeType union に追加
export type NodeType =
  | /* 既存 */
  | 'omniReference';

// 新規型定義
export interface OmniReferenceSlot {
  assetId: string | null;
  url?: string;
  filename?: string;
  durationSeconds?: number;
  mediaType: 'image' | 'video' | 'audio';
}

export interface OmniReferenceNodeData extends BaseNodeData {
  type: 'omniReference';
  // v3: image 8 個 (base image_url と合算で 9 厳守)
  imageSlots: OmniReferenceSlot[];
  videoSlots: [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
  audioSlots: [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
  consentAccepted: boolean;
}

// HANDLE_IDS に追加
export const HANDLE_IDS = {
  // ... 既存
  OMNI_REFERENCE_OUTPUT: 'omni_reference',
  OMNI_REFERENCE_INPUT: 'omni_reference_input',
} as const;
```

ファクトリ関数 (もし create*NodeData パターンがあれば):

```ts
export function createOmniReferenceNodeData(): OmniReferenceNodeData {
  return {
    type: 'omniReference',
    imageSlots: Array.from({ length: 8 }, () => ({
      assetId: null,
      mediaType: 'image',
    })),
    videoSlots: [
      { assetId: null, mediaType: 'video' },
      { assetId: null, mediaType: 'video' },
      { assetId: null, mediaType: 'video' },
    ],
    audioSlots: [
      { assetId: null, mediaType: 'audio' },
      { assetId: null, mediaType: 'audio' },
      { assetId: null, mediaType: 'audio' },
    ],
    consentAccepted: false,
  };
}
```

## 完了条件 (AC)

- [x] `NodeType` に `'omniReference'` が含まれる
- [x] `OmniReferenceSlot`, `OmniReferenceNodeData` が export される
- [x] `imageSlots` の長さ初期値が **8** (v3 仕様)
- [x] `HANDLE_IDS.OMNI_REFERENCE_INPUT` / `OMNI_REFERENCE_OUTPUT` が export される
- [x] `npm run lint` pass
- [x] `npx tsc --noEmit` pass (型チェック)
- [x] 既存型への破壊的変更なし

## ロールバック

追加した型定義と HANDLE_IDS を削除。

## 参照

- v3 計画書 §6.7 (Frontend 型定義)
- v3 計画書 §4.1 (HANDLE_IDS 配置)
- v3 計画書 §11 (image_reference max=8 の根拠)
