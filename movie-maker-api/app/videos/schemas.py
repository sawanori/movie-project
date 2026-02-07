from pydantic import BaseModel, Field, model_validator, validator
from datetime import datetime
from enum import Enum
from typing import Self, Optional, Literal


class VideoStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    GENERATING = "generating"  # 動画生成中
    COMPLETED = "completed"
    FAILED = "failed"


class GenerationMode(str, Enum):
    STORY = "story"    # AI主導ストーリーテリング
    MANUAL = "manual"  # 従来の手動モード


class OverlaySettings(BaseModel):
    """テキストオーバーレイ設定"""
    text: str | None = Field(None, max_length=100, description="オーバーレイテキスト")
    position: str = Field("bottom", description="位置: top, center, bottom")
    font: str = Field("default", description="フォント名")
    color: str = Field("#FFFFFF", description="テキスト色")


class FilmGrainPreset(str, Enum):
    """フィルムグレイン強度プリセット"""
    NONE = "none"          # グレインなし (0%)
    LIGHT = "light"        # 軽め - 料理・風景向け (15%)
    MEDIUM = "medium"      # 標準 (30%)
    HEAVY = "heavy"        # 強め - 人物・ポートレート向け (45%)


class VideoProvider(str, Enum):
    """動画生成プロバイダー"""
    RUNWAY = "runway"      # Runway Gen-4 Turbo（安価・5秒）
    VEO = "veo"            # Google Veo 3.1（高品質・音声付き・8秒）
    DOMOAI = "domoai"      # DomoAI Enterprise（アニメスタイル対応）
    PIAPI_KLING = "piapi_kling"  # Kling AI via PiAPI（高品質・5秒）
    HAILUO = "hailuo"      # HailuoAI (MiniMax)（カメラワーク・6秒）


class VideoMode(str, Enum):
    """動画生成モード"""
    I2V = "i2v"            # Image-to-Video（画像から動画を生成）
    V2V = "v2v"            # Video-to-Video（直前の動画から継続生成）


class ImageProvider(str, Enum):
    """画像生成プロバイダー"""
    NANOBANANA = "nanobanana"      # Nano Banana (Gemini) - 高品質、長文対応
    BFL_FLUX2_PRO = "bfl_flux2_pro"  # BFL FLUX.2 Pro - 最高品質、公式API


class ReferenceImagePurpose(str, Enum):
    """参照画像の用途"""
    CHARACTER = "character"    # キャラクター一貫性（同一人物を維持）
    STYLE = "style"           # スタイル転写（アートスタイルを適用）
    PRODUCT = "product"       # 商品配置（商品の外観を維持）
    CLOTHING = "clothing"     # 服・衣装（服装・衣装のデザインを適用）
    GENERAL = "general"       # 汎用


class ReferenceImage(BaseModel):
    """参照画像"""
    url: str = Field(..., description="参照画像のURL")
    purpose: ReferenceImagePurpose = Field(
        default=ReferenceImagePurpose.GENERAL,
        description="参照画像の用途"
    )


# 各画像プロバイダーの文字数制限（日本語）
IMAGE_PROVIDER_LIMITS: dict[ImageProvider, int] = {
    ImageProvider.NANOBANANA: 50000,
    ImageProvider.BFL_FLUX2_PRO: 10000,  # FLUX.2は長文対応
}

# Flux用: アスペクト比→ピクセル変換
ASPECT_RATIO_TO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (768, 1365),   # 縦長 (width, height)
    "16:9": (1365, 768),   # 横長
}


class KlingMode(str, Enum):
    """Kling AI生成モード"""
    STD = "std"            # Standard（低コスト・標準品質）
    PRO = "pro"            # Professional（高品質・高コスト）


class KlingCameraControl(BaseModel):
    """Kling 6軸カメラコントロール設定"""
    horizontal: int = Field(0, ge=-10, le=10, description="左右移動 (-10〜10)")
    vertical: int = Field(0, ge=-10, le=10, description="前後移動 (-10〜10)")
    pan: int = Field(0, ge=-10, le=10, description="左右回転 (-10〜10)")
    tilt: int = Field(0, ge=-10, le=10, description="上下回転 (-10〜10)")
    roll: int = Field(0, ge=-10, le=10, description="傾き (-10〜10)")
    zoom: int = Field(0, ge=-10, le=10, description="ズーム (-10〜10)")


class ElementImage(BaseModel):
    """Kling Elements用参照画像

    Kling AI の Elements 機能で使用する参照画像。
    複数角度の画像を登録することで、カメラワーク時の被写体一貫性を向上させる。
    """
    image_url: str = Field(..., description="参照画像のURL")


class AspectRatio(str, Enum):
    """アスペクト比"""
    PORTRAIT = "9:16"      # 縦長（デフォルト、ショート動画向け）
    LANDSCAPE = "16:9"     # 横長（YouTube等向け）


class SubjectType(str, Enum):
    """被写体タイプ"""
    PERSON = "person"      # 人物（ポートレート、表情、動作重視）
    OBJECT = "object"      # 物体（料理、商品、風景など、質感重視）
    ANIMATION = "animation"  # アニメーション（2D/3Dスタイル）


class AnimationCategory(str, Enum):
    """アニメーションカテゴリ"""
    TWO_D = "2d"   # 2Dアニメーション（A-1〜A-4）
    THREE_D = "3d"  # 3Dアニメーション（B-1〜B-4）


class AnimationTemplateId(str, Enum):
    """アニメーションテンプレートID"""
    # 2D Templates
    A_1 = "A-1"  # Modern TV Anime（モダン・TVアニメ風）
    A_2 = "A-2"  # Ghibli Style（ジブリ風）
    A_3 = "A-3"  # 90s Retro Cel（90年代レトロ）
    A_4 = "A-4"  # Flat Design（ゆるキャラ・フラット）
    # 3D Templates
    B_1 = "B-1"  # Photorealistic（フォトリアル）
    B_2 = "B-2"  # Game UE5 Style（ゲーム・UE5風）
    B_3 = "B-3"  # Pixar Style（ピクサー風）
    B_4 = "B-4"  # Low Poly PS1（PS1風レトロ）


class MotionType(str, Enum):
    """Act-Two用モーションタイプ"""
    # 表情系
    SMILE_GENTLE = "smile_gentle"      # 穏やかな笑顔
    SMILE_LAUGH = "smile_laugh"        # 笑う
    SURPRISED = "surprised"            # 驚き
    # ジェスチャー系
    WAVE_HAND = "wave_hand"            # 手を振る
    NOD_YES = "nod_yes"                # 頷く
    SHAKE_HEAD_NO = "shake_head_no"    # 首を横に振る
    # アクション系
    TURN_AROUND = "turn_around"        # 振り返る
    THINKING = "thinking"              # 考えるポーズ
    # 会話系
    TALKING_CALM = "talking_calm"      # 落ち着いて話す
    TALKING_EXCITED = "talking_excited" # 興奮して話す


class VideoCreate(BaseModel):
    """動画生成リクエスト"""
    image_urls: list[str] | None = Field(
        None,
        min_length=1,
        max_length=4,
        description="アップロード済み画像のURLリスト（1〜4枚）"
    )
    image_url: str | None = Field(None, description="アップロード済み画像のURL（後方互換）")
    prompt: str = Field(..., min_length=1, max_length=500, description="動画の説明")
    template_id: str | None = Field(None, description="使用するテンプレートID")
    bgm_track_id: str | None = Field(None, description="BGMのID（オプション）")
    overlay: OverlaySettings | None = Field(None, description="オーバーレイ設定")
    target_fps: int = Field(
        default=30,
        ge=24,
        le=60,
        description="出力フレームレート (24, 30, 60)"
    )

    @validator("target_fps")
    def validate_fps(cls, v):
        if v not in [24, 30, 60]:
            raise ValueError("target_fps must be 24, 30, or 60")
        return v

    @model_validator(mode='after')
    def validate_images(self) -> Self:
        """image_urlsまたはimage_urlのいずれかが必要"""
        if not self.image_urls and not self.image_url:
            raise ValueError("Either image_urls or image_url is required")
        # 後方互換: image_urlが指定された場合はimage_urlsに変換
        if self.image_url and not self.image_urls:
            self.image_urls = [self.image_url]
        return self


