# アドクリエイター カット画像生成機能 実装計画書

## 概要

アドクリエイターのコンテモード（カット割編集画面）において、各カットの「脚本（description_ja）」を元に、動画の元となる画像をAIで生成する機能を追加する。

### 目的
- ユーザーが画像素材を持っていなくても、脚本からAIで画像を生成できる
- 生成した画像を確認・再生成した後、動画生成に進める2ステップ方式

### 主な機能
- 脚本（+ セリフがあれば補助的に使用）から画像生成用プロンプトを自動生成
- Gemini 3 Pro による画像生成
- 生成画像のプレビュー・再生成
- 確認後、既存の動画生成フローへシームレスに接続

---

## ⚠️ 既知の制約事項（実装前に確認必須）

### 1. `dialogue`（セリフ）フィールドの現状

**現在の `generate_ad_script` 関数は `dialogue` を生成していません。**

```python
# 現在の出力フィールド
{
    "cut_number": int,
    "scene_type": str,
    "scene_type_label": str,
    "description_ja": str,  # ← これがメインの情報源
    "description_en": str,
    "duration": int
    # dialogue は含まれない！
}
```

**対策:**
- 画像生成は **`description_ja`（脚本）をメイン**で使用
- `dialogue` は「ユーザーが手動で追加した場合」のみ補助的に使用
- 将来的に `generate_ad_script` を拡張して `dialogue` 生成を追加可能

### 2. フロントエンドとバックエンドの型定義の差異

| フィールド | フロントエンド (`client.ts`) | バックエンド (`schemas.py`) |
|-----------|------------------------------|----------------------------|
| dialogue | `dialogue?: string` (定義あり) | AdCutResponse に**なし** |
| sound_effect | `sound_effect?: string` (定義あり) | AdCutResponse に**なし** |

**影響:** フロントエンドで `cut.dialogue` は常に `undefined` になる可能性が高い

---

## ユーザーフロー

```
[カット編集画面]
    │
    ├── [📁 既存から選択] → 既存の動画選択モーダル
    │
    └── [✨ 新規] クリック
            ↓
        ┌─────────────────────────────┐
        │  画像生成モーダル（新規）     │
        │                             │
        │  セリフと脚本を確認          │
        │         ↓                   │
        │  [🎨 画像を生成]             │
        │         ↓                   │
        │  生成中ローディング          │
        │         ↓                   │
        │  生成画像プレビュー          │
        │         ↓                   │
        │  [🔄 再生成] or [✅ 決定]    │
        └─────────────────────────────┘
                    │
                    ↓ [✅ 決定]
        ┌─────────────────────────────┐
        │  SceneGeneratorModal        │
        │  （既存・Step 2から開始）    │
        │                             │
        │  画像: 自動セット済み        │
        │  プロンプト: 自動入力済み    │
        │         ↓                   │
        │  プロンプト確認・編集        │
        │         ↓                   │
        │  [🎬 動画を生成]             │
        └─────────────────────────────┘
                    │
                    ↓
        カットに動画が割り当てられる
```

---

## 画面設計

### 1. 画像生成モーダル（新規作成）

