# アドクリエイター動画生成機能強化 - 実装計画書

## 概要

アドクリエイター（concat page）でシーンごとに画像から動画を生成する際に、以下の設定を選択できるようにする：
- **AIプロバイダー**: Runway / Kling / VEO / DomoAI / Hailuo
- **カメラワーク**: 108種類のカメラワークから選択
- **プロンプト**: 各シーンのスクリプト（description_ja）を自動入力

## 現状分析

### 現在のフロー
1. アドクリエイターでカットを作成
2. 「動画を生成」ボタンをクリック → `SceneGeneratorModal`が開く
3. モーダル内でプロバイダーとカメラワークを選択して生成

### 問題点
- `SceneGeneratorModal`を経由しないと設定できない
- 複数シーンの一括生成時に個別設定ができない
- ストーリーボードページのようなシーン単位のUI/UXがない

### ストーリーボードページの参考実装
- ページレベルで`videoProvider`ステートを管理
- シーンごとに`CameraWorkModal`でカメラワークを選択
- シーンカード上にカメラワーク選択ボタンを配置

## 実装方針

### 採用案: ストーリーボード同等のUI/UX

アドクリエイターにストーリーボードページと同等の機能を追加：
1. ページレベルでのプロバイダー選択
2. カットごとのカメラワーク選択
3. 一括生成時に各カットの設定を適用

## 実装タスク

### Phase 1: ステート管理の追加

**ファイル**: `app/concat/page.tsx`

```typescript
// 追加するステート
const [videoProvider, setVideoProvider] = useState<VideoProvider>('runway');
const [klingMode, setKlingMode] = useState<'std' | 'pro'>('std');
const [cameraWorkModalCutId, setCameraWorkModalCutId] = useState<string | null>(null);
const [cameraWorkSelections, setCameraWorkSelections] = useState<Record<string, CameraWorkSelection>>({});
```

**作業内容**:
- [ ] `VideoProvider`型をインポート
- [ ] 動画プロバイダーステートを追加
- [ ] Klingモードステートを追加
- [ ] カメラワークモーダル用ステートを追加
- [ ] カットごとのカメラワーク選択を保持するステートを追加

### Phase 2: プロバイダー選択UIの追加

**ファイル**: `app/concat/page.tsx`

ストーリーボードページの実装を参考に、設定セクションにプロバイダー選択UIを追加。

```tsx
{/* AI動画生成プロバイダー選択 */}
<div className="space-y-2">
  <label className="text-sm font-medium text-zinc-300">動画生成AI</label>
  <div className="grid grid-cols-2 gap-2">
    <button onClick={() => setVideoProvider('runway')} className={...}>
      Runway Gen-4
    </button>
    <button onClick={() => setVideoProvider('piapi_kling')} className={...}>
      Kling AI 2.0
    </button>
    <button onClick={() => setVideoProvider('veo')} className={...}>
      Veo 3.1
    </button>
    <button onClick={() => setVideoProvider('hailuo')} className={...}>
      Hailuo-02
    </button>
  </div>
</div>

{/* Klingモード選択（Kling選択時のみ） */}
{videoProvider === 'piapi_kling' && (
  <div className="flex gap-2 mt-2">
    <button onClick={() => setKlingMode('std')}>Standard</button>
    <button onClick={() => setKlingMode('pro')}>Professional</button>
  </div>
)}
```

**作業内容**:
- [ ] プロバイダー選択ボタングループを追加
- [ ] Klingモード選択UIを追加（条件付き表示）
- [ ] 選択状態のスタイリング

### Phase 3: カットカードへのカメラワーク選択ボタン追加

**ファイル**: `components/video/ad-storyboard.tsx`または`app/concat/page.tsx`

各カットカードにカメラワーク選択ボタンを追加。

```tsx
{/* カメラワーク選択ボタン */}
<button
  onClick={() => setCameraWorkModalCutId(cut.id)}
  className="flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs"
>
  <Camera className="h-3 w-3" />
  {cameraWorkSelections[cut.id]?.customCameraWork?.label || 'カメラワーク'}
</button>
```

**作業内容**:
- [ ] `Camera`アイコンをインポート
- [ ] カットカードにカメラワーク選択ボタンを追加
- [ ] 現在の選択状態を表示
- [ ] クリックでモーダルを開く

