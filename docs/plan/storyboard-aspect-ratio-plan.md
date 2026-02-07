# ストーリーボード生成 アスペクト比選択機能 実装計画書

## 概要

ストーリーボード生成（起承転結4シーン）に横型アスペクト比（16:9）選択機能を追加する。
現在は縦型（9:16）にハードコードされている。

## 現状分析

### 実装済み（Story生成 - 単一シーン）
- フロントエンド: `app/generate/story/page.tsx` にUI実装済み
- バックエンド: `videos/router.py` POST `/api/v1/videos/story` で対応済み
- スキーマ: `AspectRatio` enum定義済み
- 動画プロバイダー: Runway/Veo共に両アスペクト比対応済み

### 未実装（Storyboard生成 - 4シーン）
- フロントエンド: アスペクト比選択UIなし
- バックエンド: `aspect_ratio` パラメータ未対応
- DB: `storyboards`テーブルに`aspect_ratio`列なし
- プロセッサ: `"9:16"` ハードコード

## 実装タスク

### 1. データベースマイグレーション

**ファイル**: `docs/migrations/YYYYMMDD_storyboard_aspect_ratio.sql`

```sql
-- storyboardsテーブルにaspect_ratio列を追加
ALTER TABLE storyboards
ADD COLUMN aspect_ratio TEXT DEFAULT '9:16';

-- 既存レコードはデフォルト値（9:16）が適用される
```

**Supabaseで実行**: SQL Editorから直接実行

---

### 2. バックエンド - スキーマ更新

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
# StoryboardCreateRequest に aspect_ratio を追加
class StoryboardCreateRequest(BaseModel):
    """ストーリーボード作成リクエスト"""
    image_url: str = Field(..., description="ソース画像URL")
    mood: str | None = Field(None, description="ムード指定")
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー")
    aspect_ratio: AspectRatio = Field(
        AspectRatio.PORTRAIT,
        description="アスペクト比（9:16=縦長, 16:9=横長）"
    )  # 追加
