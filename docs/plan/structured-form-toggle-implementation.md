# 画像詳細入力フォーム/テキストエリア切り替え機能 実装計画書

## 概要

ワンシーン生成画面の「画像の詳細を入力（オプション）」セクションで、構造化フォームとフリーテキストエリアを切り替えできる機能を実装する。

## 現状分析

### フロントエンド
- **コンポーネント**: `components/ui/structured-image-form.tsx`
  - 7つのフィールド: 被写体, 位置, 背景, 照明, カラーパレット, ムード, 追加指示
- **使用箇所**: `app/generate/storyboard/page.tsx`
  - `structuredInput` state で管理
  - `hasStructuredInputData()` でバリデーション（`subject`が空でないかチェック）
- **型定義**: `lib/constants/image-generation.ts`
  - `StructuredImageInput` interface
  - `GenerateImageFromTextRequest` interface（APIクライアントで使用）
- **APIクライアント**: `lib/api/client.ts`
  - `textToImageApi.generate()` が `GenerateImageFromTextRequest` 型を使用

### バックエンド
- **API**: `POST /api/v1/videos/generate-image-from-text`
- **ルーター**: `app/videos/router.py` (line 3910)
  - `request.structured_input.model_dump()` を直接 service に渡している
- **スキーマ**: `app/videos/schemas.py`
  - `GenerateImageFromTextRequest.structured_input` (現在は必須フィールド)
  - `StructuredImageInput.subject` (必須、空文字列不可)
- **サービス**: `app/videos/service.py`
  - `generate_image_from_text(structured_input: dict, ...)`
  - 構造化入力を英語に翻訳 → プロンプト生成 → 画像生成
- **Geminiクライアント**: `app/external/gemini_client.py`
  - `generate_image_prompt_from_scene()` - メインエントリーポイント
  - `_generate_prompt_from_structured_input()` - 構造化入力用
  - `_generate_prompt_from_description()` - テキスト入力用（既存、`description_ja`と`dialogue`を受け取る）

## 実装難易度

**低〜中（45-75分）**

- フロントエンドのUI切り替えがメイン
- バックエンドは既存の `_generate_prompt_from_description()` を活用可能
- **データベース変更不要（Supabaseマイグレーション不要）**

## 発見した問題点と対策

### 問題1: スキーマの必須フィールド
**現状**: `StructuredImageInput.subject`が必須フィールド
**対策**: `structured_input`をOptionalにし、バリデータで`structured_input`または`free_text_description`のどちらかが必須であることを検証

### 問題2: ルーターでのNone処理
**現状**: `request.structured_input.model_dump()` を直接呼び出し（Noneだとエラー）
**対策**: `structured_input`がNoneでないか確認してから`model_dump()`を呼び出す

### 問題3: サービス層の引数
**現状**: `structured_input: dict`が必須
**対策**: `structured_input: dict | None = None`と`free_text_description: str | None = None`に変更

### 問題4: Geminiクライアントの呼び出し分岐
**現状**: `generate_image_prompt_from_scene`は`structured_input`と`description_ja`の両方をサポート
**対策**: `free_text_description`を`description_ja`として渡す

## 実装ステップ

### Step 1: バックエンドスキーマ更新 (10分)

#### 1.1 `app/videos/schemas.py` - GenerateImageFromTextRequest修正

```python
class GenerateImageFromTextRequest(BaseModel):
    """テキストからの画像生成リクエスト"""
    structured_input: StructuredImageInput | None = Field(
        default=None,
        description="構造化された画像生成入力"
    )
    free_text_description: str | None = Field(
        default=None,
        max_length=2000,
        description="フリーテキストでの画像説明（日本語）"
    )
    reference_image_url: str | None = Field(
        default=None,
        description="参照画像URL（R2にアップロード済み）"
    )
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.PORTRAIT,
        description="アスペクト比（9:16=縦長, 16:9=横長）"
    )

    @model_validator(mode='after')
    def validate_input_provided(self) -> Self:
        """structured_input か free_text_description のどちらかが必須"""
        has_structured = (
            self.structured_input is not None
            and self.structured_input.subject
            and self.structured_input.subject.strip()
        )
        has_free_text = (
            self.free_text_description is not None
            and self.free_text_description.strip()
        )

        if not has_structured and not has_free_text:
            raise ValueError(
                "structured_input（被写体を含む）または free_text_description のどちらかを指定してください"
            )
        return self
```

### Step 2: バックエンドルーター更新 (5分)

#### 2.1 `app/videos/router.py` - エンドポイント修正

