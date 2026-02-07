# シーン編集機能 実装計画書 v2

## 概要

Review画面でシーンの削除・並べ替え・追加を可能にし、自由な物語構成（例: 転転承結結）に対応する。

**採用案**: 提案B（フリーフォーム案）+ サブシーン区別の廃止

---

## 設計方針

### Before（現状）
```
起（親）──→ 起-Sub1 ──→ 起-Sub2
承（親）──→ 承-Sub1
転（親）
結（親）

階層構造: parent_scene_id, sub_scene_order で管理
表示: 起/承/転/結 のラベル
ソート: act順 → sub_scene_order順 → scene_number順
```

### After（変更後）
```
#1 ──→ #2 ──→ #3 ──→ #4 ──→ #5 ──→ #6 ──→ #7

フラット構造: display_order のみで管理
表示: シーン番号（#1, #2, #3...）
すべてのシーンが対等、自由に並べ替え可能
```

---

## Phase 0: 事前調査・影響範囲

### 0.1 変更が必要なファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `app/videos/router.py` (6箇所) | `.order("scene_number")` → `.order("display_order")` |
| `app/tasks/storyboard_processor.py` (3箇所) | ソートロジック更新 |
| `app/tasks/video_concat_processor.py` | 結合順序をdisplay_order順に |
| `movie-maker/lib/api/client.ts` | `StoryboardScene`に`display_order`追加 |
| `movie-maker/app/generate/storyboard/page.tsx` | シーン表示・編集UI |

### 0.2 廃止/変更するAPI

| エンドポイント | 対応 |
|---------------|------|
| `POST /storyboard/{id}/scenes/sub` | 汎用の`POST /storyboard/{id}/scenes`に統合 |
| `GET /storyboard/{id}/scenes/{num}/sub-scenes` | 廃止（フラット構造のため不要） |

---

## Phase 1: DB・API基盤整備

### 1.1 DBマイグレーション

**ファイル**: `docs/migrations/add_display_order.sql`

```sql
-- =============================================
-- Phase 1: display_order カラム追加
-- =============================================

-- Step 1: 新規カラム追加（NULL許容で開始）
ALTER TABLE storyboard_scenes
ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Step 2: 既存データのdisplay_order設定
-- 現在の並び順（act順 → sub_scene_order順 → scene_number順）を維持
WITH ordered_scenes AS (
  SELECT
    id,
    storyboard_id,
    ROW_NUMBER() OVER (
      PARTITION BY storyboard_id
      ORDER BY
        CASE act
          WHEN '起' THEN 1
          WHEN '承' THEN 2
          WHEN '転' THEN 3
          WHEN '結' THEN 4
          ELSE 5
        END,
        COALESCE(sub_scene_order, 0),
        scene_number
    ) as new_order
  FROM storyboard_scenes
)
UPDATE storyboard_scenes s
SET display_order = o.new_order
FROM ordered_scenes o
WHERE s.id = o.id;

-- Step 3: NOT NULL制約追加
ALTER TABLE storyboard_scenes
ALTER COLUMN display_order SET NOT NULL;

-- Step 4: デフォルト値設定（新規レコード用）
ALTER TABLE storyboard_scenes
ALTER COLUMN display_order SET DEFAULT 1;

-- Step 5: インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_storyboard_scenes_display_order
ON storyboard_scenes(storyboard_id, display_order);

-- Step 6: ユニーク制約追加（同一storyboard内でdisplay_orderの重複を防ぐ）
-- 注意: 並べ替え時は一時的に制約を無効にする必要あり
-- ALTER TABLE storyboard_scenes
-- ADD CONSTRAINT unique_display_order UNIQUE (storyboard_id, display_order);
```

### 1.2 マイグレーション実行手順

```bash
# 1. Supabase SQLエディタで実行
# 2. または Supabase CLI で実行
supabase db push

# 3. 確認
SELECT id, storyboard_id, scene_number, display_order, act, sub_scene_order
FROM storyboard_scenes
ORDER BY storyboard_id, display_order
LIMIT 20;
```

### 1.3 後方互換性

