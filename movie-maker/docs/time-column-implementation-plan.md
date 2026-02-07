# TIME列・CM尺自動調整機能 実装計画書

## 概要

アドクリエイターのカット編集画面にTIME列を追加し、CM全体の尺に合わせて各カットの秒数を自動調整する機能を実装する。

## 要件

### 機能要件

1. **CM尺選択**
   - 6秒 / 15秒 / 30秒 / 60秒 / 90秒 / 120秒 から選択
   - **脚本確認ページで設定**（カット編集画面では変更不可）
   - 選択時に各カットの秒数を均等に分配

2. **TIME列表示**
   - 各カットの開始時間をMM:SS形式で表示（例: 00:00, 00:04, 00:08）
   - カットの秒数も併せて表示

3. **秒数自動調整**
   - 1カットの秒数を変更すると、他のカットの秒数が自動調整される
   - 合計がCM尺に一致するよう均等に分配
   - 各カット最低1秒は確保

4. **トリム範囲自動調整**
   - カットの秒数が短くなった場合、動画のトリム終了位置を自動調整

5. **ドラフト保存対応**
   - `target_duration`（CM尺）をドラフトに保存・復元

### 表示仕様

- **秒数**: 整数秒のみ（小数点なし）
- **TIME表示**: MM:SS形式（例: 00:00, 01:30）
- **余り分配**: 目標秒数をカット数で割った余りは先頭カットから1秒ずつ追加

## 技術設計

### ファイル構成

```
lib/
  duration-adjuster.ts      # 新規: 秒数分配・調整ユーティリティ
  api/client.ts             # 変更: AdCreatorDraftMetadata型にtarget_duration追加
  hooks/use-auto-save-ad-creator-draft.ts  # 変更: getTargetDuration追加

app/
  concat/page.tsx           # 変更: targetDuration状態管理、handleConfirmScriptで秒数分配

components/video/
  ad-script-preview.tsx     # 変更: CM尺選択UI追加（カット編集前に設定）
  ad-storyboard.tsx         # 変更: CM尺表示（読み取り専用）・累積時間計算
  ad-cut-card.tsx           # 変更: TIME列追加
```

### 新規ファイル: lib/duration-adjuster.ts

```typescript
/**
 * 秒数を均等に分配する（整数秒のみ）
 * 端数は先頭カットから1秒ずつ追加
 */
export function distributeDurations(
  cuts: EditableCut[],
  targetTotal: number
): EditableCut[]

/**
 * 1カットの秒数変更時に他のカットを均等に調整
 */
export function adjustDurationsOnChange(
  cuts: EditableCut[],
  changedCutId: string,
  newDuration: number,
  targetTotal: number
): EditableCut[]

/**
 * 累積時間（startTime）を計算
 */
export function calculateStartTimes(cuts: EditableCut[]): number[]

/**
 * 秒数をMM:SS形式にフォーマット
 */
export function formatTime(seconds: number): string

/**
 * 動画のトリム範囲を新しい秒数に合わせて調整
 */
function adjustVideoTrim(
  video: EditableCut["video"],
  newDuration: number
): EditableCut["video"]

/**
 * 目標秒数を変更する際の検証
 */
export function validateTargetDuration(
  cutCount: number,
  targetDuration: number
): { valid: boolean; message?: string }

/**
 * カット秒数変更の検証
 */
export function validateDurationChange(
  cuts: EditableCut[],
  changedCutId: string,
  newDuration: number,
  targetTotal: number
): { valid: boolean; message?: string; adjustedDuration?: number }
```

### 型定義の変更

```typescript
// lib/api/client.ts
export interface AdCreatorDraftMetadata {
  // ... 既存フィールド
  /** CM全体の目標尺（秒）- 例: 15, 30, 60 */
  target_duration: number | null;
}
```

### コンポーネント変更

#### ad-script-preview.tsx（脚本確認ページ）

**追加Props:**
```typescript
interface AdScriptPreviewProps {
  // ... 既存Props
  targetDuration: number | null;
  onTargetDurationChange: (duration: number | null) => void;
}
```

**追加機能:**
- CM尺選択ボタン（6秒/15秒/30秒/60秒/90秒/120秒）
- CM尺未選択時は「カット編集へ」ボタンを無効化

#### ad-storyboard.tsx（カット編集ページ）

