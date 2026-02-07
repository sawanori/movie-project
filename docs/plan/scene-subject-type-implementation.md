# シーン生成 被写体タイプ別プロンプト 実装計画書

## 概要

シーン動画生成（1シーンのみ）において、被写体のタイプ（人物/物体）に応じて最適化されたプロンプトテンプレートを使用する機能を実装する。

## 設計方針

**「既存パターンを踏襲」を最優先**

- story/scene分割と同じパターンで実装
- 既存コードへの影響を最小限に
- 新規追加のみで実装し、ロールバックを容易にする

## 工数見積もり

| 作業内容 | 工数 | 難易度 |
|---------|------|--------|
| ディレクトリ構造・テンプレート作成 | 0.5h | 低 |
| バックエンド: スキーマ追加 | 0.3h | 低 |
| バックエンド: load_prompt_template更新 | 0.3h | 低 |
| バックエンド: 翻訳エンドポイント更新 | 0.3h | 低 |
| フロントエンド: Step 1にUI追加 | 0.5h | 低 |
| フロントエンド: APIクライアント更新 | 0.2h | 低 |
| テスト・動作確認 | 0.3h | - |
| **合計** | **2〜2.5時間** | **低** |

## ディレクトリ構造

### 変更前
```
docs/prompt/
├── story/
│   ├── runway_api_template.md
│   └── veo_api_template.md
└── scene/
    ├── runway_api_template.md      ← 削除
    └── veo_api_template.md         ← 削除
```

### 変更後
```
docs/prompt/
├── story/
│   ├── runway_api_template.md
│   └── veo_api_template.md
└── scene/
    ├── person/                      # 人物用（ポートレート、表情、動作重視）
    │   ├── runway_api_template.md
    │   └── veo_api_template.md
    └── object/                      # 物体用（料理、商品、風景など）
        ├── runway_api_template.md
        └── veo_api_template.md
```

## 被写体タイプ別の最適化ポイント

### Person（人物）
- **重視**: 表情の変化、目線、微細な動き
- **カメラ**: ポートレート向け（85mm相当、浅いDOF）
- **ライティング**: 肌のトーン、リムライト
- **動き**: 髪の揺れ、服の動き、表情の変化
- **注意**: 顔の歪み防止、自然な肌色

### Object（物体）
- **重視**: 質感、ディテール、光の反射
- **カメラ**: マクロ/プロダクト向け（50mm相当、テクスチャ重視）
- **ライティング**: テクスチャを引き立てる方向性のある光
- **動き**: 蒸気、光の変化、回転、ズーム
- **注意**: 色の正確さ、シャープネス

## 実装詳細

### Phase 1: ディレクトリ・テンプレート作成

#### 1.1 ディレクトリ作成
```bash
mkdir -p docs/prompt/scene/person
mkdir -p docs/prompt/scene/object
mv docs/prompt/scene/runway_api_template.md docs/prompt/scene/person/
mv docs/prompt/scene/veo_api_template.md docs/prompt/scene/person/
```

#### 1.2 Person用テンプレート（既存を調整）

`docs/prompt/scene/person/runway_api_template.md`:
```markdown
# Runway シーン動画用プロンプト・テンプレ（人物・ポートレート）

## 使い方
- 入力：**1枚の人物画像**
- 目的：**人物の魅力・表情・動きを引き出す5秒動画**
- 重視：表情の変化、自然な動き、ポートレートの美しさ

---

## TEXT PROMPT
SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the subject's identity, facial features, outfit, and expression.
Focus on subtle, natural movements that enhance the portrait quality.

CLIP SPECIFIC (edit only this block):
Scene: [WHERE + WHEN + ATMOS]
Subject: [WHO + OUTFIT + POSE]
Expression: [EMOTION + MICRO-EXPRESSION]
Camera: [PORTRAIT LENS (85mm look) + FRAMING + SUBTLE MOVE]
Lighting: [KEY LIGHT + RIM/FILL + SKIN TONE]
Motion focus: [HAIR/FABRIC MOVEMENT + EXPRESSION CHANGE]
Final note: Prioritize natural skin tones, avoid face distortion, subtle motion only.

---

## NEGATIVE PROMPT
warped faces, distorted features, unnatural skin, extra fingers, deformed hands,
extreme expressions, robotic movement, plastic skin texture,
readable text, logos, extreme bloom, crushed blacks
```

#### 1.3 Object用テンプレート（新規作成）