以下のカラムは**残すが新規では使用しない**:
- `scene_number` → 既存ロジックの後方互換用
- `act` → AIプロンプト生成の参考情報として保持
- `parent_scene_id` → NULL許容のまま残す
- `sub_scene_order` → 使用しない

### 1.4 バックエンド: ソート順変更

**変更箇所一覧**:

```python
# app/videos/router.py - 6箇所
# Line 641, 900, 1192, 1563, 1733, 1811
# Before:
.order("scene_number")
# After:
.order("display_order")

# app/tasks/storyboard_processor.py - Line 355, 800
# Before:
scenes.sort(key=lambda s: (
    act_order.get(s["act"], 99),
    s.get("sub_scene_order", 0),
    s["scene_number"]
))
# After:
scenes.sort(key=lambda s: s.get("display_order", s["scene_number"]))
```

### 1.5 フロントエンド: 型定義更新

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
export interface StoryboardScene {
  id: string;
  storyboard_id: string;
  scene_number: number;
  display_order: number;  // ← 追加
  act: string;
  description_ja: string;
  runway_prompt: string;
  camera_work: string | null;
  mood: string | null;
  duration_seconds: number;
  scene_image_url: string | null;
  status: string;
  progress: number;
  video_url: string | null;
  error_message: string | null;
  parent_scene_id: string | null;  // 非推奨
  sub_scene_order: number;         // 非推奨
  generation_seed: number | null;
}
```

---

## Phase 2: シーン削除機能

### 2.1 API設計

```
DELETE /api/v1/videos/storyboard/{storyboard_id}/scenes/{scene_id}

Headers:
  Authorization: Bearer {token}

Response 200 OK:
{
  "success": true,
  "deleted_scene_id": "uuid",
  "remaining_count": 5,
  "scenes": [...]  // 更新後のシーン一覧
}

Response 400 Bad Request:
{
  "detail": "最後のシーンは削除できません"
}

Response 403 Forbidden:
{
  "detail": "このストーリーボードへのアクセス権がありません"
}

Response 404 Not Found:
{
  "detail": "シーンが見つかりません"
}
```

### 2.2 バックエンド実装

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
@router.delete("/storyboard/{storyboard_id}/scenes/{scene_id}")
async def delete_scene(
    storyboard_id: str,
    scene_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    シーンを削除

    - 最後の1シーンは削除不可
    - 削除後、残りシーンのdisplay_orderを振り直し
    - R2の動画ファイルは削除しない（ストレージコスト vs 復元可能性のトレードオフ）
    """
    supabase = get_supabase()
    user_id = current_user["id"]

    # 1. ストーリーボード所有権確認
    sb_response = supabase.table("storyboards").select("id, user_id").eq(
        "id", storyboard_id
    ).single().execute()

    if not sb_response.data:
        raise HTTPException(404, "ストーリーボードが見つかりません")

    if sb_response.data["user_id"] != user_id:
        raise HTTPException(403, "このストーリーボードへのアクセス権がありません")

    # 2. シーン数チェック
    scenes_response = supabase.table("storyboard_scenes").select("id, display_order").eq(
        "storyboard_id", storyboard_id
    ).order("display_order").execute()

    scenes = scenes_response.data
    if len(scenes) <= 1:
        raise HTTPException(400, "最後のシーンは削除できません")

    # 3. 対象シーンの存在確認
    target_scene = next((s for s in scenes if s["id"] == scene_id), None)
    if not target_scene:
        raise HTTPException(404, "シーンが見つかりません")

    # 4. 削除実行
    supabase.table("storyboard_scenes").delete().eq("id", scene_id).execute()

    # 5. display_order振り直し
    remaining_scenes = [s for s in scenes if s["id"] != scene_id]
    for i, scene in enumerate(remaining_scenes):
        supabase.table("storyboard_scenes").update({
            "display_order": i + 1
        }).eq("id", scene["id"]).execute()

    # 6. 更新後のシーン一覧を返す
    updated_scenes = supabase.table("storyboard_scenes").select("*").eq(
        "storyboard_id", storyboard_id
    ).order("display_order").execute()

    return {
        "success": True,
        "deleted_scene_id": scene_id,
        "remaining_count": len(remaining_scenes),
        "scenes": updated_scenes.data
    }
```

