"""Image Library Schemas"""
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class ImageSource(str, Enum):
    """画像のソース"""
    GENERATED = "generated"  # AI生成画像
    UPLOADED = "uploaded"    # ユーザーアップロード


class ImageCategory(str, Enum):
    """画像カテゴリ"""
    CHARACTER = "character"    # キャラクター
    BACKGROUND = "background"  # 背景
    PRODUCT = "product"        # 商品
    GENERAL = "general"        # 汎用


class AspectRatio(str, Enum):
    """アスペクト比"""
    PORTRAIT = "9:16"   # 縦長
    LANDSCAPE = "16:9"  # 横長
    SQUARE = "1:1"      # 正方形


class ImageLibraryCreate(BaseModel):
    """画像ライブラリ作成（アップロード用）"""
    name: str = Field(..., min_length=1, max_length=200, description="画像名")
    description: str | None = Field(None, max_length=1000, description="説明")
    category: ImageCategory = Field(default=ImageCategory.GENERAL, description="カテゴリ")


class ImageLibraryFromGeneration(BaseModel):
    """画像ライブラリ作成（生成画像から）"""
    name: str = Field(..., min_length=1, max_length=200, description="画像名")
    description: str | None = Field(None, max_length=1000, description="説明")
    image_url: str = Field(..., description="生成された画像のURL")
    image_provider: str = Field(..., description="画像生成プロバイダー")
    generated_prompt_ja: str | None = Field(None, description="生成プロンプト（日本語）")
    generated_prompt_en: str | None = Field(None, description="生成プロンプト（英語）")
    width: int = Field(..., gt=0, description="画像幅（ピクセル）")
    height: int = Field(..., gt=0, description="画像高さ（ピクセル）")
    category: ImageCategory = Field(default=ImageCategory.GENERAL, description="カテゴリ")


class ImageLibraryUpdate(BaseModel):
    """画像ライブラリ更新"""
    name: str | None = Field(None, min_length=1, max_length=200, description="画像名")
    description: str | None = Field(None, max_length=1000, description="説明")
    category: ImageCategory | None = Field(None, description="カテゴリ")


class ImageLibraryListParams(BaseModel):
    """画像ライブラリ一覧取得パラメータ"""
    category: ImageCategory | None = Field(None, description="カテゴリでフィルタ")
    source: ImageSource | None = Field(None, description="ソースでフィルタ")
    page: int = Field(default=1, ge=1, description="ページ番号")
    per_page: int = Field(default=20, ge=1, le=100, description="1ページあたりの件数")


class ImageLibraryItem(BaseModel):
    """画像ライブラリアイテム"""
    id: str
    user_id: str
    name: str
    description: str | None
    image_url: str
    thumbnail_url: str | None
    r2_key: str
    width: int
    height: int
    aspect_ratio: AspectRatio
    file_size_bytes: int | None
    source: ImageSource
    image_provider: str | None
    generated_prompt_ja: str | None
    generated_prompt_en: str | None
    category: ImageCategory
    created_at: datetime
    updated_at: datetime


class ImageLibraryListResponse(BaseModel):
    """画像ライブラリ一覧レスポンス"""
    images: list[ImageLibraryItem]
    total: int
    page: int
    per_page: int
    has_next: bool


class UnifiedImageItem(BaseModel):
    """統合画像アイテム（ライブラリ + スクリーンショット）"""
    id: str
    user_id: str
    name: str
    description: str | None
    image_url: str
    thumbnail_url: str | None
    width: int
    height: int
    aspect_ratio: str
    source: str  # "generated", "uploaded", "screenshot"
    category: str | None
    created_at: datetime


class ScreenshotItem(BaseModel):
    """スクリーンショットアイテム"""
    id: str
    user_id: str
    title: str | None = None
    image_url: str
    source_video_url: str | None = None
    timestamp_ms: int | None = None
    created_at: datetime


class UnifiedImageListResponse(BaseModel):
    """統合画像一覧レスポンス（フロントエンド期待形式）"""
    library_images: list[ImageLibraryItem]
    screenshots: list[ScreenshotItem]
    total_library: int
    total_screenshots: int
    page: int
    per_page: int