`docs/prompt/scene/object/runway_api_template.md`:
```markdown
# Runway シーン動画用プロンプト・テンプレ（物体・プロダクト）

## 使い方
- 入力：**1枚の物体/料理/風景画像**
- 目的：**物体の質感・ディテール・魅力を引き出す5秒動画**
- 重視：テクスチャ、光の反射、蒸気や動きの演出

---

## TEXT PROMPT
SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the object's texture, color accuracy, and key visual details.
Focus on movements that enhance the product/food appeal.

CLIP SPECIFIC (edit only this block):
Scene: [WHERE + LIGHTING SETUP + ATMOS]
Subject: [OBJECT + KEY DETAILS + ARRANGEMENT]
Texture focus: [MATERIAL QUALITY + SURFACE DETAIL]
Camera: [PRODUCT LENS (50mm macro look) + ANGLE + MOVE]
Lighting: [DIRECTIONAL LIGHT + HIGHLIGHTS + SHADOWS]
Motion focus: [STEAM/SMOKE + LIGHT SHIFT + SUBTLE ROTATION]
Final note: Emphasize texture and appetizing/premium quality, smooth motion.

---

## NEGATIVE PROMPT
blurry texture, color shift, unnatural reflections, distorted shapes,
readable text, logos, fingerprints, dust particles,
extreme bloom, crushed blacks, overexposed highlights
```

### Phase 2: バックエンド

#### 2.1 スキーマ追加 (`app/videos/schemas.py`)

```python
from enum import Enum

class SubjectType(str, Enum):
    PERSON = "person"
    OBJECT = "object"

# TranslateStoryPromptRequestを更新
class TranslateStoryPromptRequest(BaseModel):
    """シーン動画用の日本語→英語翻訳リクエスト"""
    description_ja: str = Field(..., min_length=1, max_length=500, description="日本語のシーン説明")
    video_provider: VideoProvider = Field(
        default=VideoProvider.RUNWAY,
        description="動画生成プロバイダー（テンプレート選択用）"
    )
    subject_type: SubjectType = Field(
        default=SubjectType.PERSON,
        description="被写体タイプ（person=人物, object=物体）"
    )
```

#### 2.2 load_prompt_template更新 (`app/external/gemini_client.py`)

```python
def load_prompt_template(
    provider: str,
    mode: str = "story",
    subject_type: str | None = None
) -> dict:
    """
    動画生成プロバイダーとモードに応じたプロンプトテンプレートを読み込む

    Args:
        provider: "runway" または "veo"
        mode: "story" または "scene"
        subject_type: "person" または "object"（sceneモード時のみ使用）
    """
    if mode not in ("story", "scene"):
        mode = "story"

    # sceneモードの場合、subject_typeに応じたサブディレクトリを使用
    if mode == "scene" and subject_type in ("person", "object"):
        template_dir = PROJECT_ROOT / "docs" / "prompt" / mode / subject_type
    else:
        template_dir = PROJECT_ROOT / "docs" / "prompt" / mode

    # ... 以下既存のロジック
```

#### 2.3 translate_scene_to_runway_prompt更新

```python
async def translate_scene_to_runway_prompt(
    description_ja: str,
    scene_number: int,
    base_image_context: str | None = None,
    video_provider: str = "runway",
    scene_act: str | None = None,
    template_mode: str = "story",
    subject_type: str | None = None,  # 追加
) -> str:
    # ...
    template = load_prompt_template(
        video_provider,
        mode=template_mode,
        subject_type=subject_type
    )
```

#### 2.4 翻訳エンドポイント更新 (`app/videos/router.py`)

```python
@router.post("/story/translate", response_model=TranslateStoryPromptResponse)
async def translate_story_prompt(
    request: TranslateStoryPromptRequest,
    current_user: dict = Depends(get_current_user),
):
    english_prompt = await translate_scene_to_runway_prompt(
        description_ja=request.description_ja,
        scene_number=1,
        video_provider=request.video_provider.value,
        scene_act=None,
        template_mode="scene",
        subject_type=request.subject_type.value,  # 追加
    )
    return TranslateStoryPromptResponse(english_prompt=english_prompt)
```

### Phase 3: フロントエンド

#### 3.1 State追加 (`app/generate/story/page.tsx`)

```typescript
const [subjectType, setSubjectType] = useState<'person' | 'object'>('person');
```

#### 3.2 Step 1にUI追加

```tsx
{/* 被写体タイプ選択 */}
{imageUrl && (
  <div className="mt-6">
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
      被写体タイプ
    </label>
    <div className="flex gap-4 justify-center">
      <button
        type="button"
        onClick={() => setSubjectType('person')}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
          subjectType === 'person'
            ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
        )}
      >
        <User className="h-6 w-6" />
        <div className="text-center">
          <p className="text-sm font-medium">人物</p>
          <p className="text-xs text-zinc-500">ポートレート向け</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => setSubjectType('object')}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors min-w-[120px]",
          subjectType === 'object'
            ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
        )}
      >
        <Package className="h-6 w-6" />
        <div className="text-center">
          <p className="text-sm font-medium">物体</p>
          <p className="text-xs text-zinc-500">料理・商品向け</p>
        </div>
      </button>
    </div>
  </div>
)}
```

