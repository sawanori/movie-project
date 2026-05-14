---
id: T2-3
phase: 2
title: "components/node-editor/nodes/DialogueNode.tsx 新規実装 + React Testing Library テスト"
depends_on:
  - T2-2
estimated_effort: L
files_touched:
  - movie-maker/components/node-editor/nodes/DialogueNode.tsx
  - movie-maker/components/node-editor/nodes/DialogueNode.test.tsx
---

## 目的

DialogueNode コンポーネントを新規実装する。このノードは Pipeline 型 (入力 Handle + 出力 Handle 両持ち) で、
セリフテキスト入力・声選択・速度設定 UI を提供し、実行ボタン押下で `startDialogue` CustomEvent を発火する。

## 前提

- T2-2 完了: `ttsApi`, `dialogueApi`, `VoiceInfo` が定義されていること
- T2-1 完了: `DialogueNodeData`, `HANDLE_IDS` が定義されていること
- `BGMNode.tsx` (L21-121) と `OverlayNode.tsx` (L43-156) のパターンを確認しておくこと
- `BaseNode`, `inputHandleClassName`, `outputHandleClassName` 等の共有クラスを確認しておくこと

## 変更内容

### 1. `DialogueNode.tsx` 実装

Design Doc §6-2 の骨格を元に完全実装:

#### Props 定義

```typescript
type DialogueNodeProps = NodeProps & {
  data: DialogueNodeData
  selected: boolean
}
```

#### 定数

```typescript
const MAX_POLLING_ATTEMPTS = 180  // 5 秒 × 180 = 15 分
const POLLING_INTERVAL_MS = 5000
```

#### 状態管理

```typescript
const [voices, setVoices] = useState<VoiceInfo[]>([])
const [isLoadingVoices, setIsLoadingVoices] = useState(false)
```

#### 声リスト取得 useEffect

```typescript
useEffect(() => {
  setIsLoadingVoices(true)
  ttsApi.listVoices('ja')
    .then(setVoices)
    .catch((err) => console.error('Failed to load voices', err))
    .finally(() => setIsLoadingVoices(false))
}, [])
```

#### `updateNodeData` コールバック

BGMNode.tsx と同一パターン:
```typescript
const updateNodeData = useCallback(
  (updates: Partial<DialogueNodeData>) => {
    window.dispatchEvent(new CustomEvent('nodeDataUpdate', {
      detail: { nodeId: id, updates },
    }))
  },
  [id]
)
```

#### `handleExecute` コールバック

Design Doc §6-2 (入力動画 URL の取得方法) 通り、NodeEditor.tsx に処理を委譲する:
```typescript
const handleExecute = useCallback(() => {
  window.dispatchEvent(new CustomEvent('startDialogue', {
    detail: { nodeId: id },
  }))
}, [id])
```

#### JSX 構成

```
BaseNode (title="セリフ (TTS)", icon=<Mic />, isSelected, isValid, errorMessage)
  ├─ Handle type="target" id="dialogue_video_input" Position.Left
  ├─ セリフテキスト textarea (data.text バインド、最大 5000 文字)
  ├─ 声選択 select (voices から生成、data.voiceId バインド)
  │    └─ isLoadingVoices 中は disabled
  ├─ 速度スライダー input[type=range] (0.25〜4.0, step=0.05, data.speed バインド)
  ├─ 注意書き div (「※ 口の動きは合成しません (TTS のみ)」)
  ├─ 実行ボタン + 進捗表示
  │    ├─ idle/failed: 実行ボタン有効
  │    ├─ pending/processing: Loader2 アイコン + disabled
  │    └─ completed: CheckCircle アイコン
  └─ Handle type="source" id="dialogue_video_output" Position.Right
```

各 `updateNodeData` トリガー:
- textarea `onChange` → `text` 更新
- select `onChange` → `voiceId` 更新
- range `onChange` → `speed` 更新

### 2. テスト作成 (TDD: Red → Green)

ファイル: `movie-maker/components/node-editor/nodes/DialogueNode.test.tsx`

Design Doc §11 のフロントエンドテストケースを実装:

| テスト名 | 検証内容 |
|---------|---------|
| `renders in idle state` | テキストエリア、声ドロップダウン、実行ボタン、注意書きが表示される |
| `loads voice list on mount` | `ttsApi.listVoices` が呼ばれ、ドロップダウンに選択肢が表示される |
| `handles voice list error gracefully` | `ttsApi.listVoices` がエラー → console.error ログ、ドロップダウンは空で表示継続 |
| `shows loader when processing` | `data.status = 'processing'` → Loader2 が表示される、実行ボタンが disabled |
| `shows check icon when completed` | `data.status = 'completed'` + `outputVideoUrl` → CheckCircle が表示される |
| `shows error state when failed` | `data.status = 'failed'` + `errorMessage` → AlertCircle + エラーメッセージ表示 |
| `always shows lip sync notice` | 「口の動きは合成しません」テキストが常に表示される |
| `dispatches startDialogue event on execute` | 実行ボタン押下 → `startDialogue` CustomEvent が dispatch される |

テスト実装方針:
- `jest.mock('@/lib/api/client', () => ({ ttsApi: { listVoices: jest.fn() }, dialogueApi: {...} }))`
- `@testing-library/react` の `render`, `screen`, `fireEvent`
- `window.dispatchEvent` の spy で CustomEvent 発火確認

## 完了条件 (AC)

- [ ] `DialogueNode.tsx` が存在し、`export function DialogueNode` が正しくエクスポートされている
- [ ] 入力 Handle (`dialogue_video_input`, `type="target"`, `Position.Left`) が存在する
- [ ] 出力 Handle (`dialogue_video_output`, `type="source"`, `Position.Right`) が存在する
- [ ] 注意書き「口の動きは合成しません」が JSX に含まれる
- [ ] 実行ボタン押下で `startDialogue` CustomEvent が dispatch される
- [ ] `DialogueNode.test.tsx` が 8 件以上のテストを含む
- [ ] `npm test -- --testPathPattern=DialogueNode` が全件 pass

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npm test -- --testPathPattern=DialogueNode --watchAll=false
```

## ロールバック

`DialogueNode.tsx` と `DialogueNode.test.tsx` を削除する。
T2-4, T2-5, T2-6 はこのファイルに依存するため、それらも合わせてロールバックが必要。

## 参照

- Design Doc §6-2 (DialogueNode.tsx 骨格、handleExecute パターン、B2/B4 解決)
- Design Doc §8 (接続 Handle 設計)
- Design Doc §10 (エラー表示方針)
- Design Doc §11 (フロントエンドテスト計画)
- `movie-maker/components/node-editor/nodes/BGMNode.tsx` L21-121
- `movie-maker/components/node-editor/nodes/OverlayNode.tsx` L43-156
