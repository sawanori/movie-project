# ワンシーン生成機能拡張 - Text-to-Image実装計画書

**作成日:** 2026-01-09
**最終更新:** 2026-01-09
**ステータス:** レビュー済み

## 概要

ワンシーン生成の初期フォームを拡張し、画像アップロードに加えてテキスト入力による画像生成機能を追加する。
nanobanana 5段階構造テンプレートに基づいた構造化入力フォームを提供し、日本語→英語翻訳後にGeminiで画像を生成する。

### 入力パターン
| パターン | 画像 | テキスト | 動作 |
|---------|------|---------|------|
| A | ○ | × | 従来フロー（直接設定画面へ） |
| B | × | ○ | nanobananaで画像生成 → 確認 → 設定画面 |
| C | ○ | ○ | 参照画像を考慮してnanobananaで画像生成 → 確認 → 設定画面 |
| D | × | × | **エラー**（どちらか必須） |

## 現状フロー

```
1. 画像アップロード
2. (画像選択後) エンジン選択・アスペクト比・被写体タイプなど
3. ムード選択
4. ストーリー生成 → 動画生成
```

## 新フロー

```
1. 初期フォーム:
   - 画像アップローダー（オプション）
   - 構造化テキストフォーム（オプション）
   - 入力パターン: 画像のみ / テキストのみ / 両方

2. (テキスト入力あり) → nanobananaで画像生成 → 確認ページ

3. (確認OK または 画像のみの場合)
   → エンジン選択・アスペクト比・被写体タイプなど

4. ムード選択 → ストーリー生成 → 動画生成
```

---

## 入力フォーム設計

### nanobanana_template.md「Detailed Image Understanding」ベース

| フィールド名 | 日本語ラベル | 入力タイプ | 必須 | 説明 |
|-------------|-------------|-----------|------|------|
| `subject` | 被写体 | テキスト | ○ | 何を撮影するか（人物、商品、風景など） |
| `subject_position` | 被写体の位置 | ドロップダウン | - | 中央、左寄り、右寄り、上部、下部 |
| `background` | 背景/環境 | テキスト | - | 撮影場所・設定（スタジオ、屋外、抽象的背景など） |
| `lighting` | 照明 | ドロップダウン | - | 光の方向と質 |
| `color_palette` | カラー | テキスト/カラーピッカー | - | メインの色調 |
| `mood` | ムード/雰囲気 | ドロップダウン | - | 感情・雰囲気 |
| `additional_notes` | 追加指示 | テキストエリア | - | その他の自由記述 |

### ドロップダウン選択肢

#### 被写体の位置 (`subject_position`)
```typescript
const POSITION_OPTIONS = [
  { value: "center", label: "中央", en: "centered in frame" },
  { value: "left", label: "左寄り", en: "positioned left of center" },
  { value: "right", label: "右寄り", en: "positioned right of center" },
  { value: "upper", label: "上部", en: "positioned at upper third" },
  { value: "lower", label: "下部", en: "positioned at lower third" },
  { value: "rule_of_thirds", label: "三分割構図", en: "following rule of thirds" },
];
```

#### 照明 (`lighting`)
```typescript
const LIGHTING_OPTIONS = [
  { value: "soft_natural", label: "自然光（柔らかい）", en: "soft natural daylight" },
  { value: "dramatic", label: "ドラマチック", en: "dramatic directional lighting" },
  { value: "studio", label: "スタジオ照明", en: "professional studio lighting" },
  { value: "backlit", label: "逆光", en: "backlighting with rim highlights" },
  { value: "golden_hour", label: "ゴールデンアワー", en: "warm golden hour lighting" },
  { value: "moody", label: "ムーディー", en: "moody low-key lighting" },
];
```

