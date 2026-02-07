# シーン追加機能 実装計画書

## 概要

動画プレビュー（review）ステップから新しいシーンを追加できる機能を実装する。
追加されたシーンは末尾に配置され、既存のドラッグ&ドロップ機能で任意の位置に移動可能。

## 事前確認結果

### DBスキーマ確認
- **マイグレーション**: 不要（既存スキーマで対応可能）
- `display_order`カラム: 存在（001_add_display_order.sql で追加済み）
- `scene_number`制約: 1-16まで許可（20241225_sub_scenes.sql で拡張済み）
- `act`カラム: 文字列型で "custom" を含む任意の値を格納可能

### API確認
| API | エンドポイント | 状態 |
|-----|---------------|------|
| シーン追加 | `POST /storyboard/{id}/scenes` | ✅ 実装済み |
| シーン画像生成 | `POST /storyboard/{id}/scenes/{num}/regenerate-image` | ✅ 実装済み |
| シーン動画生成 | `POST /storyboard/{id}/scenes/{num}/regenerate-video` | ✅ 実装済み |

### 発見した問題点と対応
| 問題 | 対応 |
|------|------|
| `actLabels`に"custom"がない | "custom"エントリを追加（灰色バッジ） |
| 画像なしシーンの表示処理がない | 「画像を生成」ボタンを表示する分岐追加 |
| 動画なしシーンの表示処理がない | 「動画を生成」ボタンを表示する分岐追加 |

## 現状分析

### 既存API
```typescript
// lib/api/client.ts
storyboardApi.addScene(
  storyboardId: string,
  data: {
    description_ja: string;
    custom_image_url?: string;
  }
): Promise<{
  scene: StoryboardScene;
  scenes: StoryboardScene[];
}>
```

### 既存機能
- シーン削除機能: 実装済み
- シーン並び替え（D&D）: 実装済み
- シーン動画再生成: 実装済み
- シーン画像差し替え: 実装済み

## UI設計

### 1. シーン追加ボタン（グリッド末尾）

```
┌──────────────────────────────────────────────────────────────────┐
│  #1 起      #2 承      #3 転      #4 結      ┌─────────────┐    │
│  [動画]     [動画]     [動画]     [動画]     │    ＋       │    │
│  [トリム]   [トリム]   [トリム]   [トリム]   │ シーンを追加 │    │
│                                              └─────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

追加ボタンのデザイン:
- 他のシーンカードと同じサイズ
- 点線ボーダー + 中央に「+」アイコン
- ホバー時にハイライト

### 2. シーン追加モーダル

```
┌─────────────────────────────────────────────────────┐
│  ✕                                                  │
│                                                     │
│  新しいシーンを追加                                  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  シーンの説明（日本語）*                             │
│  ┌───────────────────────────────────────────────┐ │
│  │ このシーンで何が起こるか説明してください...     │ │
│  │                                               │ │
│  │                                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  カスタム画像（任意）                               │
│  ┌───────────────────────────────────────────────┐ │
│  │  📷 画像をアップロード                         │ │
│  │  または既存のシーン画像を使用                  │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│           [キャンセル]  [シーンを追加]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 3. 追加されたシーンカードの状態

```
┌─────────────────────┐
│  #5 extension       │
│  ┌───────────────┐  │
│  │   画像なし    │  │  ← 初期状態: 画像・動画なし
│  │   🖼️ 生成    │  │
│  └───────────────┘  │
│                     │
│  説明文...          │
│                     │
│  [画像を生成]       │  ← 手動生成ボタン
└─────────────────────┘

↓ 画像生成後

┌─────────────────────┐
│  #5 extension       │
│  ┌───────────────┐  │
│  │    [画像]     │  │
│  └───────────────┘  │
│                     │
│  説明文...          │
│                     │
│  [動画を生成]       │  ← 動画生成ボタン
└─────────────────────┘

↓ 動画生成後

┌─────────────────────┐
│  #5 extension       │
│  ┌───────────────┐  │
│  │    [動画]     │  │  ← 通常のシーンカードと同じ
│  │   プレビュー   │  │
│  └───────────────┘  │
│  [トリムスライダー]  │
│  [再生成] [I2V/V2V] │
└─────────────────────┘
```

