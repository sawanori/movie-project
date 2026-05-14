---
id: T1-common-3
step: 1
node: common
title: "NodePalette.tsx に utility カテゴリ + 4 ノードエントリ + 4 アイコンを追加"
depends_on: [T1-common-1]
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/NodePalette.tsx
---

## 目的

ノードエディタの左ペイン (ノードパレット) から、新規 4 ノードを D&D で追加可能にする。専用の `utility` カテゴリを新設し、既存 5 カテゴリ (`input` / `config` / `provider-specific` / `post-processing` / `output`) に**混ぜない**。

## 前提

- Design Doc §4.2 に準拠。
- B2 修正 (`NodePaletteItem.category` union に `'utility'` 追加) は T1-common-1 で済んでいることが前提。本タスクでは既に追加済みの union 型を利用する。
- `lucide-react` から `Camera`, `Scissors`, `Link`, `StickyNote` を import (`StickyNote` が存在しない場合は `MessageSquare` で代用)。

## 変更内容

`movie-maker/components/node-editor/NodePalette.tsx` に以下を**追加のみ** (既存エントリは変更しない):

1. **NODE_ITEMS 配列への 4 エントリ追加** (Design Doc §4.2):
   ```typescript
   { type: 'getVideoFrame', label: 'フレーム抽出', description: '動画→最初/最後フレーム画像', icon: 'camera', category: 'utility' },
   { type: 'trimVideo',     label: 'トリム',       description: '動画の開始/終了位置を指定',  icon: 'scissors', category: 'utility' },
   { type: 'stitchVideos',  label: 'スティッチ',   description: '複数動画を連結',             icon: 'link', category: 'utility' },
   { type: 'stickyNote',    label: '付箋',         description: 'ワークフローへの注釈',        icon: 'sticky-note', category: 'utility' },
   ```

2. **CATEGORIES 配列への新規カテゴリ追加**:
   ```typescript
   { id: 'utility', label: 'ユーティリティ', description: '動画編集・注釈' }
   ```

3. **getIcon() に 3 つの新規 case 追加** (Design Doc §4.2):
   - `case 'camera'` (もし既存になければ): `<Camera className={iconClass} />` (既存ノードで使われている可能性あり、要確認)
   - `case 'scissors'`: `<Scissors className={iconClass} />`
   - `case 'link'`: `<Link className={iconClass} />`
   - `case 'sticky-note'`: `<StickyNote className={iconClass} />` (または `MessageSquare`)

4. **lucide-react import 文の更新**: 新規アイコン 4 個を import 文に追加。

## 完了条件 (AC)

- [x] `NODE_ITEMS` に `getVideoFrame`, `trimVideo`, `stitchVideos`, `stickyNote` の 4 エントリが含まれる (`grep -n "type: 'getVideoFrame'\|type: 'trimVideo'\|type: 'stitchVideos'\|type: 'stickyNote'" movie-maker/components/node-editor/NodePalette.tsx` で 4 件ヒット)
- [x] `CATEGORIES` に `id: 'utility'` のエントリが含まれる (`grep -n "id: 'utility'" ...` でヒット)
- [x] `getIcon` の switch 文に `'scissors'`, `'link'`, `'sticky-note'` の 3 case が追加されている
- [x] `lucide-react` から `Scissors`, `Link`, `StickyNote` (or `MessageSquare`) が import されている
- [x] `pnpm typecheck` が error 0 (B2 修正前提)
- [x] `pnpm lint` (ESLint) が clean (新規ファイルに新規エラーなし; 3 エラーは既存ファイルの既存問題)
- [x] 既存 `NODE_ITEMS` / `CATEGORIES` のエントリが**変更されていない** (`git diff` で確認)

## テスト

- 単体テスト不要 (静的データ追加のみ)。
- T3-1 (E2E) でパレットから 4 ノードが D&D できることを確認。

## ロールバック

- 該当の追加分のみ `git revert` で元に戻せる。
- 既存エントリに触れていないため既存パレット機能への影響なし。

## 参照

- Design Doc §4.2 NodePalette.tsx への追加 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 384-406
- 既存ファイル: `movie-maker/components/node-editor/NodePalette.tsx`
- T1-common-1 の AC で B2 修正 (`NodePaletteItem.category` に `'utility'` 追加) が完了していること
