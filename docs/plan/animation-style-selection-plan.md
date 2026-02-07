# アニメーションスタイル選択機能 実装計画書

## 概要

画像アップロード時の被写体タイプ選択に「アニメーション」オプションを追加し、2D/3Dカテゴリおよび詳細なスタイルテンプレートを選択可能にする機能。

---

## 現状分析

### 現在のフロー

```
画像アップロード
    ↓
被写体タイプ選択
    ├── 人物 (person) → docs/prompt/scene/person/runway_api_template.md
    └── 物体 (object) → docs/prompt/scene/object/runway_api_template.md
    ↓
プロンプト翻訳API（テンプレート適用）
    ↓
動画生成
```

### 関連ファイル

| ファイル | 役割 |
|----------|------|
| `movie-maker/app/generate/story/page.tsx` | フロントエンドUI（被写体タイプ選択） |
| `movie-maker/lib/api/client.ts` | APIクライアント |
| `movie-maker-api/app/videos/schemas.py` | リクエスト/レスポンススキーマ |
| `movie-maker-api/app/videos/router.py` | APIエンドポイント |
| `movie-maker-api/app/external/gemini_client.py` | プロンプト翻訳・テンプレート読込 |

---

## 新規フロー設計

### UI階層構造

```
被写体タイプ選択
├── 👤 人物 (person)
│       └── [従来通り]
├── 📦 物体 (object)
│       └── [従来通り]
└── 🎨 アニメーション (animation) ← NEW
        ├── [2D] 2Dアニメーション
        │     ├── A-1: Modern TV Anime（モダン・TVアニメ風）
        │     ├── A-2: Ghibli Style（ジブリ風）
        │     ├── A-3: 90s Retro Cel（90年代レトロ）
        │     └── A-4: Flat Design（ゆるキャラ・フラット）
        │
        └── [3D] 3Dアニメーション
              ├── B-1: Photorealistic（フォトリアル）
              ├── B-2: Game UE5 Style（ゲーム・UE5風）
              ├── B-3: Pixar Style（ピクサー風）
              └── B-4: Low Poly PS1（PS1風レトロ）
```

### データフロー

```
[Frontend]
subjectType: 'animation'
animationCategory: '2d'
animationTemplate: 'A-1'
        ↓
[API Request]
POST /videos/translate-story-prompt
{
  "description_ja": "...",
  "subject_type": "animation",
  "animation_category": "2d",
  "animation_template": "A-1",
  "video_provider": "runway"
}
        ↓
[Backend]
テンプレート読込: docs/prompt/scene/anime/2d/A-1_modern_tv_anime.md
キーワード抽出: "modern anime style, sharp cel-shading, ..."
        ↓
[Gemini API]
プロンプト翻訳時にスタイルキーワードを付加
        ↓
[Response]
{
  "english_prompt": "... modern anime style, sharp cel-shading, digital line art, ..."
}
```

---

## 実装詳細

### Phase 1: フロントエンド実装

#### 1.1 型定義の拡張

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
// 既存
export type SubjectType = 'person' | 'object';

// 新規
export type SubjectType = 'person' | 'object' | 'animation';
export type AnimationCategory = '2d' | '3d';
export type AnimationTemplate =
  | 'A-1' | 'A-2' | 'A-3' | 'A-4'  // 2D templates
  | 'B-1' | 'B-2' | 'B-3' | 'B-4'; // 3D templates
```

#### 1.2 State追加

**ファイル**: `movie-maker/app/generate/story/page.tsx`

```typescript
// 既存
const [subjectType, setSubjectType] = useState<'person' | 'object'>('person');

