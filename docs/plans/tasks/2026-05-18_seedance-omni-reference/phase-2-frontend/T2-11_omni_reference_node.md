---
id: T2-11
phase: 2
title: OmniReferenceNode + nodeTypes 登録 + tests (C-1 解消)
depends_on: [T1-9, T2-10]
parallel_with: [T2-13, T2-14]
estimated_effort: L
files_touched:
  - movie-maker/components/node-editor/nodes/OmniReferenceNode.tsx
  - movie-maker/components/node-editor/nodes/index.ts
  - movie-maker/components/node-editor/utils/node-types.ts
  - movie-maker/components/node-editor/nodes/__tests__/OmniReferenceNode.test.tsx
wave: 8
agent: frontend
---

## 目的

v3 計画書 §6.8 に従い `OmniReferenceNode.tsx` を新規実装。**C-1 解消**: `node-types.ts` と `nodes/index.ts` の登録 (React Flow nodeTypes mapping) も本タスク内で完結させる (登録漏れで Node が描画されないバグ防止)。

主要機能:
- video × 3 + audio × 3 + image × 8 slots
- 著作権同意 checkbox (必須、Dropzone disable と連動)
- video 合計プログレスバー (/ 15.4s)
- **audio 合計プログレスバー (/ 15.0s) — v3 新規**

## 前提

- 依存タスク:
  - T1-9 (型 OmniReferenceNodeData, HANDLE_IDS)
  - T2-10 (client.ts upload 関数)
- 並列実行可: T2-13 (graph-to-api), T2-14 (NodePalette)
- 参照箇所: v3 計画書 §6.8, `components/node-editor/nodes/ImageInputNode.tsx` (Dropzone 雛形)

## 変更内容

### 新規: `components/node-editor/nodes/OmniReferenceNode.tsx`

```tsx
'use client';
import { useDropzone } from 'react-dropzone';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { HANDLE_IDS, OmniReferenceNodeData, OmniReferenceSlot } from '@/lib/types/node-editor';
import {
  uploadOmniVideoReference,
  uploadOmniAudioReference,
  uploadOmniImageReference,
} from '@/lib/api/client';

const MAX_VIDEO_TOTAL = 15.4;
const MAX_AUDIO_TOTAL = 15.0;  // v3

export function OmniReferenceNode({ id, data }: NodeProps<OmniReferenceNodeData>) {
  const videoTotal = data.videoSlots.reduce((s, x) => s + (x.durationSeconds ?? 0), 0);
  const audioTotal = data.audioSlots.reduce((s, x) => s + (x.durationSeconds ?? 0), 0);

  return (
    <div className="rounded border bg-white p-3">
      <h3 className="text-sm font-bold">OmniReference</h3>

      {/* 著作権同意 checkbox */}
      <label className="flex items-center gap-1 mt-2 text-xs">
        <input
          type="checkbox"
          checked={data.consentAccepted}
          onChange={(e) => updateNode(id, { consentAccepted: e.target.checked })}
        />
        アップロード素材の権利を保有または利用許諾済
      </label>

      {/* Video 3 slots + 合計バー */}
      <section>
        <h4>Video</h4>
        {data.videoSlots.map((slot, i) => (
          <SlotDropzone
            key={`v${i}`}
            slot={slot}
            mediaType="video"
            disabled={!data.consentAccepted}
            onUpload={(file) => uploadOmniVideoReference(file, data.consentAccepted)}
            onResolved={(r) => updateSlot(id, 'video', i, r)}
          />
        ))}
        <ProgressBar value={videoTotal} max={MAX_VIDEO_TOTAL} label="video 合計" />
      </section>

      {/* Audio 3 slots + 合計バー (v3 新規) */}
      <section>
        <h4>Audio</h4>
        {data.audioSlots.map((slot, i) => (
          <SlotDropzone
            key={`a${i}`}
            slot={slot}
            mediaType="audio"
            disabled={!data.consentAccepted}
            onUpload={(file) => uploadOmniAudioReference(file, data.consentAccepted)}
            onResolved={(r) => updateSlot(id, 'audio', i, r)}
          />
        ))}
        <ProgressBar value={audioTotal} max={MAX_AUDIO_TOTAL} label="audio 合計 (PiAPI 上限)" />
      </section>

      {/* Image 8 slots (折り畳み) */}
      <details>
        <summary>Image ({data.imageSlots.filter(s => s.assetId).length}/8)</summary>
        {data.imageSlots.map((slot, i) => (
          <SlotDropzone
            key={`i${i}`}
            slot={slot}
            mediaType="image"
            disabled={!data.consentAccepted}
            onUpload={(file) => uploadOmniImageReference(file, data.consentAccepted)}
            onResolved={(r) => updateSlot(id, 'image', i, r)}
          />
        ))}
      </details>

      <Handle type="source" position={Position.Right} id={HANDLE_IDS.OMNI_REFERENCE_OUTPUT} />
    </div>
  );
}
```

`ProgressBar` (赤色警告対応):
```tsx
function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const over = value > max;
  return (
    <div className="text-xs">
      <span className={over ? 'text-red-600 font-bold' : ''}>
        {label}: {value.toFixed(1)} / {max}s
      </span>
      <div className="h-1 bg-gray-200">
        <div
          className={over ? 'h-full bg-red-500' : 'h-full bg-blue-500'}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}
```

### C-1 解消: nodeTypes / index に登録

#### `components/node-editor/utils/node-types.ts`

```ts
import { OmniReferenceNode } from '../nodes/OmniReferenceNode';

export const nodeTypes = {
  // ... 既存
  omniReference: OmniReferenceNode,
};
```

#### `components/node-editor/nodes/index.ts`

```ts
export { OmniReferenceNode } from './OmniReferenceNode';
```

### 新規テスト: `nodes/__tests__/OmniReferenceNode.test.tsx`

v3 §15.2 から F-1〜F-6, F-14, F-15, F-17, F-17b を実装。

| # | テスト |
|---|--------|
| F-1 | image×8 / video×3 / audio×3 slots 初期表示 |
| F-2 | video1 にドロップ → uploadOmniVideoReference 呼出 (consent=true) |
| F-3 | upload 成功 → assetId/filename/duration 表示 |
| F-4 | video 合計 > 15.4s で赤警告 |
| F-5 | audio 20s upload 422 → エラー表示 |
| F-6 | クリアボタン → assetId reset |
| F-14 | consent 未チェック → Dropzone disable |
| F-15 | consent ON → upload 実行可能 |
| F-17 (v3) | audio 合計 6+5+5=16s → 赤 "16.0 / 15.0s" |
| F-17b (v3) | audio 合計 14s → 通常 |

## 完了条件 (AC)

- [x] `OmniReferenceNode` コンポーネント存在
- [x] `nodeTypes.omniReference` に登録済 (C-1)
- [x] `nodes/index.ts` から export
- [x] image×8 / video×3 / audio×3 slots
- [x] 著作権同意 checkbox (Dropzone disable 連動)
- [x] video / audio 合計プログレスバー (赤警告)
- [x] `npm run test OmniReferenceNode` 全 pass (10 件)
- [x] AC-1, AC-2, AC-4, AC-4b を test でカバー

## ロールバック

`OmniReferenceNode.tsx` / test / 登録分削除。

## 参照

- v3 計画書 §6.8 (UI 仕様)
- v3 計画書 §15.2 (F-1〜F-17b)
- v3 計画書 AC-1, AC-2, AC-3, AC-4, AC-4b
- C-1 解消: nodeTypes / index 登録を含める
