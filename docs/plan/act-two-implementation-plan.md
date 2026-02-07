# Runway Act-Two API 実装計画書

## 概要

アニメーション画像からの動画生成において、Runway Act-Two APIを導入し、パフォーマンス動画ベースの精密な動き制御を実現する。

### 目的

- キャラクターの不自然な動き（首360°回転、指消失等）を解消
- テキストプロンプトでは制御困難な動きを、パフォーマンス動画で精密に制御
- アニメーションスタイル選択時の品質向上

### スコープ

- **Phase 1**: シーン生成（1カット）での導入（本計画書）
- **Phase 2**: ストーリーモードへの拡張（別途計画）

---

## 前提条件

### モーション動画の準備

以下の基本モーション動画を事前に撮影・アップロードする必要がある。

| カテゴリ | モーションID | 説明 | 推奨秒数 |
|----------|-------------|------|----------|
| 表情 | `smile_gentle` | 穏やかな笑顔 | 3-5秒 |
| 表情 | `smile_laugh` | 笑う | 3-5秒 |
| 表情 | `surprised` | 驚き | 3-5秒 |
| ジェスチャー | `wave_hand` | 手を振る | 3-5秒 |
| ジェスチャー | `nod_yes` | 頷く | 3-5秒 |
| ジェスチャー | `shake_head_no` | 首を横に振る | 3-5秒 |
| アクション | `turn_around` | 振り返る | 5秒 |
| アクション | `thinking` | 考えるポーズ | 5秒 |
| 会話 | `talking_calm` | 落ち着いて話す | 5-10秒 |
| 会話 | `talking_excited` | 興奮して話す | 5-10秒 |

**撮影要件**:
- 顔が常にフレーム内に収まること
- 明るい環境で撮影
- 背景はシンプルな単色推奨
- 解像度: 720p以上
- フォーマット: MP4

**保存先**: Cloudflare R2 `motions/` ディレクトリ

---

## データベースマイグレーション

> **実行者**: Claude（Supabase MCP使用）
> **対象プロジェクト**: `qhwgvahnccpqudxtnvat`（sawanori's Project）

### 必要なマイグレーション

#### Migration 1: storyboard_scenesテーブルへのAct-Two用カラム追加

```sql
-- Act-Two機能用カラムを追加
ALTER TABLE storyboard_scenes
ADD COLUMN use_act_two boolean DEFAULT false,
ADD COLUMN motion_type text,
ADD COLUMN expression_intensity integer DEFAULT 3 CHECK (expression_intensity >= 1 AND expression_intensity <= 5),
ADD COLUMN body_control boolean DEFAULT true;

-- motion_typeのバリデーション
ALTER TABLE storyboard_scenes
ADD CONSTRAINT storyboard_scenes_motion_type_check
CHECK (motion_type IS NULL OR motion_type = ANY (ARRAY[
  'smile_gentle', 'smile_laugh', 'surprised',
  'wave_hand', 'nod_yes', 'shake_head_no',
  'turn_around', 'thinking',
  'talking_calm', 'talking_excited'
]));

-- use_act_twoがtrueの場合、motion_typeが必須
ALTER TABLE storyboard_scenes
ADD CONSTRAINT storyboard_scenes_act_two_motion_required
CHECK (use_act_two = false OR motion_type IS NOT NULL);

COMMENT ON COLUMN storyboard_scenes.use_act_two IS 'Act-Twoモードを使用するか（true=Act-Two、false=Gen-4）';
COMMENT ON COLUMN storyboard_scenes.motion_type IS 'Act-Two用モーションタイプ（smile_gentle, wave_hand等）';
COMMENT ON COLUMN storyboard_scenes.expression_intensity IS 'Act-Two表情強度（1-5、デフォルト3）';
COMMENT ON COLUMN storyboard_scenes.body_control IS 'Act-Twoボディモーション転写（デフォルトtrue）';
```

#### Migration 2: video_generationsテーブルへのAct-Two用カラム追加（シーン生成用）

```sql
-- シーン生成（1カット）用のAct-Twoカラム追加
ALTER TABLE video_generations
ADD COLUMN use_act_two boolean DEFAULT false,
ADD COLUMN motion_type text,
ADD COLUMN expression_intensity integer DEFAULT 3 CHECK (expression_intensity >= 1 AND expression_intensity <= 5),
ADD COLUMN body_control boolean DEFAULT true;

-- motion_typeのバリデーション
ALTER TABLE video_generations
ADD CONSTRAINT video_generations_motion_type_check
CHECK (motion_type IS NULL OR motion_type = ANY (ARRAY[
  'smile_gentle', 'smile_laugh', 'surprised',
  'wave_hand', 'nod_yes', 'shake_head_no',
  'turn_around', 'thinking',
  'talking_calm', 'talking_excited'
]));

COMMENT ON COLUMN video_generations.use_act_two IS 'Act-Twoモードを使用するか';
COMMENT ON COLUMN video_generations.motion_type IS 'Act-Two用モーションタイプ';
COMMENT ON COLUMN video_generations.expression_intensity IS 'Act-Two表情強度（1-5）';
COMMENT ON COLUMN video_generations.body_control IS 'Act-Twoボディモーション転写';
```

