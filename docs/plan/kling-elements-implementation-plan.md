# Kling Elements（キャラクター一貫性）実装計画書

## 概要

Kling AI の Elements 機能を導入し、複数角度の参照画像を使用することで、カメラワーク時のキャラクター・商品の一貫性を向上させる。

### 目的

- カメラが動いた際の人物・商品の外見一貫性を向上
- 異なるシーン間での被写体の同一性を維持
- リテイク回数の削減による生産性向上

### 対象機能

- ストーリーボードモードでの動画生成
- ワンシーン生成での動画生成

---

## 技術仕様

### API仕様（PiAPI Kling Elements）

```json
{
  "model": "kling",
  "task_type": "video_generation",
  "input": {
    "prompt": "A woman walking in a park",
    "duration": 5,
    "mode": "std",
    "aspect_ratio": "9:16",
    "version": "1.6",
    "elements": [
      { "image_url": "https://example.com/base.png" },
      { "image_url": "https://example.com/side.png" }
    ]
  }
}
```

### Elements とメイン画像の関係

```
【重要】Elements 使用時は image_url パラメータは使用しない

ユーザー操作                    → API送信
─────────────────────────────────────────────────────
ベース画像1枚のみ              → elements: [ベース画像]
ベース画像 + 追加1枚           → elements: [ベース画像, 追加画像1]
ベース画像 + 追加3枚           → elements: [ベース画像, 追加1, 追加2, 追加3]
```

### 制約事項

| 項目 | 制約 |
|------|------|
| 対応プロバイダー | Kling AI のみ（Runway, Veo, Hailuo 非対応） |
| 画像枚数 | 1〜4枚（ベース画像含む） |
| 画像形式 | JPG / PNG |
| 画像サイズ | 最大 10MB / 枚、最小 300px |
| 必須バージョン | Kling 1.6 以上（現在 2.6 使用中で対応済み） |
| camera_control | Elements と併用可能 |

### コスト

- **追加コストなし**（通常の動画生成と同じ $0.195/5秒）
- Elements パラメータは既存の video_generation タスクに含まれる

---

## 実装タスク

### Phase 1: バックエンド実装

#### 1.1 スキーマ更新

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class ElementImage(BaseModel):
    """Elements用参照画像"""
    image_url: str = Field(..., description="参照画像のURL")


class StoryboardCreateRequest(BaseModel):
    """ストーリーボード生成リクエスト"""
    image_url: str = Field(..., description="ベースとなる画像URL")
    mood: str | None = Field(None, description="動画のテーマ/ムード")
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー")
    aspect_ratio: AspectRatio = Field(AspectRatio.PORTRAIT, description="アスペクト比")
    element_images: list[ElementImage] | None = Field(
        default=None,
        max_length=3,
        description="一貫性向上用の追加画像（最大3枚、ベース画像と合わせて最大4枚）"
    )


class StoryboardGenerateRequest(BaseModel):
    """ストーリーボードからの動画生成リクエスト"""
    # 既存フィールド...
    bgm_track_id: str | None = Field(None)
    custom_bgm_url: str | None = Field(None)
    film_grain: FilmGrainPreset = Field(FilmGrainPreset.MEDIUM)
    use_lut: bool = Field(True)
    video_provider: VideoProvider | None = Field(None)
    scene_video_modes: dict[int, str] | None = Field(None)
    kling_mode: KlingMode | None = Field(None)
    scene_end_frame_images: dict[int, str] | None = Field(None)

    # 追加フィールド（動画生成時に上書き可能）
    element_images: list[ElementImage] | None = Field(
        default=None,
        max_length=3,
        description="一貫性向上用の追加画像（ストーリーボード保存値を上書き）"
    )

    @model_validator(mode='after')
    def validate_kling_only_features(self) -> Self:
        """Kling専用機能のバリデーション"""
        if self.element_images:
            if self.video_provider and self.video_provider != VideoProvider.PIAPI_KLING:
                raise ValueError("Elements機能はKlingプロバイダーのみ対応しています")
        return self


