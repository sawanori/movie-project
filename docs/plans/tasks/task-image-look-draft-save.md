# Task: ドラフト自動保存にimage_lookを追加

## タスク概要

アドクリエイターのドラフト自動保存機能に `image_look`（画像ルック/テイスト）を追加し、ページステートとして管理可能にする。

このタスクは実装計画書の **Task 9** と **Task 10** を実行する。

## 実装順序

**重要:** Task 10 → Task 9 の順で実装すること。
- Task 10: `use-auto-save-ad-creator-draft.ts` の変更（先）
- Task 9: `concat/page.tsx` の変更（後）

## Metadata

- **Dependencies（このタスクが依存するもの）:**
  - 実装計画書: `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/image-look-selector-plan.md`
  - Backend API: `AdCreatorDraftMetadata` に `image_look` フィールド追加済み
  - Frontend 型定義: `ImageLook` 型が `@/lib/constants/image-generation` に存在

- **Provides（このタスクが提供するもの）:**
  - `image_look` のドラフト自動保存機能
  - `concat/page.tsx` での `image_look` state管理
  - ドラフト復元時の `image_look` 復元機能

## 実装チェックリスト

### Task 10: use-auto-save-ad-creator-draft.ts の変更

- [ ] **10-1:** `UseAutoSaveAdCreatorDraftOptions` インターフェースに `getImageLook?: () => string | null` を追加
- [ ] **10-2:** `buildDraftMetadata` 関数の返り値オブジェクトに `image_look: options.getImageLook?.() ?? null` を追加

### Task 9: concat/page.tsx の変更

- [ ] **9-1:** `imageLook` state と `imageLookRef` ref を追加（デフォルト値: `"cinematic"`）
- [ ] **9-2:** `imageLookRef` を同期する `useEffect` を追加
- [ ] **9-3:** `useAutoSaveAdCreatorDraft` の呼び出しに `getImageLook: () => imageLookRef.current` を追加
- [ ] **9-4:** ドラフト復元のuseEffect内に `image_look` の復元ロジックを追加

## 実装詳細

### Task 10-1: Options型にgetImageLookを追加

**ファイル:** `/Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/hooks/use-auto-save-ad-creator-draft.ts`

**場所:** `UseAutoSaveAdCreatorDraftOptions` インターフェース（L47-64付近）

**追加内容:**
```typescript
export interface UseAutoSaveAdCreatorDraftOptions {
  /** 自動保存を有効にするかどうか */
  enabled?: boolean;
  /** 自動保存間隔（ミリ秒、デフォルト: 10000） */
  interval?: number;

  // UI状態の取得関数群
  getAspectRatio: () => AspectRatio | null;
  getAdMode: () => 'ai' | 'manual' | null;
  getAdScript: () => AdScriptResponse | null;
  getScriptConfirmed: () => boolean;
  getTargetDuration: () => number | null;
  getStoryboardCuts: () => AdCreatorEditableCut[];
  getSelectedItems: () => AdCreatorSelectableItem[];
  getTrimSettings: () => Record<string, AdCreatorTrimSetting>;
  getTransition: () => string;
  getTransitionDuration: () => number;
  getImageLook?: () => string | null;  // ← 追加
}
```

### Task 10-2: buildDraftMetadataにimage_lookを含める

**ファイル:** `/Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/hooks/use-auto-save-ad-creator-draft.ts`

**場所:** `buildDraftMetadata` 関数（L101-121付近）

**変更内容:**

1. 関数の引数destructuringに `getImageLook` を追加:
```typescript
const {
  enabled = true,
  interval = AUTO_SAVE_INTERVAL,
  getAspectRatio,
  getAdMode,
  getAdScript,
  getScriptConfirmed,
  getTargetDuration,
  getStoryboardCuts,
  getSelectedItems,
  getTrimSettings,
  getTransition,
  getTransitionDuration,
  getImageLook,  // ← 追加
} = options;
```

2. `buildDraftMetadata` 関数内の返り値オブジェクトに追加:
```typescript
const buildDraftMetadata = useCallback((): AdCreatorDraftMetadata => {
  return {
    schema_version: 1,
    aspect_ratio: getAspectRatio() as '9:16' | '16:9' | '1:1' | null,
    ad_mode: getAdMode(),
    ad_script: getAdScript(),
    script_confirmed: getScriptConfirmed(),
    storyboard_cuts: getStoryboardCuts(),
    target_duration: getTargetDuration(),
    selected_items: getSelectedItems(),
    trim_settings: getTrimSettings(),
    transition: getTransition(),
    transition_duration: getTransitionDuration(),
    image_look: getImageLook?.() ?? null,  // ← 追加
    last_saved_at: null,
    auto_saved: true,
  };
}, [
  getAspectRatio, getAdMode, getAdScript, getScriptConfirmed, getTargetDuration,
  getStoryboardCuts, getSelectedItems, getTrimSettings,
  getTransition, getTransitionDuration,
  getImageLook,  // ← 依存配列に追加
]);
```

---

### Task 9-1: image_look の state と ref を追加

**ファイル:** `/Users/noritakasawada/AI_P/practice/movie-project/movie-maker/app/concat/page.tsx`

**場所:** 他のstate宣言エリア（L100-250付近で、`selectedAspectRatio`, `adMode` などの state が定義されている箇所）

**追加内容:**
```typescript
// 画像ルック/テイスト（cinematic, realistic, anime等）
const [imageLook, setImageLook] = useState<string>("cinematic");
const imageLookRef = useRef<string>("cinematic");
```

