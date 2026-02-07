# ノードエディタ V2V (Video-to-Video) 実装計画書

**Version:** 1.3
**Date:** 2026-02-06
**Status:** Approved
**Revision:** Opus承認条件3件(I001-NEW, I002-NEW, I003-NEW)対応、推奨改善反映

## 1. 概要

### 1.1 目的
ノードエディタで生成済み動画を入力として新しい動画を生成する「Video-to-Video (V2V)」機能を実装する。

### 1.2 ユースケース
- 生成した動画のスタイルや動きを変更したい
- 動画の続きを別のプロンプトで生成したい
- 既存動画をベースに新しいバリエーションを作成したい

### 1.3 制約
- **対応プロバイダー**: Runway のみ (`gen4_aleph` モデル)
- **動画長**: 5秒固定（出力）
- **入力動画**: URL形式（R2またはアップロード済み動画）
- **入力動画制限**:
  - **最大ファイルサイズ**: 50MB
  - **対応フォーマット**: MP4, WebM, MOV (video/mp4, video/webm, video/quicktime)
  - **最大動画長**: 10秒以下

## 2. 現状分析

### 2.1 バックエンド状態 (Opus C001対応: 実態を正確に記載)

| コンポーネント | 状態 | 詳細 |
|----------------|------|------|
| `runway_provider.py` | ✅ 実装済み | `generate_v2v()` メソッド (lines 383-470) |
| `video_provider.py` | ✅ 実装済み | `supports_v2v` プロパティ |
| `VideoMode` enum | ✅ 実装済み | `schemas.py:48` に `V2V = "v2v"` |
| `AddSceneRequest` | ✅ 実装済み | `video_mode`, `source_video_url` あり (lines 685-686) |
| `RegenerateVideoRequest` | ✅ 実装済み | `video_mode` あり (line 757) ※後述の注意事項参照 |
| **`StoryVideoCreate`** | ⚠️ **要修正** | `video_mode`, `source_video_url` **なし** (lines 261-302) |
| `router.py` V2V処理 | ✅ 実装済み | 分岐処理あり (lines 1919-1955) |
| 動画アップロード | ⚠️ **要新規** | `r2.py` に `upload_video` 関数あるがAPIエンドポイントなし |

### 2.2 フロントエンド（未実装）

| コンポーネント | 状態 | 必要な作業 |
|----------------|------|------------|
| `VideoInputNode` | ❌ 未実装 | 新規作成 |
| `node-editor.ts` | ❌ 未対応 | `videoInput` タイプ、V2Vスキーマ追加 |
| `graph-to-api.ts` | ❌ 未対応 | V2V パラメータ変換追加 |
| `NodePalette.tsx` | ❌ 未対応 | 動画入力ノード追加、排他制御 |
| `GenerateNode.tsx` | ❌ 未対応 | V2V入力ハンドル追加 |
| `NodeEditor.tsx` | ❌ 未対応 | VideoInputNodeイベント処理 |

### 2.3 ブロッキング依存関係 (Opus C001対応)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ BLOCKING DEPENDENCY                                     │
│                                                             │
│  バックエンド StoryVideoCreate スキーマ修正が必須           │
│  → video_mode, source_video_url フィールド追加              │
│  → Phase 0 として最初に実施                                 │
└─────────────────────────────────────────────────────────────┘
```

**理由**: ノードエディタは `POST /api/v1/videos` (StoryVideoCreate) を使用する。
現状のスキーマには `video_mode`, `source_video_url` がないため、V2Vリクエストが
バリデーションエラー (400 Bad Request) となる。

### 2.4 RegenerateVideoRequest V2Vハンドリング (Opus I002-NEW対応)

**現状**: `RegenerateVideoRequest` には `video_mode` フィールドがあるが、`source_video_url` フィールドがない。

**対応方針**:
- V2Vモードで再生成する場合、バックエンドは元の生成リクエストから `source_video_url` を自動参照する
- フロントエンドからは `video_mode: 'v2v'` のみ指定、`source_video_url` は送信不要
- バックエンド側で元のシーン情報（`scenes` テーブル）から参照元動画URLを取得

**バックエンド処理フロー** (`router.py` 再生成処理):
```python
# 再生成時のV2V処理
if regenerate_request.video_mode == 'v2v':
    # 元のシーンから source_video_url を取得
    original_scene = await get_scene(scene_id)
    source_video_url = original_scene.get('source_video_url')
    if not source_video_url:
        raise HTTPException(400, "V2V再生成には元の参照動画が必要です")