class StoryVideoCreate(BaseModel):
    """ストーリー動画生成リクエスト（ワンシーン生成）"""
    # 既存フィールド...

    # 追加フィールド
    element_images: list[ElementImage] | None = Field(
        default=None,
        max_length=3,
        description="一貫性向上用の追加画像（最大3枚）"
    )

    @model_validator(mode='after')
    def validate_kling_only_features(self) -> Self:
        """Kling専用機能のバリデーション"""
        if self.element_images:
            if self.video_provider and self.video_provider != VideoProvider.PIAPI_KLING:
                raise ValueError("Elements機能はKlingプロバイダーのみ対応しています")
        return self
```

#### 1.2 PiAPI Kling Provider 更新

**ファイル**: `movie-maker-api/app/external/piapi_kling_provider.py`

```python
async def generate_video(
    self,
    image_url: str,
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    camera_work: Optional[str] = None,
    mode: Optional[str] = None,
    image_tail_url: Optional[str] = None,
    element_images: Optional[list[str]] = None,  # 追加
) -> str:
    """
    PiAPI Kling API で画像から動画を生成

    Args:
        image_url: 入力画像URL（element_images未指定時に使用）
        prompt: 動画生成プロンプト
        duration: 動画長さ（5 or 10秒）
        aspect_ratio: アスペクト比
        camera_work: カメラワーク名
        mode: Klingモード
        image_tail_url: 終了フレーム画像URL
        element_images: Elements用参照画像URLリスト（1〜4枚）
    """
    request_body = {
        "model": "kling",
        "task_type": "video_generation",
        "input": {
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "mode": effective_mode,
            "version": self.version,
        }
    }

    # Elements対応: element_imagesがある場合は elements パラメータを使用
    if element_images and len(element_images) > 0:
        # Elements使用時は image_url ではなく elements を使用
        request_body["input"]["elements"] = [
            {"image_url": url} for url in element_images
        ]
        logger.info(f"Using Kling Elements with {len(element_images)} images")
    else:
        # 従来通り単一画像
        request_body["input"]["image_url"] = image_url

    # 終了フレーム画像（Elements と併用可能）
    if image_tail_url:
        request_body["input"]["image_tail_url"] = image_tail_url

    # カメラ制御（Elements と併用可能）
    camera_control = _get_camera_control(camera_work)
    if camera_control:
        request_body["input"]["camera_control"] = camera_control
```

#### 1.3 ストーリーボードプロセッサ更新

**ファイル**: `movie-maker-api/app/tasks/storyboard_processor.py`

```python
# start_storyboard_processing の引数追加
def start_storyboard_processing(
    storyboard_id: str,
    video_provider: str = None,
    scene_video_modes: dict = None,
    scene_end_frame_images: dict = None,
    element_images: list[str] = None,  # 追加
):
    asyncio.run(process_storyboard_generation(
        storyboard_id,
        video_provider,
        scene_video_modes,
        scene_end_frame_images,
        element_images,  # 追加
    ))


# process_storyboard_generation の引数追加
async def process_storyboard_generation(
    storyboard_id: str,
    video_provider: str = None,
    scene_video_modes: dict = None,
    scene_end_frame_images: dict = None,
    element_images: list[str] = None,  # 追加
):
    # ... 既存処理 ...

    # generate_video_with_v2v_fallback 呼び出し時に element_images を渡す
    task_id, generation_method = await generate_video_with_v2v_fallback(
        provider=provider,
        scene=scene,
        previous_video_url=previous_video_url,
        scene_image_url=scene_image_url,
        aspect_ratio=aspect_ratio,
        force_mode=force_mode,
        image_tail_url=scene_image_tail_url,
        element_images=element_images,  # 追加
    )