### 2.3 フロントエンド実装

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
// storyboardApi に追加
deleteScene: (storyboardId: string, sceneId: string): Promise<{
  success: boolean;
  deleted_scene_id: string;
  remaining_count: number;
  scenes: StoryboardScene[];
}> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneId}`, {
    method: "DELETE",
  }),
```

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

```typescript
// 状態追加
const [deletingScene, setDeletingScene] = useState<string | null>(null);

// 削除ハンドラー
const handleDeleteScene = async (sceneId: string) => {
  const scene = storyboard?.scenes.find(s => s.id === sceneId);
  if (!scene) return;

  const confirmed = confirm(
    `シーン #${scene.display_order} を削除しますか？\n動画も削除されます。この操作は取り消せません。`
  );
  if (!confirmed) return;

  setDeletingScene(sceneId);
  try {
    const result = await storyboardApi.deleteScene(storyboard!.id, sceneId);
    setStoryboard({ ...storyboard!, scenes: result.scenes });
  } catch (error: any) {
    alert(error.message || "削除に失敗しました");
  } finally {
    setDeletingScene(null);
  }
};

// UI（各シーンカードに追加）
{storyboard.scenes.length > 1 && (
  <button
    onClick={() => handleDeleteScene(scene.id)}
    disabled={deletingScene !== null}
    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
    title="シーンを削除"
  >
    {deletingScene === scene.id ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <X className="h-4 w-4" />
    )}
  </button>
)}
```

---

## Phase 3: ドラッグ&ドロップ並べ替え

### 3.1 ライブラリインストール

```bash
cd movie-maker
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 3.2 API設計

```
PATCH /api/v1/videos/storyboard/{storyboard_id}/scenes/reorder

Headers:
  Authorization: Bearer {token}

Request:
{
  "scene_ids": ["uuid3", "uuid1", "uuid4", "uuid2"]
}

Response 200 OK:
{
  "success": true,
  "scenes": [...]
}

Response 400 Bad Request:
{
  "detail": "シーンIDの数が一致しません"
}

Response 403 Forbidden:
{
  "detail": "このストーリーボードへのアクセス権がありません"
}
```

### 3.3 バックエンド実装

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class ReorderScenesRequest(BaseModel):
    """シーン並べ替えリクエスト"""
    scene_ids: list[str] = Field(..., description="新しい順序のシーンIDリスト")
```

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
from app.videos.schemas import ReorderScenesRequest

@router.patch("/storyboard/{storyboard_id}/scenes/reorder")
async def reorder_scenes(
    storyboard_id: str,
    request: ReorderScenesRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    シーンの順序を変更

    トランザクション的に更新（失敗時は元の状態を維持）
    """
    supabase = get_supabase()
    user_id = current_user["id"]

    # 1. ストーリーボード所有権確認
    sb_response = supabase.table("storyboards").select("id, user_id").eq(
        "id", storyboard_id
    ).single().execute()

    if not sb_response.data:
        raise HTTPException(404, "ストーリーボードが見つかりません")

    if sb_response.data["user_id"] != user_id:
        raise HTTPException(403, "このストーリーボードへのアクセス権がありません")

    # 2. 現在のシーン取得
    scenes_response = supabase.table("storyboard_scenes").select("id").eq(
        "storyboard_id", storyboard_id
    ).execute()

    current_scene_ids = {s["id"] for s in scenes_response.data}
    request_scene_ids = set(request.scene_ids)

    # 3. バリデーション
    if current_scene_ids != request_scene_ids:
        raise HTTPException(400, "シーンIDが一致しません。ページを再読み込みしてください。")

    # 4. display_order更新
    for index, scene_id in enumerate(request.scene_ids):
        supabase.table("storyboard_scenes").update({
            "display_order": index + 1
        }).eq("id", scene_id).execute()

    # 5. 更新後のシーン一覧を返す
    updated_scenes = supabase.table("storyboard_scenes").select("*").eq(
        "storyboard_id", storyboard_id
    ).order("display_order").execute()

    return {"success": True, "scenes": updated_scenes.data}
```