// 新規（追加）
const [subjectType, setSubjectType] = useState<'person' | 'object' | 'animation'>('person');
const [animationCategory, setAnimationCategory] = useState<'2d' | '3d' | null>(null);
const [animationTemplate, setAnimationTemplate] = useState<string | null>(null);
```

#### 1.3 テンプレート定義データ

**ファイル**: `movie-maker/lib/constants/animation-templates.ts`（新規作成）

```typescript
export const ANIMATION_TEMPLATES = {
  '2d': [
    {
      id: 'A-1',
      name: 'Modern TV Anime',
      nameJa: 'モダン・TVアニメ風',
      description: '現代的なTVアニメスタイル。シャープな線と鮮やかな色彩。',
      icon: '📺',
    },
    {
      id: 'A-2',
      name: 'Ghibli Style',
      nameJa: 'ジブリ風',
      description: '手書きの温かみと豊かな自然描写。水彩画のような柔らかさ。',
      icon: '🌿',
    },
    {
      id: 'A-3',
      name: '90s Retro Cel',
      nameJa: '90年代レトロ',
      description: 'セル画特有のスタイル。VHSノイズとフィルムグレイン。',
      icon: '📼',
    },
    {
      id: 'A-4',
      name: 'Flat Design',
      nameJa: 'ゆるキャラ・フラット',
      description: 'シンプルで親しみやすいスタイル。説明動画やPR向け。',
      icon: '🎯',
    },
  ],
  '3d': [
    {
      id: 'B-1',
      name: 'Photorealistic',
      nameJa: 'フォトリアル',
      description: '実写と見分けがつかない写実性。映画VFX品質。',
      icon: '🎬',
    },
    {
      id: 'B-2',
      name: 'Game UE5 Style',
      nameJa: 'ゲーム・UE5風',
      description: 'AAA級ゲームのビジュアル。レイトレーシングと動的な影。',
      icon: '🎮',
    },
    {
      id: 'B-3',
      name: 'Pixar Style',
      nameJa: 'ピクサー風',
      description: 'ディズニー/ピクサーの親しみやすいデフォルメスタイル。',
      icon: '✨',
    },
    {
      id: 'B-4',
      name: 'Low Poly PS1',
      nameJa: 'PS1風レトロ',
      description: 'PS1/N64時代のローポリスタイル。ノスタルジックな3D。',
      icon: '👾',
    },
  ],
} as const;

export type AnimationCategory = keyof typeof ANIMATION_TEMPLATES;
export type AnimationTemplateId =
  | typeof ANIMATION_TEMPLATES['2d'][number]['id']
  | typeof ANIMATION_TEMPLATES['3d'][number]['id'];