class VideoResponse(BaseModel):
    """動画生成レスポンス"""
    id: str
    user_id: str
    status: VideoStatus
    progress: int = 0
    image_urls: list[str] = []
    original_image_url: str
    original_image_webp_url: str | None = None
    user_prompt: str
    optimized_prompt: str | None = None
    overlay_text: str | None = None
    overlay_position: str | None = None
    raw_video_url: str | None = None
    final_video_url: str | None = None
    original_video_url: str | None = None  # 60fps変換前の元動画URL（バージョニング用）
    hls_master_url: str | None = None  # HLS adaptive streaming URL
    error_message: str | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    film_grain: str | None = None
    use_lut: bool | None = None
    camera_work: str | None = None
    target_fps: int = 30  # 出力フレームレート（24, 30, 60）

    class Config:
        from_attributes = True


class VideoStatusResponse(BaseModel):
    """動画生成ステータスレスポンス"""
    id: str
    status: VideoStatus
    progress: int
    message: str
    video_url: str | None = None
    expires_at: datetime | None = None


class VideoListResponse(BaseModel):
    """動画一覧レスポンス"""
    videos: list[VideoResponse]
    total: int
    page: int
    per_page: int


# ===== AI主導ストーリーテリング用スキーマ =====

class StorySuggestRequest(BaseModel):
    """ストーリー提案リクエスト"""
    image_url: str = Field(..., description="分析対象の画像URL")


class StorySuggestResponse(BaseModel):
    """ストーリー提案レスポンス"""
    suggestions: list[str] = Field(..., description="AIが提案するストーリー候補（5つ）")


class StoryVideoCreate(BaseModel):
    """ストーリー動画生成リクエスト（AI主導モード）

    シンプル化されたフロー:
    - 単一画像 + ストーリーテキスト + カメラワーク
    - 選択したプロバイダー（Runway/Veo）で動画生成
    """
    image_url: str = Field(..., description="ベースとなる画像URL")
    story_text: str = Field(..., min_length=1, max_length=10000, description="ストーリー文/プロンプト（テンプレート適用後は長くなる）")
    aspect_ratio: AspectRatio = Field(AspectRatio.PORTRAIT, description="アスペクト比（9:16=縦長, 16:9=横長）")
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー（未指定時は環境変数で決定）")
    bgm_track_id: str | None = Field(None, description="プリセットBGMのID（オプション）")
    custom_bgm_url: str | None = Field(None, description="カスタムアップロードBGMのURL（オプション、bgm_track_idより優先）")
    overlay: OverlaySettings | None = Field(None, description="オーバーレイ設定")
    camera_work: str | None = Field(None, description="カメラワーク（例: zoom_in, pan_left, crane_down）")
    film_grain: FilmGrainPreset = Field(FilmGrainPreset.MEDIUM, description="フィルムグレイン強度")
    use_lut: bool = Field(True, description="LUT（カラーグレーディング）を適用するか")
    # Act-Two用フィールド
    use_act_two: bool = Field(default=False, description="Act-Twoモードを使用するか")
    motion_type: str | None = Field(default=None, description="Act-Two用モーションID")
    expression_intensity: int = Field(default=5, ge=1, le=5, description="Act-Two表情強度（1-5）")
    body_control: bool = Field(default=True, description="Act-Twoボディモーション転写")
    # Kling AI用フィールド
    kling_mode: KlingMode | None = Field(default=None, description="Kling AIモード（std: 標準, pro: 高品質）")
    end_frame_image_url: str | None = Field(default=None, description="終了フレーム画像URL（Kling専用、2枚目の画像で遷移動画を生成）")
    element_images: list[ElementImage] | None = Field(
        default=None,
        max_length=3,
        description="一貫性向上用の追加画像（最大3枚）。Kling専用機能"
    )
    kling_camera_control: KlingCameraControl | None = Field(
        default=None,
        description="Kling 6軸カメラコントロール（camera_workより優先）"
    )
    # V2V用フィールド
    video_mode: Optional[str] = Field("i2v", description="動画生成モード: 'i2v' or 'v2v'")
    source_video_url: Optional[str] = Field(None, description="V2V参照動画URL")
    subject_type: Optional[str] = Field("person", description="被写体タイプ: 'person', 'animal', 'object', etc.")

    @model_validator(mode='after')
    def validate_kling_only_features(self) -> Self:
        """Kling専用機能のバリデーション"""
        if self.element_images:
            if self.video_provider and self.video_provider != VideoProvider.PIAPI_KLING:
                raise ValueError("Elements機能はKlingプロバイダーのみ対応しています")
        return self


class StoryVideoResponse(BaseModel):
    """ストーリー動画生成レスポンス"""
    id: str
    user_id: str
    status: VideoStatus
    progress: int = 0
    generation_mode: GenerationMode = GenerationMode.STORY
    original_image_url: str
    story_text: str
    aspect_ratio: str | None = None
    video_provider: str | None = None
    camera_work: str | None = None
    film_grain: str | None = None
    use_lut: bool | None = None
    bgm_track_id: str | None = None
    custom_bgm_url: str | None = None
    final_video_url: str | None = None
    error_message: str | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


# ===== シーン動画プロンプト翻訳用スキーマ =====

class TranslateStoryPromptRequest(BaseModel):
    """シーン動画用の日本語→英語翻訳リクエスト"""
    description_ja: str = Field(..., min_length=1, max_length=500, description="日本語のシーン説明")
    video_provider: VideoProvider = Field(
        default=VideoProvider.RUNWAY,
        description="動画生成プロバイダー（テンプレート選択用）"
    )
    subject_type: SubjectType = Field(
        default=SubjectType.PERSON,
        description="被写体タイプ（person=人物, object=物体, animation=アニメーション）"
    )
    camera_work: str | None = Field(
        default=None,
        description="ユーザー選択のカメラワーク（例: slow zoom in, pan left）"
    )
    animation_category: AnimationCategory | None = Field(
        default=None,
        description="アニメーションカテゴリ（2d/3d、subject_type=animation時のみ必須）"
    )
    animation_template: AnimationTemplateId | None = Field(
        default=None,
        description="アニメーションテンプレートID（A-1〜B-4、subject_type=animation時のみ必須）"
    )
    # Act-Two用フィールド
    use_act_two: bool = Field(
        default=False,
        description="Act-Twoモードを使用するか（true=パフォーマンス動画ベースの精密制御）"
    )
    motion_type: str | None = Field(
        default=None,
        description="Act-Two用モーションID（use_act_two=true時のみ必須、Supabaseのmotionsテーブルから取得）"
    )
    expression_intensity: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Act-Two表情強度（1-5、デフォルト3）"
    )
    body_control: bool = Field(
        default=True,
        description="Act-Twoボディモーション転写（デフォルトtrue）"
    )

    @model_validator(mode='after')
    def validate_animation_params(self) -> Self:
        """アニメーション選択時のバリデーション（翻訳用なので緩め）"""
        # 翻訳エンドポイント用なので、animation_template/categoryは必須としない
        # 実際の動画生成時にはSceneGenerateRequestで厳密にバリデーションする

        if self.subject_type == SubjectType.ANIMATION:
            # カテゴリとテンプレートの整合性チェック（両方が指定されている場合のみ）
            if self.animation_category and self.animation_template:
                template_id = self.animation_template.value
                if self.animation_category == AnimationCategory.TWO_D and not template_id.startswith("A-"):
                    raise ValueError(f"Template {template_id} is not a 2D template (A-1 to A-4)")
                if self.animation_category == AnimationCategory.THREE_D and not template_id.startswith("B-"):
                    raise ValueError(f"Template {template_id} is not a 3D template (B-1 to B-4)")

        # Act-Two用バリデーション
        if self.use_act_two:
            if self.video_provider != VideoProvider.RUNWAY:
                raise ValueError("Act-Two is only available with Runway provider")
            if self.subject_type not in [SubjectType.PERSON, SubjectType.ANIMATION]:
                raise ValueError("Act-Two is only available with person or animation subject type")
            if self.motion_type is None:
                raise ValueError("motion_type is required when use_act_two is True")
        return self


