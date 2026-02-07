# 追加カット機能（サブシーン）実装計画

> **ステータス**: 計画中
> **作成日**: 2024-12-25

## 概要

起承転結4シーンの基本構成に対して、各シーンに最大3カット（計4枚）まで追加できる機能を実装する。
親シーンの動画最終フレームとプロンプトを継承することで、AI生成のクオリティと一貫性を担保する。

### 目標
- 基本4シーン（20秒）→ 最大16シーン（80秒）まで拡張可能に
- 親シーンからの連続性を保ち、自然なカット繋ぎを実現
- ユーザーは必要な箇所だけ追加できる柔軟なUX

---

## 現状分析

### 既存のデータ構造

```
Storyboard (1枚の元画像)
  └── 4 scenes (起・承・転・結、各1シーンずつ固定)
        └── 各シーンに1枚の画像 + 1本の動画
```

### 制約箇所

| 箇所 | 現在の制約 | ファイル |
|------|------------|----------|
| DB | `scene_number BETWEEN 1 AND 4` | `storyboard_scenes`テーブル |
| API | `scene_number: int = Field(..., ge=1, le=4)` | `schemas.py:302` |
| バックエンド | `len(scenes) != 4` で例外 | `storyboard_processor.py:182` |
| UI | 4カード固定グリッドレイアウト | `storyboard/page.tsx:977` |

---

## 新しいデータ構造

### 拡張後の構造

```
Storyboard
  └── Scene 1 (起) ← 親シーン（自動生成）
        ├── Sub-scene 1-1 (追加カット) ← 親の続き
        ├── Sub-scene 1-2 (追加カット)
        └── Sub-scene 1-3 (追加カット) ※最大3つ追加 = 計4枚
  └── Scene 2 (承) ← 親シーン
        └── Sub-scene 2-1 (追加カット)
  └── Scene 3 (転) ← 親シーン
  └── Scene 4 (結) ← 親シーン
        ├── Sub-scene 4-1
        └── Sub-scene 4-2
```

### 用語定義

| 用語 | 説明 |
|------|------|
| 親シーン | 起承転結の基本4シーン（`parent_scene_id = NULL`） |
| サブシーン | 親シーンに追加されたカット（`parent_scene_id = 親のID`） |
| シーン番号 | 結合時の順序を示す連番（1〜16） |

---

## 実装計画

### Phase 1: DBスキーマ拡張

#### 1.1 マイグレーションSQL

**ファイル**: `docs/migrations/20241225_sub_scenes.sql`

```sql
-- 1. 親シーン参照カラムを追加
ALTER TABLE storyboard_scenes
  ADD COLUMN parent_scene_id UUID REFERENCES storyboard_scenes(id) ON DELETE CASCADE;

-- 2. シーン番号制約を緩和（最大16シーン）
ALTER TABLE storyboard_scenes
  DROP CONSTRAINT storyboard_scenes_scene_number_check;

ALTER TABLE storyboard_scenes
  ADD CONSTRAINT storyboard_scenes_scene_number_check
  CHECK (scene_number BETWEEN 1 AND 16);

-- 3. 生成シード値を保存（スタイル一貫性のため）
ALTER TABLE storyboard_scenes
  ADD COLUMN generation_seed INTEGER;

-- 4. サブシーン順序カラム（同一親内での順序）
ALTER TABLE storyboard_scenes
  ADD COLUMN sub_scene_order INTEGER DEFAULT 0;

-- 5. インデックス追加
CREATE INDEX idx_storyboard_scenes_parent ON storyboard_scenes(parent_scene_id);

-- 6. UNIQUE制約を更新（storyboard_id + scene_number で一意）
-- ※既存制約はそのまま維持
COMMENT ON COLUMN storyboard_scenes.parent_scene_id IS '親シーンID（NULLの場合は基本シーン）';
COMMENT ON COLUMN storyboard_scenes.generation_seed IS '動画生成時のシード値（スタイル継承用）';
COMMENT ON COLUMN storyboard_scenes.sub_scene_order IS '同一親シーン内での順序（0=親自身、1〜3=サブシーン）';
```

---

### Phase 2: バックエンドAPI実装