# generate_video_with_v2v_fallback の引数追加
async def generate_video_with_v2v_fallback(
    provider,
    scene: dict,
    previous_video_url: Optional[str],
    scene_image_url: str,
    aspect_ratio: str = "9:16",
    force_mode: str = None,
    image_tail_url: Optional[str] = None,
    element_images: Optional[list[str]] = None,  # 追加
) -> tuple[str, str]:
    # ... 既存処理 ...

    # I2V時に element_images を渡す
    generate_kwargs = {
        "image_url": scene_image_url,
        "prompt": runway_prompt,
        "duration": 5,
        "aspect_ratio": aspect_ratio,
        "camera_work": camera_work,
    }

    # Kling専用オプション
    if hasattr(provider, 'provider_name') and provider.provider_name == "piapi_kling":
        if image_tail_url:
            generate_kwargs["image_tail_url"] = image_tail_url
        if element_images:
            # Elements使用時: ベース画像を先頭に追加
            all_elements = [scene_image_url] + element_images
            generate_kwargs["element_images"] = all_elements[:4]  # 最大4枚
            logger.info(f"Using Elements with {len(generate_kwargs['element_images'])} images")

    task_id = await provider.generate_video(**generate_kwargs)
    return task_id, "i2v"
```

#### 1.4 ルーター更新

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
# create_storyboard エンドポイント更新
@router.post("/storyboard", response_model=StoryboardResponse)
async def create_storyboard(...):
    # element_images を storyboards テーブルに保存
    element_urls = [e.image_url for e in request.element_images] if request.element_images else []

    sb_data = {
        "user_id": user_id,
        "source_image_url": request.image_url,
        "element_images": element_urls,  # 追加
        ...
    }


# generate_storyboard_videos エンドポイント更新
@router.post("/storyboard/{storyboard_id}/generate", response_model=StoryboardResponse)
async def generate_storyboard_videos(...):
    # リクエストで上書き or DB保存値を使用
    if request.element_images:
        element_urls = [e.image_url for e in request.element_images]
    else:
        element_urls = sb_data.get("element_images", [])

    # Kling以外のプロバイダーで element_images がある場合はエラー
    if element_urls and video_provider and video_provider not in ["piapi_kling", None]:
        raise HTTPException(400, "Elements機能はKlingプロバイダーのみ対応しています")

    background_tasks.add_task(
        start_storyboard_processing,
        storyboard_id,
        video_provider,
        scene_video_modes,
        scene_end_frame_images,
        element_urls,  # 追加
    )


# create_story_video エンドポイント更新（ワンシーン生成）
@router.post("/story", response_model=StoryVideoResponse)
async def create_story_video(...):
    element_urls = [e.image_url for e in request.element_images] if request.element_images else None

    # Kling以外で element_images がある場合はエラー
    if element_urls and request.video_provider and request.video_provider != VideoProvider.PIAPI_KLING:
        raise HTTPException(400, "Elements機能はKlingプロバイダーのみ対応しています")

    # 動画生成時に element_urls を渡す
```

---

### Phase 2: データベース更新

#### 2.1 storyboards テーブル更新

**注意**: Supabase マイグレーションは MCP ツール (`mcp__supabase__apply_migration`) を使用して実行する。

```sql
-- マイグレーション名: add_element_images_to_storyboards
ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS element_images JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN storyboards.element_images IS
'Kling Elements用の参照画像URLリスト。最大3枚（ベース画像と合わせて最大4枚）。例: ["https://...", "https://..."]';
```

#### 2.2 マイグレーション実行手順

```
1. Claude Code で MCP ツールを呼び出し
2. mcp__supabase__apply_migration を使用
3. 以下のパラメータを指定:
   - project_id: (Supabaseプロジェクト ID)
   - name: "add_element_images_to_storyboards"
   - query: (上記SQL)
```

---

### Phase 3: フロントエンド実装

#### 3.1 型定義追加

**ファイル**: `movie-maker/lib/types/storyboard.ts`

```typescript
export interface ElementImage {
  image_url: string;
}
```