class TranslateStoryPromptResponse(BaseModel):
    """シーン動画プロンプト翻訳レスポンス"""
    english_prompt: str = Field(..., description="英語プロンプト（テンプレート適用済み）")


# ===== BGMアップロード用スキーマ =====

class BGMUploadResponse(BaseModel):
    """BGMアップロードレスポンス"""
    bgm_url: str = Field(..., description="アップロードされたBGMのURL")
    duration_seconds: float | None = Field(None, description="BGMの長さ（秒）")


class AddBGMToVideoRequest(BaseModel):
    """動画へのBGM追加リクエスト"""
    bgm_url: str = Field(..., description="追加するBGMのURL（R2にアップロード済み）")


class AddBGMToVideoResponse(BaseModel):
    """動画へのBGM追加レスポンス"""
    id: str
    status: VideoStatus
    message: str
    custom_bgm_url: str


# ===== 動画結合用スキーマ =====

class TransitionType(str, Enum):
    """トランジション効果"""
    NONE = "none"           # トランジションなし（シンプル結合）
    FADE = "fade"           # フェード（黒経由）
    DISSOLVE = "dissolve"   # ディゾルブ（クロスフェード）
    WIPELEFT = "wipeleft"   # 左へワイプ
    WIPERIGHT = "wiperight" # 右へワイプ
    SLIDEUP = "slideup"     # 上へスライド
    SLIDEDOWN = "slidedown" # 下へスライド
    CIRCLEOPEN = "circleopen"   # 円形オープン
    CIRCLECLOSE = "circleclose" # 円形クローズ


class ConcatVideoRequest(BaseModel):
    """動画結合リクエスト"""
    video_ids: list[str] | None = Field(
        None,
        min_length=2,
        max_length=10,
        description="結合する動画IDのリスト（順番通りに結合、2〜10本）"
    )
    video_urls: list[str] | None = Field(
        None,
        min_length=2,
        max_length=10,
        description="結合する動画URLのリスト（video_idsより優先）"
    )
    transition: TransitionType = Field(
        TransitionType.NONE,
        description="トランジション効果"
    )
    transition_duration: float = Field(
        0.5,
        ge=0.0,
        le=2.0,
        description="トランジション時間（秒、0〜2秒）"
    )

    @model_validator(mode="after")
    def validate_video_source(self):
        if not self.video_ids and not self.video_urls:
            raise ValueError("video_ids または video_urls のいずれかが必要です")
        return self


class VideoTrimInfo(BaseModel):
    """動画トリミング情報"""
    video_id: str | None = Field(
        None,
        description="動画ID（video_urlと排他）"
    )
    video_url: str | None = Field(
        None,
        description="動画URL（video_idと排他）"
    )
    start_time: float = Field(
        0.0,
        ge=0.0,
        description="開始位置（秒）"
    )
    end_time: float | None = Field(
        None,
        ge=0.0,
        description="終了位置（秒）、Noneの場合は最後まで"
    )

    @model_validator(mode="after")
    def validate_times(self) -> Self:
        if self.end_time is not None:
            if self.start_time >= self.end_time:
                raise ValueError("end_time は start_time より大きい必要があります")
            # 最小トリム時間チェック（0.5秒以上）
            if self.end_time - self.start_time < 0.5:
                raise ValueError("トリム範囲は0.5秒以上必要です")
        return self

    @model_validator(mode="after")
    def validate_video_source(self) -> Self:
        if not self.video_id and not self.video_url:
            raise ValueError("video_id または video_url のいずれかが必要です")
        return self


class ConcatVideoRequestV2(BaseModel):
    """動画結合リクエスト（トリミング対応版）"""
    videos: list[VideoTrimInfo] = Field(
        ...,
        min_length=2,
        max_length=10,
        description="結合する動画のリスト（トリミング情報付き、2〜10本）"
    )
    transition: TransitionType = Field(
        TransitionType.NONE,
        description="トランジション効果"
    )
    transition_duration: float = Field(
        0.5,
        ge=0.0,
        le=2.0,
        description="トランジション時間（秒、0〜2秒）"
    )


class ConcatVideoResponseV2(BaseModel):
    """動画結合レスポンス（トリミング対応版）"""
    id: str
    status: str
    message: str
    source_videos: list[VideoTrimInfo]
    transition: str
    transition_duration: float
    created_at: datetime


class ConcatVideoResponse(BaseModel):
    """動画結合レスポンス"""
    id: str
    user_id: str
    status: VideoStatus
    progress: int = 0
    source_video_ids: list[str]
    transition: TransitionType
    transition_duration: float
    final_video_url: str | None = None
    hls_master_url: str | None = None  # HLS adaptive streaming URL
    total_duration: float | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class ConcatVideoStatusResponse(BaseModel):
    """動画結合ステータスレスポンス"""
    id: str
    status: VideoStatus
    progress: int
    message: str
    video_url: str | None = None
    video_with_bgm_url: str | None = None
    total_duration: float | None = None


class ConcatVideoListResponse(BaseModel):
    """結合動画一覧レスポンス"""
    concatenations: list[ConcatVideoResponse]
    total: int
    page: int
    per_page: int


# ===== ストーリーボード（起承転結4シーン）用スキーマ =====

class StoryboardStatus(str, Enum):
    """ストーリーボードステータス"""
    DRAFT = "draft"           # 編集中（シーン確定前）
    GENERATING = "generating" # 動画生成中
    VIDEOS_READY = "videos_ready"  # 全シーン動画完了、確認待ち
    CONCATENATING = "concatenating"  # 動画結合中
    COMPLETED = "completed"   # 完了
    FAILED = "failed"         # 失敗


class SceneAct(str, Enum):
    """起承転結の区分"""
    KI = "起"      # Introduction
    SHO = "承"     # Development
    TEN = "転"     # Twist/Climax
    KETSU = "結"   # Conclusion


class CameraWork(str, Enum):
    """カメラワーク種類"""
    SLOW_ZOOM_IN = "slow_zoom_in"
    SLOW_ZOOM_OUT = "slow_zoom_out"
    TRACKING = "tracking"
    DYNAMIC_PAN = "dynamic_pan"
    STATIC = "static"
    ARC_SHOT = "arc_shot"
    DOLLY_IN = "dolly_in"
    CRANE_UP = "crane_up"
    WHIP_PAN = "whip_pan"


class SceneMood(str, Enum):
    """シーンのムード"""
    CALM = "calm"
    BUILDING = "building"
    INTENSE = "intense"
    REFLECTIVE = "reflective"
    MYSTERIOUS = "mysterious"
    JOYFUL = "joyful"
    MELANCHOLIC = "melancholic"


class StoryboardSceneBase(BaseModel):
    """ストーリーボードシーン基本スキーマ"""
    scene_number: int = Field(..., ge=1, le=16, description="シーン番号（1-16）")
    act: str = Field(..., description="起承転結の区分")
    description_ja: str = Field(..., description="日本語説明")
    runway_prompt: str = Field(..., description="Runway APIプロンプト")
    camera_work: str | None = Field(None, description="カメラワーク")
    mood: str | None = Field(None, description="シーンのムード")
    duration_seconds: int = Field(5, description="秒数")
    scene_image_url: str | None = Field(None, description="シーンごとの画像URL")
    scene_image_webp_url: str | None = Field(None, description="シーンごとのWebP画像URL")
    # サブシーン用フィールド
    parent_scene_id: str | None = Field(None, description="親シーンID（NULLは基本シーン）")
    sub_scene_order: int = Field(0, description="サブシーン順序（0=親、1-3=サブ）")
    generation_seed: int | None = Field(None, description="生成シード値")


class StoryboardSceneResponse(StoryboardSceneBase):
    """シーンレスポンス"""
    id: str
    storyboard_id: str
    status: VideoStatus = VideoStatus.PENDING
    progress: int = 0
    video_url: str | None = None
    hls_master_url: str | None = None  # HLS adaptive streaming URL
    runway_task_id: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class AddSubSceneRequest(BaseModel):
    """サブシーン追加リクエスト"""
    description_ja: str | None = Field(None, description="日本語説明（省略時は空、ユーザーが入力）")
    runway_prompt: str | None = Field(None, description="英語プロンプト（省略時は空、ユーザーが入力）")
    camera_work: str | None = Field(None, description="カメラワーク（省略時は連続性テーブルから自動選択）")


