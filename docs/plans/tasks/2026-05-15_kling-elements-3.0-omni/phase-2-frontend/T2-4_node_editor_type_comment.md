---
id: T2-4
phase: 2
title: node-editor.ts の KlingElementsNodeData コメント更新 (3→4)
depends_on: []
estimated_effort: S
files_touched:
  - movie-maker/lib/types/node-editor.ts
---

## 目的

`node-editor.ts` の `KlingElementsNodeData.elementImages` のコメントを「最大3枚」から「最大4枚」に更新する。  
T1-6 の schema 変更・T2-1 の MAX_ELEMENTS 変更との整合性を型定義ファイル内でも保つ。

## 前提

- T1-6 完了済み (schema の max_length が 4 になっている)
- T2-1〜T2-3 と独立して実装可能
- 変更は**コメント変更のみ**。実行コードへの影響なし

## 変更内容

`movie-maker/lib/types/node-editor.ts` の L107-110 を以下のように変更する。

```typescript
// 修正前 (L107-110)
export interface KlingElementsNodeData extends BaseNodeData {
  type: 'klingElements';
  elementImages: string[]; // 最大3枚
}

// 修正後
export interface KlingElementsNodeData extends BaseNodeData {
  type: 'klingElements';
  /** Kling 3.0 Omni Elements 用の参照画像 URL 配列。最大 4 枚。 */
  elementImages: string[]; // 最大4枚
}
```

変更行数: 1 行修正 + 1 行追加。

## 完了条件 (AC)

- [x] `grep -n "最大3枚\|最大4枚" movie-maker/lib/types/node-editor.ts` で「最大3枚」がなく「最大4枚」があること
- [x] `grep -n "KlingElementsNodeData" movie-maker/lib/types/node-editor.ts` で型定義が確認できる
- [x] `cd movie-maker && npm run build` が成功する (型変更なし、コメントのみなので TypeScript エラーなし)

## テスト

コメント変更のみ。ビルド成功確認だけでよい。

```bash
cd movie-maker
npm run build 2>&1 | tail -5
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §7-2: `node-editor.ts:KlingElementsNodeData` (L107-110)
- `movie-maker/lib/types/node-editor.ts` L107-110