### 3.4 フロントエンド実装

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
reorderScenes: (storyboardId: string, sceneIds: string[]): Promise<{
  success: boolean;
  scenes: StoryboardScene[];
}> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ scene_ids: sceneIds }),
  }),
```

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

```typescript
"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

// ソート可能なシーンカードラッパー
function SortableSceneCard({
  scene,
  index,
  children
}: {
  scene: StoryboardScene;
  index: number;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
    >
      {/* ドラッグハンドル */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1.5 rounded bg-zinc-800/80 cursor-grab active:cursor-grabbing z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        title="ドラッグして並べ替え"
      >
        <GripVertical className="h-4 w-4 text-white" />
      </div>
      {children}
    </div>
  );
}

// Review画面のシーン一覧
function ReviewSceneList() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id || !storyboard) return;

    const oldIndex = storyboard.scenes.findIndex(s => s.id === active.id);
    const newIndex = storyboard.scenes.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // 楽観的更新
    const newScenes = arrayMove(storyboard.scenes, oldIndex, newIndex);
    setStoryboard({ ...storyboard, scenes: newScenes });

    // API呼び出し
    setIsReordering(true);
    try {
      const result = await storyboardApi.reorderScenes(
        storyboard.id,
        newScenes.map(s => s.id)
      );
      // サーバーからの正確なデータで更新
      setStoryboard({ ...storyboard, scenes: result.scenes });
    } catch (error: any) {
      // 失敗時は元に戻す
      alert("並べ替えに失敗しました: " + (error.message || ""));
      const original = await storyboardApi.get(storyboard.id);
      setStoryboard(original);
    } finally {
      setIsReordering(false);
    }
  };

  const activeScene = storyboard?.scenes.find(s => s.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis]}
    >
      <SortableContext
        items={storyboard?.scenes.map(s => s.id) || []}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-2">
          {storyboard?.scenes.map((scene, index) => (
            <SortableSceneCard key={scene.id} scene={scene} index={index}>
              <ReviewSceneCard scene={scene} index={index} />
            </SortableSceneCard>
          ))}
        </div>
      </SortableContext>

      {/* ドラッグ中のオーバーレイ */}
      <DragOverlay>
        {activeScene && (
          <div className="opacity-80 shadow-2xl">
            <ReviewSceneCard scene={activeScene} index={0} />
          </div>
        )}
      </DragOverlay>

      {/* 並べ替え中インジケーター */}
      {isReordering && (
        <div className="fixed bottom-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          保存中...
        </div>
      )}
    </DndContext>
  );
}
```

---

## Phase 4: シーン追加機能

### 4.1 API設計

```
POST /api/v1/videos/storyboard/{storyboard_id}/scenes

Headers:
  Authorization: Bearer {token}

Request:
{
  "description_ja": "主人公が夕日を見つめている",
  "custom_image_url": "https://..."  // オプション
}

Response 201 Created:
{
  "scene": {
    "id": "new-uuid",
    "display_order": 5,
    "description_ja": "主人公が夕日を見つめている",
    "runway_prompt": "A protagonist gazing at sunset...",
    "status": "pending",
    ...
  },
  "storyboard": {...}  // 更新後のストーリーボード（全シーン含む）
}

Response 400 Bad Request:
{
  "detail": "説明文は必須です"
}
```

### 4.2 バックエンド実装

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class AddSceneRequest(BaseModel):
    """シーン追加リクエスト"""
    description_ja: str = Field(..., min_length=1, description="シーンの日本語説明")
    custom_image_url: Optional[str] = Field(None, description="カスタム画像URL")
```

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
from app.external.gemini_client import generate_runway_prompt_from_description

