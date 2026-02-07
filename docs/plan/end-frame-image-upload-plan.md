# 生成画面での2枚目画像（終了フレーム）アップロード機能 実装計画書

## 概要

生成画面（uploadステップ）で、動画の終了フレームとなる2枚目の画像をアップロードできるようにする機能を実装する。

### 現状

現在、終了フレーム画像の設定は以下の場所でのみ可能:
1. **シーンカード内**（editステップ、Kling AI選択時、シーン画像生成後）
2. **再生成モーダル内**（Kling AI選択時）

**問題点**: 初回の生成時（uploadステップ）には2枚目の画像を設定するUIがない

### 要望

uploadステップ（最初の画像アップロード画面）で、2枚目の画像も一緒にアップロードできるようにしたい。

---

## システムフローの整理

### 画面遷移フロー

```
uploadステップ → moodステップ → editステップ → generatingステップ → review/completed
     ↓               ↓              ↓                 ↓
  画像UP         ムード選択      シーン編集        動画生成実行
  プロバイダー選択              画像生成
  (2枚目画像UP)                 (2枚目画像個別設定)
```

### API呼び出しタイミング

| API | 呼び出しタイミング | 終了フレーム関連 |
|-----|-----------------|----------------|
| `storyboardApi.create` | moodステップ完了時 | **受け付けない** |
| `storyboardApi.generateImages` | editステップで画像生成時 | 関係なし |
| `storyboardApi.generate` | 動画生成開始時 | `scene_end_frame_images`を受け付ける |

**重要**: 終了フレーム画像は`storyboardApi.generate`（動画生成開始API）に渡す必要がある。

---

## 技術仕様

### バックエンドAPI（既存・変更不要）

```python
# movie-maker-api/app/videos/schemas.py
class StoryboardGenerateRequest(BaseModel):
    scene_end_frame_images: dict[int, str] | None = Field(
        None,
        description="シーンごとの終了フレーム画像URL {scene_number: url}。Kling専用オプション"
    )
```

### フロントエンド状態（既存）

```typescript
// movie-maker/app/generate/storyboard/page.tsx
const [sceneEndFrameImages, setSceneEndFrameImages] = useState<Record<number, string>>({});
const [sceneEndFrameUploading, setSceneEndFrameUploading] = useState<Record<number, boolean>>({});
```

### 既存の動画生成開始処理

```typescript
// handleStartGeneration関数内
await storyboardApi.generate(storyboard.id, {
  // ...
  scene_end_frame_images: videoProvider === 'piapi_kling' && Object.keys(sceneEndFrameImages).length > 0
    ? sceneEndFrameImages
    : undefined,
});
```

---

## 実装計画

### Phase 1: uploadステップに初期終了フレーム画像設定UIを追加

#### 1.1 新規状態変数の追加

```typescript
// 初期の終了フレーム画像（全シーン共通のデフォルト値として使用）
const [initialEndFrameImageUrl, setInitialEndFrameImageUrl] = useState<string | null>(null);
const [initialEndFrameImagePreview, setInitialEndFrameImagePreview] = useState<string | null>(null);
const [initialEndFrameUploading, setInitialEndFrameUploading] = useState(false);
```

#### 1.2 uploadステップにUI追加

**追加場所**: `movie-maker/app/generate/storyboard/page.tsx`
**表示条件**: `imagePreview`が存在し、かつ`videoProvider === 'piapi_kling'`の場合

```tsx
{/* 終了フレーム画像（Kling AI選択時のみ） */}
{imagePreview && videoProvider === 'piapi_kling' && (
  <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
    <div className="flex items-center gap-2 mb-2">
      <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        終了フレーム画像
      </h4>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        （オプション）
      </span>
    </div>
    <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
      2枚目の画像を指定すると、全シーンで開始画像から終了画像への遷移動画を生成します
    </p>
    {/* アップロードUI（省略）*/}
  </div>
)}
```