#### 3.2 API クライアント更新

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
// storyboardApi の型更新
export const storyboardApi = {
  create: async (data: {
    image_url: string;
    mood?: string;
    video_provider?: string;
    aspect_ratio?: string;
    element_images?: { image_url: string }[];  // 追加
  }) => { ... },

  generate: async (storyboardId: string, options: {
    bgm_track_id?: string;
    custom_bgm_url?: string;
    film_grain?: string;
    use_lut?: boolean;
    video_provider?: string;
    scene_video_modes?: Record<number, string>;
    kling_mode?: string;
    scene_end_frame_images?: Record<number, string>;
    element_images?: { image_url: string }[];  // 追加
  }) => { ... },
};

// storyVideoApi の型更新
export const storyVideoApi = {
  create: async (data: {
    image_url: string;
    story_text: string;
    // ... 既存フィールド
    element_images?: { image_url: string }[];  // 追加
  }) => { ... },
};
```

#### 3.3 Elements画像アップロードコンポーネント

**ファイル**: `movie-maker/components/video/element-images-uploader.tsx`

```typescript
"use client";

import { useState, useCallback } from "react";
import { X, Plus, Upload, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ElementImagesUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
  onUpload: (file: File) => Promise<string>;  // 画像アップロード関数
  videoProvider?: string;
}