## 処理フロー

```
┌─────────────────┐
│ ユーザーが「+」  │
│ ボタンをクリック │
└────────┬────────┘
         ▼
┌─────────────────┐
│ モーダル表示     │
│ (説明入力)       │
└────────┬────────┘
         ▼
┌─────────────────┐
│ 「追加」クリック  │
└────────┬────────┘
         ▼
┌─────────────────┐
│ addScene API    │──→ scene追加（画像・動画なし）
│ 呼び出し         │
└────────┬────────┘
         ▼
┌─────────────────┐
│ storyboard更新  │──→ 新シーンがグリッドに表示
│ モーダルを閉じる │
└────────┬────────┘
         ▼
┌─────────────────┐
│ D&Dで位置調整   │──→ ユーザーが任意の位置に移動
│ （任意）        │
└────────┬────────┘
         ▼
┌─────────────────┐
│「画像を生成」    │──→ 手動でクリック
│ ボタンクリック   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ 画像生成API     │──→ シーン画像を生成
│ 呼び出し        │
└────────┬────────┘
         ▼
┌─────────────────┐
│「動画を生成」    │──→ 手動でクリック
│ ボタンクリック   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ 動画生成API     │──→ シーン動画を生成
│ 呼び出し        │
└────────┬────────┘
         ▼
┌─────────────────┐
│ 通常のシーンと   │
│ 同様に操作可能   │
└─────────────────┘
```

## 実装タスク

### Phase 1: State & モーダル追加

**ファイル**: `app/generate/storyboard/page.tsx`

#### 1.1 State追加
```typescript
// シーン追加モーダル
const [showAddSceneModal, setShowAddSceneModal] = useState(false);
const [newSceneDescription, setNewSceneDescription] = useState("");
const [newSceneImageFile, setNewSceneImageFile] = useState<File | null>(null);
const [newSceneImagePreview, setNewSceneImagePreview] = useState<string | null>(null);
const [addingScene, setAddingScene] = useState(false);

// シーンごとの画像/動画生成状態
const [generatingSceneImage, setGeneratingSceneImage] = useState<string | null>(null);
const [generatingSceneVideo, setGeneratingSceneVideo] = useState<string | null>(null);
```

#### 1.2 ハンドラ追加
```typescript
// シーン追加ハンドラ
const handleAddScene = async () => {
  if (!storyboard || !newSceneDescription.trim()) return;

  try {
    setAddingScene(true);

    let customImageUrl: string | undefined;

    // カスタム画像がある場合はアップロード
    if (newSceneImageFile) {
      const uploadRes = await videosApi.uploadImage(newSceneImageFile);
      customImageUrl = uploadRes.image_url;
    }

    // シーン追加API呼び出し
    const result = await storyboardApi.addScene(storyboard.id, {
      description_ja: newSceneDescription,
      custom_image_url: customImageUrl,
    });

    // storyboard更新
    setStoryboard(prev => prev ? {
      ...prev,
      scenes: result.scenes,
    } : null);

    // モーダルを閉じてリセット
    setShowAddSceneModal(false);
    setNewSceneDescription("");
    setNewSceneImageFile(null);
    setNewSceneImagePreview(null);

  } catch (error) {
    console.error("Failed to add scene:", error);
    alert("シーンの追加に失敗しました");
  } finally {
    setAddingScene(false);
  }
};

// シーン画像生成ハンドラ（手動）
const handleGenerateSceneImage = async (sceneId: string) => {
  if (!storyboard) return;

  const scene = storyboard.scenes.find(s => s.id === sceneId);
  if (!scene) return;

  try {
    setGeneratingSceneImage(sceneId);

    // 画像生成API呼び出し
    const result = await storyboardApi.generateSceneImage(
      storyboard.id,
      scene.scene_number
    );

    // storyboard更新
    setStoryboard(prev => prev ? {
      ...prev,
      scenes: prev.scenes.map(s =>
        s.id === sceneId ? { ...s, scene_image_url: result.scene_image_url } : s
      ),
    } : null);

  } catch (error) {
    console.error("Failed to generate scene image:", error);
    alert("画像の生成に失敗しました");
  } finally {
    setGeneratingSceneImage(null);
  }
};

// シーン動画生成ハンドラ（手動）
const handleGenerateSceneVideo = async (sceneId: string) => {
  if (!storyboard) return;

  const scene = storyboard.scenes.find(s => s.id === sceneId);
  if (!scene) return;

  try {
    setGeneratingSceneVideo(sceneId);

    // 動画再生成API呼び出し（新規生成と同じ）
    await storyboardApi.regenerateVideo(storyboard.id, scene.scene_number);

    // ポーリング開始
    pollSceneVideoStatus(scene.scene_number);

  } catch (error) {
    console.error("Failed to generate scene video:", error);
    alert("動画の生成に失敗しました");
    setGeneratingSceneVideo(null);
  }
};
```