### Phase 4: CameraWorkModalの統合

**ファイル**: `app/concat/page.tsx`

```tsx
import { CameraWorkModal } from '@/components/camera';
import { CameraWorkSelection } from '@/lib/camera/types';

// カメラワーク確定ハンドラー
const handleCameraWorkConfirm = (cutId: string, selection: CameraWorkSelection) => {
  setCameraWorkSelections(prev => ({
    ...prev,
    [cutId]: selection,
  }));
};

// カメラワーク取得ヘルパー
const getCameraWorkSelection = (cutId: string): CameraWorkSelection => {
  return cameraWorkSelections[cutId] || {
    preset: 'simple',
    promptText: 'static shot, camera remains still',
  };
};

// モーダルレンダリング
{cameraWorkModalCutId && (
  <CameraWorkModal
    isOpen={cameraWorkModalCutId !== null}
    onClose={() => setCameraWorkModalCutId(null)}
    value={getCameraWorkSelection(cameraWorkModalCutId)}
    onConfirm={(selection) => {
      handleCameraWorkConfirm(cameraWorkModalCutId, selection);
      setCameraWorkModalCutId(null);
    }}
    videoProvider={videoProvider}
  />
)}
```

**作業内容**:
- [ ] `CameraWorkModal`をインポート
- [ ] カメラワーク確定ハンドラーを実装
- [ ] カメラワーク取得ヘルパーを実装
- [ ] モーダルをレンダリング

### Phase 5: 動画生成APIへのパラメータ渡し

**ファイル**: `app/concat/page.tsx`

動画生成時にプロバイダーとカメラワークをAPIに渡す。

```typescript
// SceneGeneratorModalまたは直接APIコールに渡す
const handleGenerateVideo = async (cutId: string, imageUrl: string) => {
  const cut = storyboardCuts.find(c => c.id === cutId);
  const cameraWork = cameraWorkSelections[cutId]?.customCameraWork?.name;

  await videosApi.createStoryVideo({
    image_url: imageUrl,
    story_text: cut?.description_ja || '',  // シーンのスクリプトをプロンプトに
    aspect_ratio: selectedAspectRatio,
    video_provider: videoProvider,
    camera_work: cameraWork,
    kling_mode: videoProvider === 'piapi_kling' ? klingMode : undefined,
  });
};
```

**作業内容**:
- [ ] 動画生成ハンドラーを修正
- [ ] `video_provider`パラメータを追加
- [ ] `camera_work`パラメータを追加
- [ ] `kling_mode`パラメータを追加（条件付き）
- [ ] `story_text`にカットの`description_ja`を設定

### Phase 6: SceneGeneratorModalの修正

**ファイル**: `components/video/scene-generator-modal.tsx`

外部からプロバイダーとカメラワークを受け取れるようにする。

```typescript
interface SceneGeneratorModalProps {
  // 既存props...

  /** 外部から指定されたプロバイダー */
  externalVideoProvider?: VideoProvider;
  /** 外部から指定されたカメラワーク */
  externalCameraWork?: CameraWorkSelection;
  /** プロバイダー変更時のコールバック */
  onProviderChange?: (provider: VideoProvider) => void;
  /** カメラワーク変更時のコールバック */
  onCameraWorkChange?: (selection: CameraWorkSelection) => void;
}
```

**作業内容**:
- [ ] propsに外部プロバイダーを追加
- [ ] propsに外部カメラワークを追加
- [ ] 外部値がある場合は優先的に使用
- [ ] 変更時コールバックを追加

### Phase 7: 一括生成機能の強化

**ファイル**: `app/concat/page.tsx`

複数カットの一括動画生成時に各設定を適用。

```typescript
const handleBatchGenerateVideos = async () => {
  for (const cut of cutsNeedingVideo) {
    const cameraWork = cameraWorkSelections[cut.id]?.customCameraWork?.name;

    await videosApi.createStoryVideo({
      image_url: cut.image_url,
      story_text: cut.description_ja,
      aspect_ratio: selectedAspectRatio,
      video_provider: videoProvider,
      camera_work: cameraWork,
      kling_mode: videoProvider === 'piapi_kling' ? klingMode : undefined,
    });
  }
};
```