@router.post("/storyboard/{storyboard_id}/scenes", status_code=201)
async def add_scene(
    storyboard_id: str,
    request: AddSceneRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    新しいシーンを追加

    - 末尾に追加（display_orderは最大値+1）
    - 画像未指定時はバックグラウンドで生成
    """
    supabase = get_supabase()
    user_id = current_user["id"]

    # 1. ストーリーボード所有権確認
    sb_response = supabase.table("storyboards").select("*").eq(
        "id", storyboard_id
    ).eq("user_id", user_id).single().execute()

    if not sb_response.data:
        raise HTTPException(404, "ストーリーボードが見つかりません")

    storyboard = sb_response.data

    # 2. 現在の最大display_orderを取得
    scenes_response = supabase.table("storyboard_scenes").select("display_order").eq(
        "storyboard_id", storyboard_id
    ).order("display_order", desc=True).limit(1).execute()

    max_order = scenes_response.data[0]["display_order"] if scenes_response.data else 0
    new_order = max_order + 1

    # 3. runway_promptを生成
    try:
        runway_prompt = await generate_runway_prompt_from_description(
            description_ja=request.description_ja,
            mood=storyboard.get("mood", "cinematic"),
        )
    except Exception as e:
        logger.warning(f"Failed to generate runway prompt: {e}")
        runway_prompt = request.description_ja  # フォールバック

    # 4. 新規シーン作成
    new_scene_data = {
        "storyboard_id": storyboard_id,
        "display_order": new_order,
        "scene_number": new_order,  # 後方互換
        "act": "custom",
        "description_ja": request.description_ja,
        "runway_prompt": runway_prompt,
        "scene_image_url": request.custom_image_url,
        "status": "image_ready" if request.custom_image_url else "pending",
        "progress": 0,
        "duration_seconds": 5,
        "sub_scene_order": 0,
    }

    result = supabase.table("storyboard_scenes").insert(new_scene_data).execute()
    new_scene = result.data[0]

    # 5. 画像がない場合はバックグラウンドで生成
    if not request.custom_image_url:
        background_tasks.add_task(
            generate_scene_image_background,
            scene_id=new_scene["id"],
            storyboard_id=storyboard_id,
            source_image_url=storyboard["source_image_url"],
        )

    # 6. ストーリーボードステータスを更新（videos_readyの場合はeditに戻す）
    if storyboard.get("status") == "videos_ready":
        supabase.table("storyboards").update({
            "status": "edit"
        }).eq("id", storyboard_id).execute()

    # 7. 更新後の全データを返す
    updated_sb = supabase.table("storyboards").select("*").eq(
        "id", storyboard_id
    ).single().execute()

    updated_scenes = supabase.table("storyboard_scenes").select("*").eq(
        "storyboard_id", storyboard_id
    ).order("display_order").execute()

    return {
        "scene": new_scene,
        "storyboard": {
            **updated_sb.data,
            "scenes": updated_scenes.data
        }
    }


async def generate_scene_image_background(
    scene_id: str,
    storyboard_id: str,
    source_image_url: str,
):
    """バックグラウンドでシーン画像を生成"""
    from app.tasks.storyboard_processor import generate_scene_image

    try:
        await generate_scene_image(
            scene_id=scene_id,
            storyboard_id=storyboard_id,
            source_image_url=source_image_url,
        )
    except Exception as e:
        logger.exception(f"Failed to generate scene image: {scene_id}")
        supabase = get_supabase()
        supabase.table("storyboard_scenes").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", scene_id).execute()
```

### 4.3 フロントエンド実装

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
addScene: (storyboardId: string, data: {
  description_ja: string;
  custom_image_url?: string;
}): Promise<{
  scene: StoryboardScene;
  storyboard: Storyboard;
}> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes`, {
    method: "POST",
    body: JSON.stringify(data),
  }),
```

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

```typescript
// 状態
const [showAddSceneModal, setShowAddSceneModal] = useState(false);
const [newSceneDescription, setNewSceneDescription] = useState("");
const [newSceneImage, setNewSceneImage] = useState<File | null>(null);
const [newSceneImagePreview, setNewSceneImagePreview] = useState<string | null>(null);
const [addingScene, setAddingScene] = useState(false);

// 画像プレビュー
const handleNewSceneImageChange = (file: File | null) => {
  setNewSceneImage(file);
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => setNewSceneImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  } else {
    setNewSceneImagePreview(null);
  }
};

// 追加ハンドラー
const handleAddScene = async () => {
  if (!storyboard || !newSceneDescription.trim()) return;

  setAddingScene(true);
  try {
    let imageUrl: string | undefined;

    if (newSceneImage) {
      const uploadRes = await videosApi.uploadImage(newSceneImage);
      imageUrl = uploadRes.image_url;
    }

    const result = await storyboardApi.addScene(storyboard.id, {
      description_ja: newSceneDescription.trim(),
      custom_image_url: imageUrl,
    });

    setStoryboard(result.storyboard);
    setShowAddSceneModal(false);
    setNewSceneDescription("");
    setNewSceneImage(null);
    setNewSceneImagePreview(null);
  } catch (error: any) {
    alert("シーンの追加に失敗しました: " + (error.message || ""));
  } finally {
    setAddingScene(false);
  }
};

// モーダルUI
{showAddSceneModal && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-lg shadow-xl">
      <h3 className="text-xl font-bold mb-4">シーンを追加</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            シーンの説明 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={newSceneDescription}
            onChange={(e) => setNewSceneDescription(e.target.value)}
            placeholder="例: 主人公が夕日を見つめながら、遠くを見ている"
            className="w-full h-32 p-3 border rounded-lg dark:bg-zinc-800 dark:border-zinc-700"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            画像（オプション）
          </label>
          <div className="flex items-center gap-4">
            {newSceneImagePreview ? (
              <div className="relative w-24 h-24">
                <img
                  src={newSceneImagePreview}
                  alt="Preview"
                  className="w-full h-full object-cover rounded-lg"
                />
                <button
                  onClick={() => handleNewSceneImageChange(null)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center w-24 h-24 border-2 border-dashed rounded-lg cursor-pointer hover:border-purple-400">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleNewSceneImageChange(e.target.files?.[0] || null)}
                />
                <Upload className="h-6 w-6 text-zinc-400" />
              </label>
            )}
            <p className="text-xs text-zinc-500">
              画像を指定しない場合、AIが自動生成します
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => {
            setShowAddSceneModal(false);
            setNewSceneDescription("");
            setNewSceneImage(null);
            setNewSceneImagePreview(null);
          }}
          className="flex-1 py-2.5 rounded-lg border hover:bg-zinc-50 dark:hover:bg-zinc-800"
          disabled={addingScene}
        >
          キャンセル
        </button>
        <button
          onClick={handleAddScene}
          disabled={!newSceneDescription.trim() || addingScene}
          className="flex-1 py-2.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {addingScene ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              追加中...
            </>
          ) : (
            "追加"
          )}
        </button>
      </div>
    </div>
  </div>
)}

// 追加ボタン（シーン一覧の末尾に表示）
<button
  onClick={() => setShowAddSceneModal(true)}
  className="flex-shrink-0 w-48 h-72 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 hover:border-purple-400 text-zinc-400 hover:text-purple-600 transition-colors"
>
  <Plus className="h-8 w-8" />
  <span className="text-sm font-medium">シーンを追加</span>
</button>
```

---

## Phase 5: UI調整・統合

### 5.1 ラベル変更

```typescript
// Before
<span>{scene.act}{scene.sub_scene_order > 0 ? `-Sub${scene.sub_scene_order}` : ''}</span>

// After
<span className="text-sm font-bold">#{scene.display_order}</span>
```

### 5.2 動画結合順序の更新

**ファイル**: `movie-maker-api/app/videos/router.py` (concatenateエンドポイント)

```python
# Line ~900 の修正
scenes_response = (
    supabase.table("storyboard_scenes")
    .select("*")
    .eq("storyboard_id", storyboard_id)
    .order("display_order")  # ← scene_number から変更
    .execute()
)
```

### 5.3 サブシーン追加APIの統合

既存の `/scenes/sub` エンドポイントは残しつつ、内部で `/scenes` を呼ぶように変更。
または非推奨警告を返して新APIへ誘導。

---

## 実装スケジュール

| Phase | 内容 | 工数 | 担当確認事項 |
|-------|------|------|-------------|
| 0 | 事前調査・設計レビュー | 0.5日 | 影響範囲の最終確認 |
| 1 | DB・API基盤整備 | 0.5日 | マイグレーション実行・確認 |
| 2 | シーン削除機能 | 0.5日 | API + UI |
| 3 | ドラッグ&ドロップ | 1.5日 | ライブラリ導入 + UI |
| 4 | シーン追加機能 | 1日 | API + UI + 画像生成 |
| 5 | UI調整・統合テスト | 1日 | 全機能結合テスト |

**合計**: 約5日

---

## テスト計画

### 単体テスト（API）

**ファイル**: `movie-maker-api/tests/videos/test_scene_editing.py`

```python
import pytest
from httpx import AsyncClient

class TestDeleteScene:
    """シーン削除APIのテスト"""

    async def test_delete_scene_success(self, client: AsyncClient, auth_headers, sample_storyboard):
        """正常系: シーンを削除できる"""
        scene_id = sample_storyboard["scenes"][0]["id"]
        response = await client.delete(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes/{scene_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_scene_id"] == scene_id
        assert data["remaining_count"] == len(sample_storyboard["scenes"]) - 1

    async def test_delete_last_scene_fails(self, client: AsyncClient, auth_headers, single_scene_storyboard):
        """異常系: 最後の1シーンは削除できない"""
        scene_id = single_scene_storyboard["scenes"][0]["id"]
        response = await client.delete(
            f"/api/v1/videos/storyboard/{single_scene_storyboard['id']}/scenes/{scene_id}",
            headers=auth_headers,
        )
        assert response.status_code == 400

    async def test_delete_other_user_scene_fails(self, client: AsyncClient, other_user_headers, sample_storyboard):
        """異常系: 他ユーザーのシーンは削除できない"""
        scene_id = sample_storyboard["scenes"][0]["id"]
        response = await client.delete(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes/{scene_id}",
            headers=other_user_headers,
        )
        assert response.status_code == 403

    async def test_delete_nonexistent_scene_fails(self, client: AsyncClient, auth_headers, sample_storyboard):
        """異常系: 存在しないシーンは削除できない"""
        response = await client.delete(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes/nonexistent-uuid",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestReorderScenes:
    """シーン並べ替えAPIのテスト"""

    async def test_reorder_success(self, client: AsyncClient, auth_headers, sample_storyboard):
        """正常系: シーンを並べ替えできる"""
        original_order = [s["id"] for s in sample_storyboard["scenes"]]
        new_order = original_order[::-1]  # 逆順

        response = await client.patch(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes/reorder",
            headers=auth_headers,
            json={"scene_ids": new_order},
        )
        assert response.status_code == 200
        data = response.json()
        assert [s["id"] for s in data["scenes"]] == new_order

    async def test_reorder_with_missing_scene_fails(self, client: AsyncClient, auth_headers, sample_storyboard):
        """異常系: シーンIDが不足している場合は失敗"""
        partial_order = [s["id"] for s in sample_storyboard["scenes"][:-1]]

        response = await client.patch(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes/reorder",
            headers=auth_headers,
            json={"scene_ids": partial_order},
        )
        assert response.status_code == 400

    async def test_reorder_with_extra_scene_fails(self, client: AsyncClient, auth_headers, sample_storyboard):
        """異常系: 余分なシーンIDがある場合は失敗"""
        order_with_extra = [s["id"] for s in sample_storyboard["scenes"]] + ["extra-uuid"]

        response = await client.patch(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes/reorder",
            headers=auth_headers,
            json={"scene_ids": order_with_extra},
        )
        assert response.status_code == 400


class TestAddScene:
    """シーン追加APIのテスト"""

    async def test_add_scene_success(self, client: AsyncClient, auth_headers, sample_storyboard):
        """正常系: シーンを追加できる"""
        response = await client.post(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes",
            headers=auth_headers,
            json={"description_ja": "テストシーン"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["scene"]["description_ja"] == "テストシーン"
        assert data["scene"]["display_order"] == len(sample_storyboard["scenes"]) + 1

    async def test_add_scene_with_image(self, client: AsyncClient, auth_headers, sample_storyboard):
        """正常系: 画像付きでシーンを追加できる"""
        response = await client.post(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes",
            headers=auth_headers,
            json={
                "description_ja": "テストシーン",
                "custom_image_url": "https://example.com/image.jpg",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["scene"]["scene_image_url"] == "https://example.com/image.jpg"
        assert data["scene"]["status"] == "image_ready"

    async def test_add_scene_empty_description_fails(self, client: AsyncClient, auth_headers, sample_storyboard):
        """異常系: 空の説明では追加できない"""
        response = await client.post(
            f"/api/v1/videos/storyboard/{sample_storyboard['id']}/scenes",
            headers=auth_headers,
            json={"description_ja": ""},
        )
        assert response.status_code == 422  # Validation error
```

### 統合テスト（E2E）

**手動テスト項目**:

| # | テスト項目 | 期待結果 | 確認 |
|---|-----------|----------|------|
| **削除** |
| 1 | シーンカードの✕ボタンをクリック | 確認ダイアログが表示される | ☐ |
| 2 | 確認ダイアログで「OK」 | シーンが削除され、番号が振り直される | ☐ |
| 3 | 確認ダイアログで「キャンセル」 | 何も変わらない | ☐ |
| 4 | 最後の1シーンで削除ボタン | ボタンが非表示または無効化されている | ☐ |
| 5 | ページリロード後 | 削除したシーンが表示されない | ☐ |
| **並べ替え** |
| 6 | シーンをドラッグして別の位置にドロップ | シーンが移動し、番号が振り直される | ☐ |
| 7 | 並べ替え後にページリロード | 新しい順序が維持されている | ☐ |
| 8 | 並べ替え後に動画結合 | 新しい順序で結合される | ☐ |
| 9 | ネットワークエラー時 | エラーメッセージが表示され、元の順序に戻る | ☐ |
| 10 | モバイル（タッチ）でドラッグ | 正常に動作する | ☐ |
| **追加** |
| 11 | 「シーンを追加」ボタンをクリック | モーダルが表示される | ☐ |
| 12 | 説明のみ入力して追加 | シーンが追加され、画像生成が開始される | ☐ |
| 13 | 説明と画像を入力して追加 | シーンが追加され、画像がアップロードされる | ☐ |
| 14 | 空の説明で追加ボタン | ボタンが無効化されている | ☐ |
| 15 | 追加後に並べ替え | 追加したシーンもドラッグ可能 | ☐ |
| **統合** |
| 16 | 削除→並べ替え→追加→結合 | 全工程が正常に動作する | ☐ |
| 17 | 複数タブで同時操作 | 競合が適切に処理される | ☐ |

### パフォーマンステスト

| # | テスト項目 | 基準 | 確認 |
|---|-----------|------|------|
| 1 | 10シーンでドラッグ | 遅延なく動作 | ☐ |
| 2 | 20シーンでドラッグ | 遅延なく動作 | ☐ |
| 3 | 並べ替えAPI応答時間 | < 500ms | ☐ |

---

## ロールバック計画

### マイグレーション失敗時

```sql
-- display_order カラムを削除
ALTER TABLE storyboard_scenes DROP COLUMN IF EXISTS display_order;

-- インデックスを削除
DROP INDEX IF EXISTS idx_storyboard_scenes_display_order;
```

### 機能リリース後の問題発生時

1. フロントエンドで新UIを非表示にするフラグを用意
2. バックエンドAPIは後方互換を維持しているため、旧ロジックに戻せる
3. `scene_number` でのソートに一時的に戻す

---

## 注意事項

1. **V2V参照**: 並べ替え後、V2Vの「直前シーン」が変わる。UIで警告を検討。

2. **同時編集**: 複数タブ/ユーザーでの競合は考慮外（楽観的ロック）。

3. **既存サブシーンAPI**: `/scenes/sub` は残すが、新規開発では `/scenes` を使用。

4. **モバイル対応**: タッチデバイスでのドラッグは `TouchSensor` で対応。長押しで発動。