#### 2.1 スキーマ拡張

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class StoryboardSceneBase(BaseModel):
    """ストーリーボードシーン基本スキーマ"""
    scene_number: int = Field(..., ge=1, le=16, description="シーン番号（1-16）")  # 変更
    act: str = Field(..., description="起承転結の区分")
    description_ja: str = Field(..., description="日本語説明")
    runway_prompt: str = Field(..., description="Runway APIプロンプト")
    camera_work: str | None = Field(None, description="カメラワーク")
    mood: str | None = Field(None, description="シーンのムード")
    duration_seconds: int = Field(5, description="秒数")
    scene_image_url: str | None = Field(None, description="シーンごとの画像URL")
    parent_scene_id: str | None = Field(None, description="親シーンID")  # 追加
    sub_scene_order: int = Field(0, description="サブシーン順序")  # 追加
    generation_seed: int | None = Field(None, description="生成シード値")  # 追加


class AddSubSceneRequest(BaseModel):
    """サブシーン追加リクエスト"""
    parent_scene_number: int = Field(..., ge=1, le=4, description="親シーン番号（1-4）")
    description_ja: str | None = Field(None, description="日本語説明（省略時は親から継承）")
    camera_work: str | None = Field(None, description="カメラワーク（省略時は連続性テーブルから自動選択）")
```

#### 2.2 新規エンドポイント

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
@router.post("/storyboard/{storyboard_id}/scenes/{scene_number}/add-sub-scene")
async def add_sub_scene(
    storyboard_id: str,
    scene_number: int,
    request: AddSubSceneRequest,
    user: dict = Depends(get_current_user),
):
    """
    親シーンに追加カット（サブシーン）を追加

    - 親シーンの動画最終フレームを抽出して入力画像に使用
    - プロンプトは親から継承し、連続性を付与
    - カメラワークは連続性テーブルから自動選択
    """
    pass


@router.delete("/storyboard/{storyboard_id}/scenes/{scene_number}")
async def delete_sub_scene(
    storyboard_id: str,
    scene_number: int,
    user: dict = Depends(get_current_user),
):
    """
    サブシーンを削除（親シーンは削除不可）

    - 削除後、後続シーンのscene_numberを自動で詰める
    """
    pass


@router.get("/storyboard/{storyboard_id}/scenes/{scene_number}/sub-scenes")
async def list_sub_scenes(
    storyboard_id: str,
    scene_number: int,
    user: dict = Depends(get_current_user),
):
    """親シーンに紐づくサブシーン一覧を取得"""
    pass
```

#### 2.3 サービス層実装

**ファイル**: `movie-maker-api/app/videos/service.py`

```python
async def add_sub_scene(
    storyboard_id: str,
    parent_scene_number: int,
    description_ja: str | None = None,
    camera_work: str | None = None,
) -> StoryboardSceneResponse:
    """
    サブシーンを追加

    1. 親シーンの動画から最終フレームを抽出
    2. 親のプロンプトを継承して連続性プロンプトを生成
    3. カメラワーク連続性テーブルから適切なカメラワークを選択
    4. 新しいscene_numberを計算（親の次の空き番号）
    5. DBに挿入
    """
    pass


async def recalculate_scene_numbers(storyboard_id: str):
    """
    シーン削除後にscene_numberを再計算

    順序: 起(親→サブ) → 承(親→サブ) → 転(親→サブ) → 結(親→サブ)
    """
    pass
```

---

### Phase 3: クオリティ向上機能実装

#### 3.1 最終フレーム抽出

**ファイル**: `movie-maker-api/app/services/ffmpeg_service.py`

```python
async def extract_last_frame(
    self,
    video_path: str,
    output_path: str,
    offset_seconds: float = 0.1,
) -> str:
    """
    動画の最終フレームを画像として抽出

    Args:
        video_path: 入力動画パス
        output_path: 出力画像パス
        offset_seconds: 終端からのオフセット（デフォルト0.1秒前）

    Returns:
        出力画像のパス
    """
    cmd = [
        "ffmpeg", "-y",
        "-sseof", f"-{offset_seconds}",
        "-i", video_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path
    ]
    await self._run_ffmpeg(cmd)
    return output_path
```

#### 3.2 プロンプトチェーン生成

**ファイル**: `movie-maker-api/app/external/gemini_client.py`