#### ムード (`mood`)
```typescript
const MOOD_OPTIONS = [
  { value: "luxury", label: "高級感", en: "sophisticated luxury aesthetic" },
  { value: "energetic", label: "エネルギッシュ", en: "dynamic energetic feel" },
  { value: "calm", label: "穏やか", en: "calm serene atmosphere" },
  { value: "playful", label: "遊び心", en: "playful whimsical mood" },
  { value: "professional", label: "プロフェッショナル", en: "clean professional look" },
  { value: "nostalgic", label: "ノスタルジック", en: "nostalgic vintage feel" },
];
```

---

## データベース変更

### 判定: マイグレーション不要

既存テーブルで対応可能:
- `storyboard_scenes.scene_image_url` - 生成画像を保存
- `storyboards.source_image_url` - 参照画像（任意）を保存

新規テーブルは不要。フロントエンドの状態管理で対応。

---

## バックエンド実装

### 1. `generate_image_prompt_from_scene` 関数拡張

**ファイル:** `movie-maker-api/app/external/gemini_client.py`

```python
async def generate_image_prompt_from_scene(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16",
    # 新規パラメータ
    reference_image_url: str | None = None,
    structured_input: dict | None = None,  # 構造化入力
) -> tuple[str, str]:
```

**structured_input の形式:**
```python
{
    "subject": "コーヒーカップ",
    "subject_position": "center",
    "background": "白い大理石のテーブル",
    "lighting": "soft_natural",
    "color_palette": "warm brown tones",
    "mood": "calm",
    "additional_notes": "湯気が立っている"
}
```

### 2. 日本語→英語翻訳処理

Gemini 2.0 Flashで翻訳:

```python
async def translate_structured_input_to_english(
    structured_input: dict
) -> dict:
    """
    構造化入力の日本語フィールドを英語に翻訳
    """
    # subject, background, color_palette, additional_notes を翻訳
    # ドロップダウン項目は事前定義の英語値を使用
```

### 3. 新規スキーマ定義（重要: 型安全性）

**ファイル:** `movie-maker-api/app/videos/schemas.py`

```python
from pydantic import BaseModel, Field, model_validator
from typing import Self

class StructuredImageInput(BaseModel):
    """構造化画像入力（nanobananaテンプレートベース）"""
    subject: str = Field(..., min_length=1, max_length=200, description="被写体（必須）")
    subject_position: str | None = Field(default=None, description="被写体の位置")
    background: str | None = Field(default=None, max_length=200, description="背景/環境")
    lighting: str | None = Field(default=None, description="照明")
    color_palette: str | None = Field(default=None, max_length=100, description="カラー")
    mood: str | None = Field(default=None, description="ムード")
    additional_notes: str | None = Field(default=None, max_length=500, description="追加指示")

    @model_validator(mode='after')
    def validate_dropdown_values(self) -> Self:
        """ドロップダウン値の検証"""
        valid_positions = {"center", "left", "right", "upper", "lower", "rule_of_thirds", None}
        valid_lighting = {"soft_natural", "dramatic", "studio", "backlit", "golden_hour", "moody", None}
        valid_moods = {"luxury", "energetic", "calm", "playful", "professional", "nostalgic", None}

        if self.subject_position not in valid_positions:
            raise ValueError(f"Invalid subject_position: {self.subject_position}")
        if self.lighting not in valid_lighting:
            raise ValueError(f"Invalid lighting: {self.lighting}")
        if self.mood not in valid_moods:
            raise ValueError(f"Invalid mood: {self.mood}")
        return self


class GenerateImageFromTextRequest(BaseModel):
    """テキストからの画像生成リクエスト"""
    structured_input: StructuredImageInput  # 必須（dict ではなく型付きモデル）
    reference_image_url: str | None = Field(default=None, description="参照画像URL（R2にアップロード済み）")
    aspect_ratio: AspectRatio = Field(default=AspectRatio.PORTRAIT, description="アスペクト比")
```

### 4. 新規エンドポイント

**ファイル:** `movie-maker-api/app/videos/router.py`