```

#### 1.4 UI実装

**ファイル**: `movie-maker/app/generate/story/page.tsx`

```tsx
{/* 被写体タイプ選択 */}
{imageUrl && (
  <div className="mt-6">
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
      被写体タイプ
    </label>

    {/* 第1階層: person / object / animation */}
    <div className="flex gap-4 justify-center">
      <SubjectTypeButton
        type="person"
        icon={<User />}
        label="人物"
        sublabel="ポートレート向け"
        selected={subjectType === 'person'}
        onClick={() => {
          setSubjectType('person');
          setAnimationCategory(null);
          setAnimationTemplate(null);
        }}
      />
      <SubjectTypeButton
        type="object"
        icon={<Package />}
        label="物体"
        sublabel="料理・商品向け"
        selected={subjectType === 'object'}
        onClick={() => {
          setSubjectType('object');
          setAnimationCategory(null);
          setAnimationTemplate(null);
        }}
      />
      <SubjectTypeButton
        type="animation"
        icon={<Palette />}  // lucide-react
        label="アニメーション"
        sublabel="2D/3Dスタイル"
        selected={subjectType === 'animation'}
        onClick={() => setSubjectType('animation')}
      />
    </div>

    {/* 第2階層: 2D / 3D（animation選択時のみ表示） */}
    {subjectType === 'animation' && (
      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
          カテゴリを選択
        </label>
        <div className="flex gap-3 justify-center">
          <CategoryButton
            category="2d"
            label="2D アニメーション"
            selected={animationCategory === '2d'}
            onClick={() => {
              setAnimationCategory('2d');
              setAnimationTemplate(null);
            }}
          />
          <CategoryButton
            category="3d"
            label="3D アニメーション"
            selected={animationCategory === '3d'}
            onClick={() => {
              setAnimationCategory('3d');
              setAnimationTemplate(null);
            }}
          />
        </div>
      </div>
    )}

    {/* 第3階層: スタイルテンプレート選択 */}
    {subjectType === 'animation' && animationCategory && (
      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
          スタイルを選択
        </label>
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {ANIMATION_TEMPLATES[animationCategory].map((template) => (
            <TemplateButton
              key={template.id}
              template={template}
              selected={animationTemplate === template.id}
              onClick={() => setAnimationTemplate(template.id)}
            />
          ))}
        </div>
      </div>
    )}
  </div>
)}
```

#### 1.5 API呼び出し修正

**ファイル**: `movie-maker/app/generate/story/page.tsx`

```typescript
// プロンプト翻訳時
const res = await videosApi.translateStoryPrompt({
  description_ja: japanesePrompt,
  video_provider: videoProvider,
  subject_type: subjectType,
  // animation選択時のみ追加パラメータを送信
  ...(subjectType === 'animation' && animationCategory && animationTemplate && {
    animation_category: animationCategory,
    animation_template: animationTemplate,
  }),
  camera_work: cameraPromptText,
});
```

---

### Phase 2: バックエンド実装

#### 2.1 Enum/スキーマ拡張

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
from enum import Enum

class SubjectType(str, Enum):
    PERSON = "person"
    OBJECT = "object"
    ANIMATION = "animation"  # 追加

class AnimationCategory(str, Enum):
    TWO_D = "2d"
    THREE_D = "3d"

class AnimationTemplate(str, Enum):
    # 2D Templates
    A1 = "A-1"
    A2 = "A-2"
    A3 = "A-3"
    A4 = "A-4"
    # 3D Templates
    B1 = "B-1"
    B2 = "B-2"
    B3 = "B-3"
    B4 = "B-4"

class TranslateStoryPromptRequest(BaseModel):
    description_ja: str = Field(..., min_length=1, max_length=500)
    video_provider: VideoProvider = Field(default=VideoProvider.RUNWAY)
    subject_type: SubjectType = Field(default=SubjectType.PERSON)
    # 新規追加（animation選択時のみ使用）
    animation_category: AnimationCategory | None = Field(
        default=None,
        description="アニメーションカテゴリ（2d/3d）- subject_type=animation時に必須"
    )
    animation_template: AnimationTemplate | None = Field(
        default=None,
        description="アニメーションテンプレートID（A-1〜B-4）- subject_type=animation時に必須"
    )
    camera_work: str | None = Field(default=None)

    @model_validator(mode='after')
    def validate_animation_fields(self) -> 'TranslateStoryPromptRequest':
        if self.subject_type == SubjectType.ANIMATION:
            if not self.animation_category:
                raise ValueError("animation_category is required when subject_type is 'animation'")
            if not self.animation_template:
                raise ValueError("animation_template is required when subject_type is 'animation'")
        return self
```

#### 2.2 テンプレート読込の拡張

**ファイル**: `movie-maker-api/app/external/gemini_client.py`