```python
async def generate_continuation_prompt(
    parent_prompt: str,
    parent_description_ja: str,
    sub_scene_order: int,
    camera_work: str | None = None,
) -> dict:
    """
    親シーンから連続性のあるサブシーンプロンプトを生成

    Returns:
        {
            "description_ja": "日本語説明",
            "runway_prompt": "英語プロンプト（連続性付き）"
        }
    """
    system_prompt = """
    You are a cinematographer creating seamless scene continuations.

    Given a parent scene, generate a natural continuation that:
    1. Maintains the same subject, lighting, and visual style
    2. Progresses the action naturally (moments later)
    3. Uses temporal connectors for smooth transition
    4. Keeps consistent camera movement flow
    """

    user_prompt = f"""
    Parent scene prompt: {parent_prompt}
    Parent description (Japanese): {parent_description_ja}
    This is sub-scene #{sub_scene_order} after the parent.
    Camera work hint: {camera_work or 'auto-select for continuity'}

    Generate:
    1. Japanese description (1-2 sentences)
    2. English prompt with "[Seamless continuation]" prefix
    """

    # Gemini API呼び出し
    pass
```

#### 3.3 カメラワーク連続性テーブル

**ファイル**: `movie-maker-api/app/services/camera_continuity.py`

```python
CAMERA_CONTINUITY_MAP = {
    # 親のカメラワーク: [サブシーン1用, サブシーン2用, サブシーン3用]
    "Static shot": ["Slow push in", "Gentle arc right", "Pull back to wide"],
    "Slow zoom in": ["Hold on subject", "Slow pan right", "Ease out to static"],
    "Slow zoom out": ["Continue zoom out", "Pan to follow", "Static wide"],
    "Pan left": ["Slow to static", "Reverse pan right", "Tilt up"],
    "Pan right": ["Continue pan", "Slow to static", "Arc around subject"],
    "Tilt up": ["Hold at top", "Slow tilt down", "Pan right"],
    "Tilt down": ["Hold at bottom", "Reverse tilt up", "Push in"],
    "Tracking shot": ["Continue tracking", "Slow to static", "Pull back"],
    "Dolly in": ["Hold close", "Slow dolly out", "Arc right"],
    "Dolly out": ["Continue dolly out", "Static wide", "Pan to reveal"],
    "Crane up": ["Hold at height", "Slow crane down", "Pan horizon"],
    "Crane down": ["Hold low", "Push forward", "Tilt up"],
    "Handheld": ["Stabilize to static", "Gentle movement", "Follow action"],
    "360 orbit": ["Slow orbit", "Stop and hold", "Reverse orbit"],
}

def get_continuation_camera_work(
    parent_camera_work: str,
    sub_scene_order: int,
) -> str:
    """
    親カメラワークに基づいて自然な続きのカメラワークを返す

    Args:
        parent_camera_work: 親シーンのカメラワーク
        sub_scene_order: サブシーン順序（1, 2, 3）

    Returns:
        推奨カメラワーク文字列
    """
    # 正規化（大文字小文字、前後空白）
    normalized = parent_camera_work.strip().lower()

    for key, options in CAMERA_CONTINUITY_MAP.items():
        if key.lower() in normalized or normalized in key.lower():
            index = min(sub_scene_order - 1, len(options) - 1)
            return options[index]

    # マッチしない場合はデフォルト
    return ["Static hold", "Slow push in", "Gentle movement"][sub_scene_order - 1]
```

---

### Phase 4: ストーリーボード処理の拡張

#### 4.1 可変シーン数対応

**ファイル**: `movie-maker-api/app/tasks/storyboard_processor.py`

```python
async def process_storyboard_generation(
    storyboard_id: str,
    film_grain: str = "medium",
    use_lut: bool = True,
    video_provider: str = None,
):
    """
    ストーリーボードから全シーンを順番に生成

    変更点:
    - len(scenes) != 4 の検証を削除
    - 親シーン→サブシーンの順序で処理
    - サブシーンは親の最終フレームを入力画像に使用
    """
    # ... 既存コード ...

    scenes = scenes_response.data or []

    # 変更: 4シーン固定チェックを削除
    if len(scenes) == 0:
        raise Exception("No scenes found")

    # シーンを適切な順序でソート（act順 → sub_scene_order順）
    act_order = {"起": 1, "承": 2, "転": 3, "結": 4}
    scenes.sort(key=lambda s: (act_order.get(s["act"], 99), s.get("sub_scene_order", 0)))

    logger.info(f"Processing {len(scenes)} scenes in order")

    for i, scene in enumerate(scenes):
        parent_scene_id = scene.get("parent_scene_id")

        if parent_scene_id:
            # サブシーンの場合: 親の最終フレームを入力画像に使用
            parent_scene = next(s for s in scenes if s["id"] == parent_scene_id)
            parent_video_url = parent_scene.get("video_url")

            if parent_video_url:
                # 最終フレーム抽出
                scene_image_url = await extract_and_upload_last_frame(
                    parent_video_url,
                    storyboard_id,
                    scene["scene_number"]
                )
            else:
                scene_image_url = scene.get("scene_image_url") or source_image_url
        else:
            # 親シーンの場合: 通常通り
            scene_image_url = scene.get("scene_image_url") or source_image_url

        # ... 動画生成処理 ...
```