```python
@router.post("/generate-image-from-text", response_model=GenerateSceneImageResponse)
async def generate_image_from_text(
    request: GenerateImageFromTextRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    構造化テキスト入力（+オプション参照画像）から画像を生成

    nanobanana 5段階構造に基づいてプロンプトを構築し、
    Gemini Imagen 3で画像を生成する。

    注意:
    - structured_input.subject は必須
    - reference_image_url は事前にR2にアップロードされている必要あり
    - 画像生成には10-30秒かかる場合がある
    """
    # 1. 日本語→英語翻訳
    translated_input = await translate_structured_input_to_english(
        request.structured_input.model_dump()
    )

    # 2. プロンプト生成
    prompt_ja, prompt_en = await generate_image_prompt_from_scene(
        description_ja=None,
        structured_input=translated_input,
        reference_image_url=request.reference_image_url,
        aspect_ratio=request.aspect_ratio.value,
    )

    # 3. 画像生成
    image = await generate_image(prompt_en, aspect_ratio=request.aspect_ratio.value)

    # 4. R2アップロード & レスポンス
    ...
```

### 4. マルチモーダル入力対応

参照画像がある場合、Geminiに画像も送信:

```python
async def generate_image_prompt_with_reference(
    structured_input: dict,
    reference_image_url: str,
    aspect_ratio: str,
) -> tuple[str, str]:
    """
    参照画像を分析しながらプロンプトを生成
    """
    # 1. 参照画像をダウンロード
    # 2. Geminiに画像 + 構造化入力を送信
    # 3. 画像の特徴を維持しつつプロンプト生成
```

---

## フロントエンド実装

### 1. 新規Step追加

**ファイル:** `movie-maker/app/generate/storyboard/page.tsx`

```typescript
type Step =
  | "input"        // 新規: 初期入力（画像 + テキスト）
  | "preview"      // 新規: 生成画像確認
  | "upload"       // 既存: 画像確認・設定
  | "mood"
  | "edit"
  | "generating"
  | "review"
  | "concatenating"
  | "completed";
```

### 2. 構造化入力フォームコンポーネント

**新規ファイル:** `movie-maker/components/video/structured-image-form.tsx`

```typescript
interface StructuredImageFormProps {
  onSubmit: (data: StructuredImageInput) => void;
  referenceImage?: File | null;
  onReferenceImageChange: (file: File | null) => void;
  isLoading?: boolean;
}

interface StructuredImageInput {
  subject: string;
  subject_position?: string;
  background?: string;
  lighting?: string;
  color_palette?: string;
  mood?: string;
  additional_notes?: string;
}
```

### 3. APIクライアント拡張

**ファイル:** `movie-maker/lib/api/client.ts`

```typescript
export const videosApi = {
  // 既存...

  /** テキストから画像生成 */
  generateImageFromText: async (
    input: StructuredImageInput,
    referenceImageUrl?: string,
    aspectRatio?: AspectRatio,
  ): Promise<GenerateSceneImageResponse> => {
    return fetchWithAuth("/api/v1/videos/generate-image-from-text", {
      method: "POST",
      body: JSON.stringify({
        structured_input: input,
        reference_image_url: referenceImageUrl,
        aspect_ratio: aspectRatio,
      }),
    });
  },
};
```

### 4. UI/UXフロー