```

**注意**: 新規にV2Vシーンを追加する場合は `AddSceneRequest` を使用（`source_video_url` フィールドあり）。

### 2.5 image_url 必須フィールド問題

**問題**: `StoryVideoCreate` スキーマでは `image_url` が必須フィールド。V2Vモードでは本来不要。

**対応方針**:
- フロントで `videoThumbnail` を `image_url` として送信（バックエンド変更最小化）
- サムネイルがない場合は動画の1フレーム目をクライアント側でキャプチャ

## 3. 技術設計

### 3.1 新規型定義 (`lib/types/node-editor.ts`)

```typescript
// ========== NodeType に追加 ==========
export type NodeType =
  | 'imageInput'
  | 'videoInput'  // 新規追加
  | 'prompt'
  // ... 既存タイプ

// ========== V2V用スキーマフィールド追加 ==========
export interface StoryVideoCreateRequest {
  // 必須
  image_url: string;
  story_text: string;
  // 基本設定
  aspect_ratio?: '9:16' | '16:9';
  video_provider?: VideoProvider;
  subject_type?: SubjectType;
  // ... 既存フィールド
  // ========== V2V用追加フィールド ==========
  video_mode?: 'i2v' | 'v2v';         // 追加: 動画生成モード
  source_video_url?: string;           // 追加: V2V参照動画URL
}

// ========== 新規インターフェース ==========
export interface VideoInputNodeData extends BaseNodeData {
  type: 'videoInput';
  videoUrl: string | null;              // 入力動画URL
  videoThumbnail: string | null;        // サムネイル（プレビュー用）
  videoDuration: number | null;         // 動画長（秒）
  sourceType: 'upload' | 'history' | 'url';  // 入力ソースタイプ
  // オプショナルメタデータ (デバッグ・ログ用)
  fileSize?: number;                    // ファイルサイズ（bytes）
  mimeType?: string;                    // MIMEタイプ (video/mp4, video/webm, video/quicktime)
}

// ========== WorkflowNodeData に追加 ==========
export type WorkflowNodeData =
  | ImageInputNodeData
  | VideoInputNodeData  // 新規追加
  | PromptNodeData
  // ... 既存タイプ

// ========== HANDLE_IDS に追加 (Opus I003対応: 命名統一) ==========
export const HANDLE_IDS = {
  // ... 既存
  // VideoInputNode出力ハンドル (API フィールド名と統一)
  SOURCE_VIDEO_OUTPUT: 'source_video_url',
  // GenerateNode追加入力ハンドル (同じID)
  SOURCE_VIDEO_INPUT: 'source_video_url',
} as const;

// ========== NODE_CATEGORIES 更新 ==========
export const NODE_CATEGORIES = {
  input: {
    label: '入力',
    description: '画像・動画・プロンプト入力',
    nodes: ['imageInput', 'videoInput', 'prompt'] as NodeType[],
  },
  // ...
};

// ========== PROVIDER_NODE_AVAILABILITY 更新 ==========
export const PROVIDER_NODE_AVAILABILITY: Record<VideoProvider, NodeType[]> = {
  runway: ['actTwo', 'videoInput'],  // videoInput 追加
  piapi_kling: ['klingMode', 'klingElements', 'klingEndFrame', 'klingCameraControl'],
  veo: [],
  domoai: [],
  hailuo: ['hailuoEndFrame'],
};

// ========== createDefaultNodeData に追加 ==========
case 'videoInput':
  return {
    type: 'videoInput',
    isValid: false,
    videoUrl: null,
    videoThumbnail: null,
    videoDuration: null,
    sourceType: 'upload',
  };