#### 4.2 結合順序の計算

**ファイル**: `movie-maker-api/app/tasks/storyboard_processor.py`

```python
def get_concatenation_order(scenes: list[dict]) -> list[dict]:
    """
    結合時のシーン順序を計算

    順序: 起(親→サブ1→サブ2→サブ3) → 承(親→サブ...) → 転 → 結

    Returns:
        結合順にソートされたシーンリスト
    """
    act_order = {"起": 1, "承": 2, "転": 3, "結": 4}

    # 親シーンとサブシーンをグループ化
    parent_scenes = [s for s in scenes if s.get("parent_scene_id") is None]

    ordered = []
    for parent in sorted(parent_scenes, key=lambda s: act_order.get(s["act"], 99)):
        # 親シーンを追加
        ordered.append(parent)

        # この親に紐づくサブシーンを順序通りに追加
        sub_scenes = [
            s for s in scenes
            if s.get("parent_scene_id") == parent["id"]
        ]
        sub_scenes.sort(key=lambda s: s.get("sub_scene_order", 0))
        ordered.extend(sub_scenes)

    return ordered
```

---

### Phase 5: フロントエンド実装

#### 5.1 APIクライアント拡張

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
export interface StoryboardScene {
  id: string;
  storyboard_id: string;
  scene_number: number;
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
  // 追加フィールド
  parent_scene_id: string | null;
  sub_scene_order: number;
  generation_seed: number | null;
}

export const storyboardApi = {
  // ... 既存メソッド ...

  // サブシーン追加
  addSubScene: (
    storyboardId: string,
    parentSceneNumber: number,
    data?: {
      description_ja?: string;
      camera_work?: string;
    }
  ): Promise<Storyboard> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${parentSceneNumber}/add-sub-scene`,
      {
        method: "POST",
        body: JSON.stringify(data || {}),
      }
    ),

  // サブシーン削除
  deleteSubScene: (
    storyboardId: string,
    sceneNumber: number
  ): Promise<Storyboard> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}`,
      { method: "DELETE" }
    ),

  // 親シーンのサブシーン一覧取得
  listSubScenes: (
    storyboardId: string,
    parentSceneNumber: number
  ): Promise<StoryboardScene[]> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${parentSceneNumber}/sub-scenes`
    ),
};
```

#### 5.2 UIコンポーネント

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

変更箇所の概要:

```typescript
// シーンをact別にグループ化
const groupScenesByAct = (scenes: StoryboardScene[]) => {
  const groups: Record<string, { parent: StoryboardScene; subScenes: StoryboardScene[] }> = {};

  for (const scene of scenes) {
    if (!scene.parent_scene_id) {
      // 親シーン
      groups[scene.act] = { parent: scene, subScenes: [] };
    }
  }

  for (const scene of scenes) {
    if (scene.parent_scene_id) {
      // サブシーン
      const parentAct = scenes.find(s => s.id === scene.parent_scene_id)?.act;
      if (parentAct && groups[parentAct]) {
        groups[parentAct].subScenes.push(scene);
      }
    }
  }

  return groups;
};

// サブシーン追加ハンドラ
const handleAddSubScene = async (parentSceneNumber: number) => {
  if (!storyboard) return;

  // 同一actのサブシーン数をチェック（最大3つまで）
  const parentScene = storyboard.scenes.find(s => s.scene_number === parentSceneNumber);
  const subSceneCount = storyboard.scenes.filter(
    s => s.parent_scene_id === parentScene?.id
  ).length;

  if (subSceneCount >= 3) {
    alert("このシーンには最大3つまでカットを追加できます");
    return;
  }

  try {
    setAddingSubScene(parentSceneNumber);
    const updated = await storyboardApi.addSubScene(storyboard.id, parentSceneNumber);
    setStoryboard(updated);
  } catch (error) {
    console.error("Failed to add sub-scene:", error);
    alert("カットの追加に失敗しました");
  } finally {
    setAddingSubScene(null);
  }
};
```

