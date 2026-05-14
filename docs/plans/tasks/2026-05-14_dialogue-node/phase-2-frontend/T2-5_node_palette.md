---
id: T2-5
phase: 2
title: "NodePalette.tsx に Mic アイコン + dialogue パレットエントリ追加"
depends_on:
  - T2-3
estimated_effort: S
files_touched:
  - movie-maker/components/node-editor/NodePalette.tsx
---

## 目的

ノードパレットに「セリフ (TTS)」エントリを追加し、ユーザーがキャンバスに DialogueNode を
ドラッグ&ドロップで配置できるようにする。T2-4 と並行実行可能。

## 前提

- T2-3 完了: `DialogueNode` コンポーネントが実装済みであること
- `NodePalette.tsx` の現在の内容を確認しておくこと
  - L33-158: `NODE_ITEMS` 配列 (後処理セクションの位置を確認)
  - L178-206: `getIcon` 関数 (既存ケースのパターンを確認)

## 変更内容

### 1. `NODE_ITEMS` 配列への追加

Design Doc §6-5 通り、後処理セクション (L121-149 付近) に追加:

```typescript
{
  type: 'dialogue',
  label: 'セリフ (TTS)',
  description: 'テキストから音声を生成して被せる',
  icon: 'mic',
  category: 'post-processing',
},
```

追加位置: 後処理カテゴリの末尾が推奨。

### 2. `getIcon` 関数への `'mic'` ケース追加

`lucide-react` から `Mic` をインポートし、`getIcon` 関数 (L178-206) に追加:

```typescript
import { Mic } from 'lucide-react'

// getIcon 関数内:
case 'mic':
  return <Mic className={iconClass} />
```

`import` 文は既存の `lucide-react` import に `Mic` を追加するか、同じ import 文に合流させる。

## 完了条件 (AC)

- [ ] `NODE_ITEMS` に `type: 'dialogue'` のエントリが追加されている
- [ ] `getIcon('mic', ...)` が `<Mic />` を返す
- [ ] `npm run build` (または `tsc --noEmit`) がエラーなし
- [ ] ブラウザのパレットに「セリフ (TTS)」が Mic アイコンとともに表示される (手動確認 — T3-1 でも検証)

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | head -30
```

## ロールバック

`NODE_ITEMS` から `dialogue` エントリを削除する。
`getIcon` から `'mic'` ケースを削除する。
`Mic` import を削除する。

## 参照

- Design Doc §6-5 (NodePalette.tsx への登録)
- `movie-maker/components/node-editor/NodePalette.tsx` L33-158, L178-206