```

### 3.2 VideoInputNode コンポーネント

**ファイル:** `components/node-editor/nodes/VideoInputNode.tsx`

**機能:**
1. **動画アップロード** - ローカルファイルをR2にアップロード
2. **履歴から選択** - 生成済み動画をモーダルで選択
3. **URL入力** - 外部動画URLを直接入力

**UI構成:**
```
┌─────────────────────────────────────┐
│ 🎬 動画入力  [Runway専用]          │
├─────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐│
│ │アップロード│ │ 履歴  │ │  URL   ││
│ └─────────┘ └─────────┘ └─────────┘│
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │   [サムネイル / ドロップ]   │   │
│  │   ホバーで動画再生          │   │
│  └─────────────────────────────┘   │
│  Duration: 5.0s  |  MP4           │
│  ⚠️ V2VはRunwayのみ対応           │
├─────────────────────────────────────┤
│              ○ source_video_url    │
└─────────────────────────────────────┘
```

**アップロード状態管理 (Opus R002対応: 状態マシン)**
```typescript
// Discriminated Union で明示的な状態管理
type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'success'; videoUrl: string; thumbnailUrl: string; duration: number }
  | { status: 'error'; errorType: keyof typeof ERROR_MESSAGES };

const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });

// 状態遷移
const startUpload = () => setUploadState({ status: 'uploading', progress: 0 });
const uploadSuccess = (data: UploadResponse) => setUploadState({
  status: 'success',
  videoUrl: data.video_url,
  thumbnailUrl: data.thumbnail_url,
  duration: data.duration,
});
const uploadError = (type: keyof typeof ERROR_MESSAGES) => setUploadState({
  status: 'error',
  errorType: type,
});
```

**エラーメッセージマッピング:**
```typescript
const ERROR_MESSAGES = {
  INVALID_FORMAT: '対応していない動画形式です（MP4/WebM/MOVのみ）',
  FILE_TOO_LARGE: 'ファイルサイズが大きすぎます（50MB以下）',
  DURATION_TOO_LONG: '動画が長すぎます（10秒以下）',
  UPLOAD_FAILED: 'アップロードに失敗しました。再試行してください',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
} as const;
```

**サムネイル生成戦略 (Opus I002対応)**
```typescript
// サムネイル取得の優先順位
const getThumbnail = async (videoUrl: string, serverThumbnail?: string): Promise<string> => {
  // 1. サーバーから返されたサムネイルを優先
  if (serverThumbnail) return serverThumbnail;

  // 2. クライアント側でキャプチャ（フォールバック）
  return captureVideoFrame(videoUrl, 0); // 0秒 = 最初のフレーム
};

// クライアント側フレームキャプチャ (Opus I003-NEW対応: CORSエラーハンドリング)
const captureVideoFrame = async (videoUrl: string, timeInSeconds: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';  // CORS対応: R2/CDNからのクロスオリジン読み込み
    video.preload = 'metadata';
    video.src = videoUrl;

    video.onloadeddata = () => {
      video.currentTime = timeInSeconds;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);

        // CORS制限によりtoDataURL()がSecurityErrorを投げる可能性
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      } catch (error) {
        // SecurityError: CORSヘッダー不足でcanvasがtainted
        if (error instanceof DOMException && error.name === 'SecurityError') {
          console.warn('CORS restriction prevented frame capture, using fallback');
          reject(new Error('CORS_RESTRICTED'));
        } else {
          reject(error);
        }
      }
    };

    video.onerror = () => reject(new Error('Failed to load video for frame capture'));
  });
};

// サムネイル取得（CORSフォールバック付き）
const getThumbnailWithFallback = async (
  videoUrl: string,
  serverThumbnail?: string
): Promise<string | null> => {
  // 1. サーバーから返されたサムネイルを優先
  if (serverThumbnail) return serverThumbnail;

  // 2. クライアント側でキャプチャ試行
  try {
    return await captureVideoFrame(videoUrl, 0);
  } catch (error) {
    if (error instanceof Error && error.message === 'CORS_RESTRICTED') {
      // 3. CORSエラー時はサムネイルなしで続行（動画URLをプレースホルダーとして使用）
      console.warn('Using video URL as fallback due to CORS restriction');
      return null;  // UIで動画アイコンを表示
    }
    throw error;
  }
};
```

### 3.3 履歴選択モーダル仕様

**API呼び出し:**
```typescript
// GET /api/v1/videos?limit=20&status=completed
const response = await videosApi.list({
  limit: 20,
  status: 'completed',
});
```

**フィルタ条件:**
- `status === 'completed'` のみ表示
- `video_url` が存在するもののみ（null/undefinedを除外）
- 作成日時の降順でソート

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ 生成履歴から選択                              [×閉じる] │
├─────────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │thumb│ │thumb│ │thumb│ │thumb│ │thumb│ │thumb│       │
│ │5.0s │ │5.0s │ │5.0s │ │5.0s │ │5.0s │ │5.0s │       │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                       │
│ │thumb│ │thumb│ │thumb│ │thumb│                       │
│ │5.0s │ │5.0s │ │5.0s │ │5.0s │                       │
│ └─────┘ └─────┘ └─────┘ └─────┘                       │
├─────────────────────────────────────────────────────────┤
│                    [もっと読み込む]                     │
└─────────────────────────────────────────────────────────┘
```

