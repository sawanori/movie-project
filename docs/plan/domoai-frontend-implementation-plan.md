# DomoAI フロントエンド実装計画書（Story生成ページ）

## 概要

DomoAI動画生成プロバイダーをStory生成ページ（1画像→1動画）のUIに統合するための実装計画。現在のRunway/Veo選択UIに馴染む形で第3のオプションとしてDomoAIを追加する。

---

## 対象範囲

| 対象 | パス | 説明 |
|------|------|------|
| Story生成ページ | `/app/generate/story/page.tsx` | 1画像から1動画を生成 |
| API クライアント | `/lib/api/client.ts` | 型定義の更新 |

> **注意**: Storyboardページ（複数シーン管理）は本計画の対象外。別途実装予定。

---

## 現状分析

### 現在のUI構成

**動画生成エンジン選択部分**（行623-667）:
- 2つの選択ボタン（Runway, Veo）を横並びで表示
- `min-w-[120px]` の固定幅ボタン
- 中央揃えテキスト
- 選択時は `border-purple-500 bg-purple-50` のスタイル

```
┌─────────────┐  ┌─────────────┐
│   Runway    │  │     Veo     │
│ 推奨・安定品質 │  │   高品質    │
└─────────────┘  └─────────────┘
```

### 現在の型定義

```typescript
// lib/api/client.ts (行148, 169)
video_provider?: 'runway' | 'veo'
```

---

## 変更対象ファイル

### 1. `lib/api/client.ts` - 型定義の更新

**変更箇所**: Story関連の2箇所

| 行番号（目安） | 関数 | 変更内容 |
|--------------|------|---------|
| 148 | `translateStoryPrompt` | `'runway' \| 'veo'` → `'runway' \| 'veo' \| 'domoai'` |
| 169 | `createStoryVideo` | 同上 |

**変更前**:
```typescript
translateStoryPrompt: (data: {
  description_ja: string;
  video_provider?: 'runway' | 'veo';
  // ...
}): Promise<{ english_prompt: string }> =>

createStoryVideo: (data: {
  image_url: string;
  story_text: string;
  // ...
  video_provider?: 'runway' | 'veo';
  // ...
}) =>
```

**変更後**:
```typescript
translateStoryPrompt: (data: {
  description_ja: string;
  video_provider?: 'runway' | 'veo' | 'domoai';
  // ...
}): Promise<{ english_prompt: string }> =>

createStoryVideo: (data: {
  image_url: string;
  story_text: string;
  // ...
  video_provider?: 'runway' | 'veo' | 'domoai';
  // ...
}) =>
```

---

### 2. `app/generate/story/page.tsx` - Story生成ページ

#### 2.1 State型の更新（行70付近）

**変更前**:
```typescript
const [videoProvider, setVideoProvider] = useState<'runway' | 'veo'>('runway');
```

**変更後**:
```typescript
const [videoProvider, setVideoProvider] = useState<'runway' | 'veo' | 'domoai'>('runway');
```

#### 2.2 UIの更新（行623-667付近）

**変更後のレイアウト**:
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Runway    │  │     Veo     │  │   DomoAI    │
│ 推奨・安定品質 │  │   高品質    │  │  アニメ特化  │
└─────────────┘  └─────────────┘  └─────────────┘
```

**追加するコード**（既存のVeoボタンの後に追加）:

```tsx
<button
  type="button"
  onClick={() => setVideoProvider('domoai')}
  className={cn(
    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
    videoProvider === 'domoai'
      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
      : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
  )}
>
  <div className="text-center">
    <p className="text-sm font-medium text-zinc-900 dark:text-white">DomoAI</p>
    <p className="text-xs text-zinc-500">アニメ特化</p>
  </div>
  {videoProvider === 'domoai' && (
    <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">選択中</span>
  )}
</button>
```

#### 2.3 レスポンシブ対応

3ボタンになるため、狭い画面での折り返し対応を追加:

**変更前**（行628）:
```tsx
<div className="flex gap-4 justify-center">
```

**変更後**:
```tsx
<div className="flex flex-wrap gap-4 justify-center">
```

---

## 実装手順

### Step 1: 型定義の更新（5分）

1. `lib/api/client.ts` を開く
2. 行148の `translateStoryPrompt` の型を更新
3. 行169の `createStoryVideo` の型を更新

### Step 2: State型の更新（2分）

1. `app/generate/story/page.tsx` を開く
2. 行70付近の `useState` の型を更新

### Step 3: UIボタンの追加（5分）

1. 行628の `div` に `flex-wrap` を追加
2. 行664（Veoボタン）の後にDomoAIボタンを追加

### Step 4: 動作確認（10分）

1. `npm run dev` で開発サーバー起動
2. `/generate/story` ページにアクセス
3. 3つのボタンが正しく表示されることを確認
4. 各ボタンをクリックして選択状態が変わることを確認
5. DomoAI選択時に動画生成が動作することを確認

### Step 5: ビルド確認（3分）

1. `npm run build` でビルドエラーがないことを確認
2. `npm run lint` でLintエラーがないことを確認

---

## テスト項目

| # | 項目 | 確認内容 |
|---|------|---------|
| 1 | UI表示 | 3つのボタンが横並びで表示される |
| 2 | デフォルト | ページ読み込み時は Runway が選択されている |
| 3 | 選択切替 | 各ボタンをクリックすると選択状態が切り替わる |
| 4 | スタイル | 選択中のボタンは紫色のボーダー・背景になる |
| 5 | ダークモード | ダークモードでも正しく表示される |
| 6 | レスポンシブ | 狭い画面でボタンが折り返して表示される |
| 7 | API連携 | DomoAI選択時、APIに `video_provider: 'domoai'` が送信される |

---

## 作業見積もり

| Step | 作業内容 | 見積もり |
|------|---------|---------|
| Step 1 | 型定義更新 | 5分 |
| Step 2 | State型更新 | 2分 |
| Step 3 | UIボタン追加 | 5分 |
| Step 4 | 動作確認 | 10分 |
| Step 5 | ビルド確認 | 3分 |
| **合計** | | **25分** |

---

## 将来の拡張（対象外）

- Storyboardページへの DomoAI 追加
- DomoAI選択時のアニメスタイル選択UI
- プロバイダー別の推奨設定

---

*作成日: 2026年1月3日*
*対象: Story生成ページのみ*
