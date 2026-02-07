# シーン追加機能 V2V対応 実装計画書

## 概要

シーン追加モーダルにI2V/V2V切り替え機能を追加し、V2V選択時に任意の既存シーン動画を選択して、その動画を参照した動画生成を可能にする。

## 現状分析

### 既存のV2V実装
- `get_previous_video_url()`: display_order順で直前シーンのvideo_urlを自動取得
- `generate_video_v2v(video_url, prompt, aspect_ratio)`: 動画から動画を生成
- 再生成モーダルでは「直前シーンの動画があればV2V可能」という制約

### 新機能要件
1. シーン追加時にI2V/V2V選択可能
2. V2V選択時に任意のシーン動画を選択可能（直前シーンに限らない）
3. シーン追加と同時に動画生成を開始

---

## 発見した問題点と対策

### 問題1: `process_single_scene_regeneration`が`source_video_url`を受け取れない

**現状**:
```python
async def process_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,
    video_mode: str = None,  # ← source_video_urlがない
):
```

V2Vモードの場合、`get_previous_video_url()`で自動取得しているため、**任意のシーンの動画を参照できない**。

**対策**: 新規パラメータ`source_video_url`を追加
```python
async def process_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,
    video_mode: str = None,
    source_video_url: str = None,  # ← 追加
):
```

### 問題2: `scene_number`での検索は新規シーンに不適切

**現状**:
```python
.eq("scene_number", scene_number)
```

新規追加シーンは`scene_number = display_order`となるが、並べ替え後にずれる可能性がある。

**対策**: 新規シーン用に`scene_id`で検索する別関数を作成するか、`scene_id`を優先するロジックに変更

### 問題3: V2Vモード時のシーン初期ステータス

**現状**:
```python
"status": "image_ready" if request.custom_image_url else "pending"
```

V2Vモードでは画像不要なので、`source_video_url`があれば動画生成可能。

**対策**: V2Vモードの場合は`status: "v2v_ready"`または直接`"generating"`に設定

---

## UI設計

### シーン追加モーダル（更新後）

```
┌─────────────────────────────────────────────┐
│ シーンを追加                            [×] │
├─────────────────────────────────────────────┤
│                                             │
│ ◉ I2V（画像から動画生成）                   │
│ ○ V2V（既存動画から継続生成）               │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ 【I2V選択時】                               │
│ シーンの説明（日本語）  [英語に翻訳]        │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 英語プロンプト（動画生成に使用）            │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ カスタム画像（任意）                        │
│ ┌─────────────────────────────────────────┐ │
│ │     [画像をアップロード]                │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ 【V2V選択時】                               │
│ 参照する動画を選択                          │
│ ┌─────────────────────────────────────────┐ │
│ │ ▼ シーン1（起）- 主人公が...           │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────┐                         │
│ │  [動画サムネ]   │ シーン1（起）          │
│ │                 │ 主人公が夕日を...      │
│ └─────────────────┘                         │
│                                             │
│ シーンの説明（日本語）  [英語に翻訳]        │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 英語プロンプト（動画生成に使用）            │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
├─────────────────────────────────────────────┤
│ ☑ 追加と同時に動画生成を開始               │
│                                             │
│    [キャンセル]        [追加]               │
└─────────────────────────────────────────────┘
```

---

## 実装タスク

### Phase 1: バックエンド変更

#### 1.1 スキーマ更新 (`movie-maker-api/app/videos/schemas.py`)

```python
class AddSceneRequest(BaseModel):
    """シーン追加リクエスト"""
    description_ja: str = Field(..., min_length=1, description="シーンの日本語説明")
    runway_prompt: Optional[str] = Field(None, description="英語プロンプト（未指定時は自動翻訳）")
    custom_image_url: Optional[str] = Field(None, description="カスタム画像URL（I2Vのみ）")
    video_mode: Optional[str] = Field("i2v", description="動画生成モード: 'i2v' or 'v2v'")
    source_video_url: Optional[str] = Field(None, description="V2V参照動画URL")
    auto_generate_video: bool = Field(False, description="追加と同時に動画生成を開始")
```

#### 1.2 タスク関数更新 (`movie-maker-api/app/tasks/storyboard_processor.py`)

**1.2.1 `process_single_scene_regeneration`に`source_video_url`パラメータ追加**

```python
async def process_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,
    video_mode: str = None,
    source_video_url: str = None,  # ← 追加
):
```

**1.2.2 V2V処理ロジックを更新**

