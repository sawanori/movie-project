# カメラワーク プロバイダー互換性対応 実装計画書

## 概要

Runway と VEO でサポートされるカメラワークの違いに対応するため、プロバイダー別のカメラワーク管理機能を実装する。

### 目的

1. ユーザーが選択したカメラワークが確実に動画に反映されるようにする
2. VEO非対応のカメラワークをユーザーに明示する
3. 非対応カメラワークが選択された場合、適切なフォールバックを提供する

---

## 現状の問題点

### 1. プロバイダー間の互換性問題

| 問題 | 詳細 |
|------|------|
| VEOの制約 | 「1クリップ1動詞」ルール - 複合動作は品質低下 |
| orbit系 | VEOは360°回転を適切に処理できない |
| 複合動作 | `dolly_zoom_in`（めまい効果）等はVEO非対応 |
| 追従系 | 複雑な追従（steadicam等）はVEOで不安定 |

### 2. 現在のカメラワーク分布（95種）

```
static:     2種  → VEO: 全対応
approach:  21種  → VEO: 一部非対応（dolly_zoom系）
horizontal: 14種 → VEO: 全対応
vertical:  18種  → VEO: 全対応
orbit:     17種  → VEO: 大部分非対応
follow:    22種  → VEO: 一部非対応
dramatic:  21種  → VEO: 一部非対応
```

---

## 実装方針

### アプローチ: フロントエンド + バックエンド 両面対応

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (camera-works.ts)                              │
│ - providers フィールド追加                               │
│ - UI でプロバイダー別フィルタリング                       │
│ - 非対応カメラワークをグレーアウト表示                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Backend (video_provider.py)                             │
│ - VEO用フォールバックマッピング追加                      │
│ - 非対応カメラワークを自動変換                           │
│ - ログで変換を記録                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 実装ステップ

### Phase 1: バックエンド - カメラワーク変換レイヤー

#### 1.1 VEOフォールバックマッピング追加

**ファイル**: `movie-maker-api/app/external/video_provider.py`

```python
# VEO非対応カメラワーク → 対応カメラワークへの変換
VEO_CAMERA_FALLBACK = {
    # orbit系 → arc/dolly に変換
    "360_shot": "slow arc shot around subject",
    "orbit_clockwise": "slow arc right around subject",
    "orbit_counterclockwise": "slow arc left around subject",
    "circle_slow": "slow arc around subject",
    "rotate_360": "slow arc shot around subject",
    "rotate_vertical": "slow tilt up",
    "rotate_looking_up": "slow crane up while tilting",

    # 複合動作 → シンプル動作に変換
    "dolly_zoom_in": "slow dolly in",
    "dolly_zoom_out": "slow dolly out",
    "arc_left_tilt_up": "slow dolly in",
    "arc_right_tilt_down": "slow dolly out",
    "jib_up_tilt_down": "slow crane up",
    "jib_down_tilt_up": "slow crane down",
    "tilt_zoom_combo": "slow zoom in",

    # 特殊効果系 → static/シンプルに変換
    "rotational_shot": "static shot",
    "dutch_angle": "static shot with slight tilt",

    # 追従系 → tracking に統一
    "steadicam": "smooth tracking shot",
    "handheld": "static shot with subtle movement",
}

def get_veo_compatible_camera(camera_work: str) -> str:
    """VEO用にカメラワークを変換"""
    return VEO_CAMERA_FALLBACK.get(camera_work, camera_work)
```

#### 1.2 build_prompt_with_camera の拡張

```python
def build_prompt_with_camera(
    base_prompt: str,
    camera_work: Optional[str] = None,
    provider: str = "runway"
) -> str:
    if not camera_work:
        return base_prompt

    # VEOの場合はフォールバック変換
    if provider == "veo":
        original = camera_work
        camera_work = get_veo_compatible_camera(camera_work)
        if original != camera_work:
            logger.info(f"VEO fallback: {original} → {camera_work}")

    camera_text = CAMERA_PROMPT_MAPPING.get(camera_work, camera_work)
    return f"{base_prompt} Camera: {camera_text}."
```

### Phase 2: フロントエンド - プロバイダー別表示

#### 2.1 types.ts 更新

**ファイル**: `movie-maker/lib/camera/types.ts`

```typescript
export type VideoProvider = 'runway' | 'veo';

export interface CameraWork {
  id: number;
  name: string;
  label: string;
  description: string;
  category: CameraWorkCategory;
  promptText: string;
  iconSymbol: string;
  guaranteed?: boolean;
  providers: VideoProvider[];  // 新規追加
}
```

#### 2.2 camera-works.ts 更新

**ファイル**: `movie-maker/lib/camera/camera-works.ts`

各カメラワークに `providers` フィールドを追加:

```typescript
// VEO完全対応
{
  id: 20,
  name: 'dolly_in',
  label: '近づく',
  promptText: 'dolly in on the protagonist',
  category: 'approach',
  providers: ['runway', 'veo'],
}

// Runway専用
{
  id: 41,
  name: '360_shot',
  label: 'ぐるっと一周',
  promptText: '360-degree shot circling the protagonist',
  category: 'orbit',
  providers: ['runway'],
}
```

#### 2.3 フィルタリング関数追加