```python
# テンプレートファイル名マッピング
ANIMATION_TEMPLATE_FILES = {
    "A-1": "A-1_modern_tv_anime.md",
    "A-2": "A-2_ghibli_style.md",
    "A-3": "A-3_90s_retro.md",
    "A-4": "A-4_flat_design.md",
    "B-1": "B-1_photorealistic.md",
    "B-2": "B-2_game_ue5.md",
    "B-3": "B-3_pixar_style.md",
    "B-4": "B-4_low_poly_ps1.md",
}

def load_prompt_template(
    provider: str,
    mode: str = "story",
    subject_type: str | None = None,
    animation_category: str | None = None,
    animation_template: str | None = None,
) -> dict:
    """
    動画生成プロバイダーとモードに応じたプロンプトテンプレートを読み込む

    Args:
        provider: "runway" または "veo"
        mode: "story" または "scene"
        subject_type: "person", "object", または "animation"
        animation_category: "2d" または "3d"（animation時のみ）
        animation_template: "A-1"〜"B-4"（animation時のみ）
    """
    if mode not in ("story", "scene"):
        mode = "story"

    # animationモードの場合、専用ディレクトリからテンプレートを読み込む
    if subject_type == "animation" and animation_category and animation_template:
        template_dir = PROJECT_ROOT / "docs" / "prompt" / "anime" / animation_category
        template_filename = ANIMATION_TEMPLATE_FILES.get(animation_template)
        if template_filename:
            template_path = template_dir / template_filename
            return load_animation_template(template_path)

    # 従来の処理（person/object）
    if mode == "scene" and subject_type in ("person", "object"):
        template_dir = PROJECT_ROOT / "docs" / "prompt" / mode / subject_type
    else:
        template_dir = PROJECT_ROOT / "docs" / "prompt" / mode

    # ... 既存の処理 ...


def load_animation_template(template_path: Path) -> dict:
    """
    アニメーションスタイルテンプレートを読み込み、構造化データとして返す

    Returns:
        dict: {
            "style_keywords": str,      # キーワードセクションの内容
            "prompt_template": str,     # プロンプトテンプレート
            "negative_keywords": str,   # ネガティブキーワード
            "reference_rule": str,      # 参照画像のルール
        }
    """
    result = {
        "style_keywords": "",
        "prompt_template": "",
        "negative_keywords": "",
        "reference_rule": "",
    }

    if not template_path.exists():
        logger.warning(f"Animation template not found: {template_path}")
        return result

    content = template_path.read_text(encoding="utf-8")

    # ## キーワード セクションを抽出
    keywords_match = re.search(
        r"## キーワード\s*\n+`([^`]+(?:`[^`]*`[^`]*)*)`",
        content
    )
    if keywords_match:
        # バッククォートで囲まれたキーワードを抽出してカンマ区切りに
        keywords_section = content[keywords_match.start():keywords_match.end()]
        keywords = re.findall(r"`([^`]+)`", keywords_section)
        result["style_keywords"] = ", ".join(keywords)

    # ## プロンプトテンプレート セクションを抽出
    template_match = re.search(
        r"## プロンプトテンプレート\s*\n+```\n?([\s\S]*?)```",
        content
    )
    if template_match:
        result["prompt_template"] = template_match.group(1).strip()

    # ## ネガティブキーワード セクションを抽出
    negative_match = re.search(
        r"## ネガティブキーワード[^\n]*\n+```\n?([\s\S]*?)```",
        content
    )
    if negative_match:
        result["negative_keywords"] = negative_match.group(1).strip()

    logger.info(f"Loaded animation template: {template_path.name}")
    return result
```

#### 2.3 プロンプト翻訳処理の修正

**ファイル**: `movie-maker-api/app/external/gemini_client.py`

```python
async def translate_scene_to_prompt(
    description_ja: str,
    scene_number: int,
    base_image_context: str | None = None,
    video_provider: str = "runway",
    scene_act: str | None = None,
    template_mode: str = "story",
    subject_type: str | None = None,
    animation_category: str | None = None,
    animation_template: str | None = None,
    camera_work: str | None = None,
) -> str:
    """
    日本語のシーン説明をAPI用の英語プロンプトに変換
    """
    client = get_gemini_client()

    # テンプレート読み込み
    template = load_prompt_template(
        video_provider,
        mode=template_mode,
        subject_type=subject_type,
        animation_category=animation_category,
        animation_template=animation_template,
    )

    # アニメーションスタイルの場合、スタイルキーワードをプロンプトに追加
    style_suffix = ""
    if subject_type == "animation" and template.get("style_keywords"):
        style_suffix = f"\n\nStyle keywords to append: {template['style_keywords']}"

    # Gemini APIへのプロンプト構築
    system_prompt = f"""
You are a professional prompt engineer for {provider_name} video generation API.
Convert the Japanese scene description to an optimized English prompt.

{template.get('reference_rule', '')}
{template.get('clip_specific_template', '')}
{style_suffix}

IMPORTANT: If style keywords are provided, append them to the end of the generated prompt.
"""

    # ... 残りの処理 ...
```

#### 2.4 APIエンドポイント修正

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
@router.post("/translate-story-prompt", response_model=TranslateStoryPromptResponse)
async def translate_story_prompt(
    request: TranslateStoryPromptRequest,
    current_user: User = Depends(get_current_user),
):
    """日本語のシーン説明を英語プロンプトに翻訳"""
    try:
        english_prompt = await translate_scene_to_prompt(
            description_ja=request.description_ja,
            scene_number=1,
            video_provider=request.video_provider.value,
            scene_act=None,
            template_mode="scene",
            subject_type=request.subject_type.value,
            # 新規追加
            animation_category=request.animation_category.value if request.animation_category else None,
            animation_template=request.animation_template.value if request.animation_template else None,
            camera_work=request.camera_work,
        )
        return TranslateStoryPromptResponse(english_prompt=english_prompt)
    except Exception as e:
        logger.exception(f"Story prompt translation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

---

### Phase 3: テスト実施

---

#### 3.1 バックエンドユニットテスト

**ファイル**: `movie-maker-api/tests/videos/test_animation_template.py`（新規作成）

```python
import pytest
from app.external.gemini_client import load_animation_template, load_prompt_template
from pathlib import Path

class TestAnimationTemplateLoading:
    """アニメーションテンプレート読み込みテスト"""

    def test_load_2d_template_a1(self):
        """A-1 Modern TV Anime テンプレートが正しく読み込まれる"""
        template = load_prompt_template(
            provider="runway",
            mode="scene",
            subject_type="animation",
            animation_category="2d",
            animation_template="A-1",
        )
        assert "modern anime style" in template["style_keywords"]
        assert "sharp cel-shading" in template["style_keywords"]

    def test_load_3d_template_b1(self):
        """B-1 Photorealistic テンプレートが正しく読み込まれる"""
        template = load_prompt_template(
            provider="runway",
            mode="scene",
            subject_type="animation",
            animation_category="3d",
            animation_template="B-1",
        )
        assert "photorealistic" in template["style_keywords"]
        assert "cinematic lighting" in template["style_keywords"]

    def test_all_templates_exist(self):
        """全8テンプレートが存在することを確認"""
        templates = [
            ("2d", "A-1"), ("2d", "A-2"), ("2d", "A-3"), ("2d", "A-4"),
            ("3d", "B-1"), ("3d", "B-2"), ("3d", "B-3"), ("3d", "B-4"),
        ]
        for category, template_id in templates:
            template = load_prompt_template(
                provider="runway",
                mode="scene",
                subject_type="animation",
                animation_category=category,
                animation_template=template_id,
            )
            assert template["style_keywords"], f"Template {template_id} has no keywords"

    def test_template_has_no_scene_description(self):
        """テンプレートにシーン/キャラクター描写が含まれていないことを確認"""
        forbidden_keywords = ["background", "character", "girl", "boy", "man", "woman"]
        templates = [
            ("2d", "A-1"), ("2d", "A-2"), ("2d", "A-3"), ("2d", "A-4"),
            ("3d", "B-1"), ("3d", "B-2"), ("3d", "B-3"), ("3d", "B-4"),
        ]
        for category, template_id in templates:
            template = load_prompt_template(
                provider="runway",
                mode="scene",
                subject_type="animation",
                animation_category=category,
                animation_template=template_id,
            )
            keywords_lower = template["style_keywords"].lower()
            for forbidden in forbidden_keywords:
                assert forbidden not in keywords_lower, \
                    f"Template {template_id} contains forbidden keyword: {forbidden}"


class TestTranslateStoryPromptEndpoint:
    """翻訳APIエンドポイントテスト"""

    @pytest.mark.asyncio
    async def test_animation_prompt_translation(self, client, auth_headers):
        """アニメーションスタイルでのプロンプト翻訳"""
        response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "少女が夕焼けの中を歩いている",
                "subject_type": "animation",
                "animation_category": "2d",
                "animation_template": "A-2",
                "video_provider": "runway",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Ghibliスタイルのキーワードが含まれていることを確認
        assert "ghibli" in data["english_prompt"].lower() or "hand-drawn" in data["english_prompt"].lower()

    def test_validation_error_missing_category(self, client, auth_headers):
        """animation選択時にcategoryが必須"""
        response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "テスト",
                "subject_type": "animation",
                # animation_category missing
                "animation_template": "A-1",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_validation_error_missing_template(self, client, auth_headers):
        """animation選択時にtemplateが必須"""
        response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "テスト",
                "subject_type": "animation",
                "animation_category": "2d",
                # animation_template missing
            },
            headers=auth_headers,
        )
        assert response.status_code == 422
```

---

#### 3.2 回帰テスト（既存機能）

**目的**: 既存の`person`/`object`機能が壊れていないことを確認

```python
class TestRegressionExistingSubjectTypes:
    """既存被写体タイプの回帰テスト"""

    def test_person_type_still_works(self, client, auth_headers):
        """person タイプが従来通り動作する"""
        response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "女性が微笑んでいる",
                "subject_type": "person",
                "video_provider": "runway",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["english_prompt"]) > 0

    def test_object_type_still_works(self, client, auth_headers):
        """object タイプが従来通り動作する"""
        response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "美味しそうなラーメン",
                "subject_type": "object",
                "video_provider": "runway",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["english_prompt"]) > 0

    def test_person_does_not_include_animation_keywords(self, client, auth_headers):
        """person タイプにアニメーションキーワードが混入しない"""
        response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "男性が歩いている",
                "subject_type": "person",
                "video_provider": "runway",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        prompt_lower = data["english_prompt"].lower()
        # アニメスタイルキーワードが含まれていないこと
        assert "cel-shading" not in prompt_lower
        assert "ghibli" not in prompt_lower
        assert "pixar" not in prompt_lower
