---
id: T2-A-2
step: 2
node: A
title: "FE: GetVideoFrameNode.tsx 新規実装 + 単体テスト"
depends_on: [T1-common-1, T1-common-2, T1-common-3, T1-common-4]
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/GetVideoFrameNode.tsx (T1-common-4 の stub を上書き)
  - movie-maker/components/node-editor/nodes/__tests__/GetVideoFrameNode.test.tsx (新規)
---

## 目的

動画 URL を入力として受け取り、最初/最後のフレームを画像 URL として出力する React Flow ノードを実装する。`DialogueNode` の Pipeline 型パターンを踏襲する。

## 前提

- Design Doc §5.3 に準拠。
- **N1 修正 (重要)**: `HailuoEndFrameNode.tsx` は**ファイルアップロード型**で動画→画像変換ではない。本タスクの正しい参考実装は以下:
  - BE 側: `app/tasks/storyboard_processor.py:176-215` `_extract_and_upload_last_frame()` (動画 URL → ffmpeg 抽出 → R2 アップロード)
  - FE 側: `DialogueNode.tsx` (input/output handle 両方を持つ Pipeline 型) + `BGMNode.tsx` (Source 型のシンプル UI)
- T1-common-1〜4 がマージ済みで、`GetVideoFrameNodeData`, `HANDLE_IDS.GET_VIDEO_FRAME_*`, `getInputHandleClass`, `getOutputHandleClass` が利用可能であること。
- T1-common-4 で作成した stub ファイルを本実装で**上書き**する。

## 変更内容

### 1. `GetVideoFrameNode.tsx` を完全実装で上書き

Design Doc §5.3 のシグネチャに準拠。以下の構造を実装:

- **Props 型**: `GetVideoFrameNodeProps = NodeProps & { data: GetVideoFrameNodeData; selected: boolean }`
- **入力ハンドル (左、Video=緑)**: `id={HANDLE_IDS.GET_VIDEO_FRAME_VIDEO_INPUT}`, `className={getInputHandleClass('video')}`
- **direction セレクト**: `<select>` で `'first' | 'last'` を切り替え、`onChange` で `updateNodeData({ direction })`
- **出力プレビュー**: `data.outputImageUrl` があれば `<img>` でプレビュー表示
- **ステータス表示**: `data.status` に応じて Loader2 / CheckCircle / AlertCircle を表示
- **実行ボタン**: `canExecute = !isProcessing && !!data.inputVideoUrl` のとき有効。クリックで `window.dispatchEvent(new CustomEvent('startGetVideoFrame', { detail: { nodeId: id } }))`
- **出力ハンドル (右、Image=青)**: `id={HANDLE_IDS.GET_VIDEO_FRAME_IMAGE_OUTPUT}`, `className={getOutputHandleClass('image')}`
- **updateNodeData ヘルパー**: `window.dispatchEvent(new CustomEvent('nodeDataUpdate', { detail: { nodeId: id, updates } }))` で NodeEditor 側に伝播 (`DialogueNode` と同じパターン)

**注意 (B4 パターン)**: 実行ボタンの handler 本体は **NodeEditor.tsx 側で実装** (T2-A-3 のスコープ)。本ノードコンポーネントは CustomEvent を dispatch するのみ。

### 2. 単体テスト (`__tests__/GetVideoFrameNode.test.tsx` 新規)

Design Doc §10.1 に準拠。React Testing Library + MSW (必要に応じて) を使用。最低 6 ケース:

| テストケース | 確認内容 |
|-------------|---------|
| direction='first' で実行ボタン押下 | `window.dispatchEvent` が `startGetVideoFrame` イベントで呼ばれる |
| direction='last' に変更 | セレクトで 'last' を選択したとき `nodeDataUpdate` イベントが `{ direction: 'last' }` で発火 |
| 処理中 (status='processing') | Loader2 アイコンが DOM 内に表示される |
| 完了後 (status='completed', outputImageUrl 設定済み) | `<img>` プレビューが表示される |
| 失敗時 (status='failed', errorMessage 設定済み) | エラーメッセージが表示される |
| 動画未接続 (inputVideoUrl=null) | 実行ボタンが `disabled` 属性を持つ |

## 完了条件 (AC)

- [ ] `GetVideoFrameNode.tsx` が完全実装で上書きされている (stub の `data-testid="get-video-frame-node-stub"` が**消えている**)
- [ ] 入力ハンドル (Video=緑) と出力ハンドル (Image=青) が DOM に存在する (テストで `getInputHandleClass('video')` と `getOutputHandleClass('image')` のクラスが付与されていることを確認)
- [ ] direction セレクトが `'first'` / `'last'` の 2 オプションを持つ
- [ ] `'startGetVideoFrame'` の CustomEvent dispatch が実行ボタンクリック時に発火する (テストで `window.dispatchEvent` をスパイ)
- [ ] 単体テスト 6 ケースすべて green (`cd movie-maker && pnpm test GetVideoFrameNode` で確認)
- [ ] `pnpm typecheck` が error 0
- [ ] `pnpm lint` が clean (any 禁止 / TS strict 準拠)
- [ ] `getInputHandleClass('video')` を使用しており、既存の `inputHandleClassName` を**使っていない** (新規ノードは色規約必須)

## テスト

- 単体テスト: 上記 6 ケース最低 (TDD: 失敗テスト → 実装 → green)
- 結合テスト: T2-A-3 (wiring) 完了後に NodeEditor 経由で動作確認

## ロールバック

- `GetVideoFrameNode.tsx` を T1-common-4 で作成した stub に戻す (`git checkout` で stub commit を復元)。
- テストファイル削除のみで完了。

## 参照

- Design Doc §5.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 494-500
- Design Doc §5.3 FE コンポーネント骨格 — 行 548-646 (N1 修正の HailuoEndFrameNode 注意書きを含む)
- Design Doc §10.1 単体テスト方針 (Get Video Frame テスト表) — 行 1269-1278
- 参考実装: `movie-maker/components/node-editor/nodes/DialogueNode.tsx` (Pipeline 型 + CustomEvent パターン)
- 参考実装: `movie-maker/components/node-editor/nodes/BGMNode.tsx` (Source 型 UI 構造)
- BE 参考: `movie-maker-api/app/tasks/storyboard_processor.py:176-215` (`_extract_and_upload_last_frame()`)