### マイグレーション実行タイミング

Step 1（スキーマ拡張）の実装前に、Claudeが Supabase MCP の `apply_migration` ツールを使用してマイグレーションを実行する。

---

## アーキテクチャ

### 現在のフロー（Gen-4）

```
画像 + 日本語説明 → Gemini → テキストプロンプト → Gen-4 API → 動画
```

### Act-Two フロー

```
画像 + モーション選択 → Act-Two API → 動画
         ↓
  R2からモーション動画URL取得
```

### API エンドポイント

| 現在 | Act-Two |
|------|---------|
| `POST /v1/image_to_video` | `POST /v1/character_performance` |
| model: `gen4_turbo` | model: `act_two` |

---

## 実装ステップ

### Step 1: スキーマ拡張

**ファイル**: `app/videos/schemas.py`

```python
from enum import Enum

class MotionType(str, Enum):
    """Act-Two用モーションタイプ"""
    # 表情系
    SMILE_GENTLE = "smile_gentle"
    SMILE_LAUGH = "smile_laugh"
    SURPRISED = "surprised"
    # ジェスチャー系
    WAVE_HAND = "wave_hand"
    NOD_YES = "nod_yes"
    SHAKE_HEAD_NO = "shake_head_no"
    # アクション系
    TURN_AROUND = "turn_around"
    THINKING = "thinking"
    # 会話系
    TALKING_CALM = "talking_calm"
    TALKING_EXCITED = "talking_excited"


class TranslateStoryPromptRequest(BaseModel):
    # 既存フィールド
    description_ja: str
    video_provider: VideoProvider = VideoProvider.RUNWAY
    subject_type: SubjectType = SubjectType.PERSON
    animation_category: Optional[AnimationCategory] = None
    animation_template: Optional[AnimationTemplateId] = None

    # Act-Two用フィールド（新規）
    use_act_two: bool = False
    motion_type: Optional[MotionType] = None
    expression_intensity: int = 3  # 1-5
    body_control: bool = True

    @model_validator(mode='after')
    def validate_act_two_params(self):
        if self.use_act_two:
            if self.video_provider != VideoProvider.RUNWAY:
                raise ValueError("Act-Two is only available with Runway provider")
            if self.subject_type != SubjectType.ANIMATION:
                raise ValueError("Act-Two is only available with animation subject type")
            if self.motion_type is None:
                raise ValueError("motion_type is required when use_act_two is True")
        return self
```

---

### Step 2: モーション動画URL管理

**ファイル**: `app/external/motion_library.py`（新規作成）

```python
"""
Act-Two用モーションライブラリ管理
"""
from app.core.config import settings

# R2のモーション動画ベースURL
MOTION_BASE_URL = f"https://{settings.R2_PUBLIC_DOMAIN}/motions"

# モーションID → ファイル名マッピング
MOTION_FILES = {
    "smile_gentle": "expressions/smile_gentle.mp4",
    "smile_laugh": "expressions/smile_laugh.mp4",
    "surprised": "expressions/surprised.mp4",
    "wave_hand": "gestures/wave_hand.mp4",
    "nod_yes": "gestures/nod_yes.mp4",
    "shake_head_no": "gestures/shake_head_no.mp4",
    "turn_around": "actions/turn_around.mp4",
    "thinking": "actions/thinking.mp4",
    "talking_calm": "speaking/talking_calm.mp4",
    "talking_excited": "speaking/talking_excited.mp4",
}

def get_motion_url(motion_type: str) -> str:
    """モーションタイプからURLを取得"""
    filename = MOTION_FILES.get(motion_type)
    if not filename:
        raise ValueError(f"Unknown motion type: {motion_type}")
    return f"{MOTION_BASE_URL}/{filename}"
```

---

### Step 3: RunwayProvider拡張

**ファイル**: `app/external/runway_provider.py`