**追加Props:**
```typescript
interface AdStoryboardProps {
  // ... 既存Props
  targetDuration: number | null;  // 読み取り専用
}
```

**追加機能:**
- CM尺の読み取り専用表示
- 累積開始時間の計算（`calculateStartTimes`）
- 秒数変更時の自動調整（`adjustDurationsOnChange`）
- カット追加/削除時の再分配（`distributeDurations`）

#### ad-cut-card.tsx

**追加Props:**
```typescript
interface AdCutCardProps {
  // ... 既存Props
  startTime?: number;
  targetDuration?: number | null;
}
```

**追加表示:**
- TIME列（CM尺設定時のみ表示）
- MM:SS形式の開始時間
- カットの秒数表示

### UIレイアウト

**変更前（4カラム）:**
```
| 動画 | 脚本/シーン内容 | セリフ | SE |
```

**変更後（5カラム）:**
```
| TIME | 動画 | 脚本/シーン内容 | セリフ | SE |
```

※TIME列はCM尺が設定されている場合のみ表示

## 分配アルゴリズム

### 均等分配（distributeDurations）

```
例: 15秒を4カットで分配
  15 ÷ 4 = 3 余り 3
  結果: [4, 4, 4, 3]  ← 余りを先頭から1秒ずつ追加
```

### 変更時調整（adjustDurationsOnChange）

```
例: 15秒4カット [4, 4, 4, 3] でカット1を6秒に変更
  残り: 15 - 6 = 9秒
  他カット数: 3
  9 ÷ 3 = 3 余り 0
  結果: [6, 3, 3, 3]
```

## エッジケース処理

| ケース | 処理 |
|--------|------|
| カット数 > 目標秒数 | 全カット1秒に設定 |
| 1カットの秒数 > 最大許容 | 最大許容値に調整 |
| 残り秒数 < 他カット数 | 変更カットの秒数を調整 |
| トリム範囲 > 新秒数 | trimEndを新秒数に調整 |

## 実装手順

1. [x] `lib/duration-adjuster.ts` 新規作成
2. [x] `AdCreatorDraftMetadata`型に`target_duration`追加
3. [x] `concat/page.tsx`に`targetDuration`状態追加
4. [x] `ad-storyboard.tsx`にCM尺選択UI・累積時間計算追加
5. [x] `ad-cut-card.tsx`にTIME列追加
6. [x] トリム範囲の自動調整処理実装
7. [x] ドラフト保存/復元に`target_duration`追加
8. [x] テスト・動作確認

## Supabaseマイグレーション

**不要** - `target_duration`は既存の`draft_metadata` JSONBカラム内に保存されるため、スキーマ変更は不要。

## 追加修正: ドラフト復元モーダルのタイミング

### 問題
ドラフト復元モーダルがアスペクト比選択後に表示される（遅すぎる）

### 原因
- `fetchDraft()`が非同期で実行される
- ドラフトチェック完了を待たずにUIが表示される

### 解決策
`isCheckingDraft`状態を追加し、チェック完了までUIをブロック

```typescript
const [isCheckingDraft, setIsCheckingDraft] = useState(true);

// ドラフトチェック
useEffect(() => {
  const checkDraft = async () => {
    if (user && !draftRestored) {
      await fetchDraft();
    }
    setIsCheckingDraft(false);
  };
  if (user) checkDraft();
}, [user, draftRestored, fetchDraft]);

// アスペクト比選択は !isCheckingDraft && !showDraftRestoreModal の場合のみ表示
```

**修正後のフロー:**
```
ページ読込 → ローディング表示 → fetchDraft()完了 →
  ├─ ドラフトあり → モーダル表示 → 復元 or 破棄
  └─ ドラフトなし → アスペクト比選択UI表示
```

## バグ修正履歴

### 2026-01-08: ゼロ除算問題の修正
**対象ファイル**: `lib/duration-adjuster.ts`

**問題**: `adjustDurationsOnChange`関数で、カットが1つしかない場合に`otherCutCount`が0になり、ゼロ除算が発生していた。

**修正内容**: カットが1つしかない場合の早期リターン処理を追加。
```typescript
if (otherCutCount === 0) {
  return cuts.map((cut) => ({
    ...cut,
    duration: targetTotal,
    video: adjustVideoTrim(cut.video, targetTotal),
  }));
}
```

## 完了日

2026-01-08
