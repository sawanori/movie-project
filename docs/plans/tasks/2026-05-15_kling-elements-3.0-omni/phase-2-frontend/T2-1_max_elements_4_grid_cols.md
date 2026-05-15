---
id: T2-1
phase: 2
title: KlingElementsNode の MAX_ELEMENTS 3→4、grid-cols-3→4、min-w 緩和
depends_on:
  - T1-6
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/nodes/KlingElementsNode.tsx
---

## 目的

`KlingElementsNode.tsx` で 4 枚アップロードを可能にするための数値・スタイル変更を行う。  
T1-6 で BE が 4 枚受信できるよう schema を緩和済みのため、FE 側の上限も 4 に合わせる。

## 前提

- T1-6 完了済み (BE が `max_length=4` を受理する)
- 変更対象: `movie-maker/components/node-editor/nodes/KlingElementsNode.tsx`
  - L20: `const MAX_ELEMENTS = 3;`
  - L99: `className="min-w-[240px]"`
  - L102: `<div className="grid grid-cols-3 gap-2 mb-3">`

## 変更内容

### 1. MAX_ELEMENTS 変更 (L20)

```tsx
// 修正前
const MAX_ELEMENTS = 3;

// 修正後
const MAX_ELEMENTS = 4;
```

### 2. ノード最小幅の拡大 (L99)

```tsx
{/* 修正前 */}
className="min-w-[240px]"

{/* 修正後 */}
className="min-w-[280px]"
```

### 3. グリッドカラム数の変更 (L102)

```tsx
{/* 修正前 */}
<div className="grid grid-cols-3 gap-2 mb-3">

{/* 修正後 */}
<div className="grid grid-cols-4 gap-2 mb-3">
```

## 完了条件 (AC)

- [x] `grep -n "MAX_ELEMENTS" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` で `= 4` が確認できる
- [x] `grep -n "grid-cols-" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` で `grid-cols-4` が確認できる
- [x] `grep -n "min-w-\[" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` で `min-w-[280px]` が確認できる
- [x] `cd movie-maker && npm run build` が成功する

## テスト

正式テストは T2-5 で実施。ビルド成功のみ確認。

```bash
cd movie-maker
npm run build 2>&1 | tail -5
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §7-1: 修正 1 (MAX_ELEMENTS)、修正 2 (grid カラム数)、修正 5 (ノード幅)
- `movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` L20, L99, L102
