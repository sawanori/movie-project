# 実装計画書: アドクリエイター画像ルック/テイスト指定機能

## 概要

アドクリエイターのシーン画像生成（`SceneImageGeneratorModal`）で、写真のルック/テイスト（実写、アニメ、イラスト等）を指定できるようにする。

## 現状分析

### 現在のフロー
```
カット「新規」→ SceneImageGeneratorModal
  → image_provider 選択 (nanobanana / bfl_flux2_pro)
  → POST /api/v1/videos/generate-scene-image
  → バックエンドでプロンプト生成 → 画像生成
```

### 課題
- Gemini (nanobanana) パスでは **ARRI ALEXA 35 による実写シネマティック** がハードコードされている
- BFL FLUX.2 パスではスタイル指定なし（翻訳した素テキストのみ）
- ユーザーがアニメ風やイラスト風など、実写以外のルックを選択する手段がない

### スコープ

- **対象:** `generate_scene_image`（アドクリエイターのシーン画像生成）
- **対象外:** `generate_image_from_text`（テキスト→画像の独立機能）は本フェーズのスコープ外。別途対応する。

---

## 変更対象ファイル一覧

| # | ファイル | 変更種別 | タスク |
|---|---------|----------|--------|
| 1 | `movie-maker-api/app/videos/schemas.py` | Enum追加・フィールド追加 | Task 1 |
| 2 | `movie-maker-api/app/videos/service.py` | ルック反映ロジック追加 | Task 2 |
| 3 | `movie-maker-api/app/external/gemini_client.py` | プロンプトテンプレート分岐 | Task 3 |
| 4 | `movie-maker-api/app/videos/router.py` | パラメータ追加 | Task 4 |
| 5 | `movie-maker/lib/constants/image-generation.ts` | 型・定数追加 | Task 5 |
| 6 | `movie-maker/lib/api/client.ts` | API型更新 | Task 6 |
| 7 | `movie-maker/components/ui/image-look-selector.tsx` | **新規作成** | Task 7 |
| 8 | `movie-maker/components/video/scene-image-generator-modal.tsx` | UI追加・API呼び出し更新 | Task 8 |
| 9 | `movie-maker/app/concat/page.tsx` | state管理・ドラフト復元 | Task 9 |
| 10 | `movie-maker/lib/hooks/use-auto-save-ad-creator-draft.ts` | ドラフト保存追加 | Task 10 |

**合計: 10ファイル（1新規 + 9既存修正）**

---

## タスク詳細

### Task 1: バックエンド — Schema定義 (`schemas.py`)

**ファイル:** `movie-maker-api/app/videos/schemas.py`

#### 1-1. `ImageLook` Enum 追加

`ImageProvider` Enum（L51-54）の直後に追加:

```python
class ImageLook(str, Enum):
    """画像のルック/テイスト"""
    REALISTIC = "realistic"            # 実写・フォトリアル
    CINEMATIC = "cinematic"            # シネマティック（現在のデフォルト）
    ANIME = "anime"                    # アニメ
    ILLUSTRATION = "illustration"      # デジタルイラスト
    WATERCOLOR = "watercolor"          # 水彩画
    THREE_D_RENDER = "3d_render"       # 3DCG
    FLAT_DESIGN = "flat_design"        # フラットデザイン
    OIL_PAINTING = "oil_painting"      # 油絵
```

#### 1-2. `GenerateSceneImageRequest` にフィールド追加（L1480-1545）

既存フィールド `negative_prompt` の後に追加（末尾追加で後方互換維持）:

```python
image_look: ImageLook = Field(
    default=ImageLook.CINEMATIC,
    description="画像のルック/テイスト（実写、アニメ等）"
)
```

#### 1-3. `AdCreatorDraftMetadata` にフィールド追加（L1437-1451）

```python
image_look: str | None = Field(
    default=None,
    description="画像生成のルック/テイスト"
)
```

`None` = 旧ドラフト互換（FE側で `None` → `"cinematic"` にフォールバック）。

`schema_version` は既存の `1` のまま（`image_look: None` のデフォルトで旧ドラフト互換が保証されるため、バージョンアップ不要）。