```python
# V2Vモードの場合
previous_video_url = None
if video_mode == "v2v":
    if source_video_url:
        # source_video_urlが指定されている場合はそれを使用（任意シーン参照）
        previous_video_url = source_video_url
        logger.info(f"V2V: Using specified source video for scene {scene_number}")
    else:
        # 指定がなければ従来通り直前シーンを取得
        all_scenes_response = (
            supabase.table("storyboard_scenes")
            .select("*")
            .eq("storyboard_id", storyboard_id)
            .execute()
        )
        all_scenes = all_scenes_response.data or []
        previous_video_url = get_previous_video_url(scene, all_scenes)

    if not previous_video_url:
        logger.warning(f"V2V requested but no source video found for scene {scene_number}, falling back to I2V")
        video_mode = "i2v"
```

**1.2.3 `start_single_scene_regeneration`にもパラメータ追加**

```python
def start_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,
    video_mode: str = None,
    source_video_url: str = None,  # ← 追加
):
    """単一シーン再生成を開始（同期ラッパー）"""
    asyncio.run(process_single_scene_regeneration(
        storyboard_id, scene_number, video_provider, custom_prompt, video_mode, source_video_url
    ))
```

**1.2.4 `__init__.py`のエクスポート確認**

```python
from app.tasks.storyboard_processor import (
    ...
    start_single_scene_regeneration,
    ...
)
```

#### 1.3 ルーター更新 (`movie-maker-api/app/videos/router.py`)

**1.3.1 `add_scene` API を更新**

```python
@router.post("/storyboard/{storyboard_id}/scenes", status_code=201)
async def add_scene(
    storyboard_id: str,
    request: AddSceneRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    # ... 既存のロジック ...

    # 動画生成モードの処理
    video_mode = request.video_mode or "i2v"
    source_video_url = request.source_video_url

    # V2Vモードの検証
    if video_mode == "v2v":
        if not source_video_url:
            raise HTTPException(status_code=400, detail="V2Vモードには参照動画URLが必要です")

    # ステータス決定ロジック
    if request.auto_generate_video:
        initial_status = "generating"
    elif video_mode == "v2v" and source_video_url:
        initial_status = "v2v_ready"
    elif request.custom_image_url:
        initial_status = "image_ready"
    else:
        initial_status = "pending"

    # 新規シーン作成
    new_scene_data = {
        "storyboard_id": storyboard_id,
        "display_order": new_order,
        "scene_number": new_order,
        "act": "custom",
        "description_ja": request.description_ja,
        "runway_prompt": runway_prompt,
        "scene_image_url": request.custom_image_url if video_mode == "i2v" else None,
        "status": initial_status,
        "progress": 10 if request.auto_generate_video else 0,
        "duration_seconds": 5,
        "sub_scene_order": 0,
    }

    result = supabase.table("storyboard_scenes").insert(new_scene_data).execute()
    new_scene = result.data[0]

    # 自動動画生成
    if request.auto_generate_video:
        from app.tasks import start_single_scene_regeneration
        background_tasks.add_task(
            start_single_scene_regeneration,
            storyboard_id,
            new_scene["scene_number"],
            storyboard.get("video_provider", "runway"),
            None,  # custom_prompt: runway_promptはDB保存済み
            video_mode,
            source_video_url,
        )
        # usage count を1増加
        supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # ... 以降は既存のロジック ...
```

**1.3.2 `regenerate_scene_video` APIにも`source_video_url`サポート追加**

```python
class RegenerateSceneVideoRequest(BaseModel):
    prompt: Optional[str] = None
    video_provider: Optional[VideoProvider] = None
    video_mode: Optional[VideoMode] = None
    source_video_url: Optional[str] = None  # ← 追加
```

### Phase 2: フロントエンド変更

#### 2.1 APIクライアント更新 (`lib/api/client.ts`)

```typescript
addScene: (
  storyboardId: string,
  data: {
    description_ja: string;
    runway_prompt?: string;
    custom_image_url?: string;
    video_mode?: 'i2v' | 'v2v';
    source_video_url?: string;
    auto_generate_video?: boolean;
  }
): Promise<{
  scene: StoryboardScene;
  scenes: StoryboardScene[];
}> => ...
```

#### 2.2 状態追加 (`app/generate/storyboard/page.tsx`)

```typescript
// 動画生成モード
const [addSceneVideoMode, setAddSceneVideoMode] = useState<'i2v' | 'v2v'>('i2v');

// V2V参照シーン
const [addSceneSourceSceneId, setAddSceneSourceSceneId] = useState<string | null>(null);

// 自動動画生成
const [addSceneAutoGenerate, setAddSceneAutoGenerate] = useState(false);
```

#### 2.3 モーダルUI更新

1. I2V/V2V ラジオボタン追加
2. V2V選択時のシーンセレクタ追加
3. 選択シーンのプレビュー表示
4. 自動動画生成チェックボックス追加
5. V2V選択時は画像アップロードを非表示

#### 2.4 ハンドラ更新