#### 3.3 APIクライアント更新 (`lib/api/client.ts`)

```typescript
translateStoryPrompt: (data: {
  description_ja: string;
  video_provider?: 'runway' | 'veo';
  subject_type?: 'person' | 'object';  // 追加
}): Promise<{ english_prompt: string }> =>
  fetchWithAuth("/api/v1/videos/story/translate", {
    method: "POST",
    body: JSON.stringify(data),
  }),
```

#### 3.4 翻訳処理更新

```typescript
const handleTranslate = async () => {
  if (!japanesePrompt) return;

  setTranslating(true);
  try {
    const res = await videosApi.translateStoryPrompt({
      description_ja: japanesePrompt,
      video_provider: videoProvider,
      subject_type: subjectType,  // 追加
    });
    setEnglishPrompt(res.english_prompt);
  } catch (error) {
    // ...
  }
};
```

## UI/UXフロー

```
Step 1: 画像アップロード
┌─────────────────────────────────────────────────────────┐
│  1. 物語の始まりとなる画像をアップロード                 │
│                                                         │
│  [画像アップロードエリア]                               │
│                                                         │
│  被写体タイプ:                         ← 新規追加       │
│  ┌─────────┐  ┌─────────┐                              │
│  │  👤     │  │  📦     │                              │
│  │  人物   │  │  物体   │                              │
│  │(ポート │  │(料理・  │                              │
│  │ レート)│  │ 商品)   │                              │
│  └─────────┘  └─────────┘                              │
│                                                         │
│  アスペクト比:                                          │
│  ┌─────────┐  ┌─────────┐                              │
│  │  9:16   │  │  16:9   │                              │
│  └─────────┘  └─────────┘                              │
│                                                         │
│  動画生成エンジン:                                      │
│  ┌─────────┐  ┌─────────┐                              │
│  │ Runway  │  │   Veo   │                              │
│  └─────────┘  └─────────┘                              │
└─────────────────────────────────────────────────────────┘
```

## ファイル変更一覧

### 新規作成
| ファイル | 内容 |
|---------|------|
| `docs/prompt/scene/person/runway_api_template.md` | 人物用Runwayテンプレート |
| `docs/prompt/scene/person/veo_api_template.md` | 人物用Veoテンプレート |
| `docs/prompt/scene/object/runway_api_template.md` | 物体用Runwayテンプレート |
| `docs/prompt/scene/object/veo_api_template.md` | 物体用Veoテンプレート |

### 変更
| ファイル | 変更内容 |
|---------|----------|
| `app/videos/schemas.py` | SubjectType enum追加、リクエストにフィールド追加 |
| `app/external/gemini_client.py` | load_prompt_templateにsubject_type引数追加 |
| `app/external/gemini_client.py` | translate_scene_to_runway_promptにsubject_type引数追加 |
| `app/videos/router.py` | 翻訳エンドポイントでsubject_typeを渡す |
| `lib/api/client.ts` | translateStoryPromptにsubject_type追加 |
| `app/generate/story/page.tsx` | Step 1に被写体タイプ選択UI追加 |

### 削除
| ファイル | 理由 |
|---------|------|
| `docs/prompt/scene/runway_api_template.md` | person/に移動 |
| `docs/prompt/scene/veo_api_template.md` | person/に移動 |

## テスト項目

### 機能テスト
- [ ] 人物タイプ選択時、person用テンプレートが適用されること
- [ ] 物体タイプ選択時、object用テンプレートが適用されること
- [ ] Runway/Veo両方で正しいテンプレートが選択されること
- [ ] 翻訳結果に被写体タイプに応じた内容が含まれること

### UIテスト
- [ ] Step 1で被写体タイプ選択ボタンが表示されること
- [ ] 選択状態が正しく表示されること
- [ ] Step 2で選択した被写体タイプが反映されること

### 後方互換性テスト
- [ ] ストーリーボード機能が正常に動作すること（変更なし確認）

## 実装順序

1. ディレクトリ作成・テンプレート配置
2. バックエンド: スキーマにSubjectType追加
3. バックエンド: load_prompt_template更新
4. バックエンド: translate_scene_to_runway_prompt更新
5. バックエンド: 翻訳エンドポイント更新
6. フロントエンド: APIクライアント更新
7. フロントエンド: Step 1にUI追加
8. フロントエンド: 翻訳処理更新
9. テスト・動作確認

---

作成日: 2025-12-27
