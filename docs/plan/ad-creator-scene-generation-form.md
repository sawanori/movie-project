# アドクリエイター内シーン生成フォーム実装計画書

## 概要

アドクリエイター（`/concat`）内に、新規シーン動画を生成できるフォームを追加する。
既存の「ワンシーン生成」ページ（`/generate/story`）と同じフローを踏襲し、
生成した動画をそのままアドクリエイターの動画選択リストに追加できるようにする。

## 実装難易度

**中程度** ⭐⭐⭐☆☆

| 観点 | 詳細 | 難易度 |
|------|------|--------|
| バックエンド | 既存API（`POST /api/v1/videos/story`）を再利用 | ✅ 変更不要 |
| フロントエンド | 1464行の大規模ページに統合 | ⚠️ 中 |
| UI追加 | モーダル形式でシーン生成フォームを追加 | ⚠️ 中 |
| 状態管理 | 生成中のポーリング、生成済み動画の選択リスト追加 | ⚠️ 中 |

---

## ⚠️ 重要: 発見された潜在的問題点

### 問題1: 1:1アスペクト比の不整合（クリティカル）

**現状**:
- フロントエンド型定義 (`lib/types/video.ts`): `"9:16" | "16:9" | "1:1"` をサポート
- バックエンドAPI (`schemas.py`): `PORTRAIT = "9:16"` と `LANDSCAPE = "16:9"` のみ

```python
# movie-maker-api/app/videos/schemas.py
class AspectRatio(str, Enum):
    PORTRAIT = "9:16"      # 縦長
    LANDSCAPE = "16:9"     # 横長
    # 1:1 は未定義！
```

**影響**: 1:1選択時にシーン生成APIを呼ぶとバリデーションエラー

**対策**:
- **実装時**: 1:1選択時は「シーン生成」ボタンを無効化し、理由を表示
- **将来対応**: バックエンドAPIを拡張して1:1に対応（別タスク）

---

### 問題2: VideoItem型とAPIレスポンスのフィールド名不一致

**現状**:
```typescript
// concat/page.tsx の VideoItem
interface VideoItem {
  id: string;
  user_prompt: string;      // ← このフィールド名
  original_image_url: string;
  final_video_url: string | null;
  // ...
}

// バックエンドの StoryVideoResponse
class StoryVideoResponse:
  story_text: str           // ← フィールド名が異なる
  original_image_url: str
  final_video_url: str | None
```

**影響**: 生成後のリスト追加時にフィールド名のマッピングが必要

**対策**:
- リスト更新時は `loadVideos()` を呼び直す（APIが正しいフィールド名で返す）
- または、レスポンスを `VideoItem` 型に変換するマッピング関数を実装

---

### 問題3: ポーリング時のフィールド名

**現状**:
```typescript
// videosApi.getStatus() のレスポンス（VideoStatusResponse）
{
  video_url: string | null;  // ← このフィールド名
}

// VideoItem / StoryVideoResponse
{
  final_video_url: string | null;  // ← フィールド名が異なる
}
```

**影響**: ポーリング完了時に `status.video_url` を使う必要がある（`final_video_url` ではない）

**対策**: ポーリング完了時は `status.video_url` を参照

---

### 問題4: モーダルの状態管理

**未定義の挙動**:
1. モーダルを閉じて再度開いた時、前回の入力が残る
2. 生成中にモーダルを閉じた場合、ポーリングの継続/中断

**対策**:
- モーダルを閉じる時に状態をリセットする `resetModal()` 関数を実装
- 生成中はモーダルを閉じられないようにする（または警告を表示）
- `useEffect` のクリーンアップでポーリングを中断

---

### 問題5: 既存の「動画を生成」リンクとの関係

**現状**: `concat/page.tsx` の878行目に既にリンクがある
```tsx
<Link href="/generate/story">
  <Button className="mt-4">動画を生成</Button>
</Link>
```

**対策**:
- 既存リンクは「シーン動画がない場合」の誘導として残す
- 新しいモーダルボタンは「動画選択エリア内」に配置（別の場所）

---

## 現状分析

### アドクリエイターの現在のフロー

```
[1] アスペクト比選択
    ↓
[2] 動画選択（シーン動画/ストーリー動画タブ）
    ↓
[3] プレビュー・トリミング・順序調整
    ↓
[4] トランジション選択
    ↓
[5] 広告を作成
```

### シーン生成（/generate/story）のフロー