```
┌─────────────────────────────────────────────────────────┐
│  ワンシーン動画を作成                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │                 │  │  被写体 *                    │  │
│  │  参照画像       │  │  [コーヒーカップ          ]  │  │
│  │  (オプション)   │  │                             │  │
│  │                 │  │  位置                       │  │
│  │  [ドロップ]     │  │  [中央              ▼]      │  │
│  │                 │  │                             │  │
│  └─────────────────┘  │  背景/環境                  │  │
│                       │  [白い大理石のテーブル    ]  │  │
│  アスペクト比         │                             │  │
│  ┌──────┐ ┌──────┐   │  照明                       │  │
│  │ 9:16 │ │16:9  │   │  [自然光（柔らかい）  ▼]    │  │
│  │ 縦長 │ │ 横長 │   │                             │  │
│  └──────┘ └──────┘   │  カラー                     │  │
│                       │  [warm brown tones       ]  │  │
│                       │                             │  │
│                       │  ムード                     │  │
│                       │  [穏やか              ▼]    │  │
│                       │                             │  │
│                       │  追加指示                   │  │
│                       │  [湯気が立っている       ]  │  │
│                       └─────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           画像を生成                             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  または                                                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           画像だけでスキップ                     │   │
│  └─────────────────────────────────────────────────┘   │
│  ※ 画像またはテキストのどちらかは必須です                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**ボタンの有効/無効条件:**
| 条件 | 「画像を生成」 | 「画像だけでスキップ」 |
|------|--------------|---------------------|
| 画像あり + テキストあり | ○ 有効 | ○ 有効 |
| 画像あり + テキストなし | × 無効 | ○ 有効 |
| 画像なし + テキストあり | ○ 有効 | × 無効 |
| 画像なし + テキストなし | × 無効 | × 無効 |

---

## 実装タスク

### Phase 1: バックエンド（1-2日）

| # | タスク | ファイル | 優先度 |
|---|--------|----------|--------|
| 1.1 | 構造化入力の型定義追加 | `schemas.py` | 高 |
| 1.2 | 翻訳関数実装 | `gemini_client.py` | 高 |
| 1.3 | `generate_image_prompt_from_scene` 拡張 | `gemini_client.py` | 高 |
| 1.4 | マルチモーダル入力対応 | `gemini_client.py` | 中 |
| 1.5 | 新規エンドポイント実装 | `router.py` | 高 |

### Phase 2: フロントエンド（2-3日）

| # | タスク | ファイル | 優先度 |
|---|--------|----------|--------|
| 2.1 | 構造化入力フォームコンポーネント作成 | `structured-image-form.tsx` | 高 |
| 2.2 | ドロップダウン選択肢定義 | `constants/image-options.ts` | 高 |
| 2.3 | APIクライアント拡張 | `client.ts` | 高 |
| 2.4 | Step追加と状態管理 | `storyboard/page.tsx` | 高 |
| 2.5 | 確認ページUI実装 | `storyboard/page.tsx` | 中 |
| 2.6 | 3パターン分岐ロジック | `storyboard/page.tsx` | 中 |

### Phase 3: テスト（1日）

| # | タスク | 説明 |
|---|--------|------|
| 3.1 | バックエンドユニットテスト | 翻訳、プロンプト生成、エンドポイント |
| 3.2 | フロントエンド動作確認 | 3パターン（画像のみ/テキストのみ/両方）|
| 3.3 | E2Eテスト | 全フロー通しテスト |

---

## テスト計画

### バックエンドテスト

**ファイル:** `movie-maker-api/tests/videos/test_text_to_image.py`

```python
import pytest
from unittest.mock import AsyncMock, patch
from app.external.gemini_client import (
    translate_structured_input_to_english,
    generate_image_prompt_from_scene,
)
from app.videos.schemas import StructuredImageInput, GenerateImageFromTextRequest


class TestStructuredImageInputValidation:
    """スキーマバリデーションテスト"""

    def test_valid_input(self):
        """正常な入力"""
        input_data = StructuredImageInput(
            subject="コーヒーカップ",
            lighting="soft_natural",
            mood="calm",
        )
        assert input_data.subject == "コーヒーカップ"

    def test_subject_required(self):
        """被写体は必須"""
        with pytest.raises(ValueError):
            StructuredImageInput(subject="")

    def test_invalid_lighting_value(self):
        """不正な照明値"""
        with pytest.raises(ValueError, match="Invalid lighting"):
            StructuredImageInput(subject="test", lighting="invalid_value")

    def test_invalid_mood_value(self):
        """不正なムード値"""
        with pytest.raises(ValueError, match="Invalid mood"):
            StructuredImageInput(subject="test", mood="invalid_mood")


