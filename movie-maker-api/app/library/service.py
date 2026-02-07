"""Image Library Service Layer"""
import io
import logging
from uuid import uuid4

from PIL import Image
from supabase import Client

from app.library.schemas import (
    AspectRatio,
    ImageLibraryCreate,
    ImageLibraryFromGeneration,
    ImageLibraryItem,
    ImageLibraryListParams,
    ImageLibraryListResponse,
    ImageLibraryUpdate,
    ImageSource,
    ScreenshotItem,
    UnifiedImageListResponse,
)

logger = logging.getLogger(__name__)


# ===== Helper Functions =====

def _determine_aspect_ratio(width: int, height: int) -> AspectRatio:
    """画像の幅と高さからアスペクト比を判定"""
    ratio = width / height
    
    # 9:16 = 0.5625
    # 16:9 = 1.7778
    # 1:1 = 1.0
    
    if 0.5 <= ratio <= 0.6:  # 9:16 付近
        return AspectRatio.PORTRAIT
    elif 1.7 <= ratio <= 1.9:  # 16:9 付近
        return AspectRatio.LANDSCAPE
    else:  # その他は正方形扱い
        return AspectRatio.SQUARE


def _format_library_image(data: dict) -> dict:
    """DBレコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "name": data["name"],
        "description": data.get("description"),
        "image_url": data["image_url"],
        "thumbnail_url": data.get("thumbnail_url"),
        "r2_key": data["r2_key"],
        "width": data["width"],
        "height": data["height"],
        "aspect_ratio": data["aspect_ratio"],
        "file_size_bytes": data.get("file_size_bytes"),
        "source": data["source"],
        "image_provider": data.get("image_provider"),
        "generated_prompt_ja": data.get("generated_prompt_ja"),
        "generated_prompt_en": data.get("generated_prompt_en"),
        "category": data["category"],
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


# ===== Thumbnail Generation =====

async def generate_thumbnail(
    image_content: bytes,
    max_size: tuple[int, int] = (256, 256)
) -> bytes:
    """
    画像のサムネイルを生成
    
    Args:
        image_content: 元画像のバイトデータ
        max_size: サムネイルの最大サイズ (width, height)
    
    Returns:
        bytes: サムネイル画像のバイトデータ（JPEG形式）
    """
    try:
        # 画像を開く
        img = Image.open(io.BytesIO(image_content))
        
        # RGBAの場合はRGBに変換（JPEG保存のため）
        if img.mode in ('RGBA', 'LA', 'P'):
            # 白背景を作成
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # サムネイル生成（アスペクト比維持）
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # バイトデータに変換
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85, optimize=True)
        buffer.seek(0)
        
        return buffer.read()
    
    except Exception as e:
        logger.error(f"Failed to generate thumbnail: {e}")
        raise ValueError(f"サムネイル生成に失敗しました: {e}")


# ===== CRUD Operations =====

async def create_library_image(
    supabase: Client,
    user_id: str,
    data: ImageLibraryCreate,
    image_content: bytes,
    filename: str,
) -> ImageLibraryItem:
    """
    画像ライブラリに画像を追加（アップロード）
    
    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        data: 画像メタデータ
        image_content: 画像バイトデータ
        filename: 元のファイル名
    
    Returns:
        ImageLibraryItem: 作成された画像情報
    """
    from app.external.r2 import upload_image
    
    # 画像サイズを取得
    img = Image.open(io.BytesIO(image_content))
    width, height = img.size
    file_size = len(image_content)
    
    # アスペクト比を判定
    aspect_ratio = _determine_aspect_ratio(width, height)
    
    # サムネイル生成
    thumbnail_content = await generate_thumbnail(image_content)
    
    # R2にアップロード
    image_uuid = str(uuid4())
    ext = filename.split(".")[-1].lower() if "." in filename else "png"
    
    image_key = f"library/{user_id}/{image_uuid}.{ext}"
    thumb_key = f"library/{user_id}/{image_uuid}_thumb.jpg"
    
    image_url = await upload_image(image_content, image_key)
    thumbnail_url = await upload_image(thumbnail_content, thumb_key)
    
    # DBに保存
    record = {
        "user_id": user_id,
        "name": data.name,
        "description": data.description,
        "image_url": image_url,
        "thumbnail_url": thumbnail_url,
        "r2_key": image_key,
        "width": width,
        "height": height,
        "aspect_ratio": aspect_ratio.value,
        "file_size_bytes": file_size,
        "source": ImageSource.UPLOADED.value,
        "category": data.category.value,
    }
    
    result = supabase.table("user_image_library").insert(record).execute()
    
    return ImageLibraryItem(**_format_library_image(result.data[0]))


async def create_library_image_from_generation(
    supabase: Client,
    user_id: str,
    data: ImageLibraryFromGeneration
) -> ImageLibraryItem:
    """
    生成画像を画像ライブラリに追加
    
    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        data: 生成画像情報
    
    Returns:
        ImageLibraryItem: 作成された画像情報
    """
    from app.external.r2 import download_file, upload_image
    
    # 生成画像をダウンロード
    image_content = await download_file(data.image_url)
    
    # サムネイル生成
    thumbnail_content = await generate_thumbnail(image_content)
    
    # アスペクト比を判定
    aspect_ratio = _determine_aspect_ratio(data.width, data.height)
    
    # R2にコピー（永続化）
    image_uuid = str(uuid4())
    image_key = f"library/{user_id}/{image_uuid}.png"
    thumb_key = f"library/{user_id}/{image_uuid}_thumb.jpg"
    
    image_url = await upload_image(image_content, image_key)
    thumbnail_url = await upload_image(thumbnail_content, thumb_key)
    
    # DBに保存
    record = {
        "user_id": user_id,
        "name": data.name,
        "description": data.description,
        "image_url": image_url,
        "thumbnail_url": thumbnail_url,
        "r2_key": image_key,
        "width": data.width,
        "height": data.height,
        "aspect_ratio": aspect_ratio.value,
        "file_size_bytes": len(image_content),
        "source": ImageSource.GENERATED.value,
        "image_provider": data.image_provider,
        "generated_prompt_ja": data.generated_prompt_ja,
        "generated_prompt_en": data.generated_prompt_en,
        "category": data.category.value,
    }
    
    result = supabase.table("user_image_library").insert(record).execute()
    
    return ImageLibraryItem(**_format_library_image(result.data[0]))


async def get_library_images(
    supabase: Client,
    user_id: str,
    params: ImageLibraryListParams
) -> ImageLibraryListResponse:
    """
    画像ライブラリ一覧を取得
    
    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        params: 検索パラメータ
    
    Returns:
        ImageLibraryListResponse: 画像一覧
    """
    # クエリを構築
    query = supabase.table("user_image_library").select("*", count="exact").eq("user_id", user_id)
    
    # フィルタ
    if params.category:
        query = query.eq("category", params.category.value)
    if params.source:
        query = query.eq("source", params.source.value)
    
    # 総数を取得
    count_result = query.execute()
    total = count_result.count or 0
    
    # ページネーション
    offset = (params.page - 1) * params.per_page
    query = query.order("created_at", desc=True).range(offset, offset + params.per_page - 1)
    
    result = query.execute()
    images = [ImageLibraryItem(**_format_library_image(item)) for item in result.data]
    
    return ImageLibraryListResponse(
        images=images,
        total=total,
        page=params.page,
        per_page=params.per_page,
        has_next=offset + params.per_page < total,
    )


async def get_library_image(
    supabase: Client,
    user_id: str,
    image_id: str
) -> ImageLibraryItem | None:
    """
    画像ライブラリから画像を取得
    
    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        image_id: 画像ID
    
    Returns:
        ImageLibraryItem | None: 画像情報（存在しない場合はNone）
    """
    result = supabase.table("user_image_library") \
        .select("*") \
        .eq("id", image_id) \
        .eq("user_id", user_id) \
        .maybe_single() \
        .execute()
    
    if not result.data:
        return None
    
    return ImageLibraryItem(**_format_library_image(result.data))


async def update_library_image(
    supabase: Client,
    user_id: str,
    image_id: str,
    data: ImageLibraryUpdate
) -> ImageLibraryItem | None:
    """
    画像ライブラリの画像を更新
    
    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        image_id: 画像ID
        data: 更新データ
    
    Returns:
        ImageLibraryItem | None: 更新後の画像情報（存在しない場合はNone）
    """
    # 更新データを構築（Noneでない項目のみ）
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.category is not None:
        update_data["category"] = data.category.value
    
    if not update_data:
        # 更新項目がない場合は現在の状態を返す
        return await get_library_image(supabase, user_id, image_id)
    
    # 更新実行
    result = supabase.table("user_image_library") \
        .update(update_data) \
        .eq("id", image_id) \
        .eq("user_id", user_id) \
        .execute()
    
    if not result.data:
        return None
    
    return ImageLibraryItem(**_format_library_image(result.data[0]))


async def delete_library_image(
    supabase: Client,
    user_id: str,
    image_id: str
) -> bool:
    """
    画像ライブラリから画像を削除
    
    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        image_id: 画像ID
    
    Returns:
        bool: 削除成功したかどうか
    """
    from app.external.r2 import delete_file
    
    # 画像情報を取得
    image = await get_library_image(supabase, user_id, image_id)
    if not image:
        return False
    
    # R2から削除
    try:
        await delete_file(image.r2_key)
        if image.thumbnail_url:
            thumb_key = image.r2_key.rsplit(".", 1)[0] + "_thumb.jpg"
            await delete_file(thumb_key)
    except Exception as e:
        logger.warning(f"Failed to delete R2 files: {e}")
    
    # DBから削除
    supabase.table("user_image_library") \
        .delete() \
        .eq("id", image_id) \
        .eq("user_id", user_id) \
        .execute()
    
    return True


# ===== Unified Image Listing =====

async def get_all_images(
    supabase: Client,
    user_id: str,
    source_filter: str | None = None,
    category: str | None = None,
    page: int = 1,
    per_page: int = 20
) -> UnifiedImageListResponse:
    """
    すべての画像を取得（ライブラリ + スクリーンショット統合）

    Args:
        supabase: Supabaseクライアント
        user_id: ユーザーID
        source_filter: ソースフィルタ ("all", "library", "screenshot")
        category: カテゴリフィルタ
        page: ページ番号
        per_page: 1ページあたりの件数

    Returns:
        UnifiedImageListResponse: 統合画像一覧
    """
    library_images: list[ImageLibraryItem] = []
    screenshots: list[ScreenshotItem] = []
    total_library = 0
    total_screenshots = 0

    # ライブラリ画像を取得
    if source_filter in (None, "all", "library"):
        library_query = supabase.table("user_image_library") \
            .select("*", count="exact") \
            .eq("user_id", user_id)

        if category:
            library_query = library_query.eq("category", category)

        library_result = library_query.order("created_at", desc=True).execute()
        total_library = library_result.count or len(library_result.data)

        for item in library_result.data:
            library_images.append(ImageLibraryItem(**_format_library_image(item)))

    # スクリーンショット画像を取得（video_generationsの元画像）
    if source_filter in (None, "all", "screenshot"):
        screenshot_query = supabase.table("video_generations") \
            .select("id, user_id, original_image_url, created_at", count="exact") \
            .eq("user_id", user_id) \
            .not_.is_("original_image_url", "null") \
            .neq("original_image_url", "")

        screenshot_result = screenshot_query.order("created_at", desc=True).execute()
        total_screenshots = screenshot_result.count or len(screenshot_result.data)

        for item in screenshot_result.data:
            screenshots.append(ScreenshotItem(
                id=str(item["id"]),
                user_id=str(item["user_id"]),
                title=f"元画像 {item['id'][:8]}",
                image_url=item["original_image_url"],
                source_video_url=None,
                timestamp_ms=None,
                created_at=item["created_at"],
            ))

    return UnifiedImageListResponse(
        library_images=library_images,
        screenshots=screenshots,
        total_library=total_library,
        total_screenshots=total_screenshots,
        page=page,
        per_page=per_page,
    )