#### 初期状態（生成前）
```
┌─────────────────────────────────────────────────────────┐
│                                              [×]        │
│           🎨 シーン画像を生成                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  カット 3: 解決策                                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📝 脚本                                          │   │
│  │ 新発売プロテインバーが登場、手に取る              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 💬 セリフ                                        │   │
│  │ 「これなら忙しい朝でも栄養補給できる！」          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  アスペクト比: 9:16（縦長）                             │
│                                                         │
│           [🎨 画像を生成]                               │
│                                                         │
│                    [キャンセル]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 生成中
```
┌─────────────────────────────────────────────────────────┐
│                                              [×]        │
│           🎨 シーン画像を生成                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ⏳                                   │
│                                                         │
│              画像を生成中...                            │
│                                                         │
│           ┌──────────────────────┐                     │
│           │ ████████░░░░░░░░░░░░ │                     │
│           └──────────────────────┘                     │
│                                                         │
│         AIがセリフと脚本から                            │
│         最適な画像を生成しています                      │
│                                                         │
│              約10〜20秒かかります                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 生成完了
```
┌─────────────────────────────────────────────────────────┐
│                                              [×]        │
│           🎨 シーン画像を生成                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────┐                         │
│  │                           │                         │
│  │                           │                         │
│  │      [生成された画像]      │  ← 9:16 プレビュー     │
│  │                           │                         │
│  │                           │                         │
│  │                           │                         │
│  └───────────────────────────┘                         │
│                                                         │
│  生成プロンプト:                                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ A woman holding a protein bar in her hand,      │   │
│  │ looking at it with a bright smile...            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│     [🔄 再生成]              [✅ この画像で動画を生成]  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## API設計

### 新規エンドポイント

#### POST `/api/v1/videos/generate-scene-image`

セリフと脚本からシーン画像を生成する。

**Request:**
```json
{
  "dialogue": "「これなら忙しい朝でも栄養補給できる！」",
  "description_ja": "新発売プロテインバーが登場、手に取る",
  "aspect_ratio": "9:16"
}
```

**Response:**
```json
{
  "image_url": "https://pub-xxx.r2.dev/generated/scene_abc123.png",
  "generated_prompt_ja": "プロテインバーを手に持ち、明るい笑顔で見つめる女性",
  "generated_prompt_en": "A woman holding a protein bar in her hand, looking at it with a bright smile, soft natural lighting, vertical composition"
}
```

**処理フロー:**
1. セリフ + 脚本から画像生成用プロンプトを生成（Gemini）
2. プロンプトで画像生成（Gemini 3 Pro）
3. 生成画像を R2 にアップロード
4. URL と生成プロンプトを返却

**エラーレスポンス:**
```json
{
  "detail": "画像生成に失敗しました。もう一度お試しください。"
}
```

---

## データ構造

### フロントエンド状態

```typescript
// 画像生成モーダルの状態
interface ImageGenerationModalState {
  isOpen: boolean;
  cutId: string | null;
  cut: EditableCut | null;

  // 生成状態
  isGenerating: boolean;
  generatedImageUrl: string | null;
  generatedPromptJa: string | null;
  generatedPromptEn: string | null;
  error: string | null;
}

// APIレスポンス型
interface GenerateSceneImageResponse {
  image_url: string;
  generated_prompt_ja: string;
  generated_prompt_en: string;
}
```

### バックエンドスキーマ

```python
# app/videos/schemas.py に追加

from pydantic import model_validator
from typing import Self

class GenerateSceneImageRequest(BaseModel):
    """シーン画像生成リクエスト"""
    dialogue: str | None = Field(
        default=None,
        description="カットのセリフ（オプション、あれば補助的に使用）"
    )
    description_ja: str | None = Field(
        default=None,
        description="カットの脚本（日本語）"
    )
    aspect_ratio: Literal["9:16", "16:9"] = Field(default="9:16")

    @model_validator(mode='after')
    def validate_at_least_one_input(self) -> Self:
        """dialogue または description_ja のどちらかは必須"""
        if not self.dialogue and not self.description_ja:
            raise ValueError("dialogue または description_ja のどちらかを入力してください")
        return self


class GenerateSceneImageResponse(BaseModel):
    """シーン画像生成レスポンス"""
    image_url: str = Field(..., description="生成された画像のURL")
    generated_prompt_ja: str = Field(..., description="生成に使用した日本語プロンプト")
    generated_prompt_en: str = Field(..., description="生成に使用した英語プロンプト")
```

**バリデーションポイント:**
- `dialogue` と `description_ja` の両方が空の場合は 422 エラー
- 片方だけでも入力があれば生成可能

---

## バックエンド実装

### 1. Gemini クライアント拡張

```python
# app/external/gemini_client.py に追加

