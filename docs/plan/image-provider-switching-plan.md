# 画像生成プロバイダー切り替え機能 実装計画書

## 概要

Nano Banana (Gemini) と Flux (PiAPI経由) の2つの画像生成モデルを切り替えて使用できる機能を実装する。

## プロバイダー比較

| プロバイダー | モデル | 日本語プロンプト上限 | 特徴 |
|-------------|--------|---------------------|------|
| **Nano Banana** | gemini-3-pro-image-preview | 50,000文字 | 高品質、長文対応、参照画像対応 |
| **Flux Dev** | Qubico/flux1-dev | 500文字 | 高速、スタイル多様 |
| **Flux Schnell** | Qubico/flux1-schnell | 250文字 | 最速、商用利用可 |

## Supabaseマイグレーション

**不要** - 画像プロバイダーはリクエストごとの選択であり、DBに永続化する必要がない。

---

## 重要: 対象APIエンドポイント

**2つの画像生成APIが存在するため、両方に対応が必要:**

| エンドポイント | スキーマ | 使用箇所 |
|---------------|---------|---------|
| `/generate-scene-image` | `GenerateSceneImageRequest` | `SceneImageGeneratorModal` |
| `/generate-image-from-text` | `GenerateImageFromTextRequest` | `story/page.tsx`, `storyboard/page.tsx` |

---

## 実装ステップ

### Step 1: Backend - スキーマ定義

**ファイル:** `movie-maker-api/app/videos/schemas.py`

**変更内容:**
1. `ImageProvider` enum を追加
2. `IMAGE_PROVIDER_LIMITS` 定数を追加
3. `ASPECT_RATIO_TO_DIMENSIONS` 定数を追加（Flux用）
4. `GenerateImageFromTextRequest` に `image_provider` フィールドを追加
5. `GenerateSceneImageRequest` にも `image_provider` フィールドを追加
6. 動的バリデーション（プロバイダーに応じた文字数制限）を追加
7. Flux + 参照画像の組み合わせをバリデーションエラーにする

```python
class ImageProvider(str, Enum):
    """画像生成プロバイダー"""
    NANOBANANA = "nanobanana"
    FLUX_DEV = "flux_dev"
    FLUX_SCHNELL = "flux_schnell"

# 各プロバイダーの文字数制限（日本語）
IMAGE_PROVIDER_LIMITS: dict[ImageProvider, int] = {
    ImageProvider.NANOBANANA: 50000,
    ImageProvider.FLUX_DEV: 500,
    ImageProvider.FLUX_SCHNELL: 250,
}

# Flux用: アスペクト比→ピクセル変換
ASPECT_RATIO_TO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (768, 1365),   # 縦長 (width, height)
    "16:9": (1365, 768),   # 横長
}

class GenerateImageFromTextRequest(BaseModel):
    # ... 既存フィールド ...
    image_provider: ImageProvider = Field(
        default=ImageProvider.NANOBANANA,
        description="画像生成プロバイダー"
    )

    @model_validator(mode='after')
    def validate_input_provided(self) -> Self:
        """structured_input か free_text_description のどちらかが必須 + プロバイダー制限"""
        # 既存のバリデーション...

        # 追加: プロバイダーに応じた文字数制限
        if self.free_text_description:
            limit = IMAGE_PROVIDER_LIMITS.get(self.image_provider, 50000)
            if len(self.free_text_description) > limit:
                raise ValueError(
                    f"{self.image_provider.value}の文字数制限は{limit}文字です。"
                    f"現在{len(self.free_text_description)}文字入力されています。"
                )

        # 追加: Flux + 参照画像の禁止
        if self.image_provider in (ImageProvider.FLUX_DEV, ImageProvider.FLUX_SCHNELL):
            if self.reference_image_url:
                raise ValueError(
                    "Fluxは参照画像をサポートしていません。"
                    "参照画像を使用する場合はNano Bananaを選択してください。"
                )

        return self

# GenerateSceneImageRequest にも同様の変更を追加
class GenerateSceneImageRequest(BaseModel):
    # ... 既存フィールド ...
    image_provider: ImageProvider = Field(
        default=ImageProvider.NANOBANANA,
        description="画像生成プロバイダー"
    )
```

---

### Step 2: Backend - Flux プロバイダー作成

**ファイル:** `movie-maker-api/app/external/piapi_flux_provider.py` (新規作成)