### Phase 2: UI実装

#### 2.1 追加ボタン（グリッド末尾）

シーングリッドの末尾に追加ボタンカードを配置:

```tsx
{/* Add Scene Button Card */}
<div
  onClick={() => setShowAddSceneModal(true)}
  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 transition-colors hover:border-purple-400 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-purple-500 dark:hover:bg-purple-900/20"
  style={{ minHeight: '300px' }}
>
  <Plus className="h-12 w-12 text-zinc-400" />
  <span className="mt-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
    シーンを追加
  </span>
</div>
```

#### 2.2 追加モーダル

```tsx
{/* Add Scene Modal */}
{showAddSceneModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">新しいシーンを追加</h3>
        <button
          onClick={() => {
            setShowAddSceneModal(false);
            setNewSceneDescription("");
            setNewSceneImageFile(null);
            setNewSceneImagePreview(null);
          }}
          className="text-zinc-400 hover:text-zinc-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Description Input */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          シーンの説明（日本語）<span className="text-red-500">*</span>
        </label>
        <textarea
          value={newSceneDescription}
          onChange={(e) => setNewSceneDescription(e.target.value)}
          placeholder="このシーンで何が起こるか説明してください..."
          className="h-24 w-full rounded-lg border border-zinc-300 p-3 text-sm focus:border-purple-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      {/* Custom Image Upload (Optional) */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          カスタム画像（任意）
        </label>
        {newSceneImagePreview ? (
          <div className="relative">
            <img
              src={newSceneImagePreview}
              alt="Preview"
              className="h-32 w-full rounded-lg object-cover"
            />
            <button
              onClick={() => {
                setNewSceneImageFile(null);
                setNewSceneImagePreview(null);
              }}
              className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 p-4 hover:border-purple-400 dark:border-zinc-700">
            <Upload className="h-8 w-8 text-zinc-400" />
            <span className="mt-1 text-xs text-zinc-500">画像をアップロード</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setNewSceneImageFile(file);
                  const reader = new FileReader();
                  reader.onload = () => setNewSceneImagePreview(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </label>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setShowAddSceneModal(false);
            setNewSceneDescription("");
            setNewSceneImageFile(null);
            setNewSceneImagePreview(null);
          }}
          className="flex-1"
        >
          キャンセル
        </Button>
        <Button
          onClick={handleAddScene}
          disabled={!newSceneDescription.trim() || addingScene}
          className="flex-1 bg-purple-600 hover:bg-purple-700"
        >
          {addingScene ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              追加中...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              シーンを追加
            </>
          )}
        </Button>
      </div>
    </div>
  </div>
)}
```

#### 2.3 シーンカードの生成ボタン

画像・動画がないシーン用の生成ボタンをシーンカード内に追加:

```tsx
{/* 画像がない場合: 画像生成ボタン */}
{!scene.scene_image_url && !scene.video_url && (
  <div className="mb-3 flex flex-col items-center justify-center rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
    <ImageIcon className="h-8 w-8 text-zinc-400" />
    <Button
      size="sm"
      onClick={() => handleGenerateSceneImage(scene.id)}
      disabled={generatingSceneImage !== null}
      className="mt-2"
    >
      {generatingSceneImage === scene.id ? (
        <>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          生成中...
        </>
      ) : (
        <>
          <Sparkles className="mr-1 h-3 w-3" />
          画像を生成
        </>
      )}
    </Button>
  </div>
)}

{/* 画像はあるが動画がない場合: 動画生成ボタン */}
{scene.scene_image_url && !scene.video_url && (
  <div className="mb-3">
    <img
      src={scene.scene_image_url}
      alt={`Scene ${scene.display_order}`}
      className="mb-2 aspect-[9/16] w-full rounded-lg object-cover"
    />
    <Button
      size="sm"
      onClick={() => handleGenerateSceneVideo(scene.id)}
      disabled={generatingSceneVideo !== null}
      className="w-full"
    >
      {generatingSceneVideo === scene.id ? (
        <>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          生成中...
        </>
      ) : (
        <>
          <Video className="mr-1 h-3 w-3" />
          動画を生成
        </>
      )}
    </Button>
  </div>
)}
```

