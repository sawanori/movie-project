# 動画再生成時のプロンプト編集機能 実装指示書

## 概要

動画プレビュー画面（review step）で動画を再生成する際に、プロンプトを編集できるようにする。
編集したプロンプトはDBに保存し、次回以降の再生成でも反映される。

## 現状の仕組み

### リファレンス（参照元）
再生成時は以下を参照して動画を生成している：
- **画像**: `scene_image_url`（シーン画像）
- **プロンプト**: `runway_prompt`（DB保存済み）← **現在は修正不可**
- **カメラワーク**: `camera_work`（DB保存済み）

※修正前の動画は参照していない（毎回シーン画像＋プロンプトから新規生成）

### 該当コード
- バックエンド: `movie-maker-api/app/tasks/storyboard_processor.py` L460-467
- フロントエンド: `movie-maker/app/generate/storyboard/page.tsx` L499-536

---

## 実装内容

### 1. バックエンド修正

#### 1.1 スキーマ修正
**ファイル**: `movie-maker-api/app/videos/schemas.py`

`RegenerateVideoRequest` クラスに `prompt` フィールドを追加：

```python
class RegenerateVideoRequest(BaseModel):
    """シーン動画再生成リクエスト"""
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー（未指定時は環境変数で決定）")
    prompt: str | None = Field(None, description="動画生成プロンプト（未指定時は既存のrunway_promptを使用）")
```

#### 1.2 エンドポイント修正
**ファイル**: `movie-maker-api/app/videos/router.py`

`regenerate_scene_video` 関数（L1089-1153）を修正：
- `request.prompt` を取得
- `start_single_scene_regeneration` に渡す

```python
@router.post("/storyboard/{storyboard_id}/scenes/{scene_number}/regenerate-video")
async def regenerate_scene_video(
    storyboard_id: str,
    scene_number: int,
    background_tasks: BackgroundTasks,
    request: RegenerateVideoRequest = None,
    current_user: dict = Depends(check_usage_limit),
):
    # ... 既存のバリデーション処理 ...

    # video_providerの決定
    video_provider = None
    if request and request.video_provider:
        video_provider = request.video_provider.value

    # promptの取得（新規追加）
    custom_prompt = None
    if request and request.prompt:
        custom_prompt = request.prompt

    # バックグラウンドで単一シーン再生成を開始
    from app.tasks import start_single_scene_regeneration
    background_tasks.add_task(
        start_single_scene_regeneration,
        storyboard_id,
        scene_number,
        video_provider,
        custom_prompt  # 新規追加
    )

    # ... 残りの処理 ...
```

#### 1.3 タスク処理修正
**ファイル**: `movie-maker-api/app/tasks/storyboard_processor.py`

##### `start_single_scene_regeneration` 関数（L546-548）
```python
def start_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None  # 新規追加
):
    """単一シーン再生成を開始（同期ラッパー）"""
    asyncio.run(process_single_scene_regeneration(
        storyboard_id,
        scene_number,
        video_provider,
        custom_prompt  # 新規追加
    ))
```

##### `process_single_scene_regeneration` 関数（L410-543）
```python
async def process_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,  # 新規追加
):
    # ... 既存の処理 ...

    scene = scene_response.data
    scene_id = scene["id"]

    # プロンプトの決定（カスタムプロンプトがあれば使用）
    runway_prompt = custom_prompt if custom_prompt else scene["runway_prompt"]

    # カスタムプロンプトが指定された場合はDBも更新
    if custom_prompt:
        supabase.table("storyboard_scenes").update({
            "runway_prompt": custom_prompt,
        }).eq("id", scene_id).execute()
        logger.info(f"Scene {scene_number}: Updated runway_prompt in DB")

    # ... 残りの処理（runway_promptを使用）...
```

#### 1.4 タスク __init__.py 修正
**ファイル**: `movie-maker-api/app/tasks/__init__.py`

エクスポートを確認し、必要に応じて修正。

---

### 2. フロントエンド修正

#### 2.1 API クライアント修正
**ファイル**: `movie-maker/lib/api/client.ts`

`regenerateVideo` 関数（L345-351）を修正：

```typescript
// 単一シーンの動画を再生成
regenerateVideo: (storyboardId: string, sceneNumber: number, options?: {
  video_provider?: 'runway' | 'veo';
  prompt?: string;  // 新規追加
}): Promise<Storyboard> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}/regenerate-video`, {
    method: "POST",
    body: JSON.stringify(options || {}),
  }),