---

### Task 2: バックエンド — Service層ルック反映 (`service.py`)

**ファイル:** `movie-maker-api/app/videos/service.py`

#### 2-1. `IMAGE_LOOK_PROMPTS` 定数マッピング追加

`generate_scene_image` 関数の前（ファイルトップレベル）に追加:

```python
IMAGE_LOOK_PROMPTS: dict[str, str] = {
    "realistic": "photorealistic photography, natural lighting, shot on professional camera",
    "cinematic": "cinematic photography, shot on ARRI ALEXA 35, dramatic lighting, film grain",
    "anime": "anime style, cel shading, vibrant colors, clean lines, Japanese animation aesthetic",
    "illustration": "digital illustration, clean vector-like lines, professional artwork",
    "watercolor": "watercolor painting style, soft edges, translucent colors, paper texture",
    "3d_render": "3D rendered, Pixar-style, smooth surfaces, volumetric lighting",
    "flat_design": "flat design, vector art, minimal shadows, bold geometric shapes",
    "oil_painting": "oil painting style, rich textures, visible brushstrokes, classical composition",
}
```

#### 2-2. `generate_scene_image` 関数のシグネチャ変更（L602-609）

**既存パラメータ順序を維持し、末尾に追加:**

```python
async def generate_scene_image(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16",
    image_provider: str = "nanobanana",
    reference_images: list[dict] | None = None,
    negative_prompt: str | None = None,
    image_look: str = "cinematic",       # 末尾に追加
) -> dict:
```

> **注意:** `image_look` は既存パラメータの後に追加。router.py はすべてキーワード引数で呼び出しているため、順序変更による破壊リスクなし。

#### 2-3. Gemini (nanobanana) パスへの反映

`generate_image_prompt_from_scene()` の呼び出しに `image_look` を渡す:

```python
prompt_ja, prompt_en = await generate_image_prompt_from_scene(
    description_ja=description_ja,
    dialogue=dialogue,
    aspect_ratio=aspect_ratio,
    image_look=image_look,        # 追加（キーワード引数）
)
```

#### 2-4. BFL FLUX.2 パスへの反映

翻訳後のプロンプトにスタイルプレフィックスを付与:

```python
style_prefix = IMAGE_LOOK_PROMPTS.get(image_look, "")
if style_prefix:
    prompt_en = f"{style_prefix}. {prompt_en}"
```

---

### Task 3: バックエンド — Geminiプロンプト分岐 (`gemini_client.py`)

**ファイル:** `movie-maker-api/app/external/gemini_client.py`

#### 3-1. `generate_image_prompt_from_scene` シグネチャ変更（L1944-1950）

**既存パラメータ順序を維持し、末尾に追加:**

```python
async def generate_image_prompt_from_scene(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16",
    structured_input: dict | None = None,
    reference_image_url: str | None = None,
    image_look: str = "cinematic",       # 末尾に追加
) -> tuple[str, str]:
```

> **注意:** `structured_input` と `reference_image_url` は既存のパラメータ。順序を変えない。`image_look` は末尾に追加し、既存の呼び出し元（`generate_image_from_text` 等）に影響を与えない。

#### 3-2. `_generate_prompt_from_description` にルック引数を伝播

`generate_image_prompt_from_scene` → `_generate_prompt_from_description` の呼び出しに `image_look` を追加:

```python
# _generate_prompt_from_description のシグネチャにも image_look を追加
async def _generate_prompt_from_description(
    client,
    description_ja: str | None,
    dialogue: str | None,
    aspect_ratio: str,
    aspect_desc: str,
    image_look: str = "cinematic",       # 追加
) -> tuple[str, str]:
```

#### 3-3. システムプロンプトのルック別分岐

`_generate_prompt_from_description` 内の `system_prompt` 構築部分（L2285-2338）を改修:

**`cinematic` の場合:** 既存の ARRI ルックプロンプトをそのまま使用（後方互換100%）

**それ以外の場合:** ルック別に最適化したシステムプロンプトに切り替え:

