# カメラワーク選択UI 実装計画書

## 概要

ストーリーボードのシーン編集画面で、122種類のカメラワークをモーダルUIで選択できる機能を実装する。

### 目的

- ユーザーが各シーンのカメラワークを自由に変更できるようにする
- AI自動設定に依存せず、クリエイティブコントロールを提供
- サブシーン機能の前提条件として実装

### スコープ

| 項目 | 対象 |
|------|------|
| 対象画面 | ストーリーボード シーン編集画面 |
| カメラワーク数 | 122種類（8カテゴリ） |
| UI方式 | モーダル（ポップアップ） |
| プレビュー | Phase 1: アイコン+説明文 |

---

## 現状分析

### 現在のカメラワーク実装

**バックエンド（schemas.py）**
```python
class CameraWork(str, Enum):
    SLOW_ZOOM_IN = "slow_zoom_in"
    SLOW_ZOOM_OUT = "slow_zoom_out"
    TRACKING = "tracking"
    DYNAMIC_PAN = "dynamic_pan"
    STATIC = "static"
    ARC_SHOT = "arc_shot"
    DOLLY_IN = "dolly_in"
    CRANE_UP = "crane_up"
    WHIP_PAN = "whip_pan"
```

**Gemini生成時**
- AI が各シーンにカメラワークを自動割り当て
- 選択肢: 9種類のみ

**フロントエンド**
- 表示のみ: `scene.camera_work?.replace(/_/g, " ")`
- 編集機能: なし

### 既存仕様書

- `docs/camera-work-ui-spec.md` - 詳細UI仕様（122種定義済み）
- `docs/camera_prompts.yaml` - カメラワークプロンプト定義

---

## 実装計画

### Phase 1: 基本実装（4日）

#### Day 1: データ準備

**1.1 型定義作成**

```
movie-maker/lib/camera/types.ts
```

```typescript
export type CameraCategory =
  | 'static'       // 動かさない
  | 'approach'     // 近づく・離れる
  | 'horizontal'   // 左右に動く
  | 'vertical'     // 上下に動く
  | 'orbit'        // 回り込む
  | 'follow'       // 追いかける
  | 'dramatic'     // ドラマ演出
  | 'timelapse';   // 時間表現

export interface CameraWork {
  id: number;
  name: string;           // 英語名（API送信用）
  label: string;          // 日本語ラベル
  description: string;    // 効果の説明
  category: CameraCategory;
  promptText: string;     // プロンプト文字列
  iconSymbol: string;     // アイコン記号
}

export interface CameraCategory {
  id: CameraCategory;
  label: string;
  icon: string;
  description: string;
}

export type CameraPreset = 'simple' | 'cinematic' | 'dynamic' | 'custom';

export interface CameraPresetConfig {
  id: CameraPreset;
  icon: string;
  label: string;
  description: string;
  cameraWorkName: string;  // 対応するカメラワーク名
  promptText: string;
}
```

**1.2 カテゴリ定義**

```
movie-maker/lib/camera/categories.ts
```

```typescript
import { CameraCategory } from './types';

export const CAMERA_CATEGORIES: {
  id: CameraCategory;
  label: string;
  icon: string;
  description: string;
  count: number;
}[] = [
  { id: 'static', label: '動かさない', icon: '📍', description: 'カメラ固定', count: 2 },
  { id: 'approach', label: '近づく・離れる', icon: '↔️', description: '距離を変える', count: 21 },
  { id: 'horizontal', label: '左右に動く', icon: '↔', description: '横方向の動き', count: 14 },
  { id: 'vertical', label: '上下に動く', icon: '↕', description: '縦方向の動き', count: 18 },
  { id: 'orbit', label: '回り込む', icon: '🔄', description: '周囲を回転', count: 17 },
  { id: 'follow', label: '追いかける', icon: '🏃', description: '被写体を追従', count: 26 },
  { id: 'dramatic', label: 'ドラマ演出', icon: '🎬', description: '特殊効果', count: 21 },
  { id: 'timelapse', label: '時間表現', icon: '⏱️', description: 'タイムラプス等', count: 3 },
];
```

**1.3 プリセット定義**

```
movie-maker/lib/camera/presets.ts
```