#### 1.3 終了フレーム画像アップロードハンドラの実装

```typescript
const handleEndFrameImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください");
    return;
  }

  // プレビュー表示
  const reader = new FileReader();
  reader.onload = (event) => {
    setInitialEndFrameImagePreview(event.target?.result as string);
  };
  reader.readAsDataURL(file);

  // R2へアップロード
  setInitialEndFrameUploading(true);
  try {
    const uploadRes = await videosApi.uploadImage(file);
    setInitialEndFrameImageUrl(uploadRes.image_url);
  } catch (error) {
    console.error('Failed to upload end frame image:', error);
    alert('終了フレーム画像のアップロードに失敗しました');
    setInitialEndFrameImagePreview(null);
  } finally {
    setInitialEndFrameUploading(false);
  }
};
```

### Phase 2: editステップ遷移時に全シーンへ適用

#### 2.1 editステップ遷移のタイミング

ストーリーボード作成完了後（`handleGenerateStoryboard`内）にeditステップに遷移する際、
初期終了フレーム画像を全シーンに適用する。

```typescript
// handleGenerateStoryboard関数内
const handleGenerateStoryboard = async () => {
  // ... 既存のストーリーボード作成処理 ...

  const sb = await storyboardApi.create(uploadedImageUrl, moodText, videoProvider, aspectRatio);
  setStoryboard(sb);

  // 初期終了フレーム画像が設定されている場合、親シーンのみに適用
  if (initialEndFrameImageUrl && videoProvider === 'piapi_kling') {
    const endFrameImages: Record<number, string> = {};
    sb.scenes
      .filter(scene => !scene.parent_scene_id)  // 親シーンのみ
      .forEach(scene => {
        endFrameImages[scene.scene_number] = initialEndFrameImageUrl;
      });
    setSceneEndFrameImages(endFrameImages);
  }

  setStep("edit");
};
```

#### 2.2 サブシーン追加時の考慮

サブシーンが追加された場合、初期終了フレーム画像は自動適用**しない**。
（理由: サブシーンは親シーンの最終フレームを入力とするため、終了フレーム指定の意図と異なる可能性がある）

ユーザーが必要に応じて、editステップで個別に設定可能。

### Phase 3: 状態の永続化とリセット

#### 3.1 プロバイダー切り替え時のリセット

uploadステップでプロバイダーを切り替えた場合、終了フレーム画像をクリア。

**実装方法**: 新しいハンドラ関数を作成し、既存のボタンの`onClick`を変更する:

```typescript
// 新規追加
const handleProviderChange = (newProvider: 'runway' | 'veo' | 'domoai' | 'piapi_kling') => {
  setVideoProvider(newProvider);

  // Kling AI以外に切り替えた場合、終了フレーム画像をクリア
  if (newProvider !== 'piapi_kling') {
    setInitialEndFrameImageUrl(null);
    setInitialEndFrameImagePreview(null);
  }
};
```

**既存コードの変更箇所**（3箇所）:
```tsx
// 変更前
<button onClick={() => setVideoProvider('runway')}>

// 変更後
<button onClick={() => handleProviderChange('runway')}>
```

#### 3.2 「戻る」ボタン押下時の状態保持

moodステップからuploadステップに戻った場合、設定済みの終了フレーム画像は保持する。
（既存のimagePreview保持と同様の動作）

#### 3.3 editステップでの個別上書き

editステップで各シーンの終了フレーム画像を個別に設定・削除可能（既存機能）。
初期設定を上書きする形となる。

#### 3.4 既存ストーリーボード復元時の動作

URLパラメータから既存のストーリーボードを読み込む場合やドラフト復元時:
- `initialEndFrameImageUrl`は**復元されない**（uploadステップ専用の一時的な値のため）
- `sceneEndFrameImages`は**ドラフトから復元される**（今回の修正後）

これは意図した動作。`initialEndFrameImageUrl`は新規作成フローでのみ使用される。

---

## 重要な設計判断