```

---

### 3. バックエンド - ルーター更新

**ファイル**: `movie-maker-api/app/videos/router.py`

**変更箇所**: `create_storyboard` 関数（約218行目）

```python
@router.post("/storyboard", response_model=StoryboardResponse)
async def create_storyboard(
    request: StoryboardCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    # ...existing code...

    sb_record = {
        "id": storyboard_id,
        "user_id": user_id,
        "source_image_url": request.image_url,
        "title": storyboard_data.get("title"),
        "status": "draft",
        "video_provider": provider,
        "aspect_ratio": request.aspect_ratio.value,  # 追加
    }
```

---

### 4. バックエンド - プロセッサ更新

**ファイル**: `movie-maker-api/app/tasks/storyboard_processor.py`

**変更箇所1**: `process_single_scene` 関数

```python
async def process_single_scene(storyboard_id: str, scene_id: str, scene_number: int):
    # ...
    # storyboardからaspect_ratioを取得
    storyboard = supabase.table("storyboards").select("*").eq("id", storyboard_id).single().execute()
    aspect_ratio = storyboard.data.get("aspect_ratio", "9:16")

    # generate_video_with_v2v_fallback に渡す
    task_id, generation_mode = await generate_video_with_v2v_fallback(
        provider=provider,
        scene=scene,
        previous_video_url=previous_video_url,
        scene_image_url=scene_image_url,
        aspect_ratio=aspect_ratio,  # DBから取得した値を使用
    )
```

**変更箇所2**: `process_all_scenes` 関数

```python
async def process_all_scenes(storyboard_id: str):
    # storyboardからaspect_ratioを取得
    storyboard_result = supabase.table("storyboards").select("*").eq("id", storyboard_id).single().execute()
    storyboard = storyboard_result.data
    aspect_ratio = storyboard.get("aspect_ratio", "9:16")

    # 各シーン生成時にaspect_ratioを渡す
    for scene in scenes:
        task_id, generation_mode = await generate_video_with_v2v_fallback(
            provider=provider,
            scene=scene,
            previous_video_url=previous_video_url,
            scene_image_url=scene_image_url,
            aspect_ratio=aspect_ratio,
        )
```

---

### 5. フロントエンド - API クライアント更新

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
export const storyboardApi = {
  create: (data: {
    image_url: string;
    mood?: string;
    video_provider?: 'runway' | 'veo';
    aspect_ratio?: '9:16' | '16:9';  // 追加
  }) =>
    fetchWithAuth("/api/v1/videos/storyboard", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // ...
};
```

---

### 6. フロントエンド - UI追加

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

**追加箇所1**: State定義（他のstate定義の近く）

```typescript
const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
```

**追加箇所2**: UI コンポーネント（画像アップロード後、生成ボタンの前）

```tsx
{/* アスペクト比選択 */}
<div className="space-y-3">
  <label className="block text-sm font-medium text-gray-300">
    アスペクト比
  </label>
  <div className="flex gap-4">
    <button
      type="button"
      onClick={() => setAspectRatio('9:16')}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
        aspectRatio === '9:16'
          ? 'border-purple-500 bg-purple-500/20'
          : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      <div className="w-6 h-10 border-2 border-current rounded" />
      <span className="text-sm">9:16 縦長</span>
    </button>
    <button
      type="button"
      onClick={() => setAspectRatio('16:9')}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
        aspectRatio === '16:9'
          ? 'border-purple-500 bg-purple-500/20'
          : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      <div className="w-10 h-6 border-2 border-current rounded" />
      <span className="text-sm">16:9 横長</span>
    </button>
  </div>
</div>
```

**追加箇所3**: API呼び出し（storyboardApi.create）

```typescript
const result = await storyboardApi.create({
  image_url: croppedImageUrl,
  mood: mood || undefined,
  video_provider: videoProvider,
  aspect_ratio: aspectRatio,  // 追加
});
```

**追加箇所4**: ImageCropperのaspectRatio（動的に変更）

```tsx
<ImageCropper
  imageSrc={rawImageForCrop}
  aspectRatio={aspectRatio === '9:16' ? 9 / 16 : 16 / 9}  // 動的に
  onCropComplete={handleCropComplete}
  onCancel={handleCropCancel}
/>
```

---

## 実装順序

1. **DBマイグレーション** - Supabaseで`aspect_ratio`列を追加
2. **バックエンド schemas.py** - リクエストスキーマ更新
3. **バックエンド router.py** - ルーター更新
4. **バックエンド storyboard_processor.py** - プロセッサ更新
5. **フロントエンド client.ts** - APIクライアント更新
6. **フロントエンド page.tsx** - UI追加
7. **テスト** - 横型で生成テスト

## 注意点

### ImageCropperの動的アスペクト比
- アスペクト比を変更した場合、クロップ領域をリセットする必要がある
- 既にクロップ済みの画像がある場合、再クロップを促すUIが必要かもしれない

### 結合動画のアスペクト比
- `video_concat_processor.py` は既にシーン動画のアスペクト比に従って結合するため、追加変更は不要

### 動画プレビューのスタイリング
- 横型動画のプレビュー表示が適切に行われるか確認
- CSSで`object-contain`を使用しているため問題ないはず

## 工数見積もり

| タスク | 見積もり |
|-------|---------|
| DBマイグレーション | 5分 |
| schemas.py | 5分 |
| router.py | 10分 |
| storyboard_processor.py | 15分 |
| client.ts | 5分 |
| page.tsx | 20分 |
| テスト | 15分 |
| **合計** | **約75分** |

## リスク評価

- **低リスク**: 既存のStory生成で同じパターンが実装済み
- **動画プロバイダー対応済み**: Runway/Veo共に16:9対応済み
- **後方互換性**: デフォルト値`9:16`により既存データに影響なし