```typescript
export function getCameraWorksByProvider(
  provider: VideoProvider,
  category?: string
): CameraWork[] {
  let works = CAMERA_WORKS.filter(work =>
    work.providers.includes(provider)
  );

  if (category && category !== 'all') {
    works = works.filter(work => work.category === category);
  }

  return works;
}

export function isCameraWorkSupported(
  cameraWork: CameraWork,
  provider: VideoProvider
): boolean {
  return cameraWork.providers.includes(provider);
}
```

#### 2.4 UI コンポーネント更新

**ファイル**: `movie-maker/components/camera/CameraWorkSelector.tsx`

```tsx
// プロバイダーに応じてカメラワークをフィルタリング/グレーアウト
const filteredWorks = useMemo(() => {
  return getCameraWorksByCategory(selectedCategory).map(work => ({
    ...work,
    disabled: !isCameraWorkSupported(work, videoProvider),
  }));
}, [selectedCategory, videoProvider]);
```

### Phase 3: プロバイダー情報の伝播

#### 3.1 APIリクエストにプロバイダー情報を含める

現在の設定（`VIDEO_PROVIDER`環境変数）をフロントエンドに公開:

**ファイル**: `movie-maker-api/app/core/router.py` または新規エンドポイント

```python
@router.get("/api/v1/config/video-provider")
async def get_video_provider():
    return {"provider": settings.VIDEO_PROVIDER}
```

#### 3.2 フロントエンドでプロバイダー取得

```typescript
// lib/api/config.ts
export async function getVideoProvider(): Promise<VideoProvider> {
  const response = await fetch('/api/v1/config/video-provider');
  const data = await response.json();
  return data.provider;
}
```

---

## VEO対応/非対応カメラワーク一覧

### ✅ VEO完全対応（両プロバイダー）

| カテゴリ | カメラワーク |
|---------|-------------|
| static | static_shot, over_the_shoulder |
| approach | zoom_in, zoom_out, dolly_in, dolly_out, push_in, pull_out, slow_approach_building |
| horizontal | pan_left, pan_right, truck_left, truck_right, track_left, track_right, slow_pan_horizon |
| vertical | tilt_up, tilt_down, pedestal_up, pedestal_down, crane_up, crane_down |
| follow | drone, pov, tracking, follow_behind, follow_side |
| dramatic | top_shot, hero_shot, reveal_shot, zoom_object |

### ⚠️ VEO非対応（Runway専用）

| カテゴリ | カメラワーク | 理由 |
|---------|-------------|------|
| approach | dolly_zoom_in, dolly_zoom_out | めまい効果はVEO非対応 |
| orbit | 360_shot, orbit_clockwise, orbit_counterclockwise, rotate_360, rotate_vertical | 360°回転は不安定 |
| orbit | arc_left_tilt_up, arc_right_tilt_down | 複合動作 |
| follow | steadicam | 複雑な追従 |
| dramatic | rotational_shot, dutch_angle | 特殊アングル |
| vertical | jib_up_tilt_down, jib_down_tilt_up, tilt_zoom_combo | 複合動作 |

---

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker-api/app/external/video_provider.py` | VEOフォールバックマッピング追加、build_prompt_with_camera拡張 |
| `movie-maker-api/app/external/veo_provider.py` | provider名をbuild_prompt_with_cameraに渡す |
| `movie-maker-api/app/external/runway_provider.py` | provider名をbuild_prompt_with_cameraに渡す |
| `movie-maker/lib/camera/types.ts` | providers フィールド追加 |
| `movie-maker/lib/camera/camera-works.ts` | 全95件に providers 追加 |
| `movie-maker/components/camera/CameraWorkSelector.tsx` | プロバイダー別フィルタリング |
| `movie-maker/lib/api/config.ts` | プロバイダー取得API（新規） |

---

## テスト計画

### 1. ユニットテスト

```python
# test_video_provider.py
def test_veo_camera_fallback():
    result = get_veo_compatible_camera("360_shot")
    assert result == "slow arc shot around subject"

def test_veo_compatible_camera_passthrough():
    result = get_veo_compatible_camera("dolly_in")
    assert result == "dolly_in"  # 変換なし
```

### 2. 統合テスト

- [ ] VEO + 対応カメラワーク → 正常動作確認
- [ ] VEO + 非対応カメラワーク → フォールバック確認
- [ ] Runway + 全カメラワーク → 正常動作確認
- [ ] フロントエンド表示 → プロバイダー切替で表示変化確認

### 3. E2Eテスト

- [ ] VEOモードでorbit系カメラワークがグレーアウトされる
- [ ] グレーアウトされたカメラワークは選択不可
- [ ] 選択済みカメラワークがVEO非対応の場合、警告表示

---

## 実装優先順位

1. **Phase 1** (バックエンド): 最優先 - 現在VEO使用時の品質問題を即座に改善
2. **Phase 2** (フロントエンド): 次優先 - UX改善
3. **Phase 3** (プロバイダー情報伝播): 最後 - Phase 2の前提条件

---

## 見積もり

| Phase | 作業時間 |
|-------|---------|
| Phase 1 | 1時間 |
| Phase 2 | 2時間 |
| Phase 3 | 30分 |
| テスト | 1時間 |
| **合計** | **4.5時間** |

---

## 注意事項

1. `providers`フィールドは既存のカメラワーク選択UIに影響するため、段階的に導入する
2. VEOのカメラワーク対応状況は実際のテストで検証し、マッピングを調整する
3. 将来的に新しいプロバイダー（Kling等）が追加された場合も同様のパターンで対応可能