### 3.4 graph-to-api.ts 更新

**エッジベースデータフロー仕様 (Opus I001対応)**

```typescript
// V2Vモード判定ロジック
// 判定基準: VideoInputNodeの存在 AND videoUrlが設定済み
// エッジ接続は必須ではない（findNode()でノード探索）

export function graphToStoryVideoCreate(
  nodes: WorkflowNode[],
  edges: Edge[]
): StoryVideoCreateRequest {
  // ヘルパー関数
  const findNode = <T extends WorkflowNodeData>(type: T['type']): T | undefined => {
    const node = nodes.find((n) => (n.data as WorkflowNodeData).type === type);
    return node?.data as T | undefined;
  };

  // ノード取得
  const videoInput = findNode<VideoInputNodeData>('videoInput');
  const imageInput = findNode<ImageInputNodeData>('imageInput');
  const provider = findNode<ProviderNodeData>('provider');
  const prompt = findNode<PromptNodeData>('prompt');
  const cameraWork = findNode<CameraWorkNodeData>('cameraWork');
  const bgm = findNode<BGMNodeData>('bgm');
  const filmGrain = findNode<FilmGrainNodeData>('filmGrain');
  const lut = findNode<LUTNodeData>('lut');

  // ========== V2V モード判定 ==========
  if (videoInput?.videoUrl) {
    // プロバイダーチェック
    if (provider?.provider && provider.provider !== 'runway') {
      throw new Error('V2V（動画入力）はRunwayプロバイダーのみ対応しています。プロバイダーをRunwayに変更してください。');
    }

    // 排他チェック（VideoInputとImageInputの同時使用禁止）
    if (imageInput?.imageUrl) {
      throw new Error('V2Vモードでは画像入力と動画入力を同時に使用できません。どちらか一方を削除してください。');
    }

    // プロンプト必須チェック
    if (!prompt?.englishPrompt && !prompt?.japanesePrompt) {
      throw new Error('プロンプトが入力されていません');
    }

    // V2Vモードリクエスト構築
    return {
      // image_url: サムネイルを使用（バックエンドの必須フィールド対応）
      image_url: videoInput.videoThumbnail || videoInput.videoUrl,
      story_text: prompt.englishPrompt || prompt.japanesePrompt || '',
      aspect_ratio: provider?.aspectRatio ?? '9:16',
      video_provider: 'runway',
      subject_type: prompt?.subjectType ?? 'person',
      // V2V固有パラメータ
      video_mode: 'v2v',
      source_video_url: videoInput.videoUrl,
      // 後処理パラメータ
      camera_work: cameraWork?.promptText || undefined,
      bgm_track_id: bgm?.bgmTrackId || undefined,
      film_grain: filmGrain?.grain ?? 'medium',
      use_lut: lut?.useLut ?? true,
    };
  }

  // ========== I2V モード ==========
  if (!imageInput?.imageUrl) {
    throw new Error('画像が選択されていません');
  }
  if (!prompt?.englishPrompt) {
    throw new Error('プロンプトが入力されていません');
  }

  return {
    image_url: imageInput.imageUrl,
    story_text: prompt.englishPrompt,
    aspect_ratio: provider?.aspectRatio ?? '9:16',
    video_provider: provider?.provider ?? 'runway',
    subject_type: prompt?.subjectType ?? 'person',
    video_mode: 'i2v',
    camera_work: cameraWork?.promptText || undefined,
    bgm_track_id: bgm?.bgmTrackId || undefined,
    film_grain: filmGrain?.grain ?? 'medium',
    use_lut: lut?.useLut ?? true,
  };
}
```

### 3.5 バリデーション更新

**validateGraphForGeneration 関数:**