```
[Step 1] 画像アップロード
         - アスペクト比選択（9:16 / 16:9）
         - 被写体タイプ選択（人物/物体/アニメーション）
         - 動画プロバイダー選択（Runway/Veo/DomoAI）
         - カメラワーク選択
    ↓
[Step 2] プロンプト
         - AIによるストーリー提案（suggestStories API）
         - 日本語プロンプト入力/編集
         - 英語翻訳（translateStoryPrompt API）
    ↓
[Step 3] オプション
         - BGM選択（プリセット/カスタム）
         - テキストオーバーレイ
         - フィルムグレイン/LUT設定
    ↓
[生成] createStoryVideo API → ポーリング → 完成
```

---

## 実装方針

### UIパターン: モーダル方式

アドクリエイターの動画選択画面に「＋新規シーンを生成」ボタンを配置し、
クリックするとモーダルでシーン生成フォームを表示する。

```
┌─────────────────────────────────────────────┐
│  アドクリエイター                              │
├─────────────────────────────────────────────┤
│  [シーン動画] [ストーリー動画]                   │
│                                             │
│  ┌────┐ ┌────┐ ┌────┐ ┌──────────┐         │
│  │動画1│ │動画2│ │動画3│ │＋新規シーン│ ← 追加 │
│  └────┘ └────┘ └────┘ │  を生成   │         │
│                       └──────────┘         │
└─────────────────────────────────────────────┘
```

### モーダル内のステップ（簡略化版）

既存のシーン生成ページの3ステップを、モーダル内で実現する。
ただし、**アスペクト比はアドクリエイターで既に選択済み**のため、自動的に引き継ぐ。

```
[モーダル Step 1] 画像アップロード + 設定
  - 画像アップロード
  - 被写体タイプ（人物/物体/アニメーション）
  - 動画プロバイダー（Runway/Veo/DomoAI）
  - カメラワーク

[モーダル Step 2] プロンプト
  - AI提案
  - 日本語→英語翻訳

[モーダル Step 3] 生成
  - 確認 → 生成開始
  - ポーリング（進捗表示）
  - 完了 → 動画選択リストに追加
```

---

## ファイル変更一覧

### 変更が必要なファイル

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker/app/concat/page.tsx` | モーダル追加、状態管理追加 |

### 新規作成ファイル

| ファイル | 内容 |
|---------|------|
| `movie-maker/components/video/scene-generator-modal.tsx` | シーン生成モーダルコンポーネント |

### 変更不要なファイル

- バックエンドAPI（既存の`/api/v1/videos/story`を再利用）
- `lib/api/client.ts`（既存の`videosApi.createStoryVideo`を再利用）

---

## 詳細設計

### 1. SceneGeneratorModal コンポーネント

```typescript
// movie-maker/components/video/scene-generator-modal.tsx

import { useState, useCallback, useEffect, useRef } from "react";
import { videosApi, templatesApi } from "@/lib/api/client";
import { AspectRatio } from "@/lib/types/video";
import { CameraWorkSelector } from "@/components/camera";
import { CameraWorkSelection } from "@/lib/camera/types";
import { CAMERA_PRESETS } from "@/lib/camera/presets";
import { MotionSelector } from "@/components/ui/motion-selector";
import {
  ANIMATION_TEMPLATES,
  ANIMATION_CATEGORY_LABELS,
  type AnimationCategory,
  type AnimationTemplateId,
} from "@/lib/constants/animation-templates";
import { cn } from "@/lib/utils";
import {
  X,
  Loader2,
  Upload,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Wand2,
  RefreshCw,
  Check,
  User,
  Package,
  Palette,
} from "lucide-react";

interface SceneGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  aspectRatio: AspectRatio;  // アドクリエイターから引き継ぎ
  onVideoGenerated: () => void;  // 生成完了時のコールバック（リスト再読み込みをトリガー）
}

// 注意: 1:1 アスペクト比はAPIがサポートしていないため、
// isOpen && aspectRatio === "1:1" の場合はモーダルを開けないようにする
```

### 2. モーダル内の状態管理

```typescript
// モーダル内部のstate
const [modalStep, setModalStep] = useState<1 | 2 | 3>(1);