```python
LOOK_SYSTEM_INSTRUCTIONS = {
    "cinematic": None,  # None = 既存のARRIルックプロンプトをそのまま使用
    "realistic": (
        "You are an expert commercial photographer. Generate a photorealistic image prompt.\n"
        "Style: Professional photography with natural lighting.\n"
        "Camera: Shot on Canon EOS R5 with RF 50mm f/1.2L.\n"
        "Post-processing: Minimal retouching, natural color grading.\n"
        "Focus on: Sharp details, natural skin tones, realistic textures and materials."
    ),
    "anime": (
        "You are a professional anime art director. Generate an anime-style image prompt.\n"
        "Style: Modern Japanese anime, cel-shaded illustration.\n"
        "Characteristics: Clean outlines, vibrant saturated colors, expressive character design.\n"
        "Background: Detailed painted backgrounds in anime style.\n"
        "Avoid: Photorealistic elements, film grain, camera references."
    ),
    "illustration": (
        "You are a digital illustration art director. Generate a professional illustration prompt.\n"
        "Style: Clean digital artwork with precise linework.\n"
        "Characteristics: Bold colors, well-defined shapes, professional composition.\n"
        "Technique: Digital painting with clean vector-like quality.\n"
        "Avoid: Photorealistic textures, camera references, film effects."
    ),
    "watercolor": (
        "You are a watercolor art director. Generate a watercolor painting prompt.\n"
        "Style: Traditional watercolor with translucent washes.\n"
        "Characteristics: Soft color bleeding, visible paper texture, wet-on-wet effects.\n"
        "Palette: Delicate, luminous colors with white paper showing through.\n"
        "Avoid: Sharp edges, digital effects, camera references."
    ),
    "3d_render": (
        "You are a 3D art director. Generate a 3D rendered image prompt.\n"
        "Style: High-quality 3D CGI, Pixar/Disney aesthetic.\n"
        "Characteristics: Smooth surfaces, subsurface scattering, volumetric lighting.\n"
        "Materials: Clean plastic-like textures, soft shadows, global illumination.\n"
        "Avoid: Photorealistic film grain, camera lens references."
    ),
    "flat_design": (
        "You are a graphic design director. Generate a flat design illustration prompt.\n"
        "Style: Modern flat design, minimal vector art.\n"
        "Characteristics: Bold geometric shapes, limited color palette, no gradients or shadows.\n"
        "Composition: Clean layout with clear visual hierarchy.\n"
        "Avoid: Realistic textures, shadows, 3D effects, camera references."
    ),
    "oil_painting": (
        "You are a classical art director. Generate an oil painting style prompt.\n"
        "Style: Traditional oil painting with rich, layered textures.\n"
        "Characteristics: Visible brushstrokes, warm color palette, chiaroscuro lighting.\n"
        "Technique: Impasto highlights, glazed shadows, classical composition.\n"
        "Avoid: Digital effects, clean lines, camera references."
    ),
}
```

**分岐ロジック:**

```python
look_instruction = LOOK_SYSTEM_INSTRUCTIONS.get(image_look)
if look_instruction is None:
    # cinematic: 既存のARRIルック system_prompt をそのまま使用
    system_prompt = existing_arri_system_prompt  # 既存コードそのまま
else:
    # 非シネマティック: ルック別プロンプトで5段階構造のMain Concept部分を置換
    system_prompt = f"""あなたはプロの広告クリエイティブディレクターです。
{look_instruction}

以下のシーン情報から、画像生成AIに渡す高品質なプロンプトを作成してください。
...（残りの共通指示は既存と同じ）
"""
```

---

### Task 4: バックエンド — Router層 (`router.py`)

**ファイル:** `movie-maker-api/app/videos/router.py`

`generate_scene_image_endpoint`（L4594付近）内の `generate_scene_image()` 呼び出しに `image_look` を追加:

```python
result = await generate_scene_image(
    description_ja=request.description_ja,
    dialogue=request.dialogue,
    aspect_ratio=request.aspect_ratio.value,
    image_provider=request.image_provider.value,
    reference_images=...,
    negative_prompt=request.negative_prompt,
    image_look=request.image_look.value,       # 末尾に追加
)
```

---