```typescript
export function validateGraphForGeneration(
  nodes: WorkflowNode[],
  edges: Edge[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const videoInput = nodes.find(n => (n.data as WorkflowNodeData).type === 'videoInput');
  const imageInput = nodes.find(n => (n.data as WorkflowNodeData).type === 'imageInput');
  const providerNode = nodes.find(n => (n.data as WorkflowNodeData).type === 'provider');
  const hasGenerate = nodes.some(n => (n.data as WorkflowNodeData).type === 'generate');

  // 生成ノード必須
  if (!hasGenerate) {
    errors.push('生成ノードが必要です');
  }

  // V2V固有バリデーション
  if (videoInput) {
    const videoData = videoInput.data as VideoInputNodeData;

    // 1. V2VはRunwayのみ対応
    if (providerNode) {
      const providerData = providerNode.data as ProviderNodeData;
      if (providerData.provider !== 'runway') {
        errors.push('V2V（動画入力）はRunwayプロバイダーのみ対応しています');
      }
    }

    // 2. 排他チェック
    if (imageInput) {
      const imageData = imageInput.data as ImageInputNodeData;
      if (imageData.imageUrl && videoData.videoUrl) {
        errors.push('画像入力と動画入力は同時に使用できません。どちらか一方を削除してください');
      }
    }

    // 3. 動画URL存在チェック
    if (!videoData.videoUrl) {
      errors.push('動画が選択されていません');
    }

    // 4. 動画長チェック
    if (videoData.videoDuration && videoData.videoDuration > 10) {
      errors.push('入力動画は10秒以下にしてください');
    }

    // 5. エッジ接続チェック（警告レベル）
    const generateNode = nodes.find(n => (n.data as WorkflowNodeData).type === 'generate');
    if (generateNode) {
      const hasVideoEdge = edges.some(
        e => e.source === videoInput.id && e.target === generateNode.id
      );
      if (!hasVideoEdge) {
        // 接続なしでも動作するが、警告
        console.warn('VideoInputNode is not connected to GenerateNode');
      }
    }
  }

  // I2Vモードの場合
  if (!videoInput) {
    if (!imageInput) {
      errors.push('画像入力または動画入力ノードが必要です');
    } else {
      const imageData = imageInput.data as ImageInputNodeData;
      if (!imageData.imageUrl) {
        errors.push('画像が選択されていません');
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
```

### 3.6 NodePalette 更新 (Opus I004対応: 排他制御)

```typescript
// NodePalette.tsx

// ノード追加時の排他チェック
const handleAddNode = (nodeType: NodeType) => {
  const existingNodes = nodes;

  // VideoInput/ImageInput 排他制御
  if (nodeType === 'videoInput') {
    const hasImageInput = existingNodes.some(
      n => (n.data as WorkflowNodeData).type === 'imageInput' &&
           (n.data as ImageInputNodeData).imageUrl
    );
    if (hasImageInput) {
      toast.warning('画像入力ノードと動画入力ノードは同時に使用できません。画像入力を削除するか、空にしてください。');
      // 追加は許可するが警告表示
    }
  }

  if (nodeType === 'imageInput') {
    const hasVideoInput = existingNodes.some(
      n => (n.data as WorkflowNodeData).type === 'videoInput' &&
           (n.data as VideoInputNodeData).videoUrl
    );
    if (hasVideoInput) {
      toast.warning('動画入力ノードと画像入力ノードは同時に使用できません。動画入力を削除するか、空にしてください。');
    }
  }

  // ノード追加処理
  onAddNode(nodeType);
};

// パレット項目
{
  type: 'videoInput',
  label: '動画入力 (V2V)',
  description: '既存動画からV2V生成（Runway専用）',
  icon: 'Video',
  category: 'input',
  availableFor: ['runway'],
}
```

### 3.7 GenerateNode 更新 (Opus C003対応: 詳細仕様)

**既存ハンドル位置（現状）:**
```
┌─────────────────────────────────────┐
│ 🎬 生成                            │
├─────────────────────────────────────┤
│ ○ image_url        (20%)          │
│ ○ story_text       (35%)          │
│ ○ config           (50%)          │
│ ○ camera_work      (65%)          │
│                                     │
│ [生成ボタン]                        │
├─────────────────────────────────────┤
│                         video_url ○│
└─────────────────────────────────────┘
```

