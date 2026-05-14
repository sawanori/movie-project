---
id: T1-common-2
step: 1
node: common
title: "BaseNode.tsx に Krea 流ハンドル色規約ヘルパー getInputHandleClass / getOutputHandleClass を追加"
depends_on: [T1-common-1]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/nodes/BaseNode.tsx
---

## 目的

`docs/flow.md` §1.2 で規定された Krea AI Node Editor のハンドル色規約 (Image=青, Video=緑, Text=紫, Audio=橙) を、新規 4 ノードで利用できるヘルパー関数として実装する。

## 前提

- Design Doc §3.1 / §3.2 に準拠。
- 既存の `inputHandleClassName` / `outputHandleClassName` 定数は**変更しない** (既存ノードへの遡及適用は今回スコープ外)。
- 既存ハンドルのサイズ・border・hover スタイルは共通とし、`bg-*` クラスのみ型に応じて切り替える。
- 本タスクの成果物は `T1-common-1` で定義した型を import する。

## 変更内容

`movie-maker/components/node-editor/nodes/BaseNode.tsx` に以下を**追加のみ** (既存 export は変更しない):

1. **HandleDataType 型 export** (Design Doc §3.2):
   ```typescript
   export type HandleDataType = 'image' | 'video' | 'text' | 'audio' | 'default'
   ```

2. **getInputHandleClass(dataType) 関数 export**:
   - `dataType` が `'image'` → 既存 input ハンドル基本クラス + `!bg-blue-500`
   - `dataType` が `'video'` → 既存 input ハンドル基本クラス + `!bg-green-500`
   - `dataType` が `'text'` → 既存 input ハンドル基本クラス + `!bg-purple-500`
   - `dataType` が `'audio'` → 既存 input ハンドル基本クラス + `!bg-orange-500`
   - `dataType` が `'default'` → 既存 `inputHandleClassName` をそのまま返す
   - サイズ・border 部分は既存の `inputHandleClassName` から流用 (Tailwind の `cn` 等で結合)

3. **getOutputHandleClass(dataType) 関数 export**:
   - `dataType` が `'image'` → 既存 output ハンドル基本クラス + `!bg-blue-400`
   - `dataType` が `'video'` → 既存 output ハンドル基本クラス + `!bg-green-400`
   - `dataType` が `'text'` → 既存 output ハンドル基本クラス + `!bg-purple-400`
   - `dataType` が `'audio'` → 既存 output ハンドル基本クラス + `!bg-orange-400`
   - `dataType` が `'default'` → 既存 `outputHandleClassName` をそのまま返す
   - サイズ・border・hover 部分は既存の `outputHandleClassName` から流用

## 完了条件 (AC)

- [x] `HandleDataType` 型が export されている (`grep -n "export type HandleDataType" movie-maker/components/node-editor/nodes/BaseNode.tsx` でヒット)
- [x] `getInputHandleClass` 関数が export されている (`grep -n "export function getInputHandleClass" ...` でヒット)
- [x] `getOutputHandleClass` 関数が export されている (`grep -n "export function getOutputHandleClass" ...` でヒット)
- [x] 4 つのデータ型 (`image` / `video` / `text` / `audio`) について返却値が `!bg-blue` / `!bg-green` / `!bg-purple` / `!bg-orange` を含む
- [x] 既存の `inputHandleClassName` / `outputHandleClassName` の値が変更されていない (`git diff` で確認)
- [x] `pnpm typecheck` が error 0
- [x] 単体テスト (任意) で `getInputHandleClass('video')` → `toContain('bg-green')`, `getInputHandleClass('image')` → `toContain('bg-blue')` を確認 (Design Doc §10.2 のテスト方針に準拠)

## テスト

- Design Doc §10.2 に記載のサンプルに準拠する単体テスト追加 (任意、Step 2 のノード単体テスト内で間接的に確認も可):
  ```typescript
  it('video ハンドルは緑クラスを返す', () => {
    expect(getInputHandleClass('video')).toContain('bg-green')
    expect(getOutputHandleClass('video')).toContain('bg-green')
  })
  ```

## ロールバック

- 該当の追加分のみ `git revert` で元に戻せる。
- 既存 export を変更していないため既存ノードへの影響なし。

## 参照

- Design Doc §3.1 色マッピング表 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 134-146
- Design Doc §3.2 getHandleClass() ヘルパー設計 — 行 147-167
- Design Doc §3.3 既存ノードへの遡及適用ポリシー (今回スコープ外) — 行 176-184
- 既存ファイル: `movie-maker/components/node-editor/nodes/BaseNode.tsx`
- `docs/flow.md` §1.2 ハンドルの色分け