### 1. 終了フレーム画像の適用タイミング

| 選択肢 | 説明 | 採用 |
|-------|------|-----|
| A: editステップ遷移時に適用 | ストーリーボード作成直後に`sceneEndFrameImages`に設定 | **採用** |
| B: 動画生成開始時に適用 | `handleStartGeneration`内で初期値をマージ | 不採用 |

**理由**: 選択肢Aの方が、editステップで終了フレーム画像の設定状況をユーザーが視覚的に確認・編集できる。

### 2. サブシーンへの適用

| 選択肢 | 説明 | 採用 |
|-------|------|-----|
| A: サブシーンにも自動適用 | すべてのシーンに同じ終了フレームを設定 | 不採用 |
| B: サブシーンには適用しない | 親シーン（起承転結）のみに適用 | **採用** |

**理由**: サブシーンは親シーンの続きを表現するため、同じ終了フレームを設定するのは不自然。

### 3. 既存シーン終了フレーム設定との優先度

```
初期設定（uploadステップ） < 個別設定（editステップ）
```

editステップで個別に設定した終了フレーム画像が優先される。

---

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker/app/generate/storyboard/page.tsx` | 状態変数追加、uploadステップUI追加、`handleGenerateStoryboard`修正、ドラフト復元処理追加 |
| `movie-maker/lib/hooks/use-auto-save-draft.ts` | `getSceneEndFrameImages`追加、`buildDraftMetadata`修正 |
| `movie-maker/lib/api/client.ts` | `DraftMetadata`型に`scene_end_frame_images`追加 |

### バックエンド変更

**なし** - 既存のAPIで対応可能（`draft_metadata`はJSON型のため、スキーマ変更不要）

---

## テスト項目

### 機能テスト

1. [ ] Kling AI選択時のみ終了フレーム画像アップロードUIが表示される
2. [ ] 他のプロバイダー（Runway, Veo）選択時はUIが非表示
3. [ ] 画像アップロードが正常に動作する
4. [ ] アップロード中のローディング表示が正しく動作する
5. [ ] アップロードした画像の削除が正常に動作する
6. [ ] ストーリーボード作成後、全シーン（親シーンのみ）に終了フレーム画像が適用される
7. [ ] editステップで各シーンの終了フレーム画像が表示される
8. [ ] editステップで終了フレーム画像を個別に変更・削除できる
9. [ ] 動画生成開始時に`scene_end_frame_images`が正しく送信される

### エッジケース

1. [ ] 終了フレーム画像なしでの生成が正常に動作する
2. [ ] プロバイダー切り替え時に終了フレーム画像の状態がクリアされる
3. [ ] 画像アップロード失敗時のエラーハンドリング
4. [ ] moodステップから戻った際に終了フレーム画像が保持される
5. [ ] サブシーン追加後も親シーンの終了フレーム画像は維持される
6. [ ] 既存のストーリーボード復元時（ドラフト読み込み時）の動作

### 回帰テスト

1. [ ] 既存のeditステップでの終了フレーム画像設定が正常に動作する
2. [ ] 再生成モーダルでの終了フレーム画像設定が正常に動作する
3. [ ] Kling AI以外のプロバイダーでの動画生成が正常に動作する

---

## 潜在的な問題点と対策

### 1. アスペクト比の不一致

**問題**: 終了フレーム画像が開始画像と異なるアスペクト比の場合、動画生成結果が不自然になる可能性

**対策（Phase 4で検討）**:
- 終了フレーム画像にも同じアスペクト比でクロッピングを適用
- または、アスペクト比が異なる場合に警告を表示

### 2. 大量のシーンがある場合

**問題**: サブシーンを多数追加した場合、親シーンの特定が複雑になる

**対策**:
- `parent_scene_id`がnullのシーンのみに初期終了フレーム画像を適用
- 既存コードでは`!scene.parent_scene_id`で親シーンを判定済み

### 3. ドラフト保存・復元（重要）

**問題**: `sceneEndFrameImages`（シーンごとの終了フレーム画像）は現在ドラフト保存の対象外

**影響**:
- ページリロード時に終了フレーム画像の設定がすべて失われる
- これは既存機能（editステップでの個別設定）にも影響する問題

**対策**:
| 方法 | 内容 | 採用 |
|-----|------|-----|
| A: 本機能と同時に修正 | `useAutoSaveDraft`に`sceneEndFrameImages`を追加 | **推奨** |
| B: 将来の改善として延期 | 初期実装では対応せず | 不採用 |

**方法Aの実装（推奨）**:

1. `lib/hooks/use-auto-save-draft.ts`の修正:
```typescript
// UseAutoSaveDraftOptions に追加
getSceneEndFrameImages: () => Record<number, string>;