**V2V対応後のハンドル位置:**
```
┌─────────────────────────────────────┐
│ 🎬 生成                            │
├─────────────────────────────────────┤
│ ○ image_url         (15%)         │
│ ○ source_video_url  (28%) [NEW]   │
│ ○ story_text        (41%)         │
│ ○ config            (54%)         │
│ ○ camera_work       (67%)         │
│                                     │
│ [I2V/V2V モード表示]               │
│ [生成ボタン]                        │
├─────────────────────────────────────┤
│                         video_url ○│
└─────────────────────────────────────┘
```

**GenerateNode.tsx 変更点:**
```typescript
// 入力ハンドル追加
<Handle
  type="target"
  position={Position.Left}
  id="source_video_url"
  className={inputHandleClassName}
  style={{ top: '28%' }}
/>

// 入力ラベルセクション更新
const inputLabels = [
  { id: 'image_url', label: '画像', top: '15%' },
  { id: 'source_video_url', label: '動画 (V2V)', top: '28%' },  // NEW
  { id: 'story_text', label: 'プロンプト', top: '41%' },
  { id: 'config', label: '設定', top: '54%' },
  { id: 'camera_work', label: 'カメラ', top: '67%' },
];

// V2Vモード表示
const isV2VMode = !!connectedVideoUrl; // エッジから取得
{isV2VMode && (
  <div className="text-xs text-amber-400 mb-2">
    V2Vモード (Runway)
  </div>
)}
```

### 3.8 NodeEditor.tsx イベント処理 (Opus R001対応)

```typescript
// NodeEditor.tsx に追加

// VideoInputNode のデータ更新イベント処理
useEffect(() => {
  const handleVideoInputUpdate = (event: CustomEvent) => {
    const { nodeId, updates } = event.detail;
    setNodes(nodes =>
      nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  };

  window.addEventListener('nodeDataUpdate', handleVideoInputUpdate as EventListener);
  return () => {
    window.removeEventListener('nodeDataUpdate', handleVideoInputUpdate as EventListener);
  };
}, [setNodes]);

// V2V生成コンテキストの処理
const handleStartGeneration = async () => {
  const validationResult = validateGraphForGeneration(nodes, edges);
  if (!validationResult.isValid) {
    toast.error(validationResult.errors.join('\n'));
    return;
  }

  try {
    const request = graphToStoryVideoCreate(nodes, edges);

    // V2Vモード時のログ
    if (request.video_mode === 'v2v') {
      console.log('Starting V2V generation with source:', request.source_video_url);
    }

    // API呼び出し
    const response = await videosApi.create(request);
    // ...
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '生成に失敗しました');
  }
};
```

## 4. API 仕様

### 4.1 バックエンドスキーマ修正 (Phase 0: ブロッキング) (Opus I001-NEW対応)

**対象ファイル:** `movie-maker-api/app/videos/schemas.py`

**StoryVideoCreate クラス修正:**
```python
class StoryVideoCreate(BaseModel):
    """動画生成リクエスト"""
    # 既存フィールド
    image_url: str = Field(..., description="入力画像URL")
    story_text: str = Field(..., description="ストーリーテキスト")
    # ... 既存フィールド

    # ========== V2V用フィールド追加 ==========
    video_mode: Optional[str] = Field("i2v", description="動画生成モード: 'i2v' or 'v2v'")
    source_video_url: Optional[str] = Field(None, description="V2V参照動画URL")
    subject_type: Optional[str] = Field("person", description="被写体タイプ: 'person', 'animal', 'object', etc.")
```

**subject_type追加理由**: フロントエンドの `StoryVideoCreateRequest` では `subject_type` を送信可能だが、
バックエンドの `StoryVideoCreate` にも明示的に定義することで、型の整合性とAPIドキュメントの明確化を図る。
既存のAddSceneRequest (line 673) には `subject_type` があるため、StoryVideoCreateにも統一。

### 4.2 動画アップロードエンドポイント (Opus C002対応)

**実装方針**: 新規エンドポイント `upload-video` を作成（既存 `upload_video` 関数を利用）

**エンドポイント:** `POST /api/v1/videos/upload-video`