class TestTranslateStructuredInput:
    """構造化入力の翻訳テスト"""

    @pytest.mark.asyncio
    async def test_translate_japanese_subject(self):
        """日本語被写体の翻訳"""
        input_data = {"subject": "コーヒーカップ"}
        result = await translate_structured_input_to_english(input_data)
        # 翻訳されていることを確認（具体的な訳は変動するためloose check）
        assert result["subject"] != "コーヒーカップ"
        assert len(result["subject"]) > 0

    @pytest.mark.asyncio
    async def test_skip_english_input(self):
        """英語入力はそのまま返す"""
        input_data = {"subject": "coffee cup on table"}
        result = await translate_structured_input_to_english(input_data)
        assert result["subject"] == "coffee cup on table"

    @pytest.mark.asyncio
    async def test_dropdown_values_use_predefined_english(self):
        """ドロップダウン値は事前定義の英語を使用"""
        input_data = {
            "subject": "女性モデル",
            "lighting": "soft_natural",
            "mood": "luxury",
        }
        result = await translate_structured_input_to_english(input_data)
        assert result["lighting"] == "soft natural daylight"
        assert result["mood"] == "sophisticated luxury aesthetic"

    @pytest.mark.asyncio
    async def test_handle_empty_optional_fields(self):
        """空のオプションフィールドを処理"""
        input_data = {
            "subject": "test",
            "background": None,
            "additional_notes": "",
        }
        result = await translate_structured_input_to_english(input_data)
        assert result["subject"] == "test"
        assert result["background"] is None


class TestGenerateImagePromptFromScene:
    """プロンプト生成テスト"""

    @pytest.mark.asyncio
    async def test_backward_compatibility(self):
        """既存の呼び出し方式が動作することを確認（後方互換性）"""
        prompt_ja, prompt_en = await generate_image_prompt_from_scene(
            description_ja="コーヒーを飲む女性",
            dialogue="美味しい！",
            aspect_ratio="9:16"
        )
        assert prompt_ja is not None
        assert prompt_en is not None
        assert len(prompt_en) > 20

    @pytest.mark.asyncio
    async def test_generate_with_structured_input(self):
        """構造化入力からプロンプト生成"""
        structured_input = {
            "subject": "coffee cup",
            "background": "white marble table",
            "lighting": "soft natural daylight",
        }
        prompt_ja, prompt_en = await generate_image_prompt_from_scene(
            description_ja=None,
            structured_input=structured_input,
        )
        assert "coffee" in prompt_en.lower()
        assert len(prompt_en) > 50


class TestGenerateImageFromTextEndpoint:
    """エンドポイントテスト"""

    @pytest.fixture
    def mock_generate_image(self):
        """画像生成をモック"""
        with patch("app.videos.router.generate_image") as mock:
            mock.return_value = AsyncMock()  # モック画像オブジェクト
            yield mock

    @pytest.fixture
    def mock_upload_image(self):
        """R2アップロードをモック"""
        with patch("app.videos.router.upload_image") as mock:
            mock.return_value = "https://r2.example.com/generated/test.png"
            yield mock

    @pytest.mark.asyncio
    async def test_generate_with_text_only(
        self, client, auth_headers, mock_generate_image, mock_upload_image
    ):
        """テキストのみで画像生成"""
        response = await client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "コーヒーカップ",
                    "background": "木のテーブル",
                },
                "aspect_ratio": "9:16",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "image_url" in data
        assert "generated_prompt_en" in data

    @pytest.mark.asyncio
    async def test_validation_error_missing_subject(self, client, auth_headers):
        """被写体なしでバリデーションエラー"""
        response = await client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "background": "木のテーブル",
                    # subject missing
                },
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_validation_error_invalid_lighting(self, client, auth_headers):
        """不正な照明値でバリデーションエラー"""
        response = await client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "test",
                    "lighting": "invalid_lighting_value",
                },
            },
            headers=auth_headers,
        )
        assert response.status_code == 422
