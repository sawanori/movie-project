---
id: T2-2
phase: 2
title: KlingElementsNode に @image_1 ヒント文追加
depends_on:
  - T2-1
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/nodes/KlingElementsNode.tsx
---

## 目的

KlingElementsNode の枚数表示テキストの下に、`@image_1` シンタックスのヒント文を追加する。  
ユーザーがプロンプト内で `@image_1` を明示指定できることをノード上で周知する。

## 前提

- T2-1 完了済み (`MAX_ELEMENTS = 4` 反映済み)
- 変更対象: L142-144 の `<p>` 枚数表示テキストの直後に新規 `<p>` を追加

## 変更内容

`KlingElementsNode.tsx` の L142-144 付近を以下のように変更する。

```tsx
{/* 既存 */}
<p className="text-[10px] text-gray-500">
  {data.elementImages.length}/{MAX_ELEMENTS} 枚（一貫性向上用）
</p>

{/* 新規追加: @image_i ヒント文 */}
<p className="mt-1 text-[10px] text-gray-400">
  プロンプトに <span className="text-[#fce300]">@image_1</span> を入れると参照位置を明示できます
</p>
```

挿入行数: 4 行追加。

## 完了条件 (AC)

- [x] `grep -n "@image_1" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` でヒント文が確認できる
- [x] `grep -n "text-gray-400" movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` でヒント文のスタイルが確認できる
- [x] `cd movie-maker && npm run build` が成功する

## テスト

T2-5 のケース 1 (初期状態レンダリング) でヒント文「プロンプトに @image_1 を入れると...」の存在を確認する。

```bash
cd movie-maker
npm run build 2>&1 | tail -5
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §7-1: 修正 3 (ヒント文の追加)
- Design Doc §10-2 ケース 1: レンダリング検証でヒント文の存在を確認
- `movie-maker/components/node-editor/nodes/KlingElementsNode.tsx` L142-144