**作業内容**:
- [ ] 一括生成ハンドラーを修正
- [ ] 各カットのカメラワーク設定を適用
- [ ] プロバイダー設定を適用

### Phase 8: ドラフト保存への対応

**ファイル**: `lib/hooks/use-auto-save-ad-creator-draft.ts`

ドラフト保存にプロバイダーとカメラワーク設定を含める。

```typescript
interface AdCreatorDraft {
  // 既存フィールド...
  videoProvider?: VideoProvider;
  klingMode?: 'std' | 'pro';
  cameraWorkSelections?: Record<string, CameraWorkSelection>;
}
```

**作業内容**:
- [ ] ドラフト型にプロバイダーを追加
- [ ] ドラフト型にKlingモードを追加
- [ ] ドラフト型にカメラワーク選択を追加
- [ ] 保存・復元ロジックを更新

## UI/UXデザイン

### プロバイダー選択セクション配置

```
┌─────────────────────────────────────────┐
│ アドクリエイター                          │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 動画生成設定                          │ │
│ │ ┌─────────┬─────────┐               │ │
│ │ │ Runway  │ Kling   │               │ │
│ │ ├─────────┼─────────┤               │ │
│ │ │ VEO     │ Hailuo  │               │ │
│ │ └─────────┴─────────┘               │ │
│ │ [Kling選択時: Standard / Pro]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ カット1                              │ │
│ │ [画像] [脚本...]                     │ │
│ │ [🎬 カメラワーク: ズームイン]         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ カット2                              │ │
│ │ [画像] [脚本...]                     │ │
│ │ [🎬 カメラワーク: パンレフト]         │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### カメラワークバッジ表示

選択されたプロバイダーに応じてサポートレベルバッジを表示：
- **API保証**（緑）: ネイティブAPIパラメータで制御
- **プロンプト**（黄）: プロンプトベースで制御
- **非対応**（赤）: 選択不可

## テスト項目

### 機能テスト
- [ ] プロバイダー選択が正しく動作する
- [ ] Klingモード選択が条件付きで表示される
- [ ] カメラワークモーダルが開閉する
- [ ] カメラワーク選択が保持される
- [ ] 動画生成APIに正しいパラメータが渡される
- [ ] プロバイダーによるカメラワークフィルタリングが動作する

### UIテスト
- [ ] プロバイダー選択UIが正しく表示される
- [ ] カメラワークバッジが正しく表示される
- [ ] 選択状態が視覚的にフィードバックされる
- [ ] モバイルでも操作可能

### 統合テスト
- [ ] 一括動画生成が各カットの設定を適用する
- [ ] ドラフト保存・復元が正しく動作する
- [ ] SceneGeneratorModalとの連携が正しく動作する

## 依存関係

### 既存コンポーネント（再利用）
- `CameraWorkModal` - `/components/camera/CameraWorkModal.tsx`
- `CameraWorkSelector` - `/components/camera/CameraWorkSelector.tsx`
- `getCameraSupportLevel` - `/lib/camera/provider-support.ts`

### API
- `videosApi.createStoryVideo()` - 動画生成API
- パラメータ: `video_provider`, `camera_work`, `kling_mode`

## スケジュール

| Phase | タスク | 優先度 |
|-------|--------|--------|
| 1 | ステート管理の追加 | 高 |
| 2 | プロバイダー選択UI | 高 |
| 3 | カメラワーク選択ボタン | 高 |
| 4 | CameraWorkModal統合 | 高 |
| 5 | API連携 | 高 |
| 6 | SceneGeneratorModal修正 | 中 |
| 7 | 一括生成機能 | 中 |
| 8 | ドラフト保存対応 | 低 |

## 注意事項

1. **後方互換性**: 既存のドラフトデータは新フィールドがない状態でも動作するようにする
2. **デフォルト値**: プロバイダー未選択時は`runway`、カメラワーク未選択時は`simple`をデフォルトとする
3. **VEO制限**: VEO選択時は360度回転系カメラワークを非対応として表示
4. **プロンプト**: 各カットの`description_ja`を動画生成プロンプトとして使用

## 参考実装

- ストーリーボードページ: `/app/generate/storyboard/page.tsx`
  - プロバイダー選択: 2917-2993行目
  - カメラワーク選択: 3443-3450行目
  - CameraWorkModal: 4261-4274行目

---

## レビュー結果（2026-01-16）

### 発見された重大な問題

#### 1. SceneGeneratorModalは既にプロバイダー/カメラワーク選択を持っている

**現状**: `components/video/scene-generator-modal.tsx`
- Line 62: `videoProvider` ステート（runway/veo/domoai/piapi_kling）
- Line 63-70: `cameraWork` ステート
- Line 6: `CameraWorkSelector`コンポーネントをインポート済み

**問題**: モーダル内で設定可能だが、外部から初期値を渡す方法がない

**修正方針**: Phase 6を「外部から初期値を受け取れるようにする」に修正

#### 2. VideoProvider型が2箇所で定義されている

**場所**:
- `lib/camera/types.ts:6`
- `lib/types/video.ts:45`

**リスク**: インポート間違いによる型エラー

**修正方針**: `lib/types/video.ts`を正とし、インポート元を統一する

#### 3. SceneGeneratorModalにhailuoとkling_modeが欠落

**現状** (scene-generator-modal.tsx:62):
```typescript
const [videoProvider, setVideoProvider] = useState<"runway" | "veo" | "domoai" | "piapi_kling">("runway");
```

**欠落**:
- `"hailuo"` がVideoProvider選択肢にない
- `kling_mode` パラメータがAPIに渡されていない

**修正方針**: 追加タスクとしてSceneGeneratorModalの修正を含める

#### 4. カットのdescription_jaがモーダルに渡されていない

**現状のフロー**:
1. `handleGenerateVideoFromImage(cutId, imageUrl)` が呼ばれる
2. `SceneGeneratorModal`が開く（`initialImageUrl`のみ渡される）
3. モーダル内で`suggestStories` APIから新たにプロンプトを生成

**問題**: カットに既に`description_ja`があるのに使われていない

**修正方針**: `initialPrompt`プロップを追加し、カットの脚本を渡す

#### 5. Phase 5/7のコード例が実際のアーキテクチャと不一致

**計画書の記載**:
```typescript
await videosApi.createStoryVideo({...})  // 直接API呼び出し
```

**実際のフロー**:
```
concat page → SceneGeneratorModal → videosApi.createStoryVideo()
```

**修正方針**: 直接API呼び出しではなく、SceneGeneratorModalへのprops追加で対応

---

### 修正版タスク

#### Phase 1: SceneGeneratorModalの拡張（最重要）

**ファイル**: `components/video/scene-generator-modal.tsx`

```typescript
interface SceneGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  aspectRatio: AspectRatio;
  onVideoGenerated: () => void;
  initialImageUrl?: string;
  // === 新規追加 ===
  /** 初期プロンプト（カットの脚本） */
  initialPrompt?: string;
  /** 外部からの初期プロバイダー */
  initialVideoProvider?: VideoProvider;
  /** 外部からの初期カメラワーク */
  initialCameraWork?: CameraWorkSelection;
  /** 外部からの初期Klingモード */
  initialKlingMode?: 'std' | 'pro';
}
```

**修正内容**:
1. `hailuo`をvideoProviderの選択肢に追加
2. `kling_mode`パラメータをAPIに渡す
3. `initialPrompt`を受け取り、`japanesePrompt`の初期値に設定
4. `initialVideoProvider`を受け取り、初期値に設定
5. `initialCameraWork`を受け取り、初期値に設定
6. `initialKlingMode`を受け取り、初期値に設定

#### Phase 2: concat pageのステート追加

**ファイル**: `app/concat/page.tsx`

```typescript
import { VideoProvider } from '@/lib/types/video';  // 正しいインポート元
import { CameraWorkSelection } from '@/lib/camera/types';