```typescript
import { CameraPresetConfig } from './types';

export const CAMERA_PRESETS: CameraPresetConfig[] = [
  {
    id: 'simple',
    icon: '📍',
    label: 'シンプル',
    description: 'カメラ固定。被写体の動きだけに集中',
    cameraWorkName: 'static',
    promptText: 'static shot, camera remains still',
  },
  {
    id: 'cinematic',
    icon: '🎬',
    label: 'シネマティック',
    description: 'ゆっくり近づく映画的な動き',
    cameraWorkName: 'slow_zoom_in',
    promptText: 'slow dolly in, cinematic camera movement',
  },
  {
    id: 'dynamic',
    icon: '🌀',
    label: 'ダイナミック',
    description: '被写体の周りを回り込む立体的な動き',
    cameraWorkName: 'arc_shot',
    promptText: 'orbit shot around the subject, dynamic camera movement',
  },
  {
    id: 'custom',
    icon: '⚙️',
    label: 'カスタム',
    description: '122種類から選ぶ',
    cameraWorkName: '',
    promptText: '',
  },
];
```

**1.4 カメラワーク定義（122種）**

```
movie-maker/lib/camera/camera-works.ts
```

`docs/camera-work-ui-spec.md` から抽出して変換

---

#### Day 2: コンポーネント作成

**2.1 ファイル構成**

```
movie-maker/components/camera/
├── CameraWorkModal.tsx        # メインモーダル
├── CameraPresetSection.tsx    # プリセット選択部分
├── CameraCategoryTabs.tsx     # カテゴリタブ
├── CameraWorkCard.tsx         # 個別カード
├── CameraWorkGrid.tsx         # カードグリッド
└── index.ts                   # エクスポート
```

**2.2 CameraWorkModal.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CameraWork, CameraPreset, CameraCategory } from '@/lib/camera/types';
import { CAMERA_PRESETS } from '@/lib/camera/presets';
import { CAMERA_CATEGORIES } from '@/lib/camera/categories';
import { CAMERA_WORKS } from '@/lib/camera/camera-works';
import { CameraPresetSection } from './CameraPresetSection';
import { CameraCategoryTabs } from './CameraCategoryTabs';
import { CameraWorkGrid } from './CameraWorkGrid';

interface CameraWorkModalProps {
  open: boolean;
  onClose: () => void;
  currentCameraWork: string | null;
  onSelect: (cameraWork: string, promptText: string) => void;
}

export function CameraWorkModal({
  open,
  onClose,
  currentCameraWork,
  onSelect,
}: CameraWorkModalProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedCategory, setSelectedCategory] = useState<CameraCategory | 'all'>('all');
  const [selectedPreset, setSelectedPreset] = useState<CameraPreset | null>(null);
  const [selectedWork, setSelectedWork] = useState<CameraWork | null>(null);

  const handlePresetSelect = (preset: CameraPresetConfig) => {
    if (preset.id === 'custom') {
      setMode('custom');
      return;
    }
    setSelectedPreset(preset.id);
    onSelect(preset.cameraWorkName, preset.promptText);
    onClose();
  };

  const handleWorkSelect = (work: CameraWork) => {
    setSelectedWork(work);
    onSelect(work.name, work.promptText);
    onClose();
  };

  const filteredWorks = selectedCategory === 'all'
    ? CAMERA_WORKS
    : CAMERA_WORKS.filter(w => w.category === selectedCategory);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🎬 カメラワークを選択
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {mode === 'preset' ? (
            <CameraPresetSection
              presets={CAMERA_PRESETS}
              currentCameraWork={currentCameraWork}
              onSelect={handlePresetSelect}
            />
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setMode('preset')}
                className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1"
              >
                ← プリセットに戻る
              </button>

              <CameraCategoryTabs
                categories={CAMERA_CATEGORIES}
                selected={selectedCategory}
                onSelect={setSelectedCategory}
              />

              <CameraWorkGrid
                works={filteredWorks}
                selected={selectedWork}
                onSelect={handleWorkSelect}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**2.3 CameraPresetSection.tsx**

```tsx
import { CameraPresetConfig } from '@/lib/camera/types';

interface CameraPresetSectionProps {
  presets: CameraPresetConfig[];
  currentCameraWork: string | null;
  onSelect: (preset: CameraPresetConfig) => void;
}

export function CameraPresetSection({
  presets,
  currentCameraWork,
  onSelect,
}: CameraPresetSectionProps) {
  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-zinc-500">
        プリセットから選ぶか、カスタムで詳細に設定できます
      </p>

      {presets.map((preset) => {
        const isSelected = preset.cameraWorkName === currentCameraWork;

        return (
          <button
            key={preset.id}
            onClick={() => onSelect(preset)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all
              hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20
              ${isSelected
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-zinc-200 dark:border-zinc-700'
              }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{preset.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-zinc-900 dark:text-white">
                  {preset.label}
                </div>
                <div className="text-sm text-zinc-500">
                  {preset.description}
                </div>
              </div>
              {isSelected && (
                <span className="text-purple-500">✓</span>
              )}
              {preset.id === 'custom' && (
                <span className="text-zinc-400">▶</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

**2.4 CameraCategoryTabs.tsx**

```tsx
import { CameraCategory } from '@/lib/camera/types';

interface CameraCategoryTabsProps {
  categories: Array<{
    id: CameraCategory;
    label: string;
    icon: string;
    count: number;
  }>;
  selected: CameraCategory | 'all';
  onSelect: (category: CameraCategory | 'all') => void;
}

export function CameraCategoryTabs({
  categories,
  selected,
  onSelect,
}: CameraCategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
      <button
        onClick={() => onSelect('all')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${selected === 'all'
            ? 'bg-white dark:bg-zinc-700 text-purple-600 shadow-sm'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50'
          }`}
      >
        すべて (122)
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all
            ${selected === cat.id
              ? 'bg-white dark:bg-zinc-700 text-purple-600 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50'
            }`}
        >
          {cat.icon} {cat.label} ({cat.count})
        </button>
      ))}
    </div>
  );
}
```

**2.5 CameraWorkCard.tsx**

```tsx
import { CameraWork } from '@/lib/camera/types';