### Task 5: フロントエンド — 定数定義 (`image-generation.ts`)

**ファイル:** `movie-maker/lib/constants/image-generation.ts`

#### 5-1. `ImageLook` 型と `IMAGE_LOOKS` 定数配列を追加

既存の `IMAGE_PROVIDERS` セクションの後に追加:

```typescript
// ===== 画像ルック/テイスト =====

export type ImageLook =
  | "realistic"
  | "cinematic"
  | "anime"
  | "illustration"
  | "watercolor"
  | "3d_render"
  | "flat_design"
  | "oil_painting";

export const IMAGE_LOOKS = [
  {
    value: "cinematic" as const,
    label: "シネマティック",
    description: "映画的な質感・ARRI風の色調",
    icon: "🎬",
  },
  {
    value: "realistic" as const,
    label: "実写・フォトリアル",
    description: "自然な写真のような仕上がり",
    icon: "📷",
  },
  {
    value: "anime" as const,
    label: "アニメ",
    description: "日本のアニメスタイル・セル画調",
    icon: "🎨",
  },
  {
    value: "illustration" as const,
    label: "イラスト",
    description: "クリーンなデジタルイラスト",
    icon: "✏️",
  },
  {
    value: "watercolor" as const,
    label: "水彩画",
    description: "透明感のある水彩タッチ",
    icon: "💧",
  },
  {
    value: "3d_render" as const,
    label: "3DCG",
    description: "Pixar風の3Dレンダリング",
    icon: "🧊",
  },
  {
    value: "flat_design" as const,
    label: "フラットデザイン",
    description: "ミニマルなベクターアート",
    icon: "🔲",
  },
  {
    value: "oil_painting" as const,
    label: "油絵",
    description: "古典的な油彩画の質感",
    icon: "🖼️",
  },
] as const;
```

#### 5-2. `GenerateSceneImageRequest` 型に `image_look` を追加（L141-148）

```typescript
export interface GenerateSceneImageRequest {
  dialogue?: string | null;
  description_ja?: string | null;
  aspect_ratio?: "9:16" | "16:9";
  image_provider?: ImageProvider;
  image_look?: ImageLook;              // 追加
  reference_images?: ReferenceImage[] | null;
  negative_prompt?: string | null;
}
```

---

### Task 6: フロントエンド — API Client型同期 (`client.ts`)

**ファイル:** `movie-maker/lib/api/client.ts`

#### 6-1. `GenerateSceneImageRequest` に `image_look` 追加（L1564-1571）

`client.ts` にも同じインターフェースが定義されているため、こちらも同期更新:

```typescript
export interface GenerateSceneImageRequest {
  dialogue?: string;
  description_ja?: string;
  aspect_ratio?: '9:16' | '16:9';
  image_provider?: 'nanobanana' | 'bfl_flux2_pro';
  image_look?: string;                  // 追加
  reference_images?: ReferenceImage[];
  negative_prompt?: string;
}
```

> **注意:** `image-generation.ts` と `client.ts` に `GenerateSceneImageRequest` が二重定義されている。本タスクでは両方を更新する。型の一本化は別タスクで対応。

#### 6-2. `AdCreatorDraftMetadata` に `image_look` 追加（L1513-1529付近）

```typescript
image_look?: string;  // 追加（未設定=cinematic扱い）
```

---

### Task 7: フロントエンド — ルック選択UIコンポーネント (`image-look-selector.tsx`)

**ファイル:** `movie-maker/components/ui/image-look-selector.tsx` (新規作成)

`ImageProviderSelector` のデザインパターンに完全準拠。ラジオボタン形式:

```
┌─────────────────────────────────────┐
│ 画像スタイル                          │
│ ┌─ 🎬 シネマティック ──────────────┐  │
│ │  ◉ 映画的な質感・ARRI風の色調     │  │
│ └────────────────────────────────┘  │
│ ┌─ 📷 実写・フォトリアル ──────────┐  │
│ │  ○ 自然な写真のような仕上がり     │  │
│ └────────────────────────────────┘  │
│ ┌─ 🎨 アニメ ─────────────────────┐  │
│ │  ○ 日本のアニメスタイル・セル画調  │  │
│ └────────────────────────────────┘  │
│       ... (8種類)                    │
└─────────────────────────────────────┘
```