```

---

#### 3.3 統合テスト（E2E）

**ファイル**: `movie-maker-api/tests/e2e/test_animation_flow.py`（新規作成）

```python
import pytest

class TestAnimationE2EFlow:
    """アニメーションスタイル選択のE2Eテスト"""

    @pytest.mark.asyncio
    async def test_full_flow_2d_ghibli(self, client, auth_headers, test_image_url):
        """2D Ghibliスタイルの完全フロー"""
        # Step 1: 画像アップロード（既存のtest_image_urlを使用）

        # Step 2: プロンプト翻訳
        translate_response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "風に揺れる草原を歩いている",
                "subject_type": "animation",
                "animation_category": "2d",
                "animation_template": "A-2",
                "video_provider": "runway",
            },
            headers=auth_headers,
        )
        assert translate_response.status_code == 200
        prompt = translate_response.json()["english_prompt"]

        # Step 3: プロンプトにスタイルキーワードが含まれることを確認
        assert any(kw in prompt.lower() for kw in ["ghibli", "hand-drawn", "watercolor"])

        # Step 4: 動画生成リクエスト（モック）
        # 実際の動画生成はコストがかかるためスキップまたはモック

    @pytest.mark.asyncio
    async def test_full_flow_3d_ue5(self, client, auth_headers, test_image_url):
        """3D UE5スタイルの完全フロー"""
        translate_response = client.post(
            "/videos/translate-story-prompt",
            json={
                "description_ja": "剣を構えて敵を睨んでいる",
                "subject_type": "animation",
                "animation_category": "3d",
                "animation_template": "B-2",
                "video_provider": "runway",
            },
            headers=auth_headers,
        )
        assert translate_response.status_code == 200
        prompt = translate_response.json()["english_prompt"]

        # UE5スタイルキーワードが含まれることを確認
        assert any(kw in prompt.lower() for kw in ["unreal", "ray tracing", "dynamic shadows"])