interface CameraWorkCardProps {
  work: CameraWork;
  selected: boolean;
  onSelect: () => void;
}

export function CameraWorkCard({ work, selected, onSelect }: CameraWorkCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`p-4 rounded-lg border-2 text-left transition-all
        hover:border-purple-300 hover:shadow-md
        ${selected
          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-200'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'
        }`}
    >
      {/* アイコン表示エリア */}
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-700 rounded-md mb-3
                      flex items-center justify-center text-4xl">
        {work.iconSymbol}
      </div>

      {/* ラベル */}
      <div className="font-medium text-zinc-900 dark:text-white text-sm">
        {work.label}
      </div>

      {/* 説明 */}
      <div className="text-xs text-zinc-500 mt-1 line-clamp-2">
        {work.description}
      </div>

      {/* 選択状態 */}
      {selected && (
        <div className="text-purple-500 text-xs mt-2 font-medium">
          ● 選択中
        </div>
      )}
    </button>
  );
}
```

**2.6 CameraWorkGrid.tsx**

```tsx
import { CameraWork } from '@/lib/camera/types';
import { CameraWorkCard } from './CameraWorkCard';

interface CameraWorkGridProps {
  works: CameraWork[];
  selected: CameraWork | null;
  onSelect: (work: CameraWork) => void;
}

export function CameraWorkGrid({ works, selected, onSelect }: CameraWorkGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-2">
      {works.map((work) => (
        <CameraWorkCard
          key={work.id}
          work={work}
          selected={selected?.id === work.id}
          onSelect={() => onSelect(work)}
        />
      ))}
    </div>
  );
}
```

---

#### Day 3: シーン編集UIに統合

**3.1 storyboard/page.tsx への統合**

```tsx
// 既存のシーン編集部分に追加

import { CameraWorkModal } from '@/components/camera';

// 状態追加
const [cameraModalOpen, setCameraModalOpen] = useState(false);
const [editingSceneForCamera, setEditingSceneForCamera] = useState<number | null>(null);

// カメラワーク変更ハンドラ
const handleCameraWorkChange = async (cameraWork: string, promptText: string) => {
  if (!storyboard || editingSceneForCamera === null) return;

  try {
    await storyboardApi.updateScene(storyboard.id, editingSceneForCamera, {
      camera_work: cameraWork,
    });

    // ローカル状態を更新
    setStoryboard(prev => prev ? {
      ...prev,
      scenes: prev.scenes.map(s =>
        s.scene_number === editingSceneForCamera
          ? { ...s, camera_work: cameraWork }
          : s
      ),
    } : null);
  } catch (error) {
    console.error('Failed to update camera work:', error);
    alert('カメラワークの更新に失敗しました');
  }
};

