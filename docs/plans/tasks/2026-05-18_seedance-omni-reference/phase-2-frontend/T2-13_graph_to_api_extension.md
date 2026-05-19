---
id: T2-13
phase: 2
title: graph-to-api.ts 拡張 + tests (omniReference 検出 + consent guard)
depends_on: [T1-9]
parallel_with: [T2-11, T2-14]
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/utils/graph-to-api.ts
  - movie-maker/components/node-editor/utils/__tests__/graph-to-api.test.ts
wave: 8
agent: frontend
---

## 目的

v3 計画書 §6.9 に従い、`graph-to-api.ts` で OmniReferenceNode を検出し `*_reference_asset_ids` にマッピング。`consent_accepted=false` の状態で接続済なら throw (UI guard、F-16)。

## 前提

- 依存タスク: T1-9 (FE 型)
- 並列実行可: T2-11, T2-14
- 参照箇所: v3 計画書 §6.9, `components/node-editor/utils/graph-to-api.ts`

## 変更内容

### `components/node-editor/utils/graph-to-api.ts`

```ts
import { OmniReferenceNodeData } from '@/lib/types/node-editor';

// 既存 seedance 分岐内に追加
if (provider?.provider === 'seedance') {
  const omniNode = nodes.find(
    n => n.data.type === 'omniReference' &&
         isConnectedToProvider(n.id, providerNode.id, edges)
  );
  if (omniNode) {
    const d = omniNode.data as OmniReferenceNodeData;
    if (!d.consentAccepted) {
      throw new Error('著作権同意が必要です');
    }
    const imgIds = d.imageSlots.filter(s => s.assetId).map(s => s.assetId!);
    const vidIds = d.videoSlots.filter(s => s.assetId).map(s => s.assetId!);
    const audIds = d.audioSlots.filter(s => s.assetId).map(s => s.assetId!);
    if (imgIds.length) request.image_reference_asset_ids = imgIds;
    if (vidIds.length) request.video_reference_asset_ids = vidIds;
    if (audIds.length) request.audio_reference_asset_ids = audIds;
  }
}
```

### テスト拡張: `__tests__/graph-to-api.test.ts`

v3 §15.2 から F-7〜F-11, F-16 を実装。

| # | テスト |
|---|--------|
| F-7 | OmniReferenceNode 接続 + video 2 個 → request.video_reference_asset_ids=[uuid,uuid] |
| F-8 | 全 slot 空 → request に refs 含まれない |
| F-9 | 未接続 → request に含まれない |
| F-10 | provider != seedance → request に含まれない |
| F-11 | audio のみ埋まる + base image → request 正常 |
| F-16 | consentAccepted=false で接続済 → throw |

## 完了条件 (AC)

- [x] graph-to-api.ts に omniReference 検出ロジック追加
- [x] consent guard 実装
- [x] `npm run test graph-to-api` 全 pass (新 6 件 + 既存)
- [x] 既存 i2v / t2v / 他 provider 経路は変更なし
- [x] AC-5 を test でカバー

## ロールバック

追加分削除、test 削除。

## 参照

- v3 計画書 §6.9 (graph-to-api 仕様)
- v3 計画書 §15.2 (F-7〜F-11, F-16)
- v3 計画書 AC-5