```python
async def generate_video_act_two(
    self,
    image_url: str,
    motion_url: str,
    expression_intensity: int = 3,
    body_control: bool = True,
    aspect_ratio: str = "9:16",
) -> str:
    """
    Runway Act-Two API でキャラクターパフォーマンス動画を生成

    Args:
        image_url: キャラクター画像URL
        motion_url: パフォーマンス動画URL
        expression_intensity: 表情の強度（1-5）
        body_control: ボディモーション転写の有効化
        aspect_ratio: アスペクト比

    Returns:
        str: タスクID
    """
    try:
        ratio = self._convert_aspect_ratio(aspect_ratio)

        request_body = {
            "model": "act_two",
            "character": {
                "type": "image",
                "uri": image_url,
            },
            "reference": {
                "type": "video",
                "uri": motion_url,
            },
            "ratio": ratio,
            "expressionIntensity": expression_intensity,
            "bodyControl": body_control,
        }

        logger.info(f"Act-Two request: {request_body}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RUNWAY_API_BASE}/v1/character_performance",
                headers=self._get_headers(),
                json=request_body,
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()

            task_id = result.get("id")
            if task_id:
                logger.info(f"Act-Two task created: {task_id}")
                return task_id

            raise VideoProviderError("Act-Two APIからタスクIDが返されませんでした")

    except httpx.HTTPStatusError as e:
        logger.error(f"Act-Two HTTP error: {e.response.status_code} - {e.response.text}")
        raise VideoProviderError(f"Act-Two API エラー: {e.response.status_code}")
    except Exception as e:
        logger.exception(f"Act-Two generation failed: {e}")
        raise VideoProviderError(f"Act-Two動画生成に失敗しました: {str(e)}")
```

---

### Step 4: サービス層の分岐処理

**ファイル**: `app/videos/service.py`

```python
from app.external.motion_library import get_motion_url

async def generate_scene_video(
    image_url: str,
    request: TranslateStoryPromptRequest,
    ...
) -> str:
    """シーン動画生成"""

    provider = get_video_provider(request.video_provider)

    # Act-Two使用時
    if request.use_act_two and isinstance(provider, RunwayProvider):
        motion_url = get_motion_url(request.motion_type.value)
        task_id = await provider.generate_video_act_two(
            image_url=image_url,
            motion_url=motion_url,
            expression_intensity=request.expression_intensity,
            body_control=request.body_control,
            aspect_ratio=request.aspect_ratio,
        )
        return task_id

    # 従来のGen-4フロー
    else:
        prompt = await translate_scene_prompt(request)
        task_id = await provider.generate_video(
            image_url=image_url,
            prompt=prompt,
            ...
        )
        return task_id
```

---

### Step 5: APIエンドポイント更新

**ファイル**: `app/videos/router.py`

既存の `/api/v1/videos/translate-scene` エンドポイントは変更不要。
スキーマ拡張により `use_act_two`, `motion_type` パラメータを受け取れるようになる。

新規エンドポイント追加（モーション一覧取得用）:

```python
@router.get("/motions", response_model=list[dict])
async def list_available_motions():
    """利用可能なモーション一覧を取得"""
    return [
        {
            "id": "smile_gentle",
            "category": "expression",
            "name_ja": "穏やかな笑顔",
            "name_en": "Gentle Smile",
            "duration_seconds": 3,
        },
        # ... 他のモーション
    ]
```

---

### Step 6: フロントエンド対応

**ファイル**: `movie-maker/app/generate/[id]/page.tsx`

```tsx
// アニメーション選択時にAct-Twoオプションを表示
{subjectType === 'animation' && videoProvider === 'runway' && (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <Switch
        checked={useActTwo}
        onCheckedChange={setUseActTwo}
      />
      <Label>Act-Twoモードを使用（精密な動き制御）</Label>
    </div>

    {useActTwo && (
      <>
        <Select value={motionType} onValueChange={setMotionType}>
          <SelectTrigger>
            <SelectValue placeholder="モーションを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>表情</SelectLabel>
              <SelectItem value="smile_gentle">穏やかな笑顔</SelectItem>
              <SelectItem value="smile_laugh">笑う</SelectItem>
              <SelectItem value="surprised">驚き</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>ジェスチャー</SelectLabel>
              <SelectItem value="wave_hand">手を振る</SelectItem>
              <SelectItem value="nod_yes">頷く</SelectItem>
              <SelectItem value="turn_around">振り返る</SelectItem>
            </SelectGroup>
            {/* ... */}
          </SelectContent>
        </Select>

        <Slider
          label="表情の強度"
          min={1}
          max={5}
          value={expressionIntensity}
          onChange={setExpressionIntensity}
        />
      </>
    )}
  </div>
)}
```

---

## テスト計画

### ユニットテスト

**ファイル**: `tests/test_act_two.py`