// ページレベルの設定（全カット共通）
const [videoProvider, setVideoProvider] = useState<VideoProvider>('runway');
const [klingMode, setKlingMode] = useState<'std' | 'pro'>('std');

// カットごとのカメラワーク設定
const [cameraWorkSelections, setCameraWorkSelections] = useState<Record<string, CameraWorkSelection>>({});
const [cameraWorkModalCutId, setCameraWorkModalCutId] = useState<string | null>(null);
```

#### Phase 3: SceneGeneratorModal呼び出しの修正

**ファイル**: `app/concat/page.tsx`

```typescript
// 修正前
const handleGenerateVideoFromImage = useCallback((cutId: string, imageUrl: string) => {
  setCurrentAdCutId(cutId);
  setInitialImageForSceneGenerator(imageUrl);
  setIsSceneGeneratorOpen(true);
}, []);

// 修正後
const handleGenerateVideoFromImage = useCallback((cutId: string, imageUrl: string) => {
  const cut = storyboardCuts.find(c => c.id === cutId);
  setCurrentAdCutId(cutId);
  setInitialImageForSceneGenerator(imageUrl);
  setInitialPromptForSceneGenerator(cut?.description_ja || '');  // カットの脚本
  setIsSceneGeneratorOpen(true);
}, [storyboardCuts]);