```typescript
const handleAddScene = async () => {
  // ...

  // V2V用の参照動画URL取得
  let sourceVideoUrl: string | undefined;
  if (addSceneVideoMode === 'v2v' && addSceneSourceSceneId) {
    const sourceScene = storyboard.scenes.find(s => s.id === addSceneSourceSceneId);
    sourceVideoUrl = sourceScene?.video_url || undefined;
  }

  const result = await storyboardApi.addScene(storyboard.id, {
    description_ja: addSceneDescription.trim(),
    runway_prompt: addSceneRunwayPrompt.trim() || undefined,
    custom_image_url: addSceneVideoMode === 'i2v' ? customImageUrl : undefined,
    video_mode: addSceneVideoMode,
    source_video_url: sourceVideoUrl,
    auto_generate_video: addSceneAutoGenerate,
  });

  // 自動生成開始時はポーリングを開始
  if (addSceneAutoGenerate) {
    // 新規シーンのscene_numberでポーリング
    const newScene = result.scene;
    setRetryingSceneVideo(newScene.scene_number);
    pollSingleSceneStatus(newScene.scene_number);
  }

  // ...
};
```

### Phase 3: シーン選択コンポーネント

#### 3.1 SceneSelector コンポーネント作成

```tsx
// components/video/scene-selector.tsx

interface SceneSelectorProps {
  scenes: StoryboardScene[];
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
}

export function SceneSelector({ scenes, selectedSceneId, onSelect }: SceneSelectorProps) {
  // 動画があるシーンのみフィルタ
  const availableScenes = scenes.filter(s => s.video_url);

  return (
    <div>
      {/* ドロップダウン */}
      <select value={selectedSceneId || ''} onChange={e => onSelect(e.target.value)}>
        <option value="">シーンを選択...</option>
        {availableScenes.map(scene => (
          <option key={scene.id} value={scene.id}>
            シーン{scene.display_order}（{scene.act}）- {scene.description_ja.slice(0, 20)}...
          </option>
        ))}
      </select>

      {/* 選択シーンのプレビュー */}
      {selectedSceneId && (
        <ScenePreview scene={availableScenes.find(s => s.id === selectedSceneId)} />
      )}
    </div>
  );
}
```

---

## DBマイグレーション

**不要**

V2V用の参照動画URLはリクエスト時のみ使用され、DBには保存しない。
生成後は通常通り `video_url` カラムに生成された動画URLが保存される。

---

## テスト計画

### ユニットテスト

#### バックエンド (`movie-maker-api/tests/videos/test_add_scene_v2v.py`)

```python
import pytest
from app.videos.schemas import AddSceneRequest

class TestAddSceneV2V:
    """シーン追加V2V機能のテスト"""

    def test_add_scene_i2v_mode(self):
        """I2Vモードでシーン追加"""
        request = AddSceneRequest(
            description_ja="テストシーン",
            video_mode="i2v"
        )
        assert request.video_mode == "i2v"
        assert request.source_video_url is None

    def test_add_scene_v2v_mode_with_source(self):
        """V2Vモードでシーン追加（参照動画あり）"""
        request = AddSceneRequest(
            description_ja="テストシーン",
            video_mode="v2v",
            source_video_url="https://example.com/video.mp4"
        )
        assert request.video_mode == "v2v"
        assert request.source_video_url is not None

    def test_add_scene_v2v_mode_without_source_should_fail(self):
        """V2Vモードで参照動画なしはエラー"""
        # APIレベルでの検証
        pass

    def test_add_scene_with_auto_generate(self):
        """自動動画生成オプション"""
        request = AddSceneRequest(
            description_ja="テストシーン",
            auto_generate_video=True
        )
        assert request.auto_generate_video is True
```

### 統合テスト

