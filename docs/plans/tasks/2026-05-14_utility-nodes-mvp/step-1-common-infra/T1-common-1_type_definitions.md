---
id: T1-common-1
step: 1
node: common
title: "node-editor.ts に Utility Nodes の型定義・HasImageOutput・category 拡張を追加"
depends_on: []
estimated_effort: M
files_touched:
  - movie-maker/lib/types/node-editor.ts
---

## 目的

Utility Nodes MVP の 4 ノード (`getVideoFrame`, `trimVideo`, `stitchVideos`, `stickyNote`) を TypeScript の型システムから利用可能にする。**Step 2 の全タスクをブロック解除する critical path**。

## 前提

- Design Doc §4.1 に記載された型シグネチャに**完全準拠**する。
- B2 修正 (NodePaletteItem.category union に `'utility'` 追加) を本タスクで実施する。これを忘れると T1-common-3 で TS strict ビルドが落ちる。
- B3 修正 (HasImageOutput interface + getNodeImageOutput helper) を本タスクで実施する。下流ノードからの画像出力解決に必須。
- 既存の `NodeType` union, `WorkflowNodeData` union, `HANDLE_IDS`, `createDefaultNodeData` の構造を踏襲する。

## 変更内容

`movie-maker/lib/types/node-editor.ts` に以下を**追加のみ** (既存型は変更しない):

1. **NodeType union 拡張** (Design Doc §4.1):
   - `| 'getVideoFrame'`
   - `| 'trimVideo'`
   - `| 'stitchVideos'`
   - `| 'stickyNote'`

2. **4 ノードの NodeData interface 定義** (Design Doc §4.1):
   - `GetVideoFrameNodeData` (inputVideoUrl, direction, status, outputImageUrl)
   - `TrimVideoNodeData` (inputVideoUrl, startSeconds, endSeconds, status, outputVideoUrl)
   - `StitchVideosNodeData` (transition, status, progress, stitchId, outputVideoUrl)
   - `StickyNoteNodeData` (text, color)

3. **WorkflowNodeData union 拡張**: 上記 4 型を追加。

4. **HasImageOutput interface 新設 (B3)** (Design Doc §4.1):
   ```typescript
   export interface HasImageOutput {
     imageUrl?: string | null;
     outputImageUrl?: string | null;
   }

   export function getNodeImageOutput(data: unknown): string | null {
     const d = data as HasImageOutput;
     return d?.outputImageUrl ?? d?.imageUrl ?? null;
   }
   ```

5. **NodePaletteItem.category union 拡張 (B2)** (Design Doc §4.1, node-editor.ts:257 周辺):
   ```typescript
   category: 'input' | 'config' | 'provider-specific' | 'post-processing' | 'output' | 'utility'; // ← 'utility' 追加
   ```

6. **HANDLE_IDS 拡張** (Design Doc §4.1):
   - `GET_VIDEO_FRAME_VIDEO_INPUT: 'get_video_frame_video_input'`
   - `GET_VIDEO_FRAME_IMAGE_OUTPUT: 'get_video_frame_image_output'`
   - `TRIM_VIDEO_INPUT: 'trim_video_input'`
   - `TRIM_VIDEO_OUTPUT: 'trim_video_output'`
   - `STITCH_VIDEO_1`〜`STITCH_VIDEO_5` (`video_1`〜`video_5`)
   - `STITCH_VIDEO_OUTPUT: 'stitch_video_output'`

7. **createDefaultNodeData の 4 ケース追加** (Design Doc §4.1):
   - `case 'getVideoFrame'`: direction='first', status='idle', isValid=true
   - `case 'trimVideo'`: startSeconds=0, endSeconds=null, status='idle', isValid=false
   - `case 'stitchVideos'`: transition='none', status='idle', progress=0, stitchId=null, isValid=false
   - `case 'stickyNote'`: text='', color='yellow', isValid=true

## 完了条件 (AC)

- [x] `NodeType` union に 4 ノード型が追加されている (`grep -n "getVideoFrame\|trimVideo\|stitchVideos\|stickyNote" movie-maker/lib/types/node-editor.ts` で確認)
- [x] 4 つの `*NodeData` interface が Design Doc §4.1 のシグネチャ通りに定義されている
- [x] `WorkflowNodeData` union に 4 型が含まれている
- [x] **B3 反映確認**: `HasImageOutput` interface + `getNodeImageOutput` helper が export されている (`grep -n "HasImageOutput\|getNodeImageOutput" movie-maker/lib/types/node-editor.ts` で確認)
- [x] **B2 反映確認**: `NodePaletteItem.category` union に `'utility'` が含まれている (`grep -n "'utility'" movie-maker/lib/types/node-editor.ts` で 1 件以上ヒット)
- [x] `HANDLE_IDS` に 9 個の新規エントリ (`GET_VIDEO_FRAME_*` 2 個 + `TRIM_VIDEO_*` 2 個 + `STITCH_VIDEO_*` 5 個 + `STITCH_VIDEO_OUTPUT` 1 個 = 計 9 個 のうち 8 個実体 + `STITCH_VIDEO_OUTPUT`) が追加されている
- [x] `createDefaultNodeData` の switch 文に 4 ケースが追加されている
- [x] `pnpm typecheck` (または `pnpm tsc --noEmit`) が `node-editor.ts` 単体で error 0 (新規型の参照箇所はまだないため独立に通る)
- [x] 既存型 (`NodeType`, `WorkflowNodeData`, `HANDLE_IDS`, `createDefaultNodeData`) を**削除/変更していない**

## テスト

- Step 1 では型定義のみのためユニットテスト不要 (型は構造的整合性のみ)。
- `pnpm typecheck` で型エラー 0 を確認。
- 後続タスク (T1-common-2/3/4) と Step 2 全タスクで型を import する際に整合性を担保する。

## ロールバック

- 該当の追加分のみ `git revert` または `git checkout HEAD -- movie-maker/lib/types/node-editor.ts` で元に戻せる。
- 既存型に触れていないため、ロールバックによる既存機能への影響なし。

## 参照

- Design Doc §4.1 `lib/types/node-editor.ts` への追加 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 187-382
- Design Doc §4.1.1 NodePaletteItem.category union 拡張 (B2 解決) — 行 300-319
- Design Doc §4.1.2 HasImageOutput 新設 (B3 解決) — 行 274-298
- 既存ファイル: `movie-maker/lib/types/node-editor.ts` (NodePaletteItem は L257 周辺)