```
POST /api/v1/videos/upload-video
Content-Type: multipart/form-data

Request:
  file: video/mp4, video/webm, video/quicktime (max 50MB)

Response:
{
  "video_url": "https://r2.example.com/user-videos/xxx.mp4",
  "thumbnail_url": "https://r2.example.com/user-videos/thumbs/xxx.jpg",
  "duration": 5.2
}
```

**サムネイル生成方式 (Opus I005対応):**
- **同期生成**を採用（アップロード完了時にサムネイルも返却）
- FFmpegで最初のフレームをキャプチャ: `ffmpeg -i input.mp4 -vf "select=eq(n\,0)" -vframes 1 thumb.jpg`
- アップロード時間は若干増加するが、UXの即時性を優先

### 4.3 生成履歴動画取得

**既存エンドポイント使用:**

```
GET /api/v1/videos?limit=20&status=completed

Response:
{
  "videos": [
    {
      "id": "uuid",
      "video_url": "https://...",
      "thumbnail_url": "https://...",
      "duration": 5.0,
      "created_at": "2026-02-06T..."
    }
  ]
}
```

## 5. 実装タスク

### Phase 0: バックエンド依存解決 (ブロッキング)
| Task | 内容 | 工数 | ブロック |
|------|------|------|----------|
| **T0-1** | `StoryVideoCreate` に `video_mode`, `source_video_url`, `subject_type` 追加 | 小 | - |
| **T0-2** | `upload-video` エンドポイント実装 | 中 | - |
| **T0-3** | FFmpegサムネイル同期生成 | 中 | T0-2 |
| **T0-4** | バックエンドユニットテスト | 小 | T0-1,T0-2 |

### Phase 1: 型定義・基盤整備
| Task | 内容 | 工数 | ブロック |
|------|------|------|----------|
| T1-1 | `node-editor.ts` に `videoInput` 型追加 | 小 | T0-1 |
| T1-2 | `StoryVideoCreateRequest` に V2Vフィールド追加 | 小 | T0-1 |
| T1-3 | `HANDLE_IDS`, `NODE_CATEGORIES`, `PROVIDER_NODE_AVAILABILITY` 更新 | 小 | - |
| T1-4 | `createDefaultNodeData` に `videoInput` case追加 | 小 | - |

### Phase 2: VideoInputNode 実装
| Task | 内容 | 工数 | ブロック |
|------|------|------|----------|
| T2-1 | `VideoInputNode.tsx` 基本構造・状態マシン | 中 | T1-1 |
| T2-2 | 動画アップロード機能（ドラッグ&ドロップ） | 中 | T0-2 |
| T2-3 | 履歴選択モーダル実装（createPortal） | 中 | - |
| T2-4 | URL入力機能 | 小 | - |
| T2-5 | 動画プレビュー・サムネイル表示 | 小 | - |
| T2-6 | クライアント側サムネイルキャプチャ（フォールバック）+ CORSハンドリング | 小 | T2-5 |
| T2-7 | エラーハンドリング | 小 | - |

### Phase 3: API 連携・バリデーション
| Task | 内容 | 工数 | ブロック |
|------|------|------|----------|
| T3-1 | `graph-to-api.ts` V2Vパラメータ対応 | 中 | T1-2 |
| T3-2 | `validateGraphForGeneration` V2Vバリデーション | 小 | - |
| T3-3 | フロントAPIクライアント `uploadVideo` 追加 | 小 | T0-2 |

### Phase 4: 統合
| Task | 内容 | 工数 | ブロック |
|------|------|------|----------|
| T4-1 | NodeEditor.tsx イベント処理追加 | 小 | T2-1 |
| T4-2 | NodePalette排他制御追加 | 小 | - |
| T4-3 | GenerateNode V2Vハンドル・UI追加 | 中 | T1-3 |

### Phase 5: 品質保証
| Task | 内容 | 工数 | ブロック |
|------|------|------|----------|
| T5-1 | VideoInputNode単体テスト | 中 | T2-7 |
| T5-2 | graph-to-api.ts V2Vテスト | 小 | T3-1 |
| T5-3 | バリデーションテスト | 小 | T3-2 |
| T5-4 | E2Eテスト（V2Vフロー） | 中 | T4-3 |
| T5-5 | 受け入れ基準検証 | 小 | T5-4 |
| T5-6 | コードレビュー | 小 | T5-5 |