```python
@router.post("/generate-image-from-text", response_model=GenerateSceneImageResponse)
async def generate_image_from_text_endpoint(
    request: GenerateImageFromTextRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    構造化テキスト入力またはフリーテキストからシーン画像を生成（Text-to-Image）
    """
    logger.info(f"Generating image from text for user {current_user['user_id']}")
    logger.info(f"structured_input: {request.structured_input}")
    logger.info(f"free_text_description: {request.free_text_description}")
    logger.info(f"reference_image_url: {request.reference_image_url}")
    logger.info(f"aspect_ratio: {request.aspect_ratio}")

    try:
        result = await service.generate_image_from_text(
            # structured_inputがNoneでない場合のみmodel_dump()
            structured_input=request.structured_input.model_dump() if request.structured_input else None,
            free_text_description=request.free_text_description,
            reference_image_url=request.reference_image_url,
            aspect_ratio=request.aspect_ratio.value,
        )
        return GenerateSceneImageResponse(**result)
    # ... エラーハンドリングは既存のまま
```

### Step 3: バックエンドサービス更新 (10分)

#### 3.1 `app/videos/service.py` - generate_image_from_text関数修正

```python
async def generate_image_from_text(
    structured_input: dict | None = None,
    free_text_description: str | None = None,
    reference_image_url: str | None = None,
    aspect_ratio: str = "9:16"
) -> dict:
    """
    構造化テキスト入力またはフリーテキストからシーン画像を生成（Text-to-Image）

    Args:
        structured_input: 構造化入力（nanobananaテンプレートベース）- Noneの場合はfree_textを使用
        free_text_description: フリーテキストでの画像説明（日本語）
        reference_image_url: 参照画像のURL（オプション）
        aspect_ratio: アスペクト比

    Note:
        structured_input または free_text_description のどちらかは必須
    """
    import io
    import logging
    from uuid import uuid4

    from app.external.gemini_client import (
        generate_image_prompt_from_scene,
        translate_structured_input_to_english,
        generate_image
    )
    from app.external.r2 import upload_image

    logger = logging.getLogger(__name__)

    # 入力モードを判定
    use_structured = structured_input is not None and structured_input.get("subject", "").strip()

    if use_structured:
        # 構造化入力モード（既存ロジック）
        logger.info(f"Using structured input mode: {structured_input}")
        translated_input = await translate_structured_input_to_english(structured_input)
        logger.info(f"Translated input: {translated_input}")

        prompt_ja, prompt_en = await generate_image_prompt_from_scene(
            description_ja=None,
            dialogue=None,
            aspect_ratio=aspect_ratio,
            structured_input=translated_input,
            reference_image_url=reference_image_url
        )
    else:
        # フリーテキストモード
        logger.info(f"Using free text mode: {free_text_description}")
        prompt_ja, prompt_en = await generate_image_prompt_from_scene(
            description_ja=free_text_description,
            dialogue=None,
            aspect_ratio=aspect_ratio,
            structured_input=None,
            reference_image_url=reference_image_url
        )

    logger.info(f"Generated prompt: {prompt_en[:100]}...")

    # 以下は既存ロジック（画像生成 → R2アップロード）
    # ...
```

### Step 4: フロントエンド型定義更新 (5分)

#### 4.1 `lib/constants/image-generation.ts` - 型追加・更新

```typescript
// 入力モード型を追加
export type ImageInputMode = "form" | "text";

// 画像生成リクエストの型（更新）
export interface GenerateImageFromTextRequest {
  structured_input?: StructuredImageInput | null;
  free_text_description?: string | null;
  reference_image_url?: string | null;
  aspect_ratio?: "9:16" | "16:9";
}
```

### Step 5: フロントエンドAPIクライアント更新 (5分)

#### 5.1 `lib/api/client.ts` - textToImageApi修正

現在の実装は`fetchWithAuth`でJSON.stringifyを使用しており、`null`や`undefined`は適切にシリアライズされるため、大きな変更は不要。型定義の更新で対応可能。

```typescript
export const textToImageApi = {
  /**
   * 構造化テキスト入力またはフリーテキストからシーン画像を生成
   */
  generate: (data: TextToImageRequest): Promise<TextToImageResponse> =>
    fetchWithAuth("/api/v1/videos/generate-image-from-text", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
```

### Step 6: フロントエンドUI実装 (25分)

#### 6.1 `app/generate/storyboard/page.tsx` - 状態追加

```typescript
import type { ImageInputMode } from "@/lib/constants/image-generation";

// State追加
const [imageInputMode, setImageInputMode] = useState<ImageInputMode>("form");
const [freeTextDescription, setFreeTextDescription] = useState("");
```

#### 6.2 切り替えUI実装（フォーム部分の置き換え）