**実装内容:**
- PiAPI Flux API呼び出しクラス
- Text-to-Image生成（非同期タスク方式）
- タスクステータスポーリング
- 画像URL取得
- 日本語→英語翻訳（Geminiを使用）

```python
"""
PiAPI Flux Image Provider

PiAPI経由でFlux画像生成APIを使用するプロバイダー。
"""
import httpx
import logging
import asyncio
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

PIAPI_BASE_URL = "https://api.piapi.ai/api/v1"

# ポーリング設定
MAX_POLL_ATTEMPTS = 60  # 最大60回（約5分）
POLL_INTERVAL_SECONDS = 5


class FluxImageProvider:
    """Flux画像生成プロバイダー"""

    def __init__(self, model: str = "Qubico/flux1-dev"):
        self.api_key = settings.PIAPI_API_KEY
        self.model = model
        if not self.api_key:
            raise ValueError("PIAPI_API_KEY must be configured")

    def _get_headers(self) -> dict:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    async def generate_image(
        self,
        prompt: str,
        width: int = 768,
        height: int = 1365,
        negative_prompt: str | None = None,
    ) -> str:
        """
        画像を生成してURLを返す

        Args:
            prompt: 英語プロンプト（事前に翻訳済み）
            width: 画像幅（ピクセル）
            height: 画像高さ（ピクセル）
            negative_prompt: ネガティブプロンプト（オプション）

        Returns:
            str: 生成された画像のURL

        Raises:
            ValueError: 生成に失敗した場合
        """
        # 1. タスク作成
        task_id = await self._create_task(prompt, width, height, negative_prompt)
        logger.info(f"Flux task created: {task_id}")

        # 2. ポーリングでステータス確認
        for attempt in range(MAX_POLL_ATTEMPTS):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            status, image_url = await self._check_status(task_id)

            if status == "Completed":
                logger.info(f"Flux image generated: {image_url}")
                return image_url
            elif status == "Failed":
                raise ValueError("Flux画像生成に失敗しました")

            logger.debug(f"Flux polling attempt {attempt + 1}: {status}")

        raise ValueError("Flux画像生成がタイムアウトしました")

    async def _create_task(
        self,
        prompt: str,
        width: int,
        height: int,
        negative_prompt: str | None,
    ) -> str:
        """タスクを作成してtask_idを返す"""
        request_body = {
            "model": self.model,
            "task_type": "txt2img",
            "input": {
                "prompt": prompt,
                "width": width,
                "height": height,
            },
        }

        if negative_prompt:
            request_body["input"]["negative_prompt"] = negative_prompt

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{PIAPI_BASE_URL}/task",
                headers=self._get_headers(),
                json=request_body,
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        task_id = result.get("data", {}).get("task_id")
        if not task_id:
            raise ValueError("Flux APIからtask_idが返されませんでした")

        return task_id

    async def _check_status(self, task_id: str) -> tuple[str, str | None]:
        """タスクのステータスを確認"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{PIAPI_BASE_URL}/task/{task_id}",
                headers=self._get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        data = result.get("data", {})
        status = data.get("status", "Unknown")
        output = data.get("output", {})
        image_url = output.get("image_url") or (
            output.get("image_urls", [None])[0] if output.get("image_urls") else None
        )

        return status, image_url
```

**重要: 日本語プロンプトの翻訳**

Fluxは英語プロンプトが必須のため、サービス層で翻訳を行う（Step 4で実装）。
既存の`gemini_client.translate_to_english()`を使用。

---

### Step 3: Backend - 設定ファイル更新

**ファイル:** `movie-maker-api/app/core/config.py`

**変更内容:**
- Flux用のデフォルト設定を追加（既存のPIAPI_API_KEYを共用）

```python
# PiAPI Flux Settings
PIAPI_FLUX_MODEL: str = "Qubico/flux1-dev"  # or "Qubico/flux1-schnell"
```

---

### Step 4: Backend - サービス層更新

**ファイル:** `movie-maker-api/app/videos/service.py`

**変更内容:**
1. `generate_image_from_text` 関数にプロバイダー分岐を追加
2. `generate_scene_image` 関数にもプロバイダー分岐を追加
3. Flux用の翻訳・レスポンス整形処理を追加