### Phase 3: バックエンド確認

#### 3.1 必要なAPIエンドポイント確認（全て実装済み）

| API | エンドポイント | 状態 | 用途 |
|-----|---------------|------|------|
| シーン追加 | `POST /storyboard/{id}/scenes` | ✅ 実装済み | 新規シーン追加 |
| 画像生成 | `POST /storyboard/{id}/scenes/{num}/regenerate-image` | ✅ 実装済み | シーン画像生成 |
| 動画生成 | `POST /storyboard/{id}/scenes/{num}/regenerate-video` | ✅ 実装済み | シーン動画生成 |

**注意**: `regenerate-image`は「再生成」という名前だが、新規シーンの画像生成にも使用可能。

#### 3.2 DBマイグレーション

**マイグレーション不要**: 既存のスキーマで対応可能
- `display_order`カラム: 存在（001_add_display_order.sql）
- `scene_number`制約: 1-16まで許可（20241225_sub_scenes.sql）
- `act`カラム: "custom"を含む任意の文字列を格納可能

### Phase 4: トリム設定対応

新しく追加されたシーンの動画が生成されたら、トリム設定を自動初期化:

```typescript
// 動画生成完了後のコールバック内で
useEffect(() => {
  // 新しく動画が追加されたシーンのトリム設定を初期化
  if (storyboard && step === 'review') {
    for (const scene of storyboard.scenes) {
      if (scene.video_url && !sceneTrimSettings[scene.id]) {
        // duration取得してトリム設定を初期化
        getVideoDuration(scene.video_url).then(duration => {
          setSceneTrimSettings(prev => ({
            ...prev,
            [scene.id]: {
              startTime: 0,
              endTime: duration,
              duration: duration,
            },
          }));
        });
      }
    }
  }
}, [storyboard?.scenes]);
```

## テスト項目

### 機能テスト

- [ ] 「+」ボタンクリックでモーダルが開く
- [ ] 説明未入力で「追加」ボタンが無効化される
- [ ] シーン追加後、グリッド末尾に新シーンが表示される
- [ ] 追加されたシーンがドラッグ&ドロップで移動可能
- [ ] 「画像を生成」ボタンで画像が生成される
- [ ] 「動画を生成」ボタンで動画が生成される
- [ ] 動画生成後、トリムスライダーが表示される
- [ ] カスタム画像アップロードが正常に動作する

### エッジケース

- [ ] シーン追加中に他の操作（削除、並び替え）が無効化される
- [ ] 画像生成中/動画生成中のシーンは適切にローディング表示
- [ ] ネットワークエラー時のエラーハンドリング
- [ ] 最大シーン数の制限（必要に応じて）

### UI/UX

- [ ] モーダルのアニメーション
- [ ] 追加ボタンのホバーエフェクト
- [ ] 生成中のプログレス表示
- [ ] レスポンシブ対応（モバイル表示）

## 実装順序

1. **Phase 1**: State & ハンドラ追加（30分）
2. **Phase 2**: UI実装（1時間）
   - 2.1 追加ボタン
   - 2.2 モーダル
   - 2.3 生成ボタン
3. **Phase 3**: バックエンド確認/実装（必要に応じて）
4. **Phase 4**: トリム設定対応（15分）
5. **Phase 5**: テスト実施（30分）

## 備考

- act（起承転結）は追加シーンでは「extension」または「development」を使用
- 既存のD&D機能は修正不要（追加シーンも自動的に対応）
- Supabaseマイグレーションは不要（既存のscenesテーブルを使用）