// buildDraftMetadata 内に追加
scene_end_frame_images: convertNumberKeysToString(getSceneEndFrameImages()),
```

2. `lib/api/client.ts`の`DraftMetadata`型に追加:
```typescript
scene_end_frame_images?: Record<string, string>;
```

3. `storyboard/page.tsx`の`restoreDraftState`関数内に追加（約430行目付近）:
```typescript
// 終了フレーム画像の復元（既存の「その他の設定復元」セクションの前に追加）
if (draft.scene_end_frame_images) {
  setSceneEndFrameImages(convertStringKeysToNumber(draft.scene_end_frame_images));
}
```

4. `storyboard/page.tsx`の`useAutoSaveDraft`呼び出しに追加（約320行目付近）:
```typescript
// 既存のgetVideoModes等と同じ形式で追加
getSceneEndFrameImages: useCallback(() => sceneEndFrameImages, [sceneEndFrameImages]),
```

---

## UI/UXの注意点

1. **条件付き表示**: Kling AI選択時のみ表示し、UIの複雑さを抑える
2. **オプション明示**: 「オプション」ラベルを表示し、必須ではないことを明確にする
3. **説明テキスト**: 「全シーンで」適用されることを明記
4. **視覚的フィードバック**: アップロード中、成功/失敗時に適切なフィードバックを提供
5. **開始画像との並列表示**: 開始画像と終了フレーム画像を並べて表示し、遷移のイメージを伝える

---

## 実装優先度

**高** - ユーザーから直接の要望があり、既存のバックエンドAPIで対応可能

---

## 参考コード

### 既存の終了フレーム画像アップロードUI（シーンカード内）

```tsx
// movie-maker/app/generate/storyboard/page.tsx:2877-2944
{/* 終了フレーム画像（Kling専用オプション、画像生成後に表示） */}
{allScenesHaveImages && videoProvider === 'piapi_kling' && (
  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs text-zinc-500">終了フレーム:</span>
      <span className="text-[10px] text-zinc-400">(オプション)</span>
    </div>
    {/* ... */}
  </div>
)}
```

この既存実装を参考に、uploadステップにも同様のUIを追加する。

---

## 更新履歴

- v1.0: 初版作成
- v1.1: レビュー後の修正
  - APIタイミングの誤りを修正（`storyboardApi.create`→`storyboardApi.generate`）
  - シーン適用タイミングをeditステップ遷移時に変更
  - サブシーンへの適用方針を明確化
  - プロバイダー切り替え時のリセット処理を追加
  - 潜在的な問題点と対策を追加
- v1.2: ドラフト保存問題の発見と対策追加
  - `sceneEndFrameImages`がドラフト保存対象外である問題を発見
  - ドラフト保存対応の実装方針を追加
  - 影響範囲に`use-auto-save-draft.ts`と`client.ts`を追加
- v1.3: 実装詳細の追記
  - プロバイダー切り替え時の既存ボタン変更箇所を明記（3箇所）
  - 既存ストーリーボード復元時の動作を明記
  - ドラフト復元処理の追加箇所（`restoreDraftState`、`useAutoSaveDraft`呼び出し）を詳細化