```python
from app.videos.schemas import ASPECT_RATIO_TO_DIMENSIONS

async def generate_image_from_text(
    structured_input: dict | None = None,
    free_text_description: str | None = None,
    reference_image_url: str | None = None,
    aspect_ratio: str = "9:16",
    image_provider: str = "nanobanana"  # 追加
) -> dict:
    """
    画像生成（プロバイダー分岐対応）

    Returns:
        dict: {
            "image_url": str,
            "generated_prompt_ja": str,
            "generated_prompt_en": str
        }
    """
    # プロバイダー分岐
    if image_provider == "nanobanana":
        # 既存のGemini処理（変更なし）
        ...
    elif image_provider in ("flux_dev", "flux_schnell"):
        # === Flux処理 ===
        from app.external.piapi_flux_provider import FluxImageProvider
        from app.external.gemini_client import translate_to_english

        # 1. 入力テキストを決定
        if free_text_description:
            prompt_ja = free_text_description
        elif structured_input:
            # 構造化入力を簡易テキストに変換
            prompt_ja = _structured_input_to_text(structured_input)
        else:
            raise ValueError("プロンプトが指定されていません")

        # 2. 日本語→英語翻訳（Gemini使用）
        prompt_en = await translate_to_english(prompt_ja)

        # 3. アスペクト比→ピクセル変換
        width, height = ASPECT_RATIO_TO_DIMENSIONS.get(aspect_ratio, (768, 1365))

        # 4. Flux画像生成
        model = "Qubico/flux1-dev" if image_provider == "flux_dev" else "Qubico/flux1-schnell"
        provider = FluxImageProvider(model=model)
        image_url = await provider.generate_image(
            prompt=prompt_en,
            width=width,
            height=height,
        )

        # 5. R2にアップロード（Flux画像はPiAPIから直接URLが返るが、永続化のためR2にコピー）
        image_url = await _copy_image_to_r2(image_url)

        return {
            "image_url": image_url,
            "generated_prompt_ja": prompt_ja,
            "generated_prompt_en": prompt_en,
        }


def _structured_input_to_text(structured_input: dict) -> str:
    """構造化入力をシンプルなテキストに変換（Flux用）"""
    parts = []
    if structured_input.get("subject"):
        parts.append(structured_input["subject"])
    if structured_input.get("background"):
        parts.append(f"背景: {structured_input['background']}")
    if structured_input.get("lighting"):
        parts.append(f"照明: {structured_input['lighting']}")
    if structured_input.get("color_palette"):
        parts.append(f"カラー: {structured_input['color_palette']}")
    if structured_input.get("mood"):
        parts.append(f"ムード: {structured_input['mood']}")
    if structured_input.get("additional_notes"):
        parts.append(structured_input["additional_notes"])
    return "。".join(parts)


async def _copy_image_to_r2(source_url: str) -> str:
    """外部画像URLからR2にコピー"""
    import httpx
    from uuid import uuid4
    from app.external.r2 import upload_image

    async with httpx.AsyncClient() as client:
        response = await client.get(source_url, timeout=60.0)
        response.raise_for_status()
        image_data = response.content

    filename = f"generated/flux_{uuid4().hex}.png"
    return await upload_image(image_data, filename)
```

**注意:** `generate_scene_image` 関数にも同様の分岐を追加すること。

---

### Step 5: Backend - ルーター更新

**ファイル:** `movie-maker-api/app/videos/router.py`

**変更内容:**
1. `generate_image_from_text_endpoint` でプロバイダーをサービスに渡す
2. `generate_scene_image_endpoint` でもプロバイダーをサービスに渡す

```python
# /generate-image-from-text エンドポイント
@router.post("/generate-image-from-text", response_model=GenerateSceneImageResponse)
async def generate_image_from_text_endpoint(
    request: GenerateImageFromTextRequest,
    current_user: dict = Depends(get_current_user),
):
    result = await service.generate_image_from_text(
        structured_input=request.structured_input.model_dump() if request.structured_input else None,
        free_text_description=request.free_text_description,
        reference_image_url=request.reference_image_url,
        aspect_ratio=request.aspect_ratio.value,
        image_provider=request.image_provider.value,  # 追加
    )
    return result

# /generate-scene-image エンドポイント
@router.post("/generate-scene-image", response_model=GenerateSceneImageResponse)
async def generate_scene_image_endpoint(
    request: GenerateSceneImageRequest,
    current_user: dict = Depends(get_current_user),
):
    result = await service.generate_scene_image(
        description_ja=request.description_ja,
        dialogue=request.dialogue,
        aspect_ratio=request.aspect_ratio.value,
        image_provider=request.image_provider.value,  # 追加
    )
    return result
```

---

### Step 6: Frontend - 型定義更新