コンポーネント仕様:
- Props: `value: ImageLook`, `onChange: (look: ImageLook) => void`, `disabled?: boolean`, `className?: string`
- 選択状態: `border-[#fce300] bg-[#fce300]/10` (既存UIと統一)
- スクロール可能: 8種類のため `max-h-[280px] overflow-y-auto` を設定
- アイコン表示: 各ルックの `icon` を左端に表示

---

### Task 8: フロントエンド — モーダル組み込み (`scene-image-generator-modal.tsx`)

**ファイル:** `movie-maker/components/video/scene-image-generator-modal.tsx`

#### 8-1. import追加

```typescript
import { ImageLook } from "@/lib/constants/image-generation";
import { ImageLookSelector } from "@/components/ui/image-look-selector";
```

#### 8-2. State追加

```typescript
const [imageLook, setImageLook] = useState<ImageLook>("cinematic");
```

#### 8-3. UI配置

`ImageProviderSelector` の直後に配置:

```tsx
<ImageProviderSelector
  value={imageProvider}
  onChange={handleProviderChange}
  disabled={isGenerating}
/>

<ImageLookSelector
  value={imageLook}
  onChange={setImageLook}
  disabled={isGenerating}
/>
```

#### 8-4. APIリクエスト更新

```typescript
const response = await sceneImageApi.generate({
  description_ja: descriptionJa || undefined,
  dialogue: dialogue || undefined,
  aspect_ratio: aspectRatio,
  image_provider: imageProvider,
  image_look: imageLook,           // 追加
});
```

---

### Task 9: フロントエンド — concat/page.tsx のstate管理とドラフト復元

**ファイル:** `movie-maker/app/concat/page.tsx`

#### 9-1. ドラフト復元時に `image_look` を読み取り

ドラフト読み込みロジック（`useEffect` 内でドラフトをフェッチする部分）で:

```typescript
// ドラフトからimage_lookを復元（旧ドラフトはnull → "cinematic"にフォールバック）
const restoredImageLook = draft.image_look ?? "cinematic";
```

> **注意:** `SceneImageGeneratorModal` が内部stateで `imageLook` を管理する設計（Task 8-2）のため、`concat/page.tsx` 側で持つのはドラフトの保存/復元用のstateのみ。モーダルを開くたびにデフォルト or 前回値を渡すかは、Task 8 のモーダルprops設計で決定する。

#### 9-2. `useAutoSaveAdCreatorDraft` にgetter提供

```typescript
useAutoSaveAdCreatorDraft({
  // ...既存のgetter群
  getImageLook: () => imageLookRef.current,  // 追加
});
```

---

### Task 10: フロントエンド — 自動保存Hook更新 (`use-auto-save-ad-creator-draft.ts`)

**ファイル:** `movie-maker/lib/hooks/use-auto-save-ad-creator-draft.ts`

#### 10-1. Options型に `getImageLook` 追加

```typescript
interface UseAutoSaveAdCreatorDraftOptions {
  // ...既存フィールド
  getImageLook?: () => string | null;  // 追加
}
```

#### 10-2. `buildDraftMetadata()` に `image_look` を含める（L101-121付近）

```typescript
const buildDraftMetadata = (): AdCreatorDraftMetadata => ({
  // ...既存フィールド
  image_look: options.getImageLook?.() ?? null,  // 追加
});
```

---

## タスク依存関係と実行順序

```
 ┌─────────── バックエンド ──────────┐   ┌─────────── フロントエンド ──────────┐
 │                                   │   │                                     │
 │  Task 1 (Schema: Enum+Field)      │   │  Task 5 (定数: ImageLook型)          │
 │       ↓                           │   │       ↓                             │
 │  Task 2 (Service: ルック反映)      │   │  Task 6 (client.ts: API型同期)       │
 │       ↓                           │   │       ↓                             │
 │  Task 3 (Gemini: プロンプト分岐)   │   │  Task 7 (UIコンポーネント作成)       │
 │       ↓                           │   │       ↓                             │
 │  Task 4 (Router: パラメータ追加)   │   │  Task 8 (モーダル組み込み)           │
 │                                   │   │       ↓                             │
 └───────────────────────────────────┘   │  Task 9 (concat/page: state管理)    │
                                         │       ↓                             │
                                         │  Task 10 (自動保存Hook更新)          │
                                         └─────────────────────────────────────┘
```