#### フロントエンド E2E (`movie-maker/tests/e2e/add-scene-v2v.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test.describe('シーン追加V2V機能', () => {
  test('I2Vモードでシーン追加', async ({ page }) => {
    // 1. ストーリーボードページに移動
    // 2. レビューステップに進む
    // 3. シーン追加ボタンをクリック
    // 4. I2Vモードを選択（デフォルト）
    // 5. 説明を入力
    // 6. 追加ボタンをクリック
    // 7. シーンが追加されていることを確認
  });

  test('V2Vモードでシーン追加', async ({ page }) => {
    // 1. 既存シーンに動画があることを確認
    // 2. シーン追加ボタンをクリック
    // 3. V2Vモードを選択
    // 4. 参照シーンを選択
    // 5. 説明を入力
    // 6. 追加ボタンをクリック
    // 7. シーンが追加されていることを確認
  });

  test('V2Vモードで自動動画生成', async ({ page }) => {
    // 1. V2Vモードでシーン追加
    // 2. 自動動画生成チェックボックスをON
    // 3. 追加後、動画生成中の表示を確認
    // 4. 動画生成完了を確認（タイムアウト長め）
  });

  test('動画がないシーンはV2V参照に表示されない', async ({ page }) => {
    // 1. シーン追加モーダルを開く
    // 2. V2Vモードを選択
    // 3. ドロップダウンに動画なしシーンが含まれないことを確認
  });
});
```

### 手動テスト項目

| # | テスト項目 | 手順 | 期待結果 |
|---|-----------|------|----------|
| 1 | I2Vモード基本動作 | I2Vモードでシーン追加 | シーンが末尾に追加される |
| 2 | V2Vモード基本動作 | V2Vモードで参照シーン選択してシーン追加 | シーンが追加され、参照動画情報が正しく渡される |
| 3 | V2Vシーン選択UI | V2Vモード選択時 | 動画があるシーンのみ選択肢に表示 |
| 4 | V2Vプレビュー表示 | シーンを選択 | サムネイルと説明が表示される |
| 5 | 自動動画生成 | チェックボックスONで追加 | 追加後に動画生成が開始される |
| 6 | ポーリング動作 | 自動動画生成ON | 生成完了まで進捗表示される |
| 7 | モード切替時のUI | I2V→V2V切替 | 画像アップロードが非表示になる |
| 8 | モード切替時のUI | V2V→I2V切替 | シーン選択が非表示になる |
| 9 | エラーハンドリング | V2Vで参照シーン未選択で追加 | エラーメッセージ表示 |
| 10 | ドラッグ&ドロップ | V2Vで追加後に並べ替え | 正常に並べ替え可能 |

---

## 実装順序

1. **Phase 1.1**: バックエンドスキーマ更新（15分）
2. **Phase 1.2**: バックエンドルーター更新（30分）
3. **Phase 1.3**: バックエンドタスク関数追加（30分）
4. **Phase 2.1**: フロントエンドAPIクライアント更新（10分）
5. **Phase 2.2**: フロントエンド状態追加（10分）
6. **Phase 2.3-2.4**: モーダルUI・ハンドラ更新（45分）
7. **Phase 3**: シーン選択コンポーネント（30分）
8. **テスト実施**: ユニット・統合・手動テスト（60分）

**合計見積もり: 約4時間**

---

## 注意事項

1. **V2Vモード時の画像**
   - V2Vモードではカスタム画像アップロードは無効化
   - 画像は参照動画から自動抽出されるため不要

2. **動画がないシーン**
   - V2V参照先として選択不可
   - UI上でフィルタリング

3. **自動動画生成時の状態管理**
   - 追加直後は `status: "generating"`
   - ポーリングで進捗を追跡
   - 既存の `retryingSceneVideo` 状態を流用

4. **エラーハンドリング**
   - V2Vで参照動画が削除された場合のエラー処理
   - 動画生成失敗時のリトライUI

---

## 実装前チェックリスト

### バックエンド確認済み項目

| # | 確認項目 | 状態 | 対策 |
|---|---------|------|------|
| 1 | `AddSceneRequest`に`runway_prompt`が既に存在 | ✅ 確認済 | 追加フィールドのみ |
| 2 | `process_single_scene_regeneration`は`scene_number`で検索 | ⚠️ 要注意 | 新規シーンは`scene_number=display_order`で作成されるため動作する |
| 3 | `start_single_scene_regeneration`のパラメータ追加 | 🔧 要修正 | `source_video_url`パラメータ追加 |
| 4 | `RegenerateVideoRequest`に`source_video_url`がない | 🔧 要修正 | フィールド追加 |
| 5 | DBマイグレーション | ✅ 不要 | `source_video_url`はリクエスト時のみ使用 |

### フロントエンド確認済み項目

| # | 確認項目 | 状態 | 対策 |
|---|---------|------|------|
| 1 | `storyboardApi.addScene`に`runway_prompt`が既に存在 | ✅ 確認済 | 追加フィールドのみ |
| 2 | ポーリングは`scene_number`をキーに使用 | ✅ 確認済 | APIレスポンスから`scene.scene_number`を取得 |
| 3 | `pollSingleSceneStatus`の`sawGenerating`ロジック | ✅ 確認済 | `status: "generating"`から開始するため正常動作 |
| 4 | `generatingSceneVideo`と`retryingSceneVideo`の状態 | ⚠️ 要注意 | 両方を適切にセット/クリアする |

### 潜在的リスク

| リスク | 影響度 | 対策 |
|-------|-------|------|
| 並べ替え後に`scene_number`がずれる | 中 | 追加直後にポーリング開始、並べ替えはポーリング完了後に制限 |
| V2V参照動画がストレージから削除される | 低 | 動画生成時にURL検証、エラーメッセージ表示 |
| 大量シーン追加時のパフォーマンス | 低 | 1シーンずつ追加するUIのため問題なし |

---

## 関連ドキュメント

- `/docs/scene-add-implementation-plan.md` - シーン追加機能基本実装
- `/docs/v2v-implementation-plan.md` - V2V実装（既存）