**ファイル:** `movie-maker/lib/constants/image-generation.ts`

**変更内容:**
1. `ImageProvider` 型を追加
2. プロバイダーごとの文字数制限・機能制限を追加
3. リクエスト型に `image_provider` を追加
4. ヘルパー関数を追加

```typescript
// 画像生成プロバイダー
export type ImageProvider = "nanobanana" | "flux_dev" | "flux_schnell";

// プロバイダー情報（機能制限を含む）
export const IMAGE_PROVIDERS = [
  {
    value: "nanobanana" as const,
    label: "Nano Banana (Gemini)",
    maxLength: 50000,
    description: "高品質・長文対応・参照画像対応",
    supportsStructuredInput: true,
    supportsReferenceImage: true,
  },
  {
    value: "flux_dev" as const,
    label: "Flux Dev",
    maxLength: 500,
    description: "高速・スタイル多様",
    supportsStructuredInput: false,  // テキスト入力のみ
    supportsReferenceImage: false,   // 参照画像非対応
  },
  {
    value: "flux_schnell" as const,
    label: "Flux Schnell",
    maxLength: 250,
    description: "最速・商用利用可",
    supportsStructuredInput: false,
    supportsReferenceImage: false,
  },
] as const;

// プロバイダー情報を取得するヘルパー
export function getProviderInfo(provider: ImageProvider) {
  return IMAGE_PROVIDERS.find((p) => p.value === provider) ?? IMAGE_PROVIDERS[0];
}

// プロバイダーが構造化入力をサポートするか
export function supportsStructuredInput(provider: ImageProvider): boolean {
  return getProviderInfo(provider).supportsStructuredInput;
}

// プロバイダーが参照画像をサポートするか
export function supportsReferenceImage(provider: ImageProvider): boolean {
  return getProviderInfo(provider).supportsReferenceImage;
}

// リクエスト型に追加
export interface GenerateImageFromTextRequest {
  structured_input?: StructuredImageInput | null;
  free_text_description?: string | null;
  reference_image_url?: string | null;
  aspect_ratio?: "9:16" | "16:9";
  image_provider?: ImageProvider;  // 追加
}
```

**ファイル:** `movie-maker/lib/api/client.ts`

**変更内容:**
- `GenerateSceneImageRequest`にも`image_provider`を追加

```typescript
export interface GenerateSceneImageRequest {
  description_ja?: string;
  dialogue?: string;
  aspect_ratio?: '9:16' | '16:9';
  image_provider?: ImageProvider;  // 追加
}
```

---

### Step 7: Frontend - ワンシーン生成ページ

**ファイル:** `movie-maker/app/generate/story/page.tsx`

**変更内容:**
1. プロバイダー選択State追加
2. プロバイダー選択UIコンポーネント追加
3. 動的な文字数制限
4. APIリクエストにプロバイダーを含める
5. **プロバイダー変更時の自動モード切り替え**
6. **参照画像アップロードの条件付き無効化**

```typescript
import {
  ImageProvider,
  IMAGE_PROVIDERS,
  getProviderInfo,
  supportsStructuredInput,
  supportsReferenceImage,
} from "@/lib/constants/image-generation";

// State追加
const [imageProvider, setImageProvider] = useState<ImageProvider>("nanobanana");

// プロバイダー変更時のハンドラ
const handleProviderChange = (provider: ImageProvider) => {
  setImageProvider(provider);

  // Flux選択時は強制的にテキスト入力モードに切り替え
  if (!supportsStructuredInput(provider)) {
    setImageInputMode("text");
  }

  // 参照画像非対応プロバイダーの場合はクリア
  if (!supportsReferenceImage(provider)) {
    setReferenceImageUrl(null);
  }
};

// 現在のプロバイダーの文字数制限を取得
const currentMaxLength = getProviderInfo(imageProvider).maxLength;

// フォーム/テキスト切り替えタブの条件付きレンダリング
{supportsStructuredInput(imageProvider) ? (
  // 通常: フォーム/テキスト切り替えタブを表示
  <div className="flex gap-2">
    <button onClick={() => setImageInputMode("form")}>フォーム入力</button>
    <button onClick={() => setImageInputMode("text")}>テキスト入力</button>
  </div>
) : (
  // Flux: テキスト入力のみ（メッセージ表示）
  <div className="text-sm text-amber-600">
    ⚠️ {getProviderInfo(imageProvider).label}はテキスト入力のみ対応しています
  </div>
)}

// 参照画像アップロードの条件付き無効化
{supportsReferenceImage(imageProvider) ? (
  <ReferenceImageUpload ... />
) : (
  <div className="opacity-50 cursor-not-allowed">
    <ReferenceImageUpload disabled />
    <span className="text-xs text-gray-500">このモデルは参照画像に対応していません</span>
  </div>
)}

// 文字数カウンターの動的表示
<span>{freeTextDescription.length}/{currentMaxLength.toLocaleString()}</span>
```