class SubSceneListResponse(BaseModel):
    """サブシーン一覧レスポンス"""
    parent_scene: StoryboardSceneResponse
    sub_scenes: list[StoryboardSceneResponse] = []
    can_add_more: bool = Field(..., description="追加可能かどうか（最大3つまで）")


class ReorderScenesRequest(BaseModel):
    """シーン並べ替えリクエスト"""
    scene_ids: list[str] = Field(..., description="新しい順序のシーンIDリスト")


class AddSceneRequest(BaseModel):
    """シーン追加リクエスト"""
    description_ja: str = Field(..., min_length=1, description="シーンの日本語説明")
    runway_prompt: Optional[str] = Field(None, description="英語プロンプト（未指定時は自動翻訳）")
    custom_image_url: Optional[str] = Field(None, description="カスタム画像URL（I2Vのみ）")
    video_mode: Optional[str] = Field("i2v", description="動画生成モード: 'i2v' or 'v2v'")
    source_video_url: Optional[str] = Field(None, description="V2V参照動画URL")
    auto_generate_video: bool = Field(False, description="追加と同時に動画生成を開始")


class StoryboardSceneUpdate(BaseModel):
    """シーン更新リクエスト"""
    description_ja: str | None = Field(None, description="日本語説明を更新")
    runway_prompt: str | None = Field(None, description="プロンプトを更新")
    camera_work: str | None = Field(None, description="カメラワークを更新")
    mood: str | None = Field(None, description="ムードを更新")


class StoryboardSceneImageUpdate(BaseModel):
    """シーン画像更新リクエスト"""
    image_url: str = Field(..., description="新しいシーン画像のURL")


class TranslateSceneRequest(BaseModel):
    """シーン説明翻訳リクエスト"""
    description_ja: str = Field(..., description="日本語のシーン説明")
    scene_number: int = Field(..., ge=1, description="シーン番号（1以上、新規シーンの場合は任意の正の数）")
    storyboard_id: str | None = Field(None, description="ストーリーボードID（テンプレート取得用）")


class TranslateSceneResponse(BaseModel):
    """シーン説明翻訳レスポンス"""
    runway_prompt: str = Field(..., description="英語のRunwayプロンプト")


class StoryboardCreateRequest(BaseModel):
    """ストーリーボード生成リクエスト"""
    image_url: str = Field(..., description="ベースとなる画像URL")
    mood: str | None = Field(None, description="動画のテーマ/ムード（例：楽しい、感動、ロマンチック）")
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー（runway/veo）")
    aspect_ratio: AspectRatio = Field(AspectRatio.PORTRAIT, description="アスペクト比（9:16=縦長, 16:9=横長）")
    element_images: list[ElementImage] | None = Field(
        default=None,
        max_length=3,
        description="一貫性向上用の追加画像（最大3枚、ベース画像と合わせて最大4枚）。Kling専用機能"
    )


class StoryboardGenerateRequest(BaseModel):
    """ストーリーボードからの動画生成リクエスト"""
    bgm_track_id: str | None = Field(None, description="プリセットBGMのID")
    custom_bgm_url: str | None = Field(None, description="カスタムBGMのURL")
    film_grain: FilmGrainPreset = Field(FilmGrainPreset.MEDIUM, description="フィルムグレイン")
    use_lut: bool = Field(True, description="LUTを適用するか")
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー（未指定時は環境変数で決定）")
    scene_video_modes: dict[int, str] | None = Field(None, description="シーンごとのI2V/V2V設定 {scene_number: 'i2v' or 'v2v'}")
    kling_mode: KlingMode | None = Field(None, description="Kling AIモード（std: 標準, pro: 高品質）。Klingプロバイダー使用時のみ有効")
    scene_end_frame_images: dict[int, str] | None = Field(None, description="シーンごとの終了フレーム画像URL {scene_number: url}。Kling専用オプション")
    element_images: list[ElementImage] | None = Field(
        default=None,
        max_length=3,
        description="一貫性向上用の追加画像（ストーリーボード保存値を上書き）。Kling専用機能"
    )

    @model_validator(mode='after')
    def validate_kling_only_features(self) -> Self:
        """Kling専用機能のバリデーション"""
        if self.element_images:
            if self.video_provider and self.video_provider != VideoProvider.PIAPI_KLING:
                raise ValueError("Elements機能はKlingプロバイダーのみ対応しています")
        return self


class RegenerateVideoRequest(BaseModel):
    """シーン動画再生成リクエスト"""
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー（未指定時は環境変数で決定）")
    prompt: str | None = Field(None, description="動画生成プロンプト（未指定時は既存のrunway_promptを使用）")
    video_mode: VideoMode | None = Field(None, description="動画生成モード（i2v: 画像から生成, v2v: 直前の動画から継続）。未指定時はi2v")
    kling_mode: KlingMode | None = Field(None, description="Kling AIモード（std: 標準, pro: 高品質）。Klingプロバイダー使用時のみ有効")
    image_tail_url: str | None = Field(None, description="終了フレーム画像URL（Kling専用オプション）。指定時は開始画像→終了画像への遷移動画を生成")


class StoryboardConcatenateRequest(BaseModel):
    """ストーリーボード結合リクエスト"""
    film_grain: FilmGrainPreset = Field(
        FilmGrainPreset.MEDIUM,
        description="フィルムグレイン強度"
    )
    use_lut: bool = Field(True, description="LUT（カラーグレーディング）を適用するか")
    lut_intensity: float = Field(
        0.3,
        ge=0.0,
        le=1.0,
        description="LUT適用強度（0.0-1.0）"
    )


class StoryboardResponse(BaseModel):
    """ストーリーボードレスポンス"""
    id: str
    user_id: str
    source_image_url: str
    source_image_webp_url: str | None = None
    title: str | None = None
    theme: str | None = None
    status: StoryboardStatus = StoryboardStatus.DRAFT
    scenes: list[StoryboardSceneResponse] = []
    bgm_track_id: str | None = None
    custom_bgm_url: str | None = None
    final_video_url: str | None = None
    hls_master_url: str | None = None  # HLS adaptive streaming URL
    total_duration: float | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    video_provider: VideoProvider | None = None
    max_scenes: int = 16
    draft_metadata: Optional[dict] = None  # DraftMetadata をそのまま返す（JSONBから直接取得）

    class Config:
        from_attributes = True


class StoryboardListResponse(BaseModel):
    """ストーリーボード一覧レスポンス"""
    storyboards: list[StoryboardResponse]
    total: int
    page: int
    per_page: int


class StoryboardStatusResponse(BaseModel):
    """ストーリーボード生成ステータス"""
    id: str
    status: StoryboardStatus
    scenes: list[dict]  # 各シーンの進捗
    message: str
    video_url: str | None = None
    total_duration: float | None = None


# ===== 動画アップスケール用スキーマ =====

class UpscaleResolution(str, Enum):
    """アップスケール解像度"""
    ORIGINAL = "original"  # オリジナル（720p）
    HD = "hd"              # フルHD（1080p）
    FOUR_K = "4k"          # 4K（2160p）


class UpscaleRequest(BaseModel):
    """動画アップスケールリクエスト"""
    resolution: UpscaleResolution = Field(
        UpscaleResolution.FOUR_K,
        description="出力解像度（hd=1080p, 4k=2160p）"
    )
    source_url: str | None = Field(
        None,
        description="アップスケール対象の動画URL（指定しない場合はDBの元動画を使用）"
    )


class UpscaleResponse(BaseModel):
    """動画アップスケールレスポンス"""
    id: str
    storyboard_id: str
    scene_number: int | None = None  # シーン単位アップスケール時のシーン番号
    status: VideoStatus
    resolution: UpscaleResolution
    original_video_url: str
    upscaled_video_url: str | None = None
    progress: int = 0
    error_message: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class UpscaleStatusResponse(BaseModel):
    """アップスケールステータスレスポンス"""
    id: str
    status: VideoStatus
    progress: int
    message: str
    upscaled_video_url: str | None = None
    resolution: str | None = None