```

### フロントエンドテスト（手動）

| # | テストケース | 期待結果 |
|---|-------------|----------|
| F1 | テキストのみ入力 → 生成 | 画像が生成され確認ページに遷移 |
| F2 | 画像のみアップロード | 従来フロー（設定画面に直接遷移） |
| F3 | 画像+テキスト入力 → 生成 | 参照画像を考慮した画像が生成 |
| F4 | 確認ページで「使用する」 | 設定画面に遷移、画像がセット |
| F5 | 確認ページで「再生成」 | 再度画像生成 |
| F6 | 必須項目（被写体）未入力 | バリデーションエラー表示 |

---

## 見積もり

| フェーズ | 工数 |
|---------|------|
| Phase 1: バックエンド | 1-2日 |
| Phase 2: フロントエンド | 2-3日 |
| Phase 3: テスト | 1日 |
| **合計** | **4-6日** |

---

## 重要な実装注意点

### 1. 後方互換性の確保

`generate_image_prompt_from_scene` 関数の既存呼び出し元:
- `movie-maker-api/app/videos/service.py` の `generate_scene_image` 関数

**対策:** 新規パラメータはすべてデフォルト値 `None` を持つため、既存コードは変更不要。

```python
# 既存の呼び出し（変更不要）
prompt_ja, prompt_en = await generate_image_prompt_from_scene(
    description_ja=description_ja,
    dialogue=dialogue,
    aspect_ratio=aspect_ratio
)

# 新規の呼び出し
prompt_ja, prompt_en = await generate_image_prompt_from_scene(
    description_ja=None,
    structured_input=translated_input,
    reference_image_url=reference_url,
    aspect_ratio=aspect_ratio
)
```

### 2. 参照画像アップロードフロー

フロントエンドで参照画像を選択した場合、**先にR2にアップロード**する必要がある。

```
1. ユーザーが画像を選択
2. フロントエンドで既存の /upload-image エンドポイントを呼び出し
3. R2 URLを取得
4. /generate-image-from-text に R2 URL を渡す
```

### 3. 翻訳処理の言語検出

ユーザーが英語で入力した場合の二重翻訳を防ぐ:

```python
async def translate_structured_input_to_english(structured_input: dict) -> dict:
    """
    日本語フィールドを英語に翻訳。
    既に英語の場合はそのまま返す。
    """
    # 簡易言語検出: ASCII比率が80%以上なら英語と判定
    def is_likely_english(text: str) -> bool:
        if not text:
            return True
        ascii_chars = sum(1 for c in text if ord(c) < 128)
        return ascii_chars / len(text) > 0.8

    result = structured_input.copy()

    # 翻訳対象フィールド
    text_fields = ["subject", "background", "color_palette", "additional_notes"]

    for field in text_fields:
        value = result.get(field)
        if value and not is_likely_english(value):
            result[field] = await translate_to_english(value)

    return result
```

### 4. タイムアウト設定

画像生成は時間がかかるため、適切なタイムアウト設定が必要:

```python
# gemini_client.py
GEMINI_IMAGE_GENERATION_TIMEOUT = 60  # 秒

async def generate_image(prompt: str, aspect_ratio: str = "9:16") -> Image | None:
    try:
        async with asyncio.timeout(GEMINI_IMAGE_GENERATION_TIMEOUT):
            response = await client.models.generate_images(...)
    except asyncio.TimeoutError:
        logger.error("Image generation timed out")
        raise ValueError("画像生成がタイムアウトしました。再度お試しください。")