async def generate_image_prompt_from_scene(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16"
) -> tuple[str, str]:
    """
    脚本（とオプションでセリフ）から画像生成用プロンプトを生成

    Args:
        description_ja: カットの脚本（日本語）- メインの情報源
        dialogue: カットのセリフ（オプション）- 補助的に使用
        aspect_ratio: アスペクト比

    Returns:
        tuple[str, str]: (日本語プロンプト, 英語プロンプト)
    """
    client = get_gemini_client()

    # 入力テキストの構築（脚本がメイン、セリフは補助）
    input_parts = []
    if description_ja:
        input_parts.append(f"脚本: {description_ja}")
    if dialogue:
        input_parts.append(f"セリフ: {dialogue}")

    input_text = "\n".join(input_parts) if input_parts else "（入力なし）"

    system_prompt = """
あなたは広告クリエイティブディレクターです。
CM用のシーン画像を生成するためのプロンプトを作成してください。

入力:
- 脚本: シーンの状況説明（メイン）
- セリフ: キャラクターが話す台詞（あれば参考に）

出力:
1. 日本語プロンプト: シーンの視覚的な説明（1-2文）
2. 英語プロンプト: 画像生成AI向けの詳細なプロンプト

英語プロンプトのルール:
- 構図、照明、雰囲気を含める
- 人物の表情やポーズを具体的に
- 縦長(9:16)または横長(16:9)の構図を意識
- ネガティブな表現は避ける
- 50-100語程度
- 静止画として成立する瞬間を描写
"""

    user_prompt = f"""
{input_text}
アスペクト比: {aspect_ratio}

上記から画像生成用のプロンプトを生成してください。
JSON形式で出力: {{"prompt_ja": "...", "prompt_en": "..."}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
            )
        )

        result_text = response.text.strip()
        # ```json ... ``` を除去
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            result_text = "\n".join(lines[1:-1])

        result = json.loads(result_text)
        return result["prompt_ja"], result["prompt_en"]

    except Exception as e:
        logger.exception(f"Failed to generate image prompt: {e}")
        # フォールバック: 入力をそのまま使用
        fallback_ja = description_ja or dialogue or "シーン画像"
        fallback_en = f"A scene depicting: {fallback_ja}, professional photography, high quality"
        return fallback_ja, fallback_en
```

### 2. 画像生成サービス

```python
# app/videos/service.py に追加

import uuid
import io
import logging

logger = logging.getLogger(__name__)


async def generate_scene_image(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16"
) -> dict:
    """
    脚本（とオプションでセリフ）からシーン画像を生成

    Args:
        description_ja: カットの脚本（日本語）- メイン
        dialogue: カットのセリフ（オプション）- 補助
        aspect_ratio: アスペクト比

    Returns:
        dict: {
            "image_url": str,
            "generated_prompt_ja": str,
            "generated_prompt_en": str
        }

    Raises:
        ValueError: 画像生成に失敗した場合
    """
    from app.external.gemini_client import (
        generate_image_prompt_from_scene,
        generate_image
    )
    from app.external.r2 import upload_image

    # 1. プロンプト生成
    logger.info(f"Generating image prompt from: description_ja={description_ja}, dialogue={dialogue}")
    prompt_ja, prompt_en = await generate_image_prompt_from_scene(
        description_ja=description_ja,
        dialogue=dialogue,
        aspect_ratio=aspect_ratio
    )
    logger.info(f"Generated prompt: {prompt_en[:100]}...")

    # 2. 画像生成（Gemini 3 Pro）
    logger.info("Starting image generation with Gemini 3 Pro...")
    image = await generate_image(prompt_en)
    if image is None:
        logger.error("Image generation returned None")
        raise ValueError("画像生成に失敗しました。プロンプトを変更して再試行してください。")

    # 3. R2にアップロード
    # 注意: upload_image は (file_content: bytes, filename: str) の2引数
    # Content-Type はファイル名の拡張子から自動推測される
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)

    filename = f"generated/scene_{uuid.uuid4().hex}.png"  # .png で終わること
    logger.info(f"Uploading generated image to R2: {filename}")
    image_url = await upload_image(buffer.read(), filename)

    logger.info(f"Scene image generated successfully: {image_url}")
    return {
        "image_url": image_url,
        "generated_prompt_ja": prompt_ja,
        "generated_prompt_en": prompt_en,
    }
```

**注意点:**
- `upload_image` 関数は `(file_content: bytes, filename: str)` の2引数
- Content-Type は自動推測（`.png` → `image/png`）
- 画像生成失敗時は `ValueError` を投げる

### 3. ルーター追加

```python
# app/videos/router.py に追加

from app.videos.schemas import GenerateSceneImageRequest, GenerateSceneImageResponse


@router.post("/generate-scene-image", response_model=GenerateSceneImageResponse)
async def generate_scene_image_endpoint(
    request: GenerateSceneImageRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    脚本（とオプションでセリフ）からシーン画像を生成

    - description_ja（脚本）をメインの情報源として使用
    - dialogue（セリフ）があれば補助的に参照
    - 両方空の場合は 422 Validation Error
    """
    try:
        result = await service.generate_scene_image(
            description_ja=request.description_ja,
            dialogue=request.dialogue,
            aspect_ratio=request.aspect_ratio,
        )
        return GenerateSceneImageResponse(**result)

    except ValueError as e:
        # 画像生成失敗（Gemini API エラー等）
        logger.warning(f"Scene image generation failed (ValueError): {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        # 予期しないエラー
        logger.exception(f"Scene image generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="画像生成に失敗しました。もう一度お試しください。"
        )
```

**エラーハンドリング:**
- `ValueError`: 画像生成失敗 → 422
- その他: 予期しないエラー → 500

---

## フロントエンド実装

### 1. APIクライアント追加

```typescript
// lib/api/client.ts に追加

export interface GenerateSceneImageRequest {
  dialogue: string;
  description_ja: string;
  aspect_ratio: "9:16" | "16:9";
}

export interface GenerateSceneImageResponse {
  image_url: string;
  generated_prompt_ja: string;
  generated_prompt_en: string;
}

export const videosApi = {
  // ... 既存メソッド ...

  // シーン画像生成
  generateSceneImage: (data: GenerateSceneImageRequest): Promise<GenerateSceneImageResponse> =>
    fetchWithAuth("/api/v1/videos/generate-scene-image", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
```

### 2. 画像生成モーダルコンポーネント（新規）

```typescript
// components/video/scene-image-generator-modal.tsx

"use client";

import { useState, useCallback } from "react";
import { videosApi, GenerateSceneImageResponse } from "@/lib/api/client";
import { EditableCut } from "./ad-cut-card";
import { AspectRatio } from "@/lib/types/video";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X, Loader2, Sparkles, RefreshCw, Check } from "lucide-react";

interface SceneImageGeneratorModalProps {
  isOpen: boolean;
  cut: EditableCut | null;
  aspectRatio: AspectRatio;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, promptEn: string) => void;
}

export function SceneImageGeneratorModal({
  isOpen,
  cut,
  aspectRatio,
  onClose,
  onImageGenerated,
}: SceneImageGeneratorModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<GenerateSceneImageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!cut) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await videosApi.generateSceneImage({
        dialogue: cut.dialogue || "",
        description_ja: cut.description_ja,
        aspect_ratio: aspectRatio as "9:16" | "16:9",
      });
      setGeneratedData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  }, [cut, aspectRatio]);

  const handleConfirm = useCallback(() => {
    if (!generatedData) return;
    onImageGenerated(generatedData.image_url, generatedData.generated_prompt_en);
  }, [generatedData, onImageGenerated]);

  const handleRegenerate = useCallback(() => {
    setGeneratedData(null);
    handleGenerate();
  }, [handleGenerate]);

  const handleClose = useCallback(() => {
    setGeneratedData(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen || !cut) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-lg bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-white">
            🎨 シーン画像を生成
          </h2>
          <button onClick={handleClose} className="p-2 text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* カット情報 */}
          <div className="text-sm text-zinc-400">
            カット {cut.cut_number}: {cut.scene_type_label}
          </div>

          {/* 脚本 */}
          <div className="p-3 rounded-lg bg-zinc-800">
            <div className="text-xs text-zinc-500 mb-1">📝 脚本</div>
            <div className="text-sm text-white">{cut.description_ja || "（未入力）"}</div>
          </div>

          {/* セリフ */}
          <div className="p-3 rounded-lg bg-zinc-800">
            <div className="text-xs text-zinc-500 mb-1">💬 セリフ</div>
            <div className="text-sm text-white">{cut.dialogue || "（未入力）"}</div>
          </div>

          {/* 生成前 */}
          {!isGenerating && !generatedData && (
            <div className="pt-4">
              <Button
                onClick={handleGenerate}
                disabled={!cut.description_ja && !cut.dialogue}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                画像を生成
              </Button>
              {!cut.description_ja && !cut.dialogue && (
                <p className="mt-2 text-xs text-amber-500 text-center">
                  脚本またはセリフを入力してください
                </p>
              )}
            </div>
          )}

          {/* 生成中 */}
          {isGenerating && (
            <div className="py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
              <p className="mt-4 text-sm text-zinc-400">画像を生成中...</p>
              <p className="mt-1 text-xs text-zinc-500">約10〜20秒かかります</p>
            </div>
          )}

          {/* 生成完了 */}
          {generatedData && (
            <div className="space-y-4">
              {/* 画像プレビュー */}
              <div className="flex justify-center">
                <div
                  className={cn(
                    "overflow-hidden rounded-lg border border-zinc-700",
                    aspectRatio === "9:16" ? "w-40 aspect-[9/16]" : "w-64 aspect-[16/9]"
                  )}
                >
                  <img
                    src={generatedData.image_url}
                    alt="Generated scene"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* 生成プロンプト */}
              <div className="p-3 rounded-lg bg-zinc-800 text-xs">
                <div className="text-zinc-500 mb-1">生成プロンプト:</div>
                <div className="text-zinc-300">{generatedData.generated_prompt_ja}</div>
              </div>

              {/* ボタン */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleRegenerate} className="flex-1">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  再生成
                </Button>
                <Button onClick={handleConfirm} className="flex-1 bg-blue-500 hover:bg-blue-600">
                  <Check className="mr-2 h-4 w-4" />
                  この画像で動画を生成
                </Button>
              </div>
            </div>
          )}

          {/* エラー */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-700">
          <Button variant="ghost" onClick={handleClose} className="w-full">
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### 3. concat/page.tsx の修正

```typescript
// app/concat/page.tsx に追加・修正

// 新しいstate追加
const [isImageGeneratorOpen, setIsImageGeneratorOpen] = useState(false);
const [imageGeneratorCut, setImageGeneratorCut] = useState<EditableCut | null>(null);
const [preGeneratedImageUrl, setPreGeneratedImageUrl] = useState<string | null>(null);
const [preGeneratedPromptEn, setPreGeneratedPromptEn] = useState<string | null>(null);

// handleGenerateVideoForCut を修正
const handleGenerateVideoForCut = useCallback((cutId: string, descriptionEn: string) => {
  const cut = storyboardCuts.find((c) => c.id === cutId);
  if (!cut) return;

  setCurrentAdCutId(cutId);
  setImageGeneratorCut(cut);
  setIsImageGeneratorOpen(true);
}, [storyboardCuts]);

// 画像生成完了ハンドラ追加
const handleImageGenerated = useCallback((imageUrl: string, promptEn: string) => {
  setPreGeneratedImageUrl(imageUrl);
  setPreGeneratedPromptEn(promptEn);
  setIsImageGeneratorOpen(false);
  setIsSceneGeneratorOpen(true);
}, []);

// JSXに追加
<SceneImageGeneratorModal
  isOpen={isImageGeneratorOpen}
  cut={imageGeneratorCut}
  aspectRatio={selectedAspectRatio!}
  onClose={() => {
    setIsImageGeneratorOpen(false);
    setImageGeneratorCut(null);
  }}
  onImageGenerated={handleImageGenerated}
/>

// SceneGeneratorModal に初期値を渡す（既存コンポーネントの拡張が必要）
<SceneGeneratorModal
  isOpen={isSceneGeneratorOpen}
  onClose={() => {
    setIsSceneGeneratorOpen(false);
    setPreGeneratedImageUrl(null);
    setPreGeneratedPromptEn(null);
  }}
  aspectRatio={selectedAspectRatio!}
  onVideoGenerated={handleVideoGenerated}
  // 新規props
  initialImageUrl={preGeneratedImageUrl}
  initialPromptEn={preGeneratedPromptEn}
/>
```

### 4. SceneGeneratorModal の拡張

```typescript
// scene-generator-modal.tsx に追加

interface SceneGeneratorModalProps {
  // ... 既存props ...
  initialImageUrl?: string | null;    // 追加
  initialPromptEn?: string | null;    // 追加
}

// useEffect で初期値を設定
useEffect(() => {
  if (initialImageUrl) {
    setImageUrl(initialImageUrl);
    setImagePreview(initialImageUrl);
    // Step 2 から開始
    setModalStep(2);
  }
  if (initialPromptEn) {
    setEnglishPrompt(initialPromptEn);
  }
}, [initialImageUrl, initialPromptEn]);
```

---

## ファイル構成

### 変更対象
| ファイル | 変更内容 |
|---------|---------|
| `movie-maker-api/app/videos/router.py` | 新規エンドポイント追加 |
| `movie-maker-api/app/videos/schemas.py` | リクエスト/レスポンススキーマ追加 |
| `movie-maker-api/app/videos/service.py` | 画像生成サービス追加 |
| `movie-maker-api/app/external/gemini_client.py` | プロンプト生成関数追加 |
| `movie-maker/lib/api/client.ts` | APIクライアント追加 |
| `movie-maker/app/concat/page.tsx` | 状態管理・ハンドラ追加 |
| `movie-maker/components/video/scene-generator-modal.tsx` | 初期値対応 |

### 新規作成
| ファイル | 内容 |
|---------|------|
| `movie-maker/components/video/scene-image-generator-modal.tsx` | 画像生成モーダル |

---

## 実装ステップ

### Step 1: バックエンドAPI（2時間）
1. `schemas.py` にスキーマ追加
2. `gemini_client.py` にプロンプト生成関数追加
3. `service.py` に画像生成サービス追加
4. `router.py` にエンドポイント追加
5. 動作確認

### Step 2: フロントエンド - APIクライアント（30分）
1. `client.ts` に型定義追加
2. `generateSceneImage` メソッド追加

### Step 3: フロントエンド - モーダル（2-3時間）
1. `scene-image-generator-modal.tsx` 新規作成
2. 状態管理（生成前/生成中/生成完了/エラー）
3. UI実装

### Step 4: フロントエンド - 統合（1-2時間）
1. `concat/page.tsx` に状態追加
2. `handleGenerateVideoForCut` 修正
3. 画像生成モーダル組み込み
4. `SceneGeneratorModal` に初期値対応追加

### Step 5: テスト（1時間）
1. バックエンドAPI単体テスト
2. フロントエンド手動テスト
3. E2E動作確認

---

## テスト計画

### バックエンドテスト

```python
# tests/videos/test_scene_image.py

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_generate_scene_image_with_description_only(client: AsyncClient, auth_headers: dict):
    """正常系: 脚本のみで画像生成成功"""
    response = await client.post(
        "/api/v1/videos/generate-scene-image",
        json={
            "description_ja": "女性が鏡の前で決意を固める",
            "aspect_ratio": "9:16"
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "image_url" in data
    assert data["image_url"].startswith("https://")
    assert "generated_prompt_ja" in data
    assert "generated_prompt_en" in data


@pytest.mark.asyncio
async def test_generate_scene_image_with_both_inputs(client: AsyncClient, auth_headers: dict):
    """正常系: 脚本 + セリフで画像生成成功"""
    response = await client.post(
        "/api/v1/videos/generate-scene-image",
        json={
            "dialogue": "「今日から新しい私になる！」",
            "description_ja": "女性が鏡の前で決意を固める",
            "aspect_ratio": "9:16"
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "image_url" in data


@pytest.mark.asyncio
async def test_generate_scene_image_with_dialogue_only(client: AsyncClient, auth_headers: dict):
    """正常系: セリフのみで画像生成成功"""
    response = await client.post(
        "/api/v1/videos/generate-scene-image",
        json={
            "dialogue": "「これなら忙しい朝でも栄養補給できる！」",
            "aspect_ratio": "16:9"
        },
        headers=auth_headers,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_generate_scene_image_empty_input_fails(client: AsyncClient, auth_headers: dict):
    """異常系: 両方空の場合は 422 エラー"""
    response = await client.post(
        "/api/v1/videos/generate-scene-image",
        json={
            "dialogue": "",
            "description_ja": "",
            "aspect_ratio": "9:16"
        },
        headers=auth_headers,
    )
    assert response.status_code == 422
    data = response.json()
    assert "dialogue または description_ja" in data["detail"][0]["msg"]


@pytest.mark.asyncio
async def test_generate_scene_image_null_input_fails(client: AsyncClient, auth_headers: dict):
    """異常系: 両方 null の場合は 422 エラー"""
    response = await client.post(
        "/api/v1/videos/generate-scene-image",
        json={
            "aspect_ratio": "9:16"
        },
        headers=auth_headers,
    )
    assert response.status_code == 422
```

### フロントエンド手動テスト

- [ ] 「新規」ボタンクリックで画像生成モーダルが開く
- [ ] 脚本・セリフが正しく表示される
- [ ] 「画像を生成」ボタンでローディング表示
- [ ] 生成完了後に画像がプレビュー表示される
- [ ] 「再生成」で新しい画像が生成される
- [ ] 「この画像で動画を生成」でSceneGeneratorModalが開く
- [ ] SceneGeneratorModalに画像が自動セットされている
- [ ] 動画生成が正常に完了する
- [ ] カットに動画が割り当てられる

---

## 注意事項

### 1. セリフ・脚本が空の場合
- どちらも空の場合は生成ボタンを無効化
- 片方だけの場合は生成可能（警告表示）

### 2. 画像生成の品質
- Gemini 3 Pro の画像生成は比較的新しい機能
- 品質が安定しない場合は再生成を促す

### 3. アスペクト比
- 9:16（縦長）と16:9（横長）のみ対応
- 1:1 はカット割モードで選択不可のため考慮不要

### 4. 既存動画選択との使い分け
- 「既存から選択」: 過去に生成した動画を再利用
- 「新規」: セリフ/脚本から画像→動画を新規生成

### 5. エラー時のリカバリ
- 画像生成失敗時は再試行ボタンを表示
- 動画生成失敗時は画像選択からやり直し可能

---

## 実装前チェックリスト

実装開始前に以下を確認してください：

### バックエンド確認事項

- [ ] `generate_image` 関数（gemini_client.py）が正常に動作することを確認
  - Gemini 3 Pro のAPI制限・レート制限を確認
  - 画像生成に必要な環境変数が設定されているか

- [ ] `upload_image` 関数（r2.py）のシグネチャ確認
  - 実際: `async def upload_image(file_content: bytes, filename: str) -> str`
  - Content-Type は第3引数ではなくファイル名から自動推測

- [ ] Gemini API の `response_mime_type="application/json"` が使用可能か確認
  - 使用不可の場合は手動でJSONパースが必要

### フロントエンド確認事項

- [ ] `SceneGeneratorModal` の現在の実装を確認
  - `initialImageUrl`, `initialPromptEn` の props が存在するか
  - 存在しない場合は追加が必要

- [ ] `EditableCut` 型に `dialogue` フィールドがあるか確認
  - `AdCut` を継承しているはずだが実装を確認

- [ ] `AspectRatio` 型のインポートパスを確認

### 潜在的なエラー原因

| 問題 | 原因 | 対策 |
|------|------|------|
| 画像生成がNullを返す | Gemini API エラー、レート制限 | エラーハンドリング、リトライロジック |
| プロンプト生成でJSON解析エラー | Geminiが不正なJSONを返す | try-catch + フォールバック実装済み |
| R2アップロード失敗 | 認証エラー、バケット設定 | 環境変数確認 |
| フロントエンドで型エラー | dialogue が undefined | オプショナルチェイニング使用 |

---

## 将来の拡張（今回は実装しない）

### 1. 画像スタイル選択
- フォトリアル / イラスト / アニメ調などのスタイル選択

### 2. 参考画像アップロード
- 雰囲気を伝える参考画像をアップロードして類似画像を生成

### 3. 一括画像生成
- 全カットの画像を一括で生成

### 4. 画像編集機能
- 生成後の画像を部分的に編集（インペインティング）
