---
id: T2-5
phase: 2
title: "FE 単体テスト追加 — DialogueNode.test.tsx 4 ケース"
depends_on:
  - T2-3
  - T2-4
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/DialogueNode.test.tsx
---

## 目的

`DialogueNode.test.tsx` に `useLipSync` 関連の 4 ケースを追加し、チェックボックス操作・条件付き UI 表示・ボタンラベル切替・処理中メッセージの動作を自動テストで保証する。

## 前提

- T2-3 (DialogueNode.tsx 拡張) / T2-4 (NodeEditor.tsx 拡張) 完了済
- `movie-maker/components/node-editor/nodes/DialogueNode.test.tsx` が既に存在すること
- 既存テストのモックセットアップ方法 (`updateNodeData` モック等) を把握していること

## 変更内容

### `components/node-editor/nodes/DialogueNode.test.tsx`

Design Doc §8-2 のテストケース表 + §6-5 のケースを実装する。

#### ケース 1: 初期状態の useLipSync=false — TTS 注意書き表示、Hedra 注意書き非表示、ボタンラベル「合成する」

```typescript
it('useLipSync=false のとき TTS 注意書きを表示し、Hedra 注意書きを非表示にする', () => {
  render(<DialogueNode id="test-node" data={createDefaultDialogueData({ useLipSync: false })} />);

  expect(screen.getByText('※ 口の動きは合成しません (TTS のみ)')).toBeInTheDocument();
  expect(screen.queryByText(/キャラの顔がはっきり映る動画/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /合成する/ })).toHaveTextContent('合成する');
  // "リップシンク合成する" でないこと
  expect(screen.queryByText('リップシンク合成する')).not.toBeInTheDocument();
});
```

#### ケース 2: チェックボックス ON → updateNodeData が { useLipSync: true } を dispatch

```typescript
it('チェックボックスを ON にすると updateNodeData({ useLipSync: true }) が呼ばれる', async () => {
  const mockUpdateNodeData = jest.fn();
  render(
    <DialogueNode
      id="test-node"
      data={createDefaultDialogueData({ useLipSync: false })}
      updateNodeData={mockUpdateNodeData}
    />
  );

  const checkbox = screen.getByRole('checkbox', { name: /口を動かす/ });
  await userEvent.click(checkbox);

  expect(mockUpdateNodeData).toHaveBeenCalledWith({ useLipSync: true });
});
```

#### ケース 3: useLipSync=true で再描画 — TTS 注意書き非表示、Hedra 注意書き表示、ボタンラベル「リップシンク合成する」

```typescript
it('useLipSync=true のとき Hedra 注意書きを表示し、TTS 注意書きを非表示にする', () => {
  render(<DialogueNode id="test-node" data={createDefaultDialogueData({ useLipSync: true })} />);

  expect(screen.queryByText('※ 口の動きは合成しません (TTS のみ)')).not.toBeInTheDocument();
  expect(screen.getByText(/キャラの顔がはっきり映る動画を入力してください/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /合成する/ })).toHaveTextContent('リップシンク合成する');
});
```

#### ケース 4: useLipSync=true & processing 状態で「(1-3 分かかります)」が表示される

```typescript
it('useLipSync=true & processing 状態で処理時間目安が表示される', () => {
  render(
    <DialogueNode
      id="test-node"
      data={createDefaultDialogueData({ useLipSync: true, status: 'processing', progress: 30 })}
    />
  );

  expect(screen.getByText(/処理中/)).toBeInTheDocument();
  expect(screen.getByText(/1-3 分かかります/)).toBeInTheDocument();
});
```

**注意**: `createDefaultDialogueData` はテストファイル内のヘルパー関数 (または既存 `createDefaultNodeData('dialogue')` を拡張) として定義する。`DialogueNodeData` の全フィールドにデフォルト値を持ち、引数でオーバーライドできる形式。

## 完了条件 (AC)

- [x] 以下のコマンドで全テストが pass すること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npx jest components/node-editor/nodes/DialogueNode.test.tsx --no-coverage 2>&1 | tail -20
  ```
- [x] ケース 1: 「※ 口の動きは合成しません (TTS のみ)」が存在し、「キャラの顔がはっきり映る動画」が存在しないこと
- [x] ケース 2: `mockUpdateNodeData` が `{ useLipSync: true }` で呼ばれること
- [x] ケース 3: 「キャラの顔がはっきり映る動画を入力してください」が存在し、「リップシンク合成する」ボタンが存在すること
- [x] ケース 4: 「1-3 分かかります」テキストが processing 状態で表示されること
- [x] 既存の DialogueNode テストが引き続き pass すること (テスト数が減少していないこと)
- [x] `npm run build` が成功すること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npm run build 2>&1 | tail -10
  ```

## テスト

本タスク自体がテスト追加タスク。実行コマンド:

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx jest components/node-editor/nodes/DialogueNode --no-coverage --verbose 2>&1 | tail -30
```

## ロールバック

`DialogueNode.test.tsx` から追加した 4 ケースを削除する。

## 参照

- Design Doc §6-5 既存 DialogueNode テスト追加 (4 ケース表)
- Design Doc §8-2 フロントエンドテスト (ケース表と検証内容)
- `movie-maker/components/node-editor/nodes/DialogueNode.test.tsx` (既存テスト構造)
- `movie-maker/components/node-editor/nodes/DialogueNode.tsx` (T2-3 で拡張済)