```

### 5. 使用量カウント

画像生成もコストがかかるため、使用量追跡を検討:

```python
# オプション: 画像生成を usage_logs に記録
# 現状は動画生成のみカウントしているため、要件確認が必要
```

---

## エラーハンドリング

### バックエンドエラーコード

| エラー | HTTPステータス | メッセージ |
|--------|---------------|-----------|
| 入力バリデーションエラー | 422 | "被写体は必須です" |
| 翻訳失敗 | 500 | "翻訳処理に失敗しました" |
| 画像生成失敗 | 500 | "画像生成に失敗しました。プロンプトを変更して再試行してください" |
| タイムアウト | 504 | "画像生成がタイムアウトしました" |
| 参照画像取得失敗 | 400 | "参照画像を読み込めませんでした" |

### フロントエンドエラー表示

```typescript
// 構造化入力フォームでのバリデーション
const validateForm = (input: StructuredImageInput): string | null => {
  if (!input.subject?.trim()) {
    return "被写体を入力してください";
  }
  if (input.subject.length > 200) {
    return "被写体は200文字以内で入力してください";
  }
  return null;
};

// 送信ボタンの制御
const canSubmit = useMemo(() => {
  const hasImage = !!referenceImageFile || !!referenceImageUrl;
  const hasText = !!structuredInput.subject?.trim();
  return hasImage || hasText;  // どちらか必須
}, [referenceImageFile, referenceImageUrl, structuredInput]);
```

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| Gemini翻訳精度 | 不自然なプロンプト | テンプレート化で安定性確保、言語検出で二重翻訳防止 |
| 画像生成品質 | ユーザー期待との乖離 | 再生成機能で対応 |
| マルチモーダル処理時間 | UX低下 | ローディング表示、60秒タイムアウト設定 |
| 後方互換性 | 既存機能の破壊 | デフォルト引数で対応、既存テスト実行で確認 |
| 参照画像の不正URL | セキュリティ | R2 URLのみ許可（バリデーション追加） |

---

## 実装チェックリスト

### バックエンド
- [x] `StructuredImageInput` スキーマ定義（schemas.py）
- [x] `GenerateImageFromTextRequest` スキーマ定義（schemas.py）
- [x] `translate_structured_input_to_english` 関数（gemini_client.py）
- [x] `generate_image_prompt_from_scene` パラメータ拡張（gemini_client.py）
- [x] `/generate-image-from-text` エンドポイント（router.py）
- [x] 言語検出ロジック
- [x] タイムアウト設定
- [ ] 既存テスト実行（後方互換性確認）

### フロントエンド
- [x] `StructuredImageForm` コンポーネント
- [x] 定数ファイル（POSITION_OPTIONS, LIGHTING_OPTIONS, MOOD_OPTIONS）
- [x] APIクライアント `generateImageFromText` 関数
- [x] Step追加（"input", "preview"）
- [x] 入力パターン分岐ロジック（A/B/C/D）
- [x] ローディング状態（10-30秒対応）
- [x] エラー表示UI
- [x] 確認ページ（生成画像表示、再生成ボタン）

### テスト
- [x] スキーマバリデーションテスト（test_text_to_image.py - 13 passed）
- [x] リクエストスキーマテスト（test_text_to_image.py - 3 passed）
- [x] エンドポイントテスト（正常系）（test_text_to_image.py - 7 passed）
- [x] エンドポイントテスト（バリデーションエラー）（test_text_to_image.py - passed）
- [ ] 翻訳関数ユニットテスト
- [ ] プロンプト生成ユニットテスト
- [ ] 既存 `generate_scene_image` テスト実行
- [ ] フロントエンド手動テスト（4パターン）

### 手動テスト手順
1. http://localhost:3000/generate/storyboard にアクセス
2. 以下4パターンをテスト:
   - **パターンA**: 画像のみアップロード → 「画像だけでスキップ」
   - **パターンB**: テキストのみ入力（被写体「コーヒーカップ」等）→ 「画像を生成」
   - **パターンC**: 画像+テキスト → 「画像を生成」
   - **パターンD**: 両方なし → ボタンが無効化されていることを確認

---

## 承認

- [x] 技術レビュー完了（2026-01-09）
- [x] 実装完了（2026-01-09）
- [ ] テスト・動作確認