// Step 1: 画像 + 設定
const [imageFile, setImageFile] = useState<File | null>(null);
const [imagePreview, setImagePreview] = useState<string | null>(null);
const [imageUrl, setImageUrl] = useState<string | null>(null);
const [subjectType, setSubjectType] = useState<'person' | 'object' | 'animation'>('person');
const [videoProvider, setVideoProvider] = useState<'runway' | 'veo' | 'domoai'>('runway');
const [cameraWork, setCameraWork] = useState<CameraWorkSelection>(() => {
  const defaultPreset = CAMERA_PRESETS.find((p) => p.id === 'simple');
  return {
    preset: 'simple',
    customCameraWork: undefined,
    promptText: defaultPreset?.promptText || '',
  };
});
// アニメーション用
const [animationCategory, setAnimationCategory] = useState<AnimationCategory | null>(null);
const [animationTemplate, setAnimationTemplate] = useState<AnimationTemplateId | null>(null);
// Act-Two用
const [useActTwo, setUseActTwo] = useState(false);
const [motionType, setMotionType] = useState<string | null>(null);
const [expressionIntensity, setExpressionIntensity] = useState(3);
const [bodyControl, setBodyControl] = useState(true);

// Step 2: プロンプト
const [japanesePrompt, setJapanesePrompt] = useState("");
const [englishPrompt, setEnglishPrompt] = useState("");
const [storySuggestions, setStorySuggestions] = useState<string[]>([]);
const [suggestingStories, setSuggestingStories] = useState(false);
const [translating, setTranslating] = useState(false);

// Step 3: 生成
const [generating, setGenerating] = useState(false);
const [generatingVideoId, setGeneratingVideoId] = useState<string | null>(null);
const [generationProgress, setGenerationProgress] = useState(0);
const [generationStatus, setGenerationStatus] = useState<string>("");

// ポーリング用ref（クリーンアップに使用）
const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

// ★ 状態リセット関数（モーダルを閉じる時に呼ぶ）
const resetModal = useCallback(() => {
  // ポーリングを中断
  if (pollingIntervalRef.current) {
    clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
  }

  // 生成中でない場合のみリセット
  if (!generating) {
    setModalStep(1);
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setSubjectType('person');
    setVideoProvider('runway');
    setAnimationCategory(null);
    setAnimationTemplate(null);
    setUseActTwo(false);
    setMotionType(null);
    setExpressionIntensity(3);
    setBodyControl(true);
    setJapanesePrompt("");
    setEnglishPrompt("");
    setStorySuggestions([]);
    setGeneratingVideoId(null);
    setGenerationProgress(0);
    setGenerationStatus("");
  }
}, [generating]);

// モーダルを閉じる時の処理
const handleClose = useCallback(() => {
  if (generating) {
    // 生成中は確認ダイアログを表示
    if (window.confirm("動画生成中です。閉じると進捗が失われます。閉じますか？")) {
      resetModal();
      onClose();
    }
  } else {
    resetModal();
    onClose();
  }
}, [generating, resetModal, onClose]);
```

### 3. concat/page.tsx への統合

```typescript
// movie-maker/app/concat/page.tsx に追加

import { SceneGeneratorModal } from "@/components/video/scene-generator-modal";

// 新規state
const [isSceneGeneratorOpen, setIsSceneGeneratorOpen] = useState(false);

// 生成完了時のハンドラ（リスト再読み込み）
const handleVideoGenerated = useCallback(() => {
  // シーン動画リストを再取得
  loadVideos();
}, []);

// ★ 1:1 アスペクト比チェック
const canGenerateScene = selectedAspectRatio !== "1:1";

// UIに追加（動画選択エリア内、シーン動画グリッドの最後に配置）
{canGenerateScene ? (
  <button
    onClick={() => setIsSceneGeneratorOpen(true)}
    className="relative aspect-[9/16] rounded-xl overflow-hidden border-2 border-dashed border-zinc-600 hover:border-blue-500 hover:bg-blue-500/10 transition-all flex flex-col items-center justify-center gap-2"
  >
    <Plus className="h-8 w-8 text-zinc-400" />
    <span className="text-zinc-400 text-sm">新規シーンを生成</span>
  </button>
) : (
  <div className="relative aspect-[9/16] rounded-xl overflow-hidden border-2 border-dashed border-zinc-700 bg-zinc-800/50 flex flex-col items-center justify-center gap-2 cursor-not-allowed">
    <Plus className="h-8 w-8 text-zinc-600" />
    <span className="text-zinc-500 text-xs text-center px-2">
      1:1では<br />シーン生成不可
    </span>
  </div>
)}

