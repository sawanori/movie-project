from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from enum import Enum
from typing import Self


class VideoStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PREVIEW = "preview"  # プレビュー確認待ち


class GenerationMode(str, Enum):
    STORY = "story"    # AI主導ストーリーテリング
    MANUAL = "manual"  # 従来の手動モード


class OverlaySettings(BaseModel):
    """テキストオーバーレイ設定"""
    text: str | None = Field(None, max_length=100, description="オーバーレイテキスト")
    position: str = Field("bottom", description="位置: top, center, bottom")
    font: str = Field("default", description="フォント名")
    color: str = Field("#FFFFFF", description="テキスト色")


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
    image_urls: list[str] = []  # 新規: 複数画像対応
    original_image_url: str  # 後方互換性のため維持
    user_prompt: str
    optimized_prompt: str | None = None
    overlay_text: str | None = None
    overlay_position: str | None = None
    raw_video_url: str | None = None
    final_video_url: str | None = None
    error_message: str | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

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


class FilmGrainPreset(str, Enum):
    """フィルムグレイン強度プリセット"""
    NONE = "none"          # グレインなし (0%)
    LIGHT = "light"        # 軽め - 料理・風景向け (15%)
    MEDIUM = "medium"      # 標準 (30%)
    HEAVY = "heavy"        # 強め - 人物・ポートレート向け (45%)


class StoryVideoCreate(BaseModel):
    """ストーリー動画生成リクエスト（AI主導モード）"""
    image_url: str = Field(..., description="ベースとなる画像URL（フレーム1）")
    story_text: str = Field(..., min_length=1, max_length=200, description="ストーリー文")
    bgm_track_id: str | None = Field(None, description="BGMのID（オプション）")
    overlay: OverlaySettings | None = Field(None, description="オーバーレイ設定")
    film_grain: FilmGrainPreset = Field(FilmGrainPreset.MEDIUM, description="フィルムグレイン強度")


class StoryVideoResponse(BaseModel):
    """ストーリー動画生成レスポンス"""
    id: str
    user_id: str
    status: VideoStatus
    progress: int = 0
    generation_mode: GenerationMode = GenerationMode.STORY
    original_image_url: str
    story_text: str
    base_prompt: str | None = None
    storyboard_prompts: list[dict] | None = None
    ai_generated_image_urls: list[str] = []
    image_urls: list[str] = []
    final_video_url: str | None = None
    error_message: str | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ===== プレビュー用スキーマ =====

class StoryPreviewRequest(BaseModel):
    """ストーリープレビュー生成リクエスト"""
    image_url: str = Field(..., description="ベースとなる画像URL")
    story_text: str = Field(..., min_length=1, max_length=200, description="ストーリー文")


class FramePrompt(BaseModel):
    """フレームごとのプロンプト"""
    frame: int
    scene: str
    element: str
    action: str
    style: str
    full_prompt: str


class StoryPreviewResponse(BaseModel):
    """ストーリープレビューレスポンス"""
    preview_id: str = Field(..., description="プレビューID（確認後に使用）")
    original_image_url: str
    story_text: str
    base_prompt: str
    frame_prompts: list[FramePrompt]
    generated_image_urls: list[str] = Field(..., description="AI生成画像URL（フレーム2,3）")


class StoryConfirmRequest(BaseModel):
    """ストーリー動画生成確認リクエスト"""
    preview_id: str = Field(..., description="プレビューID")
    bgm_track_id: str | None = Field(None, description="BGMのID（オプション）")
    overlay: OverlaySettings | None = Field(None, description="オーバーレイ設定")
    film_grain: FilmGrainPreset = Field(FilmGrainPreset.MEDIUM, description="フィルムグレイン強度")
    use_lut: bool = Field(True, description="LUT（カラーグレーディング）を適用するか")