# ===== 結合動画アップスケール用スキーマ =====

class ConcatUpscaleResponse(BaseModel):
    """結合動画アップスケールレスポンス"""
    id: str
    concat_id: str
    status: VideoStatus
    resolution: UpscaleResolution
    original_video_url: str
    upscaled_video_url: str | None = None
    progress: int = 0
    error_message: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class ConcatUpscaleStatusResponse(BaseModel):
    """結合動画アップスケールステータスレスポンス"""
    id: str
    status: VideoStatus
    progress: int
    message: str
    upscaled_video_url: str | None = None
    resolution: str | None = None


# ===== 60fps補間（Topaz Video API）=====

class InterpolateModel(str, Enum):
    """フレーム補間モデル"""
    APO_8 = "apo-8"  # Apollo: 高品質、遅い
    APF_2 = "apf-2"  # Apollo Fast: 標準品質、速い
    CHR_2 = "chr-2"  # Chronos: 高品質、遅い
    CHF_3 = "chf-3"  # Chronos Fast: 標準品質、速い


class EnhanceModel(str, Enum):
    """Topaz Enhancement モデル"""
    PROTEUS = "prob-4"       # 汎用（推奨デフォルト）
    ARTEMIS_HQ = "ahq-12"   # 高画質
    ARTEMIS_MQ = "amq-13"   # 中画質
    ARTEMIS_LQ = "alq-13"   # 低画質復元
    GAIA_HQ = "ghq-5"       # バランス型
    GAIA_CG = "gcg-5"       # CG/アニメ向け
    NYX = "nyk-3"            # デノイズ特化
    RHEA = "rhea-1"          # 4xアップスケール特化
    IRIS = "iris-3"          # 顔特化Enhancement
    THEIA_DETAIL = "thd-3"   # ディテール強化
    THEIA_FINE = "thf-4"     # 微細ディテール


class TopazUpscaleScale(str, Enum):
    """アップスケール倍率"""
    TWO_X = "2x"     # 2倍アップスケール
    FOUR_X = "4x"    # 4倍アップスケール


class InterpolateRequest(BaseModel):
    """60fps補間リクエスト"""
    model: InterpolateModel = Field(
        InterpolateModel.APO_8,
        description="補間モデル（apo-8推奨）"
    )


class InterpolateResponse(BaseModel):
    """60fps補間レスポンス"""
    id: str
    video_id: str | None = None
    storyboard_id: str | None = None
    concat_id: str | None = None
    scene_number: int | None = None
    status: VideoStatus
    model: InterpolateModel
    original_video_url: str
    interpolated_video_url: str | None = None
    progress: int = 0
    error_message: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class InterpolateStatusResponse(BaseModel):
    """60fps補間ステータスレスポンス"""
    id: str
    status: VideoStatus
    progress: int
    message: str
    interpolated_video_url: str | None = None
    model: str | None = None


# ===== ProRes変換（デバンド + 10bit）=====

class ProResConversionRequest(BaseModel):
    """ProRes変換リクエスト"""
    deband_strength: float = Field(
        default=1.1,
        ge=0.5,
        le=2.0,
        description="デバンド強度（0.5-2.0）"
    )
    deband_radius: int = Field(
        default=20,
        ge=8,
        le=64,
        description="デバンド半径（8-64）"
    )
    apply_flat_look: bool = Field(
        default=True,
        description="フラットルック適用（編集しやすい色調に調整）"
    )
    contrast: float = Field(
        default=0.9,
        ge=0.5,
        le=1.5,
        description="コントラスト調整（0.5-1.5）"
    )
    saturation: float = Field(
        default=0.85,
        ge=0.5,
        le=1.5,
        description="彩度調整（0.5-1.5）"
    )
    brightness: float = Field(
        default=0.03,
        ge=-0.5,
        le=0.5,
        description="明るさ調整（-0.5-0.5）"
    )


class ProResConversionResponse(BaseModel):
    """ProRes変換レスポンス"""
    id: str
    source_type: str  # "storyboard" or "concat"
    source_id: str
    status: VideoStatus
    original_video_url: str
    prores_video_url: str | None = None
    progress: int = 0
    error_message: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class ProResConversionStatusResponse(BaseModel):
    """ProRes変換ステータスレスポンス"""
    id: str
    status: VideoStatus
    progress: int
    message: str
    prores_video_url: str | None = None


# ===== AI BGM生成用スキーマ =====

class BGMMood(str, Enum):
    """BGMのムード"""
    UPBEAT = "upbeat"           # 軽快・明るい
    CALM = "calm"               # 穏やか・落ち着いた
    DRAMATIC = "dramatic"       # ドラマチック・緊張感
    ENERGETIC = "energetic"     # エネルギッシュ・活発
    MELANCHOLIC = "melancholic" # 哀愁・メランコリック
    CINEMATIC = "cinematic"     # 映画的・壮大


class BGMGenre(str, Enum):
    """BGMのジャンル"""
    ELECTRONIC = "electronic"   # エレクトロニック
    ACOUSTIC = "acoustic"       # アコースティック
    ORCHESTRAL = "orchestral"   # オーケストラ
    POP = "pop"                 # ポップ
    ROCK = "rock"               # ロック
    AMBIENT = "ambient"         # アンビエント


class BGMGenerationStatus(str, Enum):
    """BGM生成ステータス"""
    PENDING = "pending"         # 待機中
    ANALYZING = "analyzing"     # 動画分析中
    GENERATING = "generating"   # BGM生成中
    SYNCING = "syncing"         # ビート同期中
    COMPLETED = "completed"     # 完了
    FAILED = "failed"           # 失敗


class BGMPromptSuggestion(BaseModel):
    """動画分析から生成されるBGM提案"""
    mood: BGMMood
    genre: BGMGenre
    tempo_bpm: int = Field(..., ge=60, le=180, description="推定BPM")
    prompt: str = Field(..., description="Suno用の完成プロンプト")
    reasoning: str = Field(..., description="分析理由")


class BeatInfo(BaseModel):
    """ビート検出結果"""
    tempo: float = Field(..., description="検出BPM")
    beat_times: list[float] = Field(..., description="ビート位置（秒）")
    downbeat_times: list[float] = Field(..., description="強拍位置（小節頭）")


class SyncResult(BaseModel):
    """同期計算結果"""
    original_cut_points: list[float]
    adjusted_cut_points: list[float]
    time_stretch_ratio: float = Field(..., description="1.0 = 変更なし")
    sync_quality_score: float = Field(..., ge=0.0, le=1.0, description="同期品質スコア")


class BGMGenerateRequest(BaseModel):
    """BGM生成リクエスト"""
    auto_analyze: bool = Field(
        True,
        description="動画を自動分析してプロンプトを生成"
    )
    custom_prompt: str | None = Field(
        None,
        max_length=500,
        description="カスタムプロンプト（指定時はauto_analyzeより優先）"
    )
    mood: BGMMood | None = Field(
        None,
        description="BGMのムード（auto_analyze時のヒント）"
    )
    genre: BGMGenre | None = Field(
        None,
        description="BGMのジャンル（auto_analyze時のヒント）"
    )
    sync_to_beats: bool = Field(
        True,
        description="BGMのビートと動画カットを同期"
    )
    duration_seconds: int | None = Field(
        None,
        ge=5,
        le=300,
        description="BGMの長さ（秒）。未指定時は動画長に合わせる"
    )


class BGMGenerateResponse(BaseModel):
    """BGM生成開始レスポンス"""
    bgm_generation_id: str
    concat_id: str
    status: BGMGenerationStatus
    message: str


class BGMStatusResponse(BaseModel):
    """BGM生成ステータスレスポンス"""
    id: str
    status: BGMGenerationStatus
    progress: int = Field(..., ge=0, le=100)
    bgm_url: str | None = None
    sync_quality_score: float | None = None
    detected_mood: str | None = None
    detected_genre: str | None = None
    detected_tempo_bpm: int | None = None
    auto_generated_prompt: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None


