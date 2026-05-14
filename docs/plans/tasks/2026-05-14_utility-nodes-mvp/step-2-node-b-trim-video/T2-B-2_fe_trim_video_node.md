---
id: T2-B-2
step: 2
node: B
title: "FE: TrimVideoNode.tsx 新規実装 + 単体テスト"
depends_on: [T1-common-1, T1-common-2, T1-common-3, T1-common-4]
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/TrimVideoNode.tsx (T1-common-4 の stub を上書き)
  - movie-maker/components/node-editor/nodes/__tests__/TrimVideoNode.test.tsx (新規)
---

## 目的

動画 URL を入力として受け取り、`startSeconds` / `endSeconds` を指定してトリム済み動画を出力する React Flow ノードを実装する。クライアント側バリデーション (`start < end`, 範囲 >= 0.5s) を含む。

## 前提

- Design Doc §6.3〜§6.4 に準拠。
- T1-common-1〜4 がマージ済みで、`TrimVideoNodeData`, `HANDLE_IDS.TRIM_VIDEO_*`, `getInputHandleClass`, `getOutputHandleClass` が利用可能。
- 参考実装: `OverlayNode.tsx` (数値入力 UI), `DialogueNode.tsx` (input/output handle + 実行ボタンパターン)。
- T1-common-4 の stub ファイルを本実装で上書きする。

## 変更内容

### 1. `TrimVideoNode.tsx` を完全実装で上書き

Design Doc §6.3 のシグネチャに準拠:

- **入力ハンドル (左、Video=緑)**: `id={HANDLE_IDS.TRIM_VIDEO_INPUT}`, `className={getInputHandleClass('video')}`
- **開始時刻 input**: `type="number"`, `min={0}`, `step={0.1}`, `value={data.startSeconds}`, `onChange` で `updateNodeData({ startSeconds: parseFloat(e.target.value) || 0 })`
- **終了時刻 input**: `type="number"`, `min={0}`, `step={0.1}`, `value={data.endSeconds ?? ''}`, 空欄なら `null` を設定 (placeholder="最後まで")
- **クライアントバリデーション**:
  - `isStartValid = data.startSeconds >= 0`
  - `isEndValid = data.endSeconds === null || data.endSeconds > data.startSeconds`
  - `isRangeValid = isStartValid && isEndValid`
  - `isRangeValid === false` のとき `errorMessage='終了時刻は開始時刻より大きい値を入力してください'` をインライン表示
- **実行ボタン**: `canExecute = !isProcessing && !!data.inputVideoUrl && isRangeValid` のとき有効。クリックで `'startTrimVideo'` CustomEvent dispatch
- **ステータス表示**: `data.status` に応じて Loader2 / CheckCircle / AlertCircle
- **出力ハンドル (右、Video=緑)**: `id={HANDLE_IDS.TRIM_VIDEO_OUTPUT}`, `className={getOutputHandleClass('video')}`

### 2. 単体テスト (`__tests__/TrimVideoNode.test.tsx` 新規)

Design Doc §10.1 に準拠。最低 6 ケース:

| テストケース | 確認内容 |
|-------------|---------|
| start=2, end=5 で実行ボタン押下 | `startTrimVideo` CustomEvent が `{ nodeId }` で dispatch される |
| end=null (空欄) で実行 | endSeconds が null のまま `startTrimVideo` イベントが発火 |
| start=5, end=3 (start > end) | 実行ボタンが `disabled`、インラインエラーメッセージが表示 |
| start=5, end=5 (start == end) | 実行ボタンが `disabled` |
| start=-1 (負の値入力) | バリデーションエラー (startSeconds が 0 にクランプされるか、エラー表示) |
| 動画未接続 (inputVideoUrl=null) | 実行ボタンが `disabled` |

## 完了条件 (AC)

- [x] `TrimVideoNode.tsx` が完全実装で上書きされている (stub が消えている)
- [x] 入力ハンドル (Video=緑) と出力ハンドル (Video=緑) が DOM に存在し、`getInputHandleClass('video')` / `getOutputHandleClass('video')` のクラスが付与されている
- [x] start/end の number input が **2 つ**存在し、それぞれ `data.startSeconds` / `data.endSeconds` を反映する
- [x] クライアントバリデーション (`start < end`, 範囲 >= 0.5s は警告のみで disabled は start >= end のときのみ) が動作
- [x] `'startTrimVideo'` の CustomEvent dispatch が実行ボタンクリック時に発火する
- [x] 単体テスト 10 ケース (6 最低) が green (`cd movie-maker && npx vitest run TrimVideoNode`)
- [x] `pnpm typecheck` が error 0 (tsc --noEmit: 0 errors)
- [x] `pnpm lint` が clean (any 禁止、TS strict 準拠)

## テスト

- 単体テスト: 上記 6 ケース最低 (TDD)
- 結合テスト: T2-B-3 (wiring) 完了後に NodeEditor 経由で動作確認

## ロールバック

- `TrimVideoNode.tsx` を T1-common-4 の stub に戻す。
- テストファイル削除のみで完了。

## 参照

- Design Doc §6.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 683-690
- Design Doc §6.3 FE コンポーネント骨格 — 行 742-851
- Design Doc §6.4 バリデーション設計 — 行 853-861
- Design Doc §10.1 単体テスト方針 (Trim Video テスト表) — 行 1280-1287
- 参考実装: `movie-maker/components/node-editor/nodes/DialogueNode.tsx` (input/output + 実行ボタン)
- 参考実装: `movie-maker/components/node-editor/nodes/OverlayNode.tsx` (数値入力 UI)