```

---

#### 3.4 フロントエンドテスト

##### 3.4.1 手動テストチェックリスト

| # | テストケース | 手順 | 期待結果 | 結果 |
|---|--------------|------|----------|------|
| 1 | 初期状態確認 | ページを開く | 「人物」がデフォルト選択されている | [ ] |
| 2 | 人物選択 | 「人物」をクリック | animation関連UIは非表示 | [ ] |
| 3 | 物体選択 | 「物体」をクリック | animation関連UIは非表示 | [ ] |
| 4 | アニメーション選択 | 「アニメーション」をクリック | 2D/3D選択UIが表示される | [ ] |
| 5 | 2D選択 | 「2D」をクリック | A-1〜A-4のカードが表示される | [ ] |
| 6 | 3D選択 | 「3D」をクリック | B-1〜B-4のカードが表示される | [ ] |
| 7 | テンプレート選択 | A-2をクリック | A-2が選択状態になる | [ ] |
| 8 | カテゴリ切替 | 2D選択後に3Dをクリック | テンプレート選択がリセットされる | [ ] |
| 9 | タイプ切替 | animation選択後にpersonをクリック | category/templateがリセットされる | [ ] |
| 10 | 翻訳実行 | テンプレート選択後に翻訳ボタン | スタイルキーワードがプロンプトに含まれる | [ ] |
| 11 | 未選択エラー | animation選択、template未選択で翻訳 | エラーメッセージ表示 | [ ] |

##### 3.4.2 レスポンシブテスト

| デバイス | 画面幅 | 確認項目 |
|----------|--------|----------|
| Desktop | 1920px | 3カラムでボタン表示 |
| Tablet | 768px | 2カラムでテンプレート表示 |
| Mobile | 375px | 1カラムで縦積み表示 |

---

#### 3.5 出力品質テスト（動画生成後）

**目的**: 生成された動画がスタイルテンプレートに従っているか視覚確認

| テンプレート | 入力画像 | 確認ポイント |
|--------------|----------|--------------|
| A-1 Modern TV | アニメキャラ画像 | シャープな線、高コントラストの影 |
| A-2 Ghibli | 自然の風景画像 | 柔らかい質感、水彩風の色彩 |
| A-3 90s Retro | サイバーパンク画像 | フィルムグレイン、VHS風ノイズ |
| A-4 Flat Design | シンプルなイラスト | 太い線、ベタ塗り、滑らかな動き |
| B-1 Photorealistic | 実写風CG | 肌の質感、自然な照明 |
| B-2 UE5 | ゲームキャラ画像 | レイトレ反射、動的な影 |
| B-3 Pixar | 3Dキャラ画像 | 柔らかい質感、豊かな表情 |
| B-4 PS1 | ローポリキャラ | カクカクした動き、固定カメラ |

**評価基準**:
- ✅ 期待通りのスタイルが反映されている
- ⚠️ 一部スタイルが適用されているが不完全
- ❌ スタイルが反映されていない / 画像と競合している

---

#### 3.6 テスト実施スケジュール

| Phase | テスト種別 | 担当 | 所要時間 |
|-------|-----------|------|----------|
| 実装中 | ユニットテスト (3.1) | 開発者 | 1h |
| 実装中 | 回帰テスト (3.2) | 開発者 | 0.5h |
| 実装後 | 統合テスト (3.3) | 開発者 | 1h |
| 実装後 | 手動テスト (3.4) | 開発者/QA | 1h |
| リリース前 | 出力品質テスト (3.5) | 開発者 | 2h |
| **合計** | | | **5.5h** |

---

#### 3.7 テスト完了基準

- [ ] 全ユニットテストがパス（pytest）
- [ ] 回帰テストで既存機能に影響なし
- [ ] 手動テストチェックリスト全項目クリア
- [ ] 全8テンプレートで動画生成し、スタイル反映を確認
- [ ] モバイル/タブレットでのUI表示確認

---

## 実装タスク一覧

### フロントエンド

| # | タスク | ファイル | 工数 |
|---|--------|----------|------|
| F1 | 定数ファイル作成（ANIMATION_TEMPLATES） | `lib/constants/animation-templates.ts` | 0.5h |
| F2 | State追加（animationCategory, animationTemplate） | `app/generate/story/page.tsx` | 0.5h |
| F3 | 第1階層UI（アニメーションボタン追加） | `app/generate/story/page.tsx` | 0.5h |
| F4 | 第2階層UI（2D/3D選択） | `app/generate/story/page.tsx` | 1h |
| F5 | 第3階層UI（テンプレート選択グリッド） | `app/generate/story/page.tsx` | 1.5h |
| F6 | API呼び出し修正 | `app/generate/story/page.tsx` | 0.5h |
| F7 | APIクライアント型定義更新 | `lib/api/client.ts` | 0.5h |

### バックエンド

| # | タスク | ファイル | 工数 |
|---|--------|----------|------|
| B1 | Enum追加（AnimationCategory, AnimationTemplate） | `app/videos/schemas.py` | 0.5h |
| B2 | リクエストスキーマ拡張 + バリデーション | `app/videos/schemas.py` | 0.5h |
| B3 | テンプレート読込関数の拡張 | `app/external/gemini_client.py` | 1.5h |
| B4 | プロンプト翻訳処理の修正 | `app/external/gemini_client.py` | 1h |
| B5 | APIエンドポイント修正 | `app/videos/router.py` | 0.5h |
| B6 | ユニットテスト作成 | `tests/videos/test_animation_template.py` | 1h |

### テスト

| # | タスク | ファイル | 工数 |
|---|--------|----------|------|
| T1 | ユニットテスト実行・修正 | `tests/videos/test_animation_template.py` | 0.5h |
| T2 | 回帰テスト作成・実行 | `tests/videos/test_animation_template.py` | 0.5h |
| T3 | E2Eテスト作成 | `tests/e2e/test_animation_flow.py` | 1h |
| T4 | 手動テスト実施（チェックリスト） | - | 1h |
| T5 | レスポンシブテスト実施 | - | 0.5h |
| T6 | 出力品質テスト（全8テンプレート） | - | 2h |

---

## UI/UXデザイン案

### 第1階層（被写体タイプ）

```
┌─────────────────────────────────────────────────────────┐
│  被写体タイプ                                            │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐             │
│  │  👤     │  │  📦     │  │  🎨        │             │
│  │  人物   │  │  物体   │  │ アニメーション│             │
│  │ポートレート│  │料理・商品│  │ 2D/3Dスタイル │             │
│  └─────────┘  └─────────┘  └─────────────┘             │
│                              ↑ 選択中                   │
└─────────────────────────────────────────────────────────┘
```

### 第2階層（カテゴリ選択）

```
┌─────────────────────────────────────────────────────────┐
│  カテゴリを選択                                          │
│                                                         │
│       ┌────────────────┐  ┌────────────────┐           │
│       │ 2D アニメーション │  │ 3D アニメーション │           │
│       │    選択中       │  │                │           │
│       └────────────────┘  └────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