class ApplyBGMRequest(BaseModel):
    """BGM適用リクエスト"""
    bgm_generation_id: str = Field(..., description="適用するBGM生成のID")
    volume: float = Field(
        0.7,
        ge=0.0,
        le=1.0,
        description="BGMの音量（0.0-1.0）"
    )
    original_audio_volume: float = Field(
        0.3,
        ge=0.0,
        le=1.0,
        description="元動画の音声音量（0.0-1.0）"
    )
    fade_in_seconds: float = Field(
        0.5,
        ge=0.0,
        le=5.0,
        description="フェードイン時間（秒）"
    )
    fade_out_seconds: float = Field(
        1.5,
        ge=0.0,
        le=5.0,
        description="フェードアウト時間（秒）"
    )


class ApplyBGMResponse(BaseModel):
    """BGM適用レスポンス"""
    concat_id: str
    status: str
    message: str
    final_video_url: str | None = None


# ===== 広告脚本（コンテ）生成用スキーマ =====

class AdTheory(str, Enum):
    """広告理論"""
    AIDA = "aida"                    # 注目→興味→欲求→行動
    PASONA = "pasona"                # 問題→共感→解決→提案→絞込→行動
    KISHOUTENKETSU = "kishoutenketsu"  # 起承転結
    STORYTELLING = "storytelling"    # フック→課題→旅→発見→変化→CTA


class AdScriptGenerateRequest(BaseModel):
    """広告脚本生成リクエスト"""
    description: str = Field(
        ...,
        min_length=10,
        max_length=1000,
        description="広告の内容（どんな広告を作りたいか）"
    )
    target_duration: int | None = Field(
        None,
        description="希望の尺（秒）。15, 30, 60 または null（おまかせ）"
    )
    aspect_ratio: AspectRatio = Field(
        AspectRatio.PORTRAIT,
        description="アスペクト比（9:16=縦長, 16:9=横長）"
    )

    @model_validator(mode='after')
    def validate_duration(self) -> Self:
        """希望の尺のバリデーション"""
        if self.target_duration is not None:
            if self.target_duration not in [15, 30, 60]:
                raise ValueError("target_duration must be 15, 30, 60, or null")
        return self


class AdCutResponse(BaseModel):
    """広告カットレスポンス"""
    id: str = Field(..., description="カットID")
    cut_number: int = Field(..., ge=1, description="カット番号")
    scene_type: str = Field(..., description="シーンタイプ（例: problem, affinity, solution）")
    scene_type_label: str = Field(..., description="シーンタイプの日本語ラベル")
    description_ja: str = Field(..., description="日本語の説明")
    description_en: str = Field(..., description="英語の説明（動画生成プロンプト用）")
    duration: int = Field(..., ge=1, le=30, description="カット秒数")


class AdScriptGenerateResponse(BaseModel):
    """広告脚本生成レスポンス"""
    id: str = Field(..., description="脚本ID")
    theory: AdTheory = Field(..., description="使用した広告理論")
    theory_label: str = Field(..., description="広告理論の日本語ラベル")
    total_duration: int = Field(..., description="合計秒数")
    cuts: list[AdCutResponse] = Field(..., description="カットリスト")


# ===== ユーザーアップロード動画用スキーマ =====

class UserVideoResponse(BaseModel):
    """ユーザー動画レスポンス"""
    id: str
    user_id: str
    title: str
    description: str | None = None
    video_url: str
    hls_master_url: str | None = None  # HLS adaptive streaming URL
    thumbnail_url: str | None = None
    thumbnail_webp_url: str | None = None
    duration_seconds: float
    width: int
    height: int
    file_size_bytes: int
    mime_type: str
    created_at: datetime
    updated_at: datetime
    upscaled_video_url: str | None = None  # Topaz Enhancementアップスケール済みURL

    class Config:
        from_attributes = True