**UIデザイン:**
```
┌────────────────────────────────────────┐
│  画像生成モデル                          │
│  ┌──────────────────────────────────┐  │
│  │ ● Nano Banana (50,000文字)        │  │
│  │ ○ Flux Dev (500文字)              │  │
│  │ ○ Flux Schnell (250文字)          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [フォーム入力] [テキスト入力]            │
│  ※ Flux選択時はタブが消えてメッセージ表示 │
│                                        │
│  [参照画像アップロード]                   │
│  ※ Flux選択時はdisabled + メッセージ     │
└────────────────────────────────────────┘
```

---

### Step 8: Frontend - ストーリーボードページ

**ファイル:** `movie-maker/app/generate/storyboard/page.tsx`

**変更内容:**
- Step 7と同様のプロバイダー選択UIを追加

---

### Step 9: Frontend - シーン画像生成モーダル

**ファイル:** `movie-maker/components/video/scene-image-generator-modal.tsx`

**変更内容:**
1. プロバイダー選択propsを追加
2. モーダル内にプロバイダー選択UIを追加
3. APIリクエストにプロバイダーを含める

```typescript
interface SceneImageGeneratorModalProps {
  // ... 既存props ...
  imageProvider?: ImageProvider;
  onProviderChange?: (provider: ImageProvider) => void;
}
```

---

### Step 10: Frontend - concat ページ

**ファイル:** `movie-maker/app/concat/page.tsx`

**変更内容:**
- SceneImageGeneratorModal使用箇所でプロバイダー選択を有効化

---

### Step 11: Frontend - 共通コンポーネント作成（推奨）

**ファイル:** `movie-maker/components/ui/image-provider-selector.tsx` (新規作成)

**理由:** 複数箇所で同じUIを使用するため、共通コンポーネント化して一貫性を保つ

```typescript
"use client";

import { ImageProvider, IMAGE_PROVIDERS } from "@/lib/constants/image-generation";
import { cn } from "@/lib/utils";

interface ImageProviderSelectorProps {
  value: ImageProvider;
  onChange: (provider: ImageProvider) => void;
  disabled?: boolean;
  className?: string;
}

export function ImageProviderSelector({
  value,
  onChange,
  disabled,
  className,
}: ImageProviderSelectorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium">画像生成モデル</label>
      <div className="space-y-1">
        {IMAGE_PROVIDERS.map((provider) => (
          <label
            key={provider.value}
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg border cursor-pointer",
              value === provider.value && "border-blue-500 bg-blue-50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <input
              type="radio"
              name="imageProvider"
              value={provider.value}
              checked={value === provider.value}
              onChange={() => onChange(provider.value)}
              disabled={disabled}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="font-medium">{provider.label}</div>
              <div className="text-xs text-gray-500">
                {provider.description} • 最大{provider.maxLength.toLocaleString()}文字
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
```

---

## テスト計画

### Backend テスト

**ファイル:** `movie-maker-api/tests/videos/test_text_to_image.py`

```python
# 追加テストケース
async def test_generate_image_with_flux_dev():
    """Flux Devでの画像生成テスト"""
    pass

async def test_generate_image_with_flux_schnell():
    """Flux Schnellでの画像生成テスト"""
    pass

async def test_flux_prompt_length_validation():
    """Fluxのプロンプト長制限テスト"""
    pass
```

---

## 実装順序チェックリスト

- [ ] Step 1: Backend - schemas.py (ImageProvider enum追加)
- [ ] Step 2: Backend - piapi_flux_provider.py (新規作成)
- [ ] Step 3: Backend - config.py (設定追加)
- [ ] Step 4: Backend - service.py (分岐追加)
- [ ] Step 5: Backend - router.py (パラメータ受け渡し)
- [ ] Step 6: Frontend - image-generation.ts (型定義)
- [ ] Step 11: Frontend - image-provider-selector.tsx (共通コンポーネント)
- [ ] Step 7: Frontend - story/page.tsx (UI追加)
- [ ] Step 8: Frontend - storyboard/page.tsx (UI追加)
- [ ] Step 9: Frontend - scene-image-generator-modal.tsx (UI追加)
- [ ] Step 10: Frontend - concat/page.tsx (連携)
- [ ] テスト実行