### 第3階層（スタイル選択）

```
┌─────────────────────────────────────────────────────────┐
│  スタイルを選択                                          │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ 📺 A-1           │  │ 🌿 A-2           │            │
│  │ Modern TV Anime  │  │ Ghibli Style     │            │
│  │ モダン・TVアニメ風  │  │ ジブリ風          │            │
│  │ ✓ 選択中         │  │                  │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ 📼 A-3           │  │ 🎯 A-4           │            │
│  │ 90s Retro Cel    │  │ Flat Design      │            │
│  │ 90年代レトロ       │  │ ゆるキャラ・フラット │            │
│  └──────────────────┘  └──────────────────┘            │
└─────────────────────────────────────────────────────────┘
```

---

## リスク・考慮事項

### 1. 既存機能への影響

- **リスク**: `subject_type` のEnum拡張によるデータ互換性
- **対策**: バックエンドでデフォルト値を維持し、新パラメータはオプショナルに

### 2. テンプレートキーワードの品質

- **リスク**: キーワードがプロンプトに適切に反映されない可能性
- **対策**: Geminiへのシステムプロンプトを調整し、キーワードの付加ルールを明確化

### 3. UI複雑性

- **リスク**: 3階層の選択UIがユーザーに分かりにくい
- **対策**: アコーディオン形式ではなく、選択に応じた段階的表示で直感的に

