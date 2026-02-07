# CM構成カード セリフ・効果音カラム追加 実装計画書

## 概要

CM構成（広告脚本）のカットカードに「セリフ」「効果音/SE」カラムを追加する。
現在のレイアウト: ①動画 → ②脚本・シーン
追加後のレイアウト: ①動画 → ②脚本・シーン → ③セリフ → ④効果音/SE

## 実装難易度

**低〜中 (★★☆☆☆)**

## 影響範囲

### フロントエンド
- `components/video/ad-cut-card.tsx` - UIカラム追加
- `lib/api/client.ts` - 型定義追加
- 親コンポーネント（AdCutCardを使用する箇所）- 状態管理追加

### バックエンド
- 初期実装ではバックエンド変更なし（フロントエンドのみのメモ機能）
- 将来的にデータ永続化が必要な場合はSupabaseマイグレーションを実施

---

## 実装ステップ

### Step 1: 型定義の更新

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
export interface AdCut {
  id: string;
  cut_number: number;
  scene_type: string;
  scene_type_label: string;
  description_ja: string;
  description_en: string;
  duration: number;
  // 追加フィールド
  dialogue?: string;      // セリフ
  sound_effect?: string;  // 効果音/SE
}
```

### Step 2: AdCutCardPropsの更新

**ファイル**: `movie-maker/components/video/ad-cut-card.tsx`

```typescript
interface AdCutCardProps {
  // ... 既存のprops ...
  onUpdateDescription: (descriptionJa: string) => void;
  onUpdateDuration: (duration: number) => void;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
  // 追加
  onUpdateDialogue: (dialogue: string) => void;
  onUpdateSoundEffect: (soundEffect: string) => void;
  canDelete: boolean;
}
```

### Step 3: UIカラムの追加

**ファイル**: `movie-maker/components/video/ad-cut-card.tsx`

現在の2カラムレイアウトを4カラムに変更:

```
┌─────────────────────────────────────────────────────────────────────┐
│ カット1  [シーンタイプ]                    秒数: [5秒 ▼]  [🗑️]     │
├──────────┬──────────────┬──────────────┬──────────────────────────────┤
│  動画    │  脚本/シーン │   セリフ     │     効果音/SE              │
│  プレ    │  内容        │              │                            │
│  ビュー  │              │              │                            │
│          │              │              │                            │
│ [トリム] │              │              │                            │
│ [変更]   │              │              │                            │
└──────────┴──────────────┴──────────────┴──────────────────────────────┘
```

### Step 4: 親コンポーネントの更新

AdCutCardを使用している親コンポーネントで:

1. `dialogue`と`soundEffect`の状態管理を追加
2. `onUpdateDialogue`と`onUpdateSoundEffect`ハンドラーを実装
3. propsとして渡す

### Step 5: テスト実施

- UIの表示確認
- 各カラムへのテキスト入力・編集の動作確認
- レスポンシブデザインの確認

---

## 詳細実装タスク

### タスク一覧

| # | タスク | ファイル | 優先度 |
|---|--------|----------|--------|
| 1 | AdCut型にdialogue, sound_effectフィールド追加 | lib/api/client.ts | 高 |
| 2 | EditableCutの状態初期化にフィールド追加 | 親コンポーネント | 高 |
| 3 | AdCutCardPropsにハンドラー追加 | ad-cut-card.tsx | 高 |
| 4 | セリフカラムのUI実装 | ad-cut-card.tsx | 高 |
| 5 | 効果音/SEカラムのUI実装 | ad-cut-card.tsx | 高 |
| 6 | 親コンポーネントでハンドラー実装 | 親コンポーネント | 高 |
| 7 | ビルド確認 | - | 高 |
| 8 | 動作テスト | - | 高 |

---

## Supabaseマイグレーション（将来的に必要な場合）

データの永続化が必要になった場合、以下のマイグレーションを実施:

```sql
-- ad_cutsテーブルにカラム追加（テーブルが存在する場合）
ALTER TABLE ad_cuts
ADD COLUMN IF NOT EXISTS dialogue TEXT,
ADD COLUMN IF NOT EXISTS sound_effect TEXT;
```

**注意**: マイグレーションはMCP経由で実施すること
```
mcp__supabase__apply_migration
```

---

## テスト計画

### 実装完了後のテスト項目

1. **UIテスト**
   - [ ] セリフカラムが表示されること
   - [ ] 効果音/SEカラムが表示されること
   - [ ] 各カラムにテキスト入力できること
   - [ ] 入力したテキストが保持されること

2. **編集テスト**
   - [ ] セリフの編集モード切り替えが動作すること
   - [ ] 効果音/SEの編集モード切り替えが動作すること
   - [ ] 保存・キャンセルが正しく動作すること

3. **レスポンシブテスト**
   - [ ] モバイルサイズでの表示確認
   - [ ] タブレットサイズでの表示確認

4. **ビルドテスト**
   - [ ] `npm run build`が成功すること
   - [ ] TypeScriptエラーがないこと

---

## 見積もり時間

| フェーズ | 時間 |
|----------|------|
| 型定義更新 | 5分 |
| UIコンポーネント実装 | 15分 |
| 親コンポーネント更新 | 10分 |
| テスト | 10分 |
| **合計** | **約40分** |

---

## 備考

- 初期実装はフロントエンドのみのメモ機能
- セッション中のみデータ保持（リロードで消える）
- 永続化が必要な場合は別途バックエンド実装を検討