```

#### 2.2 プロンプト編集モーダル追加
**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

##### State追加（L85付近）
```typescript
// Video review state
const [retryingSceneVideo, setRetryingSceneVideo] = useState<number | null>(null);
const [concatenating, setConcatenating] = useState(false);

// 新規追加: 再生成モーダル用
const [regenerateModalScene, setRegenerateModalScene] = useState<number | null>(null);
const [regeneratePrompt, setRegeneratePrompt] = useState("");
```

##### handleRegenerateVideo 関数を2段階に分割（L499付近）

```typescript
// 再生成ボタンクリック時 - モーダルを開く
const openRegenerateModal = (sceneNumber: number) => {
  if (!storyboard) return;
  const scene = storyboard.scenes.find(s => s.scene_number === sceneNumber);
  if (scene) {
    setRegeneratePrompt(scene.runway_prompt);
    setRegenerateModalScene(sceneNumber);
  }
};

// モーダルで「再生成」ボタンをクリック時 - 実際に再生成
const handleRegenerateVideo = async (sceneNumber: number, customPrompt?: string) => {
  if (!storyboard) return;

  try {
    setRegenerateModalScene(null); // モーダルを閉じる
    setRetryingSceneVideo(sceneNumber);

    // Immediately clear the video_url in local state to show loading state
    setStoryboard((prev) =>
      prev
        ? {
            ...prev,
            scenes: prev.scenes.map((s) =>
              s.scene_number === sceneNumber
                ? { ...s, status: "processing", progress: 0, video_url: null }
                : s
            ),
          }
        : null
    );

    await storyboardApi.regenerateVideo(storyboard.id, sceneNumber, {
      video_provider: videoProvider,
      prompt: customPrompt,  // プロンプトを渡す
    });

    // Wait a bit for the backend to update the status before polling
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Start polling for this scene
    pollSingleSceneStatus(sceneNumber);
  } catch (error) {
    console.error("Failed to regenerate video:", error);
    alert("動画の再生成に失敗しました");
    setRetryingSceneVideo(null);
    // Reload storyboard to get current state
    const updated = await storyboardApi.get(storyboard.id);
    setStoryboard(updated);
  }
};
```

##### 再生成ボタンのonClick変更（L1457付近）

```tsx
{/* Retry Button */}
{scene.video_url && retryingSceneVideo !== scene.scene_number && (
  <button
    onClick={() => openRegenerateModal(scene.scene_number)}  // 変更
    disabled={retryingSceneVideo !== null}
    className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white transition-colors hover:bg-black/90 disabled:opacity-50"
    title="動画を再生成"
  >
    <RotateCcw className="h-3 w-3" />
    再生成
  </button>
)}
```

##### 再生成モーダルコンポーネント追加（ページ末尾、return内の最後）

```tsx
{/* Regenerate Video Modal */}
{regenerateModalScene !== null && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
      <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
        シーン{regenerateModalScene}を再生成
      </h3>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          プロンプト
        </label>
        <textarea
          className="w-full rounded-lg border border-zinc-300 p-3 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          rows={6}
          value={regeneratePrompt}
          onChange={(e) => setRegeneratePrompt(e.target.value)}
          placeholder="動画生成用のプロンプト"
        />
        <p className="mt-1 text-xs text-zinc-500">
          プロンプトを編集すると、変更内容がDBに保存されます
        </p>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setRegenerateModalScene(null)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </button>
        <button
          onClick={() => handleRegenerateVideo(regenerateModalScene, regeneratePrompt)}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          再生成
        </button>
      </div>
    </div>
  </div>
)}
```

---

## テスト項目

1. **基本動作**
   - [ ] 再生成ボタンクリックでモーダルが開く
   - [ ] モーダルに現在のプロンプトが表示される
   - [ ] プロンプトを編集できる
   - [ ] キャンセルでモーダルが閉じる

2. **再生成実行**
   - [ ] プロンプト未編集で再生成 → 既存プロンプトで動画生成
   - [ ] プロンプト編集して再生成 → 新プロンプトで動画生成＆DB更新

3. **DB保存確認**
   - [ ] 編集したプロンプトがDBに保存される
   - [ ] 次回再生成時に編集済みプロンプトが表示される

4. **エラーハンドリング**
   - [ ] 空のプロンプトでの再生成を防止（任意）
   - [ ] API エラー時の適切なエラー表示

---

## 実装順序

1. バックエンド: schemas.py の修正
2. バックエンド: storyboard_processor.py の修正
3. バックエンド: router.py の修正
4. バックエンド: __init__.py の確認
5. フロントエンド: client.ts の修正
6. フロントエンド: page.tsx の修正（State, 関数, UI）
7. 動作テスト