---

## 今後の拡張案

1. **カスタムテンプレート**: ユーザーが独自のスタイルキーワードを保存
2. **プレビュー画像**: 各テンプレートのサンプル画像をUIに表示
3. **お気に入り**: よく使うテンプレートをピン留め
4. **テンプレート追加**: C-1〜などの新スタイルを追加可能な設計

---

## スケジュール

| Phase | 内容 | 工数 |
|-------|------|------|
| Phase 1 | フロントエンド実装（F1〜F7） | 5h |
| Phase 2 | バックエンド実装（B1〜B6） | 5h |
| Phase 3 | テスト実施（T1〜T6） | 5.5h |
| Phase 4 | バグ修正・調整 | 1.5h |
| **合計** | | **17h（約2日）** |

### 実施フロー

```
Day 1（8h）
├── Phase 1: フロントエンド実装 (5h)
│   ├── F1-F3: 定数・State・第1階層UI (1.5h)
│   ├── F4-F5: 第2階層・第3階層UI (2.5h)
│   └── F6-F7: API連携 (1h)
└── Phase 2: バックエンド実装 (3h)
    ├── B1-B2: スキーマ拡張 (1h)
    └── B3: テンプレート読込 (2h)

Day 2（9h）
├── Phase 2: バックエンド実装続き (2h)
│   ├── B4: プロンプト翻訳 (1h)
│   ├── B5: エンドポイント (0.5h)
│   └── B6: テスト作成 (0.5h)
├── Phase 3: テスト実施 (5.5h)
│   ├── T1-T3: 自動テスト (2h)
│   ├── T4-T5: 手動テスト (1.5h)
│   └── T6: 出力品質テスト (2h)
└── Phase 4: バグ修正・調整 (1.5h)
```

---

## 承認

- [ ] 実装着手承認
- [ ] UI/UXデザイン承認
- [ ] テスト計画承認
- [ ] テスト完了確認