**並列実行:**
- バックエンド（Task 1→2→3→4）とフロントエンド（Task 5→6→7→8→9→10）は **並列実行可能**
- ただしAPI契約（`image_look` フィールド名 + Enum値）を先に確定させること

**推奨実行順序:**
1. Task 1 → Task 2 + 3 + 4（バックエンド完了）
2. Task 5 → Task 6 → Task 7 → Task 8 → Task 9 + 10（フロントエンド完了）
3. 結合テスト

---

## 後方互換性

| 項目 | 対応 |
|------|------|
| BEデフォルト値 | `ImageLook.CINEMATIC` = 現在のARRIルック挙動そのまま |
| APIリクエスト | `image_look` はオプション（未指定時 Pydantic default = `cinematic`） |
| 既存ドラフト (BE) | `AdCreatorDraftMetadata.image_look` は `None` デフォルト → 保存時に影響なし |
| 既存ドラフト (FE) | 復元時 `draft.image_look ?? "cinematic"` でフォールバック |
| `schema_version` | 変更なし（`None` デフォルトで旧ドラフト互換が保証される） |
| 既存の `generate_image_from_text` | 変更なし（スコープ外）。既存の挙動を維持 |
| Geminiプロンプト | `cinematic` 選択時は既存のARRIプロンプトを100%再利用 |
| パラメータ順序 | すべて既存パラメータの **末尾に追加**。既存呼び出し元に影響なし |

---

## テスト観点

### バックエンド

| # | テスト内容 | 対象 |
|---|-----------|------|
| 1 | `ImageLook` Enumの全値バリデーション | `schemas.py` |
| 2 | `image_look` 未指定時にデフォルト `cinematic` が適用されること | `schemas.py` |
| 3 | 不正な `image_look` 値でバリデーションエラーになること | `schemas.py` |
| 4 | nanobanana × 各ルックで `generate_image_prompt_from_scene` にルックが伝播すること | `service.py` |
| 5 | bfl_flux2_pro × 各ルックでプロンプトにスタイルプレフィックスが付与されること | `service.py` |
| 6 | `cinematic` 選択時に既存のARRIプロンプトと同一の出力になること | `gemini_client.py` |
| 7 | 非cinematicルック時にARRI参照が含まれないこと | `gemini_client.py` |

### フロントエンド

| # | テスト内容 | 対象 |
|---|-----------|------|
| 8 | `ImageLookSelector` の選択状態が正しく表示されること | コンポーネント |
| 9 | `disabled` 時にクリック不可であること | コンポーネント |
| 10 | APIリクエストに `image_look` が含まれること | モーダル |
| 11 | ドラフト保存に `image_look` が含まれること | 自動保存Hook |
| 12 | 旧ドラフト（`image_look` なし）復元時に `cinematic` にフォールバックすること | concat/page |

### 結合テスト

| # | テスト内容 |
|---|-----------|
| 13 | 8種類すべてのルックで画像が正常に生成されること（nanobanana） |
| 14 | 8種類すべてのルックで画像が正常に生成されること（bfl_flux2_pro） |
| 15 | ルック選択 → 画像生成 → ドラフト保存 → リロード → ルック復元の一連フロー |

---

## リスクと軽減策

| リスク | 影響度 | 軽減策 |
|--------|--------|--------|
| 非cinematicルックのプロンプト品質が低い | 中 | まずcinematic/realistic/animeの3種で検証。品質が低ければプロンプトを調整 |
| Geminiが非写実系ルックの指示を無視する | 中 | BFL FLUX.2 をプライマリ推奨にするか、ルック別にプロバイダー推奨を表示 |
| UIが縦長すぎる（8選択肢） | 低 | `max-h-[280px] overflow-y-auto` で制限 |