{/* モーダル */}
{selectedAspectRatio && selectedAspectRatio !== "1:1" && (
  <SceneGeneratorModal
    isOpen={isSceneGeneratorOpen}
    onClose={() => setIsSceneGeneratorOpen(false)}
    aspectRatio={selectedAspectRatio}
    onVideoGenerated={handleVideoGenerated}
  />
)}
```

**配置場所の詳細**:
- `concat/page.tsx` の883行目付近、シーン動画グリッド (`availableVideos.map(...)`) の後に配置
- グリッドの最後のアイテムとして表示される

### 4. ポーリング処理

```typescript
// 生成開始後のポーリング
// ★ 重要: status.video_url を使用（final_video_url ではない）
const pollGenerationStatus = useCallback((videoId: string) => {
  // 既存のポーリングをクリア
  if (pollingIntervalRef.current) {
    clearInterval(pollingIntervalRef.current);
  }

  const poll = async () => {
    try {
      const status = await videosApi.getStatus(videoId);

      setGenerationProgress(status.progress || 0);
      setGenerationStatus(status.status);

      if (status.status === 'completed') {
        // ポーリング停止
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        setGenerating(false);
        // ★ 親コンポーネントに通知（リスト再読み込みをトリガー）
        onVideoGenerated();
        // モーダルを閉じる
        resetModal();
        onClose();
        return;
      }

      if (status.status === 'failed') {
        // ポーリング停止
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        alert(`生成に失敗しました: ${status.message || 'Unknown error'}`);
        setGenerating(false);
        return;
      }

      // processing中は継続
    } catch (error) {
      console.error('Polling error:', error);
      // エラーでも継続（リトライ）
    }
  };

  // 初回実行
  poll();
  // 3秒間隔でポーリング
  pollingIntervalRef.current = setInterval(poll, 3000);
}, [onVideoGenerated, resetModal, onClose]);

// useEffectでクリーンアップ
useEffect(() => {
  return () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
  };
}, []);
```

---

## 実装手順

### Phase 1: モーダルコンポーネント作成

1. `scene-generator-modal.tsx` を新規作成
2. Step 1（画像アップロード + 設定）UIを実装
3. Step 2（プロンプト）UIを実装
4. Step 3（確認 + 生成）UIを実装

### Phase 2: concat/page.tsx への統合

1. モーダル表示用のstateを追加
2. 「新規シーンを生成」ボタンを動画選択エリアに追加
3. モーダルコンポーネントをインポート・配置
4. 生成完了時のコールバック処理を実装

### Phase 3: テスト・調整

1. モーダル内の各ステップが正常に動作するか確認
2. 生成した動画が選択リストに反映されるか確認
3. アスペクト比の引き継ぎが正しく動作するか確認
4. エラーハンドリングの確認

---

## UI/UXの考慮事項

### アスペクト比の自動引き継ぎ

- アドクリエイターで選択したアスペクト比を自動的にシーン生成に適用
- モーダル内ではアスペクト比選択UIを非表示または読み取り専用で表示
- これにより、生成した動画が確実に選択可能になる

### 生成中の体験

- モーダル内に進捗バーを表示
- 「生成中...」のスピナーとステータスメッセージ
- 生成中はモーダルを閉じられないようにする（または警告を表示）

### 生成完了後の体験

- 自動的にモーダルを閉じる
- 生成した動画を選択リストの先頭に表示（最新順）
- トースト通知で「シーン動画が生成されました」と表示

---

## API利用（既存を再利用）

### 使用するAPI

| API | 用途 |
|-----|------|
| `videosApi.uploadImage(file)` | 画像アップロード |
| `videosApi.suggestStories(imageUrl)` | AIストーリー提案 |
| `videosApi.translateStoryPrompt(data)` | 日本語→英語翻訳 |
| `videosApi.createStoryVideo(data)` | シーン動画生成 |
| `videosApi.getStatus(id)` | 生成ステータス取得（ポーリング） |

### createStoryVideo に渡すパラメータ

```typescript
{
  image_url: string;          // アップロードした画像URL
  story_text: string;         // 英語プロンプト
  aspect_ratio: '9:16' | '16:9' | '1:1';  // アドクリエイターから引き継ぎ
  video_provider: 'runway' | 'veo' | 'domoai';
  camera_work?: string;
  // BGM、オーバーレイは今回は省略（シンプルに保つ）
}
```

---

## 注意事項

### 1. アスペクト比 1:1 への対応（実装済み対策）

現在のシーン生成APIは `9:16` と `16:9` のみ対応。
アドクリエイターは `1:1` も選択可能なため、以下の対策を実装：

- **UI対策**: 1:1選択時は「新規シーン生成」ボタンを無効化し、理由を表示
- **条件付きレンダリング**: `selectedAspectRatio !== "1:1"` でモーダルを表示しない
- **将来対応**: バックエンドAPIを拡張して1:1に対応（別タスク、優先度低）

### 2. 動画リストの更新（実装済み対策）

生成完了後、`loadVideos()` を呼び出してリスト全体を再取得。

**理由**:
- 型の不一致（`story_text` vs `user_prompt`）を回避
- アスペクト比検出も再実行される
- 信頼性が高い

**副作用**:
- リスト再取得中は一瞬ローディング表示になる可能性
- アスペクト比検出は非同期のため、一時的に動画のアスペクト比が不明になる
  - ただし `isCompatible = !videoRatio || videoRatio === selectedAspectRatio` の実装により、未検出時は選択可能

### 3. 生成時間

シーン動画の生成には **60〜120秒** 程度かかるため：
- モーダル内に進捗バーを表示
- 「生成中...約1〜2分かかります」のメッセージを表示
- 生成中はモーダルを閉じる際に確認ダイアログを表示

### 4. エラーハンドリング

| エラーケース | 対応 |
|-------------|------|
| 画像アップロード失敗 | アラート表示、状態をリセット |
| AI提案取得失敗 | アラート表示、手動入力を促す |
| 翻訳失敗 | アラート表示、リトライ可能 |
| 動画生成失敗 | アラート表示、生成状態をリセット |
| ポーリングエラー | リトライ継続（最大5分でタイムアウト） |

### 5. タイムアウト処理

ポーリングの最大時間を設定し、タイムアウト時はエラーメッセージを表示：

```typescript
// タイムアウト設定（5分）
const POLLING_TIMEOUT_MS = 5 * 60 * 1000;