// シーンカードにカメラワーク選択ボタンを追加
<div className="mt-3">
  <button
    onClick={() => {
      setEditingSceneForCamera(scene.scene_number);
      setCameraModalOpen(true);
    }}
    className="flex items-center gap-2 px-3 py-2 rounded-lg
               bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200
               dark:hover:bg-zinc-700 transition-colors w-full"
  >
    <span>🎬</span>
    <span className="text-sm text-zinc-700 dark:text-zinc-300">
      {scene.camera_work?.replace(/_/g, ' ') || 'カメラワーク未設定'}
    </span>
    <span className="ml-auto text-zinc-400">変更</span>
  </button>
</div>

// モーダル追加
<CameraWorkModal
  open={cameraModalOpen}
  onClose={() => {
    setCameraModalOpen(false);
    setEditingSceneForCamera(null);
  }}
  currentCameraWork={
    editingSceneForCamera
      ? storyboard?.scenes.find(s => s.scene_number === editingSceneForCamera)?.camera_work || null
      : null
  }
  onSelect={handleCameraWorkChange}
/>
```

---

#### Day 4: バックエンド対応 + テスト

**4.1 シーン更新API確認**

現在の `updateScene` API が `camera_work` を受け取れるか確認：

```python
# app/videos/schemas.py
class StoryboardSceneUpdate(BaseModel):
    description_ja: str | None = Field(None)
    runway_prompt: str | None = Field(None)
    camera_work: str | None = Field(None)  # ← 確認・追加
    mood: str | None = Field(None)
```

**4.2 動画生成時の適用確認**

`storyboard_processor.py` でカメラワークが正しく適用されているか確認：

```python
# 動画生成時
camera_work = scene.get("camera_work")
task_id = await provider.generate_video(
    image_url=scene_image_url,
    prompt=runway_prompt,
    duration=5,
    aspect_ratio="9:16",
    camera_work=camera_work,  # ← 渡されているか確認
)
```

**4.3 テスト項目**

| テスト | 内容 |
|--------|------|
| プリセット選択 | 3プリセットが正しく動作する |
| カスタム選択 | 122種すべて選択可能 |
| カテゴリフィルター | 8カテゴリで絞り込みできる |
| 保存 | 選択したカメラワークがDBに保存される |
| 動画生成 | 選択したカメラワークで動画が生成される |
| モバイル | モーダルがモバイルでも操作しやすい |

---

## API仕様

### シーン更新API（既存）

```
PUT /api/v1/videos/storyboard/{storyboard_id}/scenes/{scene_number}
```

**リクエスト**
```json
{
  "camera_work": "orbit_shot"
}
```

**レスポンス**
```json
{
  "id": "...",
  "scenes": [
    {
      "scene_number": 1,
      "camera_work": "orbit_shot",
      ...
    }
  ]
}
```

---

## ファイル一覧

### 新規作成

| ファイル | 説明 |
|----------|------|
| `lib/camera/types.ts` | 型定義 |
| `lib/camera/categories.ts` | カテゴリ定義 |
| `lib/camera/presets.ts` | プリセット定義 |
| `lib/camera/camera-works.ts` | 122種カメラワーク定義 |
| `components/camera/CameraWorkModal.tsx` | メインモーダル |
| `components/camera/CameraPresetSection.tsx` | プリセット選択 |
| `components/camera/CameraCategoryTabs.tsx` | カテゴリタブ |
| `components/camera/CameraWorkCard.tsx` | カメラワークカード |
| `components/camera/CameraWorkGrid.tsx` | カードグリッド |
| `components/camera/index.ts` | エクスポート |

### 修正

| ファイル | 変更内容 |
|----------|----------|
| `app/generate/storyboard/page.tsx` | カメラワーク選択UI統合 |
| `app/videos/schemas.py` | `camera_work` フィールド確認 |

---

## 将来の拡張（Phase 2以降）

### GIFプレビュー追加

```
public/assets/camera/
├── static.gif
├── dolly-in.gif
├── orbit.gif
└── ...
```

### 検索機能

```tsx
<input
  type="text"
  placeholder="カメラワークを検索..."
  onChange={(e) => setSearchQuery(e.target.value)}
/>
```

### お気に入り機能

```tsx
const [favorites, setFavorites] = useState<number[]>([]);
// LocalStorage に保存
```

---

## 工数サマリー

| タスク | 工数 |
|--------|------|
| Day 1: データ準備 | 0.5日 |
| Day 2: コンポーネント作成 | 1.5日 |
| Day 3: UI統合 | 1日 |
| Day 4: バックエンド + テスト | 1日 |
| **合計** | **4日** |

---

## 次のステップ

1. この計画書の承認
2. 実装開始
3. 完了後、サブシーン機能の検討

---

作成日: 2025-12-25