```tsx
{/* 入力モード切り替えタブ */}
<div className="mb-4">
  <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
    <button
      type="button"
      onClick={() => setImageInputMode("form")}
      disabled={generatingFromText}
      className={cn(
        "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
        imageInputMode === "form"
          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      )}
    >
      フォーム入力
    </button>
    <button
      type="button"
      onClick={() => setImageInputMode("text")}
      disabled={generatingFromText}
      className={cn(
        "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
        imageInputMode === "text"
          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      )}
    >
      テキスト入力
    </button>
  </div>
</div>

{/* 条件付きレンダリング */}
{imageInputMode === "form" ? (
  <StructuredImageForm
    value={structuredInput}
    onChange={setStructuredInput}
    disabled={generatingFromText}
  />
) : (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      画像の説明
    </label>
    <textarea
      value={freeTextDescription}
      onChange={(e) => setFreeTextDescription(e.target.value)}
      placeholder="生成したい画像の説明を自由に入力してください。&#10;&#10;例: 白い大理石のテーブルの上に置かれた高級感のあるコーヒーカップ。ゴールデンアワーの柔らかい光が左上から差し込み、暖かみのある色調で撮影。背景は軽くぼかしたモダンなカフェの内装。"
      disabled={generatingFromText}
      rows={8}
      maxLength={2000}
      className={cn(
        "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-zinc-400",
        "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-none",
        "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
      )}
    />
    <div className="flex justify-between text-xs text-zinc-500">
      <span>被写体、背景、照明、色調などを詳しく記述すると精度が上がります</span>
      <span>{freeTextDescription.length}/2000</span>
    </div>
  </div>
)}
```

#### 6.3 バリデーションとAPI呼び出し更新

```typescript
// バリデーション関数
const canGenerateImage = (): boolean => {
  if (imageInputMode === "form") {
    return hasStructuredInputData(structuredInput);
  } else {
    return freeTextDescription.trim().length > 0;
  }
};

// handleGenerateImageFromText関数を更新
const handleGenerateImageFromText = async () => {
  // バリデーション
  if (imageInputMode === "form") {
    if (!hasStructuredInputData(structuredInput)) {
      alert("被写体を入力してください");
      return;
    }
  } else {
    if (!freeTextDescription.trim()) {
      alert("画像の説明を入力してください");
      return;
    }
  }

  setGeneratingFromText(true);
  try {
    const result = await textToImageApi.generate({
      // フォームモードの場合は structured_input を送信
      structured_input: imageInputMode === "form" ? structuredInput : null,
      // テキストモードの場合は free_text_description を送信
      free_text_description: imageInputMode === "text" ? freeTextDescription : null,
      reference_image_url: referenceImageUrl || null,
      aspect_ratio: aspectRatio,
    });

    setGeneratedImageUrl(result.image_url);
    setGeneratedPromptJa(result.generated_prompt_ja);
    setGeneratedPromptEn(result.generated_prompt_en);
    setStep("preview");
  } catch (error) {
    console.error("Image generation failed:", error);
    alert(error instanceof Error ? error.message : "画像生成に失敗しました");
  } finally {
    setGeneratingFromText(false);
  }
};
```

#### 6.4 ボタンのdisabled状態更新

```tsx
<Button
  onClick={handleGenerateImageFromText}
  disabled={generatingFromText || !canGenerateImage()}
  className="w-full"
  size="lg"
>
  {/* ... */}
</Button>
```

### Step 7: テスト (10分)

1. **フォーム入力モード**
   - 被写体のみ入力 → 画像生成成功
   - 全フィールド入力 → 画像生成成功
   - 被写体未入力 → エラー表示

2. **テキスト入力モード**
   - テキスト入力 → 画像生成成功
   - 空テキスト → エラー表示

3. **モード切り替え**
   - フォーム → テキスト → フォームで入力内容が保持されること
   - 切り替え後にボタンのdisabled状態が正しく更新されること

4. **参照画像との組み合わせ**
   - フォーム + 参照画像 → 画像生成成功
   - テキスト + 参照画像 → 画像生成成功

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker-api/app/videos/schemas.py` | `free_text_description`フィールド追加、バリデータ追加 |
| `movie-maker-api/app/videos/router.py` | `structured_input`のNone処理追加 |
| `movie-maker-api/app/videos/service.py` | フリーテキスト分岐処理追加 |
| `movie-maker/lib/constants/image-generation.ts` | `ImageInputMode`型追加、リクエスト型更新 |
| `movie-maker/lib/api/client.ts` | 型の更新のみ（実装変更なし） |
| `movie-maker/app/generate/storyboard/page.tsx` | 切り替えUI実装、状態追加、API呼び出し更新 |

## データベース変更

**なし** - Supabaseマイグレーション不要

## 注意事項

1. **モード切り替え時のデータ保持**: 切り替え時に入力内容はリセットしない（ユーザーが戻れるように）
2. **参照画像**: 両方のモードで参照画像機能は利用可能
3. **プロンプト品質**: フリーテキストモードでもARRI Camera & Lens Lookは自動適用される（`_generate_prompt_from_description`に組み込み済み）
4. **文字数制限**: フリーテキストは5000文字まで（バックエンド・フロントエンド両方で制限）

## 将来の拡張案

- 入力モードのユーザー設定保存（localStorage）
- フォームからテキストへの自動変換機能
- テキストからフォームへのAI解析変換機能