```python
class TestMotionLibrary:
    """モーションライブラリのテスト"""

    def test_get_motion_url_valid(self):
        url = get_motion_url("smile_gentle")
        assert "motions/expressions/smile_gentle.mp4" in url

    def test_get_motion_url_invalid(self):
        with pytest.raises(ValueError):
            get_motion_url("invalid_motion")

    def test_all_motion_types_have_files(self):
        for motion in MotionType:
            url = get_motion_url(motion.value)
            assert url is not None


class TestActTwoSchema:
    """Act-Twoスキーマのテスト"""

    def test_act_two_requires_runway(self):
        with pytest.raises(ValidationError):
            TranslateStoryPromptRequest(
                description_ja="テスト",
                use_act_two=True,
                motion_type=MotionType.SMILE_GENTLE,
                video_provider=VideoProvider.VEO,  # NG
                subject_type=SubjectType.ANIMATION,
            )

    def test_act_two_requires_animation(self):
        with pytest.raises(ValidationError):
            TranslateStoryPromptRequest(
                description_ja="テスト",
                use_act_two=True,
                motion_type=MotionType.SMILE_GENTLE,
                video_provider=VideoProvider.RUNWAY,
                subject_type=SubjectType.PERSON,  # NG
            )

    def test_act_two_requires_motion_type(self):
        with pytest.raises(ValidationError):
            TranslateStoryPromptRequest(
                description_ja="テスト",
                use_act_two=True,
                motion_type=None,  # NG
                video_provider=VideoProvider.RUNWAY,
                subject_type=SubjectType.ANIMATION,
            )

    def test_act_two_valid_request(self):
        request = TranslateStoryPromptRequest(
            description_ja="キャラクターが笑う",
            use_act_two=True,
            motion_type=MotionType.SMILE_GENTLE,
            video_provider=VideoProvider.RUNWAY,
            subject_type=SubjectType.ANIMATION,
            animation_category=AnimationCategory.TWO_D,
            animation_template=AnimationTemplateId.A_1,
        )
        assert request.use_act_two is True


class TestRunwayActTwo:
    """RunwayProvider Act-Twoメソッドのテスト"""

    @pytest.mark.asyncio
    async def test_generate_video_act_two_success(self, mocker):
        # モック設定
        mock_response = {"id": "act_two_task_123"}
        mocker.patch("httpx.AsyncClient.post", return_value=MockResponse(mock_response))

        provider = RunwayProvider()
        task_id = await provider.generate_video_act_two(
            image_url="https://example.com/character.png",
            motion_url="https://example.com/motion.mp4",
        )
        assert task_id == "act_two_task_123"
```

### 統合テスト

```python
class TestActTwoIntegration:
    """Act-Two統合テスト（実際のAPIを使用）"""

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_end_to_end_act_two_generation(self):
        # 実際のモーション動画とテスト画像を使用
        # 注意: API課金が発生する
        pass
```

---

## 実装スケジュール

| ステップ | 内容 | 実行者 | 見積もり |
|----------|------|--------|----------|
| 0 | モーション動画撮影・R2アップロード | ユーザー | 事前準備 |
| 1 | **DBマイグレーション実行** | **Claude（Supabase MCP）** | 10分 |
| 2 | スキーマ拡張（MotionType等） | Claude | 30分 |
| 3 | motion_library.py作成 | Claude | 20分 |
| 4 | RunwayProvider.generate_video_act_two実装 | Claude | 45分 |
| 5 | サービス層の分岐処理 | Claude | 30分 |
| 6 | APIエンドポイント更新 | Claude | 20分 |
| 7 | ユニットテスト作成・実行 | Claude | 45分 |
| 8 | フロントエンド対応 | Claude | 60分 |
| 9 | 統合テスト・動作確認 | Claude | 30分 |

**合計**: 約4-5時間（モーション動画準備除く）

### Step 1: DBマイグレーション詳細

Claudeが以下のコマンドで実行:

```
mcp__supabase__apply_migration(
  project_id="qhwgvahnccpqudxtnvat",
  name="add_act_two_columns",
  query="..."  # 上記マイグレーションSQL
)
```

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| Act-Two APIの品質がアニメキャラに合わない | 高 | 事前に数パターンで検証 |
| モーション動画の品質が不十分 | 中 | 撮影ガイドライン策定、複数テイク |
| APIレート制限 | 低 | 既存のリトライ機構を活用 |
| モーション動画のストレージコスト | 低 | 初期は10本程度で小規模 |

---

## 成功基準

- [ ] 全10種類のモーションでAct-Two動画生成が成功する
- [ ] 首360°回転、指消失などの不自然な動きが発生しない
- [ ] 既存のGen-4フローに影響を与えない（回帰テストパス）
- [ ] フロントエンドからAct-Twoモードを選択・使用できる

---

## 備考

### モーション動画撮影のコツ

1. **顔を常にフレーム内に** - Act-Twoは顔認識が必須
2. **動きは大げさに** - 控えめな動きは転写されにくい
3. **背景はシンプルに** - 無地の壁が理想的
4. **照明は均一に** - 顔に影ができないように
5. **カメラは固定** - 三脚使用推奨

### Phase 2 への拡張ポイント

- Geminiによる最適モーション自動選択
- 複数シーン間のモーション連続性
- カスタムモーション動画アップロード機能