class UserVideoListResponse(BaseModel):
    """ユーザー動画一覧レスポンス"""
    videos: list[UserVideoResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


# ===== ユーザー動画Topazアップスケール用スキーマ =====

class UserVideoUpscaleRequest(BaseModel):
    """ユーザー動画アップスケールリクエスト"""
    model: EnhanceModel = Field(
        default=EnhanceModel.PROTEUS,
        description="使用するEnhancementモデル"
    )
    scale: TopazUpscaleScale = Field(
        default=TopazUpscaleScale.TWO_X,
        description="アップスケール倍率"
    )


class UserVideoUpscaleEstimateResponse(BaseModel):
    """アップスケールコスト見積もりレスポンス"""
    estimated_credits_min: int
    estimated_credits_max: int
    estimated_time_min: int  # 秒
    estimated_time_max: int  # 秒
    target_width: int
    target_height: int


class UserVideoUpscaleResponse(BaseModel):
    """アップスケール開始レスポンス"""
    id: str
    user_video_id: str
    status: str
    model: str
    target_width: int
    target_height: int
    original_video_url: str
    upscaled_video_url: str | None = None
    progress: int = 0
    estimated_credits_min: int | None = None
    estimated_credits_max: int | None = None
    created_at: datetime


class UserVideoUpscaleStatusResponse(BaseModel):
    """アップスケールステータス確認レスポンス"""
    id: str
    status: str
    progress: int
    upscaled_video_url: str | None = None
    thumbnail_url: str | None = None
    error_message: str | None = None


# ===== 動画スクリーンショット用スキーマ =====

class ScreenshotSource(str, Enum):
    """スクリーンショットのソースタイプ"""
    VIDEO_GENERATION = "video_generation"  # 生成動画
    STORYBOARD_SCENE = "storyboard_scene"  # ストーリーボードシーン
    USER_VIDEO = "user_video"              # アップロード動画
    URL = "url"                            # 外部URL


class ScreenshotCreateRequest(BaseModel):
    """スクリーンショット作成リクエスト"""
    source_type: ScreenshotSource
    source_id: str | None = Field(None, description="ソースのID（URLの場合は不要）")
    source_url: str | None = Field(None, description="動画URL（source_type=urlの場合のみ）")
    timestamp_seconds: float = Field(..., ge=0.0, description="抽出位置（秒）")
    title: str | None = Field(None, max_length=100, description="スクリーンショット名")

    @model_validator(mode='after')
    def validate_source(self) -> Self:
        if self.source_type == ScreenshotSource.URL:
            if not self.source_url:
                raise ValueError("source_url is required when source_type is 'url'")
        else:
            if not self.source_id:
                raise ValueError("source_id is required for this source_type")
        return self


class ScreenshotResponse(BaseModel):
    """スクリーンショットレスポンス"""
    id: str
    user_id: str
    source_type: str  # DBには保存されない。レスポンス生成時に計算
    source_id: str | None = None
    source_video_url: str | None = None
    timestamp_seconds: float
    image_url: str
    width: int | None = None
    height: int | None = None
    title: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScreenshotListResponse(BaseModel):
    """スクリーンショット一覧レスポンス"""
    screenshots: list[ScreenshotResponse]
    total: int
    page: int
    per_page: int


# ===== ストーリーボード一時保存（ドラフト）用スキーマ =====

class DraftMetadata(BaseModel):
    """ストーリーボード編集中のUI状態を保存するためのスキーマ"""
    schema_version: int = Field(default=1, description="スキーマバージョン（将来の互換性用）")
    current_step: Optional[str] = Field(None, description="現在のステップ")
    editing_scene: Optional[int] = Field(None, description="編集中のシーン番号")
    edit_form: Optional[dict] = Field(None, description="編集フォームの内容")
    # Pydanticでは Field(default_factory=dict) を使用してミュータブルデフォルトを避ける
    camera_selections: dict = Field(default_factory=dict, description="カメラワーク選択状態")
    trim_settings: dict = Field(default_factory=dict, description="トリム設定")
    video_modes: dict = Field(default_factory=dict, description="動画生成モード（i2v/v2v）")
    custom_image_scenes: list[int] = Field(default_factory=list, description="カスタム画像シーン番号")
    film_grain: Optional[str] = Field("light", description="フィルムグレイン設定")
    use_lut: Optional[bool] = Field(False, description="LUT適用フラグ")
    lut_intensity: Optional[float] = Field(0.3, description="LUT強度")
    apply_trim: Optional[bool] = Field(True, description="トリム適用フラグ")
    video_provider: Optional[str] = Field("runway", description="動画生成プロバイダー")
    aspect_ratio: Optional[str] = Field("9:16", description="アスペクト比")
    selected_mood: Optional[str] = Field(None, description="選択中のムード")
    custom_mood_text: Optional[str] = Field(None, description="カスタムムードテキスト")
    last_saved_at: Optional[str] = Field(None, description="最終保存時刻（ISO 8601）")
    auto_saved: Optional[bool] = Field(False, description="自動保存フラグ")


class SaveDraftRequest(BaseModel):
    """一時保存リクエスト"""
    draft_metadata: DraftMetadata


class SaveDraftResponse(BaseModel):
    """一時保存レスポンス"""
    success: bool
    last_saved_at: str


# ===== Ad Creator ドラフト保存用スキーマ =====

class AdCreatorSelectedVideo(BaseModel):
    """Ad Creator用 選択された動画情報"""
    id: str
    type: str  # "scene", "storyboard", "uploaded"
    videoUrl: str
    thumbnailUrl: Optional[str] = None
    originalDuration: float
    trimStart: float
    trimEnd: float


class AdCreatorEditableCut(BaseModel):
    """Ad Creator用 編集可能なカット"""
    id: str
    cut_number: int
    scene_type: str
    scene_type_label: str
    description_ja: str
    description_en: str
    duration: int
    video: Optional[AdCreatorSelectedVideo] = None


class AdCreatorDraftMetadata(BaseModel):
    """Ad Creator編集中のUI状態を保存するためのスキーマ"""
    schema_version: int = Field(default=1, description="スキーマバージョン（将来の互換性用）")
    aspect_ratio: Optional[str] = Field(None, description="アスペクト比（9:16, 16:9, 1:1）")
    ad_mode: Optional[str] = Field(None, description="モード（ai/manual）")
    ad_script: Optional[dict] = Field(None, description="AI生成した脚本（AdScriptResponse）")
    script_confirmed: bool = Field(False, description="脚本確定フラグ")
    storyboard_cuts: list[dict] = Field(default_factory=list, description="編集中のカット一覧")
    # 手動モード用フィールド
    selected_items: list[dict] = Field(default_factory=list, description="選択した動画アイテム")
    trim_settings: dict = Field(default_factory=dict, description="トリム設定")
    transition: str = Field("none", description="トランジション効果")
    transition_duration: float = Field(0.5, description="トランジション時間（秒）")
    last_saved_at: Optional[str] = Field(None, description="最終保存時刻（ISO 8601）")
    auto_saved: bool = Field(False, description="自動保存フラグ")


class AdCreatorSaveDraftRequest(BaseModel):
    """Ad Creator ドラフト保存リクエスト"""
    draft_metadata: AdCreatorDraftMetadata


class AdCreatorDraftExistsResponse(BaseModel):
    """Ad Creator ドラフト存在確認レスポンス（軽量）"""
    exists: bool
    last_saved_at: datetime | None = None


class AdCreatorDraftResponse(BaseModel):
    """Ad Creator ドラフトレスポンス"""
    id: str
    user_id: str
    draft_metadata: AdCreatorDraftMetadata
    created_at: datetime
    updated_at: datetime
    last_saved_at: datetime

    class Config:
        from_attributes = True


# ===== シーン画像生成用スキーマ =====

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
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.PORTRAIT,
        description="アスペクト比（9:16=縦長, 16:9=横長）"
    )
    image_provider: ImageProvider = Field(
        default=ImageProvider.NANOBANANA,
        description="画像生成プロバイダー"
    )
    reference_images: list[ReferenceImage] | None = Field(
        default=None,
        max_length=8,
        description="参照画像（Nano Banana:最大3枚、BFL FLUX.2:最大8枚）"
    )
    negative_prompt: str | None = Field(
        default=None,
        max_length=1000,
        description="ネガティブプロンプト（BFL FLUX.2のみ対応）"
    )

    @model_validator(mode='after')
    def validate_at_least_one_input(self) -> Self:
        """dialogue または description_ja のどちらかは必須 + プロバイダー制限チェック"""
        if not self.dialogue and not self.description_ja:
            raise ValueError("dialogue または description_ja のどちらかを入力してください")

        # プロバイダーに応じた文字数制限チェック
        text_length = len(self.description_ja or "") + len(self.dialogue or "")
        limit = IMAGE_PROVIDER_LIMITS.get(self.image_provider, 50000)
        if text_length > limit:
            raise ValueError(
                f"{self.image_provider.value}の文字数制限は{limit}文字です。"
                f"現在{text_length}文字入力されています。"
            )

        # 参照画像の対応プロバイダーと枚数制限
        if self.reference_images:
            if self.image_provider == ImageProvider.NANOBANANA:
                # Nano Banana: 最大3枚
                if len(self.reference_images) > 3:
                    raise ValueError(
                        "Nano Bananaの参照画像は最大3枚までです。"
                        f"現在{len(self.reference_images)}枚指定されています。"
                    )
            elif self.image_provider == ImageProvider.BFL_FLUX2_PRO:
                # BFL FLUX.2: 最大8枚
                if len(self.reference_images) > 8:
                    raise ValueError(
                        "BFL FLUX.2 Proの参照画像は最大8枚までです。"
                        f"現在{len(self.reference_images)}枚指定されています。"
                    )
            else:
                raise ValueError(
                    "参照画像はNano BananaまたはBFL FLUX.2 Proのみ対応しています。"
                )

        return self


class GenerateSceneImageResponse(BaseModel):
    """シーン画像生成レスポンス"""
    image_url: str = Field(..., description="生成された画像のURL")
    generated_prompt_ja: str = Field(..., description="生成に使用した日本語プロンプト")
    generated_prompt_en: str = Field(..., description="生成に使用した英語プロンプト")
    r2_key: str = Field(..., description="R2ストレージのキー")
    width: int = Field(..., description="画像の幅（ピクセル）")
    height: int = Field(..., description="画像の高さ（ピクセル）")
    aspect_ratio: str = Field(..., description="アスペクト比 (9:16, 16:9)")
    image_provider: str = Field(..., description="使用した画像生成プロバイダー")


# ===== FLUX.2 JSON プロンプト変換スキーマ =====

class ConvertToFluxJsonRequest(BaseModel):
    """FLUX.2用JSONプロンプト変換リクエスト"""
    description_ja: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="日本語の画像説明"
    )
    negative_prompt_ja: str | None = Field(
        default=None,
        max_length=1000,
        description="日本語のネガティブプロンプト（オプション）"
    )
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.PORTRAIT,
        description="アスペクト比（構図のヒントに使用）"
    )


class FluxJsonPreview(BaseModel):
    """FLUX.2 JSON構造のプレビュー"""
    scene: str | None = None
    subject: str | None = None
    style: str | None = None
    camera: str | None = None
    lighting: str | None = None
    color_palette: str | None = None
    mood: str | None = None
    quality: str | None = None


class ConvertToFluxJsonResponse(BaseModel):
    """FLUX.2用JSONプロンプト変換レスポンス"""
    json_prompt: str = Field(..., description="JSON形式の英語プロンプト")
    negative_prompt_en: str | None = Field(None, description="英語のネガティブプロンプト")
    preview: FluxJsonPreview = Field(..., description="パース済みのJSONプレビュー")


# ===== Text-to-Image 構造化入力スキーマ =====

# ドロップダウン選択肢の定義（バリデーション用）
VALID_SUBJECT_POSITIONS = {"center", "left", "right", "upper", "lower", "rule_of_thirds"}
VALID_LIGHTING_OPTIONS = {"soft_natural", "dramatic", "studio", "backlit", "golden_hour", "moody"}
VALID_MOOD_OPTIONS = {"luxury", "energetic", "calm", "playful", "professional", "nostalgic"}

# ドロップダウン値の英語マッピング
POSITION_EN_MAP = {
    "center": "centered in frame",
    "left": "positioned left of center",
    "right": "positioned right of center",
    "upper": "positioned at upper third",
    "lower": "positioned at lower third",
    "rule_of_thirds": "following rule of thirds",
}