## 6. UI/UX 考慮事項

### 6.1 Runway専用であることの明示
- VideoInputNode にはRunway専用バッジを常時表示
- 他プロバイダー選択時は警告: 「V2VはRunwayのみ対応」
- プロバイダーノードでRunway以外選択時、VideoInputNodeを赤枠で警告

### 6.2 I2V/V2V排他制御
- VideoInputNodeとImageInputNodeは同時使用不可
- どちらかを配置した状態でもう一方を追加しようとするとtoast警告
- 生成ノードで入力タイプ（I2V/V2V）を表示

### 6.3 動画プレビュー
- **通常**: サムネイル表示（軽量）
- **ホバー**: 動画自動再生（ミュート）
- **クリック**: フルスクリーンモーダルで再生
- Duration（秒）とフォーマット表示

### 6.4 エラー表示
- ノード内にエラーメッセージ表示
- 赤枠でエラー状態を視覚化
- 詳細エラーはツールチップで表示

## 7. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| **バックエンドスキーマ未対応** | APIエラー400 | Phase 0でブロッキング対応 |
| 動画アップロードサイズ制限 | UX低下 | フロントで50MB制限、明確なエラー |
| Runway APIレート制限 | 生成失敗 | リトライロジック |
| 長時間動画の処理 | タイムアウト | 10秒制限、バリデーション |
| 非対応フォーマット | アップロード失敗 | MIME検証 + 拡張子チェック |
| サムネイル生成失敗 | プレビュー不可 | クライアント側キャプチャでフォールバック |
| CORSによるサムネイル取得失敗 | プレビュー不可 | R2のCORS設定確認、nullフォールバックで動画アイコン表示 |
| **動画コーデック非互換** | Runway処理失敗 | H.264/H.265のみ受付、アップロード時にFFprobeで検証、非対応コーデックはエラー表示 |

## 8. 成功指標

- [ ] **バックエンドV2V対応**: `StoryVideoCreate`に`video_mode`/`source_video_url`が追加され、V2Vリクエストが受け付けられる
- [ ] **動画アップロード**: 50MB以下のMP4/WebM/MOV動画をR2にアップロードし、`video_url`と`thumbnail_url`が返却される
- [ ] **履歴選択**: 生成履歴モーダルから動画を選択し、VideoInputNodeに反映される
- [ ] **URL入力**: 外部動画URLを入力し、VideoInputNodeに反映される
- [ ] **V2V生成完了**: VideoInput + Prompt + Provider(Runway) + Generate で動画生成が成功し、5秒動画が取得できる
- [ ] **プロバイダー警告**: Runway以外選択時、VideoInputNodeに警告表示
- [ ] **排他バリデーション**: ImageInputとVideoInputを同時配置で`validateGraphForGeneration`がエラー
- [ ] **動画プレビュー**: サムネイル表示、ホバー再生、フルスクリーン再生が動作
- [ ] **エラーハンドリング**: 無効なフォーマット/サイズ/長さで適切なエラー表示

## 9. 参考リンク

- Runway V2V API: `runway_provider.py:383-470`
- バックエンドV2Vスキーマ: `schemas.py:48`, `schemas.py:685-686`
- StoryVideoCreateスキーマ: `schemas.py:261-302` (要修正)
- V2Vルーター処理: `router.py:1919-1955`
- 既存ImageInputNode: `nodes/ImageInputNode.tsx`
- 既存GenerateNode: `nodes/GenerateNode.tsx`

## 10. 変更履歴

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-06 | 初版作成 |
| 1.1 | 2026-02-06 | Sonnetレビュー指摘対応 (C001-C005, I001-I005, R001-R003) |
| 1.2 | 2026-02-06 | Opusレビュー指摘対応: Phase 0追加、バックエンドスキーマ修正明記、ハンドル位置詳細、状態マシン、サムネイル戦略、排他制御詳細 |
| 1.3 | 2026-02-06 | **最終版**: Opus承認条件対応 - (1) subject_type追加 (Section 4.1, T0-1), (2) RegenerateVideoRequest V2Vハンドリング明確化 (Section 2.4), (3) CORSエラーハンドリング追加 (Section 3.2), 推奨改善: VideoInputNodeDataにfileSize/mimeType追加、T2-6依存追加、動画コーデック互換性リスク追加 |