useEffect(() => {
  if (!generatingVideoId) return;

  const timeoutId = setTimeout(() => {
    if (generating) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      alert("生成がタイムアウトしました。もう一度お試しください。");
      setGenerating(false);
    }
  }, POLLING_TIMEOUT_MS);

  return () => clearTimeout(timeoutId);
}, [generatingVideoId, generating]);
```

---

## 見積もり工数

| 作業 | 内容 |
|------|------|
| モーダルUI実装 | Step 1〜3 のUI |
| 状態管理 | ポーリング、エラーハンドリング |
| 統合テスト | concat/page.tsx との連携確認 |

---

## 関連ファイル

### 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker/app/concat/page.tsx` | モーダル統合、state追加、ボタン追加 |
| `movie-maker/components/video/scene-generator-modal.tsx` | **新規作成** |

### 参照ファイル（コピー元）

| ファイル | 参照内容 |
|---------|---------|
| `movie-maker/app/generate/story/page.tsx` | シーン生成フローの実装（ほぼそのまま流用） |
| `movie-maker/app/generate/[id]/page.tsx` | ポーリング処理の参考 |

### 依存コンポーネント

| ファイル | 用途 |
|---------|------|
| `movie-maker/lib/api/client.ts` | API呼び出し（videosApi） |
| `movie-maker/lib/types/video.ts` | AspectRatio型定義 |
| `movie-maker/components/camera/index.tsx` | CameraWorkSelector |
| `movie-maker/lib/camera/types.ts` | CameraWorkSelection型 |
| `movie-maker/lib/camera/presets.ts` | CAMERA_PRESETS |
| `movie-maker/components/ui/motion-selector.tsx` | MotionSelector（Act-Two用） |
| `movie-maker/lib/constants/animation-templates.ts` | アニメーションテンプレート定数 |
| `movie-maker/components/ui/button.tsx` | Buttonコンポーネント |

### バックエンドAPI（変更不要）

| エンドポイント | 用途 |
|--------------|------|
| `POST /api/v1/videos/upload-image` | 画像アップロード |
| `POST /api/v1/videos/suggest-stories` | AIストーリー提案 |
| `POST /api/v1/videos/story/translate` | 日本語→英語翻訳 |
| `POST /api/v1/videos/story` | シーン動画生成 |
| `GET /api/v1/videos/{id}/status` | 生成ステータス取得 |
| `GET /api/v1/videos` | 動画リスト取得 |

---

## チェックリスト（実装前確認）

- [ ] `lib/constants/animation-templates.ts` が存在することを確認
- [ ] `components/camera/index.tsx` がエクスポートされていることを確認
- [ ] `components/ui/motion-selector.tsx` が存在することを確認
- [ ] バックエンドサーバーが起動していることを確認
- [ ] Supabase認証が正常に動作していることを確認