---

## 注意事項

### Flux使用時の制限

1. **構造化フォーム非対応**: Fluxは短文プロンプトのため、構造化フォームではなくテキスト入力のみ対応
2. **参照画像非対応**: Flux Text-to-Imageは参照画像機能なし（別途Image-to-Image APIが必要）
3. **日本語効率**: Fluxは日本語に最適化されていないため、英語プロンプトの方が効率的

### APIキー共用

- PiAPI Flux と PiAPI Kling は同じ `PIAPI_API_KEY` を使用
- 追加の環境変数設定は不要

### 価格

| モデル | 価格 |
|--------|------|
| Flux Schnell | $0.0015/画像 |
| Flux Dev | $0.02/画像 |
| Nano Banana | Gemini API料金に準拠 |

---

## 画像生成関連UI設置箇所一覧

| ファイル | 用途 | プロバイダー選択 |
|----------|------|-----------------|
| `app/generate/story/page.tsx` | ワンシーン生成 | 必須 |
| `app/generate/storyboard/page.tsx` | ストーリーボード | 必須 |
| `components/video/scene-image-generator-modal.tsx` | シーン画像生成モーダル | 必須 |
| `app/concat/page.tsx` | 動画結合ページ | モーダル経由 |
| `components/ui/structured-image-form.tsx` | 構造化フォーム | 親から制御 |

---

## 完了条件

1. 全てのUI箇所でプロバイダー選択が可能
2. 選択したプロバイダーに応じて文字数制限が動的に変化
3. Flux選択時は構造化フォームがdisabledになりテキスト入力モードに切り替わる
4. Flux選択時は参照画像アップロードがdisabledになる
5. 各プロバイダーで画像生成が正常に動作
6. テストが全てパス

---

## レビューで発見された問題点と解決策

### 問題1: 2つの画像生成APIエンドポイントの存在

**問題:** 計画書では`/generate-image-from-text`のみに言及していたが、`/generate-scene-image`も存在し、`SceneImageGeneratorModal`がこちらを使用している。

**解決策:** 両方のスキーマ（`GenerateImageFromTextRequest`, `GenerateSceneImageRequest`）に`image_provider`フィールドを追加。

---

### 問題2: 静的な文字数制限（max_length=50000固定）

**問題:** Pydanticの`max_length`は静的値のため、Flux選択時も50,000文字が許可されてしまう。

**解決策:** `model_validator`でプロバイダーに応じた動的バリデーションを実装。

```python
if len(self.free_text_description) > IMAGE_PROVIDER_LIMITS[self.image_provider]:
    raise ValueError(f"文字数制限を超えています")
```

---

### 問題3: Fluxのプロンプト翻訳

**問題:** Fluxは英語プロンプトが必須だが、計画書に翻訳処理の記載がなかった。

**解決策:** 既存の`gemini_client.translate_to_english()`を使用してサービス層で翻訳。

---

### 問題4: アスペクト比からピクセル値への変換

**問題:** Nano Bananaは`aspect_ratio: "9:16"`を使用するが、Fluxは`width`, `height`のピクセル値を要求する。

**解決策:** 変換マッピング定数を追加。

```python
ASPECT_RATIO_TO_DIMENSIONS = {
    "9:16": (768, 1365),
    "16:9": (1365, 768),
}
```

---

### 問題5: Flux + 参照画像の組み合わせ

**問題:** Flux Text-to-Imageは参照画像をサポートしないが、エラーハンドリングがなかった。

**解決策:**
1. バックエンド: `model_validator`でエラーを返す
2. フロントエンド: 参照画像アップロードをdisabledにし、メッセージを表示

---

### 問題6: レスポンス形式の一貫性

**問題:** Nano Bananaは`prompt_ja`, `prompt_en`を生成するが、Fluxは画像URLのみ返す。

**解決策:** Fluxの場合は:
- `prompt_ja`: ユーザーの元の入力
- `prompt_en`: 翻訳後のプロンプト

を返すことでレスポンス形式を統一。

---

### 問題7: 画像の永続化

**問題:** Flux APIは一時的なURLを返す可能性がある。

**解決策:** `_copy_image_to_r2()`関数でFlux画像をR2にコピーして永続化。
