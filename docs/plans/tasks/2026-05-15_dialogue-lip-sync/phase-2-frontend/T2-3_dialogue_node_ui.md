---
id: T2-3
phase: 2
title: "DialogueNode.tsx 拡張 — リップシンクチェックボックス UI + 条件付き表示"
depends_on:
  - T2-1
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/DialogueNode.tsx
---

## 目的

DialogueNode に「口を動かす (リップシンク)」チェックボックスを追加し、ON/OFF で注意書き・ヒント文・ボタンラベル・処理中メッセージを切り替える。既存 UX (useLipSync=false 時) は変更しない。

## 前提

- T2-1 (型定義拡張) 完了済 — `data.useLipSync` が型安全に参照できること
- `movie-maker/components/node-editor/nodes/DialogueNode.tsx` の現状構造を把握していること
  - L71-97: `renderStatusArea` 関数
  - L180-185: 注意書き (現状常時表示)
  - L191-203: 実行ボタン

## 変更内容

### `components/node-editor/nodes/DialogueNode.tsx`

#### 変更 1: リップシンクトグル追加 (速度スライダーと注意書きの間)

Design Doc §6-2 UI スケッチの通りに追加:

```tsx
{/* リップシンクトグル (新規追加) */}
<div className="flex items-start gap-2 p-2 rounded bg-[#1a1a1a]">
  <input
    type="checkbox"
    id={`use-lip-sync-${id}`}
    checked={data.useLipSync}
    onChange={(e) => updateNodeData({ useLipSync: e.target.checked })}
    disabled={isProcessing}
    className="mt-0.5 accent-[#fce300]"
  />
  <label htmlFor={`use-lip-sync-${id}`} className="cursor-pointer">
    <div className="text-xs text-gray-200">口を動かす (リップシンク)</div>
    <div className="text-[10px] text-gray-500 mt-0.5">
      Hedra で口パク合成 ($0.10/分)、処理に 1-3 分かかります
    </div>
  </label>
</div>
```

#### 変更 2: 注意書きを条件付き表示に変更 (L180-185 相当)

```tsx
{/* 注意書き (条件付き) */}
{!data.useLipSync && (
  <div className="p-2 rounded bg-[#2a2a2a] border border-yellow-600/30">
    <p className="text-[10px] text-yellow-500">
      ※ 口の動きは合成しません (TTS のみ)
    </p>
  </div>
)}

{data.useLipSync && (
  <div className="p-2 rounded bg-[#2a2a2a] border border-blue-600/30">
    <p className="text-[10px] text-blue-400 leading-relaxed">
      キャラの顔がはっきり映る動画を入力してください。<br />
      Hedra が顔を検出できない場合は失敗します。
    </p>
  </div>
)}
```

#### 変更 3: 実行ボタンラベル切替 (L191-203 相当)

```tsx
<button
  onClick={handleExecute}
  disabled={!canExecute}
  className={cn(/* 既存クラスはそのまま */)}
>
  <Mic className="w-4 h-4" />
  {data.useLipSync ? 'リップシンク合成する' : '合成する'}
</button>
```

#### 変更 4: processing 表示に処理時間目安追加 (`renderStatusArea` 内、L71-97 相当)

```tsx
if (data.status === 'processing' || data.status === 'pending') {
  return (
    <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
      <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
      <span className="text-xs text-gray-300">
        処理中... {data.progress}%
        {data.useLipSync && (
          <span className="text-gray-500 ml-1">(1-3 分かかります)</span>
        )}
      </span>
    </div>
  );
}
```

## 完了条件 (AC)

- [x] `id={`use-lip-sync-${id}`}` を持つ `input[type=checkbox]` が追加されている
- [x] チェックボックスの `checked={data.useLipSync}` と `onChange={(e) => updateNodeData({ useLipSync: e.target.checked })}` が設定されている
- [x] チェックボックスが `disabled={isProcessing}` を持つ (処理中に変更不可)
- [x] `!data.useLipSync` 条件下で「※ 口の動きは合成しません (TTS のみ)」が表示される
- [x] `data.useLipSync` 条件下で「キャラの顔がはっきり映る動画を入力してください」が表示される
- [x] 実行ボタンのテキストが `data.useLipSync ? 'リップシンク合成する' : '合成する'` で切り替わる
- [x] TypeScript 型チェックが通ること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npx tsc --noEmit 2>&1 | head -20
  ```
- [x] `npm run build` が成功すること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npm run build 2>&1 | tail -10
  ```
- [x] `errorMessage` が `DialogueNode.tsx` で再宣言・再定義されていないこと (B1):
  ```bash
  grep -n 'errorMessage.*:.*string' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/components/node-editor/nodes/DialogueNode.tsx
  # 型定義行は 0 件であること (使用箇所は OK)
  ```

## テスト

T2-5 で DialogueNode.test.tsx に 4 ケースを追加する。本タスクでは TypeScript と build のみ確認。

## ロールバック

1. チェックボックス `div` ブロックを削除
2. 注意書きを条件なし `{!data.useLipSync &&...}` ではなく常時表示に戻す
3. Hedra ヒント `{data.useLipSync &&...}` ブロックを削除
4. ボタンラベルを `'合成する'` に戻す
5. `renderStatusArea` の `(1-3 分かかります)` スパンを削除

## 参照

- Design Doc §6-2 DialogueNode.tsx 変更 (UI スケッチ全文)
- `movie-maker/components/node-editor/nodes/DialogueNode.tsx:71-97` (renderStatusArea)
- `movie-maker/components/node-editor/nodes/DialogueNode.tsx:180-185` (注意書き現状)
- `movie-maker/components/node-editor/nodes/DialogueNode.tsx:191-203` (実行ボタン現状)