### Task 9-2: imageLookRefの同期useEffectを追加

**場所:** 他のrefの同期useEffectの近く

**追加内容:**
```typescript
// imageLookRef の同期
useEffect(() => {
  imageLookRef.current = imageLook;
}, [imageLook]);
```

### Task 9-3: useAutoSaveAdCreatorDraftにgetter提供

**場所:** `useAutoSaveAdCreatorDraft` の呼び出し箇所（L266付近）

**変更内容:** オプションオブジェクトに `getImageLook` を追加
```typescript
const {
  saveStatus,
  lastSavedAt,
  draftRestored,
  restoredDraft,
  draftExistsInfo,
  saveDraft,
  clearDraft,
  markDraftRestored,
  checkDraftExists,
  fetchDraft,
} = useAutoSaveAdCreatorDraft({
  enabled: false,
  getAspectRatio: () => selectedAspectRatio,
  getAdMode: () => adMode,
  getAdScript: () => adScript,
  getScriptConfirmed: () => scriptConfirmed,
  getTargetDuration: () => targetDuration,
  getStoryboardCuts: () => storyboardCuts.map((cut) => ({
    // ...既存のマッピング
  })),
  getSelectedItems: () => selectedItems.map((item) => ({
    // ...既存のマッピング
  })),
  getTrimSettings: () => trimSettings,
  getTransition: () => transition,
  getTransitionDuration: () => transitionDuration,
  getImageLook: () => imageLookRef.current,  // ← 追加
});
```

### Task 9-4: ドラフト復元時にimage_lookを読み取り

**場所:** ドラフト復元のuseEffect（L853-880付近、`restoredDraft`を使用している箇所）

**追加内容:** 既存の復元ロジック（`draft.aspect_ratio`, `draft.ad_mode`, `draft.ad_script`）の後に追加
```typescript
// restoredDraftが設定されたら実際の復元処理を実行
useEffect(() => {
  if (!restoredDraft || !isRestoring) return;

  const draft = restoredDraft.draft_metadata;

  // アスペクト比を復元
  if (draft.aspect_ratio) {
    setSelectedAspectRatio(draft.aspect_ratio);
  }

  // モードを復元
  if (draft.ad_mode) {
    setAdMode(draft.ad_mode);
  }

  // AI脚本を復元
  if (draft.ad_script) {
    setAdScript(draft.ad_script);
  }

  // 脚本確認フラグを復元
  setScriptConfirmed(draft.script_confirmed);

  // CM目標尺を復元
  if (draft.target_duration !== undefined && draft.target_duration !== null) {
    setTargetDuration(draft.target_duration);
  }

  // 画像ルック/テイストを復元（旧ドラフトはnull → "cinematic"にフォールバック）
  if (draft.image_look) {
    setImageLook(draft.image_look);
  }

  // ... 残りの復元処理
}, [restoredDraft, isRestoring]);
```

## 重要な注意事項

### コード探索について
- `concat/page.tsx` は約2500行の非常に大きなファイル
- 変更箇所を正確に特定すること（Grepツールを活用）
- 既存のコードパターン（`getAspectRatio`, `getAdMode` 等のgetter）に合わせること

### 既存パターンに従う
- state管理: 既存の `selectedAspectRatio`, `adMode` と同じパターン
- ref同期: 既存の ref同期 useEffect と同じパターン
- getter関数: 既存の `getAspectRatio: () => selectedAspectRatio` パターンを使用
- ドラフト復元: 既存の `draft.aspect_ratio` 復元ロジックと同じパターン

### TypeScript型の正確性
- `imageLook` の型は `string`（`ImageLook` 型は使わない、後で統一予定）
- `getImageLook` の返り値型は `string | null`
- `AdCreatorDraftMetadata` の `image_look` フィールドは既にバックエンドで定義済み

### フォールバック動作
- 旧ドラフト（`image_look` なし）: 復元時にフォールバックしない（`if (draft.image_look)` で条件チェック）
- デフォルト値は state初期化時の `"cinematic"` で保証される

## 動作確認方法

### 確認項目

1. **自動保存の確認:**
   - `concat/page.tsx` で `imageLook` state を変更
   - 10秒後にドラフトが保存されること
   - ブラウザDevToolsのNetworkタブで `POST /api/v1/ad-creator/draft` のリクエストボディに `image_look: "cinematic"` が含まれること

2. **ドラフト復元の確認:**
   - ドラフトを保存した状態でページをリロード
   - `imageLook` state が保存された値で復元されること

3. **旧ドラフト互換性の確認:**
   - `image_look` フィールドがない旧ドラフトをロード
   - エラーにならず、`imageLook` state がデフォルト値 `"cinematic"` になること

### テストコマンド（参考）

```bash
# 型チェック
npm run type-check

# ビルド確認
npm run build

# 開発サーバー起動
npm run dev
```

## 成功基準

- [ ] TypeScript型エラーがないこと
- [ ] ビルドが成功すること
- [ ] `imageLook` state の変更がドラフトに保存されること
- [ ] ドラフト復元時に `image_look` が正しく復元されること
- [ ] 旧ドラフト（`image_look` なし）でもエラーが発生しないこと

## 参照ドキュメント

- **実装計画書:** `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/image-look-selector-plan.md`
  - Task 9, 10 の詳細仕様
- **既存コード:**
  - `use-auto-save-ad-creator-draft.ts`: 既存のgetter関数パターン
  - `concat/page.tsx`: 既存のstate管理・ドラフト復元パターン