// SceneGeneratorModalに渡す
<SceneGeneratorModal
  isOpen={isSceneGeneratorOpen}
  onClose={...}
  aspectRatio={selectedAspectRatio}
  onVideoGenerated={...}
  initialImageUrl={initialImageForSceneGenerator}
  initialPrompt={initialPromptForSceneGenerator}  // 追加
  initialVideoProvider={videoProvider}             // 追加
  initialCameraWork={cameraWorkSelections[currentAdCutId]}  // 追加
  initialKlingMode={klingMode}                     // 追加
/>
```

#### Phase 4: プロバイダー選択UIの追加

**ファイル**: `app/concat/page.tsx`

既存の設定セクションに追加（アスペクト比選択の近く）

#### Phase 5: カットごとのカメラワーク選択

**ファイル**: `app/concat/page.tsx` + `components/video/ad-storyboard.tsx`

AdStoryboardのpropsに追加:
```typescript
interface AdStoryboardProps {
  // ... 既存props
  cameraWorkSelections?: Record<string, CameraWorkSelection>;
  onOpenCameraWorkModal?: (cutId: string) => void;
}
```

#### Phase 6: CameraWorkModal統合

**ファイル**: `app/concat/page.tsx`

（元のPhase 4と同じ）

#### Phase 7: ドラフト保存対応

（元のPhase 8と同じ）

---

### 削除/変更されたタスク

| 元Phase | 変更内容 |
|---------|----------|
| Phase 5 | 削除 - 直接API呼び出しは不要（SceneGeneratorModal経由） |
| Phase 6 | → Phase 1に統合（SceneGeneratorModalの修正） |
| Phase 7 | 削除 - 直接API呼び出しは不要 |

---

### 追加の前提条件タスク

#### 0-1: VideoProvider型の統一

**問題**: 2箇所で定義されている
**対応**: `lib/types/video.ts`を正とし、`lib/camera/types.ts`からは削除またはre-export

```typescript
// lib/camera/types.ts
export type { VideoProvider } from '@/lib/types/video';
```

#### 0-2: SceneGeneratorModalのプロバイダー型修正

**現状**: `"runway" | "veo" | "domoai" | "piapi_kling"`（hailuo欠落）
**修正**: `VideoProvider`型を使用

---

### 修正後の実装順序

| 順序 | タスク | 優先度 |
|------|--------|--------|
| 0-1 | VideoProvider型の統一 | 最高 |
| 0-2 | SceneGeneratorModalのhailuo/kling_mode対応 | 最高 |
| 1 | SceneGeneratorModalに初期値propsを追加 | 高 |
| 2 | concat pageにステート追加 | 高 |
| 3 | SceneGeneratorModal呼び出し修正 | 高 |
| 4 | プロバイダー選択UI追加 | 高 |
| 5 | カメラワーク選択UI追加（AdStoryboard修正含む） | 高 |
| 6 | CameraWorkModal統合 | 高 |
| 7 | ドラフト保存対応 | 低 |

---

### リスク項目

1. **SceneGeneratorModalの大幅修正** - 既存のフローに影響を与える可能性
2. **型の不整合** - VideoProvider型の統一時に既存コードへの影響
3. **AdStoryboardのprops変更** - インターフェース変更による影響範囲

### 推奨テスト

1. SceneGeneratorModalの単体テスト（初期値が正しく適用されるか）
2. concat page → SceneGeneratorModal の統合テスト
3. Klingモード選択 → API呼び出しの確認
4. hailuoプロバイダーでの動画生成テスト