#### 5.3 UIレイアウト案

```
┌─────────────────────────────────────────────────────────────────┐
│  起 (導入)                                                       │
├─────────────┬─────────────┬─────────────┬─────────────┐        │
│   Scene 1   │  Sub 1-1    │  Sub 1-2    │    [+]      │        │
│   (親)      │  (追加)     │  (追加)     │   ボタン    │        │
│   5秒       │  5秒        │  5秒        │             │        │
│  ┌───────┐  │ ┌───────┐   │ ┌───────┐   │ ┌─────────┐ │        │
│  │ 動画  │  │ │ 動画  │   │ │ 動画  │   │ │  + 追加 │ │        │
│  │ プレ  │  │ │ プレ  │   │ │ プレ  │   │ │  カット │ │        │
│  │ ビュー│  │ │ ビュー│   │ │ ビュー│   │ └─────────┘ │        │
│  └───────┘  │ └───────┘   │ └───────┘   │             │        │
│  [編集]     │ [編集][×]   │ [編集][×]   │             │        │
└─────────────┴─────────────┴─────────────┴─────────────┘        │
│                                                                 │
│  承 (展開)                                                       │
├─────────────┬─────────────┐                                     │
│   Scene 2   │    [+]      │ ← まだ追加なし                      │
│   (親)      │   ボタン    │                                     │
...
```

---

## トランジション最適化

### シーン間トランジションの自動選択

```python
def get_optimal_transition(
    scene_a: dict,
    scene_b: dict,
) -> dict:
    """
    2つのシーン間の最適なトランジションを自動選択

    Returns:
        {"type": "cut" | "dissolve" | "fade", "duration": float}
    """
    # 同一act内（親→サブ、サブ→サブ）の場合
    if scene_a["act"] == scene_b["act"]:
        # ハードカットまたは非常に短いディゾルブ
        return {"type": "cut", "duration": 0}

    # act間のトランジション
    return {"type": "dissolve", "duration": 0.5}
```

---

## 料金・コスト考慮

### API呼び出し回数の増加

| シナリオ | シーン数 | 動画生成API | 推定コスト |
|----------|----------|-------------|------------|
| 基本（現状） | 4 | 4回 | $X |
| 1act追加×1 | 5 | 5回 | $1.25X |
| 全act追加×1 | 8 | 8回 | $2X |
| 最大拡張 | 16 | 16回 | $4X |

### 推奨: 段階的課金

```
- 基本プラン: 4シーンまで（現状と同じ）
- 追加カット: 1カットあたり追加料金
```

---

## 実装フェーズとスケジュール

| Phase | 内容 | 依存関係 |
|-------|------|----------|
| Phase 1 | DBスキーマ拡張 | なし |
| Phase 2 | バックエンドAPI | Phase 1 |
| Phase 3 | クオリティ向上機能 | Phase 2 |
| Phase 4 | ストーリーボード処理拡張 | Phase 2, 3 |
| Phase 5 | フロントエンドUI | Phase 2, 4 |

---

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存データ非互換 | 高 | マイグレーションで`parent_scene_id=NULL`をデフォルト設定 |
| 生成時間増加 | 中 | 並列生成を検討（ただし一貫性とのトレードオフ） |
| UI複雑化 | 中 | 段階的公開（まず1カット追加のみ） |
| コスト増加 | 中 | 追加カットに課金、上限設定 |

---

## 検証項目

- [ ] 親シーン動画から最終フレーム抽出が正しく動作する
- [ ] サブシーンのプロンプトに連続性が反映される
- [ ] カメラワーク連続性テーブルが適切なカメラワークを返す
- [ ] 結合順序が正しい（起親→起サブ→承親→...）
- [ ] サブシーン削除後のscene_number再計算が正しい
- [ ] UIでサブシーン追加/削除が動作する
- [ ] 既存の4シーンストーリーボードが正常に動作する（後方互換）