export function ElementImagesUploader({
  value,
  onChange,
  maxImages = 3,
  disabled,
  onUpload,
  videoProvider,
}: ElementImagesUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const isKling = videoProvider === "piapi_kling" || !videoProvider;
  const canAddMore = value.length < maxImages && !disabled && isKling;

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange([...value, url]);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  }, [value, onChange, onUpload]);

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  // Kling以外は非表示
  if (!isKling) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">
          一貫性向上用の追加画像（任意）
        </label>
        <span className="text-xs text-zinc-500">
          {value.length} / {maxImages} 枚
        </span>
      </div>

      <p className="text-xs text-zinc-500">
        同じ被写体の異なる角度の画像を追加すると、カメラワーク時の一貫性が向上します。
      </p>

      <div className="flex flex-wrap gap-2">
        {/* 既存画像 */}
        {value.map((url, index) => (
          <div
            key={index}
            className="relative group w-16 h-16 rounded-lg overflow-hidden border border-zinc-700"
          >
            <img
              src={url}
              alt={`追加画像 ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => handleRemove(index)}
              disabled={disabled}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/80
                         flex items-center justify-center opacity-0 group-hover:opacity-100
                         transition-opacity"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {/* 追加ボタン */}
        {canAddMore && (
          <label
            className={cn(
              "w-16 h-16 rounded-lg border-2 border-dashed border-zinc-600",
              "flex items-center justify-center cursor-pointer",
              "hover:border-zinc-500 transition-colors",
              uploading && "opacity-50 cursor-wait"
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              disabled={uploading || disabled}
            />
            {uploading ? (
              <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-5 h-5 text-zinc-500" />
            )}
          </label>
        )}
      </div>

      {value.length > 0 && (
        <p className="text-xs text-amber-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Klingプロバイダー選択時のみ有効
        </p>
      )}
    </div>
  );
}
```

#### 3.4 ストーリーボードページ更新

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

```typescript
// state追加
const [elementImages, setElementImages] = useState<string[]>([]);

// プロバイダー変更時にクリア
const handleProviderChange = (provider: string) => {
  setVideoProvider(provider);
  if (provider !== "piapi_kling") {
    setElementImages([]);
  }
};

// 動画生成リクエスト
const handleGenerate = async () => {
  await storyboardApi.generate(storyboardId, {
    ...otherOptions,
    element_images: elementImages.length > 0
      ? elementImages.map(url => ({ image_url: url }))
      : undefined,
  });
};

// UI（ベース画像セクションの下に追加）
<ElementImagesUploader
  value={elementImages}
  onChange={setElementImages}
  maxImages={3}
  videoProvider={videoProvider}
  onUpload={handleImageUpload}
  disabled={isGenerating}
/>
```

#### 3.5 ワンシーン生成ページ更新

**ファイル**: `movie-maker/app/generate/story/page.tsx`

同様に `ElementImagesUploader` を追加。

---

### Phase 4: 動作確認・テスト

#### 4.1 ユニットテスト

**ファイル**: `movie-maker-api/tests/external/test_piapi_kling_elements.py`

```python
import pytest
from app.external.piapi_kling_provider import PiAPIKlingProvider

@pytest.mark.asyncio
async def test_generate_video_with_elements():
    """Elements付きで動画生成できることを確認"""
    provider = PiAPIKlingProvider()

    element_images = [
        "https://example.com/base.png",
        "https://example.com/side.png",
    ]

    task_id = await provider.generate_video(
        image_url="https://example.com/base.png",
        prompt="A woman walking",
        element_images=element_images,
    )

    assert task_id is not None


@pytest.mark.asyncio
async def test_generate_video_without_elements():
    """Elements なしでも従来通り動作することを確認"""
    provider = PiAPIKlingProvider()

    task_id = await provider.generate_video(
        image_url="https://example.com/main.png",
        prompt="A woman walking",
        element_images=None,
    )

    assert task_id is not None


@pytest.mark.asyncio
async def test_elements_with_camera_control():
    """Elements とカメラコントロールの併用を確認"""
    provider = PiAPIKlingProvider()

    task_id = await provider.generate_video(
        image_url="https://example.com/base.png",
        prompt="A woman walking",
        element_images=["https://example.com/base.png", "https://example.com/side.png"],
        camera_work="zoom_in",
    )

    assert task_id is not None
```

#### 4.2 E2Eテスト

- ストーリーボード作成 → Elements画像追加 → 動画生成 → 一貫性確認
- プロバイダー切り替え時の Elements クリア確認
- Runway選択時に Elements エラー確認

---

## 実装順序

```
Step 1: スキーマ更新 (schemas.py)
    ↓
Step 2: Provider更新 (piapi_kling_provider.py)
    ↓
Step 3: Processor更新 (storyboard_processor.py)
    ↓
Step 4: Router更新 (router.py)
    ↓
Step 5: データベースマイグレーション（MCP使用）
    ↓
Step 6: フロントエンド型定義 + APIクライアント更新
    ↓
Step 7: ElementImagesUploader コンポーネント作成
    ↓
Step 8: ストーリーボードページ更新
    ↓
Step 9: ワンシーン生成ページ更新
    ↓
Step 10: テスト・動作確認
```

---

## 影響範囲

### 変更が必要なファイル

| ファイル | 変更内容 |
|----------|----------|
| `app/videos/schemas.py` | ElementImage, 各リクエストスキーマ更新 |
| `app/external/piapi_kling_provider.py` | element_images パラメータ対応 |
| `app/tasks/storyboard_processor.py` | 3関数の引数追加 |
| `app/videos/router.py` | 3エンドポイント更新 |
| `lib/api/client.ts` | storyboardApi, storyVideoApi 型更新 |
| `components/video/element-images-uploader.tsx` | 新規作成 |
| `app/generate/storyboard/page.tsx` | UI追加 |
| `app/generate/story/page.tsx` | UI追加 |

### 変更が不要なファイル

- Runway, Veo, Hailuo 等の他プロバイダー
- 既存の画像アップロード処理（再利用）
- 動画結合・書き出し処理

---

## ロールバック計画

Elements 機能に問題が発生した場合:

1. フロントエンド: ElementImagesUploader を非表示に（`return null`）
2. バックエンド: element_images パラメータを無視（従来の image_url を使用）
3. DB: element_images カラムは残しても影響なし（JSONB デフォルト空配列）

---

## 今後の拡張可能性

1. **自動角度検出**: アップロード画像から自動で角度を判定
2. **AI画像生成連携**: BFL FLUX.2 で異なる角度の画像を自動生成
3. **テンプレート化**: よく使うキャラクターを「マイElements」として保存

---

## 参考資料

- [PiAPI Kling Elements Documentation](https://piapi.ai/docs/kling-api/kling-elements)
- [PiAPI Kling Elements Blog](https://piapi.ai/blogs/kling-elements-through-kling-api)
- [Kling AI Character Consistency](https://app.klingai.com/global/quickstart/ai-video-character-consistency)