LIGHTING_EN_MAP = {
    "soft_natural": "soft natural daylight",
    "dramatic": "dramatic directional lighting",
    "studio": "professional studio lighting",
    "backlit": "backlighting with rim highlights",
    "golden_hour": "warm golden hour lighting",
    "moody": "moody low-key lighting",
}

MOOD_EN_MAP = {
    "luxury": "sophisticated luxury aesthetic",
    "energetic": "dynamic energetic feel",
    "calm": "calm serene atmosphere",
    "playful": "playful whimsical mood",
    "professional": "clean professional look",
    "nostalgic": "nostalgic vintage feel",
}


class StructuredImageInput(BaseModel):
    """構造化画像入力（nanobananaテンプレートベース）"""
    subject: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="被写体（必須）- 何を撮影するか"
    )
    subject_position: str | None = Field(
        default=None,
        description="被写体の位置（center, left, right, upper, lower, rule_of_thirds）"
    )
    background: str | None = Field(
        default=None,
        max_length=200,
        description="背景/環境"
    )
    lighting: str | None = Field(
        default=None,
        description="照明（soft_natural, dramatic, studio, backlit, golden_hour, moody）"
    )
    color_palette: str | None = Field(
        default=None,
        max_length=100,
        description="カラーパレット"
    )
    mood: str | None = Field(
        default=None,
        description="ムード（luxury, energetic, calm, playful, professional, nostalgic）"
    )
    additional_notes: str | None = Field(
        default=None,
        max_length=500,
        description="追加指示"
    )

    @model_validator(mode='after')
    def validate_dropdown_values(self) -> Self:
        """ドロップダウン値の検証"""
        if self.subject_position is not None and self.subject_position not in VALID_SUBJECT_POSITIONS:
            raise ValueError(f"Invalid subject_position: {self.subject_position}. Valid options: {VALID_SUBJECT_POSITIONS}")
        if self.lighting is not None and self.lighting not in VALID_LIGHTING_OPTIONS:
            raise ValueError(f"Invalid lighting: {self.lighting}. Valid options: {VALID_LIGHTING_OPTIONS}")
        if self.mood is not None and self.mood not in VALID_MOOD_OPTIONS:
            raise ValueError(f"Invalid mood: {self.mood}. Valid options: {VALID_MOOD_OPTIONS}")
        return self


class GenerateImageFromTextRequest(BaseModel):
    """テキストからの画像生成リクエスト（構造化入力またはフリーテキスト）"""
    structured_input: StructuredImageInput | None = Field(
        default=None,
        description="構造化された画像生成入力"
    )
    free_text_description: str | None = Field(
        default=None,
        max_length=50000,
        description="フリーテキストでの画像説明（日本語）"
    )
    reference_image_url: str | None = Field(
        default=None,
        description="参照画像URL（Nano Banana用、R2にアップロード済み）"
    )
    reference_images: list[ReferenceImage] | None = Field(
        default=None,
        max_length=8,
        description="参照画像リスト（Nano Banana:最大3枚、BFL FLUX.2:最大8枚）"
    )
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.PORTRAIT,
        description="アスペクト比（9:16=縦長, 16:9=横長）"
    )
    image_provider: ImageProvider = Field(
        default=ImageProvider.NANOBANANA,
        description="画像生成プロバイダー"
    )
    negative_prompt: str | None = Field(
        default=None,
        max_length=1000,
        description="ネガティブプロンプト（BFL FLUX.2のみ対応）"
    )

    @model_validator(mode='after')
    def validate_input_provided(self) -> Self:
        """structured_input か free_text_description のどちらかが必須 + プロバイダー制限"""
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

        # プロバイダーに応じた文字数制限チェック
        if has_free_text and self.free_text_description:
            limit = IMAGE_PROVIDER_LIMITS.get(self.image_provider, 50000)
            if len(self.free_text_description) > limit:
                raise ValueError(
                    f"{self.image_provider.value}の文字数制限は{limit}文字です。"
                    f"現在{len(self.free_text_description)}文字入力されています。"
                )

        # Nano Banana: reference_image_url または reference_images（最大3枚）
        if self.image_provider == ImageProvider.NANOBANANA:
            if self.reference_images and len(self.reference_images) > 3:
                raise ValueError(
                    "Nano Bananaの参照画像は最大3枚までです。"
                    f"現在{len(self.reference_images)}枚指定されています。"
                )

        # BFL FLUX.2: reference_images のみ対応（最大8枚）
        if self.image_provider == ImageProvider.BFL_FLUX2_PRO:
            if self.reference_image_url:
                raise ValueError(
                    "BFL FLUX.2 Proはreference_image_urlに対応していません。"
                    "reference_imagesを使用してください。"
                )
            if self.reference_images and len(self.reference_images) > 8:
                raise ValueError(
                    "BFL FLUX.2 Proの参照画像は最大8枚までです。"
                    f"現在{len(self.reference_images)}枚指定されています。"
                )

        return self


# ========================================
# 編集用素材エクスポート
# ========================================


class MaterialExportCut(BaseModel):
    """エクスポート対象カット"""
    cut_number: int = Field(..., description="カット番号")
    label: str = Field(..., description="カットラベル")
    video_url: str = Field(..., description="動画URL")
    trim_start: float = Field(default=0.0, description="トリム開始時間（秒）")
    trim_end: float | None = Field(default=None, description="トリム終了時間（秒）")


class MaterialExportRequest(BaseModel):
    """編集用素材エクスポートリクエスト"""
    cuts: list[MaterialExportCut] = Field(..., description="エクスポート対象カットのリスト")
    aspect_ratio: str = Field(default="16:9", description="アスペクト比 (16:9, 9:16, 1:1)")


# ========================================
# Ad Creator プロジェクト管理
# ========================================


class AdCreatorProjectStatus(str, Enum):
    """Ad Creatorプロジェクトステータス"""
    DRAFT = "draft"           # 下書き
    PROCESSING = "processing"  # 処理中
    COMPLETED = "completed"   # 完了
    FAILED = "failed"         # 失敗


class AdCreatorProjectCreate(BaseModel):
    """Ad Creatorプロジェクト作成リクエスト"""
    title: str = Field(..., min_length=1, max_length=100, description="プロジェクトタイトル")
    description: str | None = Field(None, max_length=500, description="プロジェクト説明")
    aspect_ratio: str = Field(default="16:9", description="アスペクト比")
    target_duration: int = Field(default=30, ge=5, le=120, description="目標尺（秒）")
    theory: AdTheory | None = Field(None, description="使用した広告理論")
    project_data: dict | None = Field(None, description="プロジェクトデータ（カット情報等）")


class AdCreatorProjectUpdate(BaseModel):
    """Ad Creatorプロジェクト更新リクエスト"""
    title: str | None = Field(None, min_length=1, max_length=100, description="プロジェクトタイトル")
    description: str | None = Field(None, max_length=500, description="プロジェクト説明")
    status: AdCreatorProjectStatus | None = Field(None, description="ステータス")
    thumbnail_url: str | None = Field(None, description="サムネイルURL")
    final_video_url: str | None = Field(None, description="最終動画URL")
    project_data: dict | None = Field(None, description="プロジェクトデータ（カット情報等）")


class AdCreatorProjectResponse(BaseModel):
    """Ad Creatorプロジェクトレスポンス"""
    id: str
    user_id: str
    title: str
    description: str | None = None
    aspect_ratio: str
    target_duration: int
    theory: str | None = None
    status: str
    thumbnail_url: str | None = None
    thumbnail_webp_url: str | None = Field(None, description="サムネイルWebP URL")
    final_video_url: str | None = None
    project_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdCreatorProjectListResponse(BaseModel):
    """Ad Creatorプロジェクト一覧レスポンス"""
    projects: list[AdCreatorProjectResponse]
    total: int
    page: int
    per_page: int


# ===== 動画アップロード用スキーマ =====

class VideoUploadResponse(BaseModel):
    """動画アップロードレスポンス"""
    video_url: str = Field(..., description="アップロードされた動画のURL")
    thumbnail_url: Optional[str] = Field(None, description="サムネイルURL")
    duration: Optional[float] = Field(None, description="動画の長さ（秒）")
