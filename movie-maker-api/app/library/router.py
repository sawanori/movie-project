"""
画像ライブラリAPIルーター
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from typing import Optional

from app.core.dependencies import get_current_user
from app.core.supabase import get_supabase
from app.library.schemas import (
    ImageLibraryCreate,
    ImageLibraryFromGeneration,
    ImageLibraryUpdate,
    ImageLibraryItem,
    ImageLibraryListResponse,
    ImageCategory,
    ImageSource,
    ImageLibraryListParams,
    ScreenshotItem,
    UnifiedImageListResponse,
)
from app.library import service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/library", tags=["library"])


# ===== ライブラリ専用API =====

@router.get("/images", response_model=ImageLibraryListResponse)
async def list_library_images(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: Optional[ImageCategory] = None,
    source: Optional[ImageSource] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    画像ライブラリ一覧を取得

    Args:
        page: ページ番号
        per_page: 1ページあたりの件数
        category: カテゴリフィルタ
        source: ソースフィルタ (generated/uploaded)
        current_user: 現在のユーザー情報

    Returns:
        ImageLibraryListResponse: 画像一覧
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    params = ImageLibraryListParams(
        page=page,
        per_page=per_page,
        category=category,
        source=source,
    )

    try:
        result = await service.get_library_images(db, user_id, params)
        return result
    except Exception as e:
        logger.error(f"Failed to list library images: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="画像一覧の取得に失敗しました"
        )


@router.get("/images/{image_id}", response_model=ImageLibraryItem)
async def get_library_image(
    image_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    画像ライブラリアイテムの詳細を取得

    Args:
        image_id: 画像ID
        current_user: 現在のユーザー情報

    Returns:
        ImageLibraryItem: 画像詳細
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    image = await service.get_library_image(db, user_id, image_id)

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="画像が見つかりません"
        )

    return image


@router.post("/images", response_model=ImageLibraryItem)
async def create_library_image(
    file: UploadFile = File(...),
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: ImageCategory = ImageCategory.GENERAL,
    current_user: dict = Depends(get_current_user),
):
    """
    アップロード画像をライブラリに保存

    Args:
        file: アップロードファイル
        name: 画像名
        description: 画像の説明
        category: 画像カテゴリ
        current_user: 現在のユーザー情報

    Returns:
        ImageLibraryItem: 作成された画像情報
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    # ファイルサイズチェック（10MB制限）
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="ファイルサイズは10MB以下にしてください"
        )

    # ファイル形式チェック
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"サポートされていないファイル形式です。対応形式: {', '.join(allowed_types)}"
        )

    try:
        data = ImageLibraryCreate(
            image_url="",  # serviceで生成されるため一時的に空
            name=name,
            description=description,
            category=category,
        )

        result = await service.create_library_image(
            db,
            user_id,
            data,
            content,
            file.filename or "upload.png"
        )

        return result
    except ValueError as e:
        logger.error(f"Failed to create library image: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to create library image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="画像の保存に失敗しました"
        )


@router.post("/images/from-generation", response_model=ImageLibraryItem)
async def create_library_image_from_generation(
    request: ImageLibraryFromGeneration,
    current_user: dict = Depends(get_current_user),
):
    """
    生成画像をライブラリに保存

    Args:
        request: 生成画像情報
        current_user: 現在のユーザー情報

    Returns:
        ImageLibraryItem: 作成された画像情報
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    try:
        result = await service.create_library_image_from_generation(db, user_id, request)
        return result
    except Exception as e:
        logger.error(f"Failed to create library image from generation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="生成画像の保存に失敗しました"
        )


@router.put("/images/{image_id}", response_model=ImageLibraryItem)
async def update_library_image(
    image_id: str,
    request: ImageLibraryUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    画像ライブラリアイテムのメタデータを更新

    Args:
        image_id: 画像ID
        request: 更新データ
        current_user: 現在のユーザー情報

    Returns:
        ImageLibraryItem: 更新された画像情報
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    image = await service.update_library_image(db, user_id, image_id, request)

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="画像が見つかりません"
        )

    return image


@router.delete("/images/{image_id}")
async def delete_library_image(
    image_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    画像ライブラリアイテムを削除

    Args:
        image_id: 画像ID
        current_user: 現在のユーザー情報

    Returns:
        dict: 削除結果
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    success = await service.delete_library_image(db, user_id, image_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="画像が見つかりません"
        )

    return {"message": "画像を削除しました"}


# ===== 統合API（ライブラリ + スクリーンショット） =====

@router.get("/all-images", response_model=UnifiedImageListResponse)
async def list_all_images(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    source_filter: str = Query("all"),  # "all", "library", "screenshot"
    category: Optional[ImageCategory] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    統合画像一覧を取得（ライブラリ + スクリーンショット）

    フロントエンドで画像選択UIを表示する際に使用。
    ライブラリ保存画像とスクリーンショットを統合して返す。

    Args:
        page: ページ番号
        per_page: 1ページあたりの件数
        source_filter: ソースフィルタ ("all", "library", "screenshot")
        category: カテゴリフィルタ
        current_user: 現在のユーザー情報

    Returns:
        UnifiedImageListResponse: 統合画像一覧
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    # source_filterのバリデーション
    if source_filter not in ("all", "library", "screenshot"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source_filterは 'all', 'library', 'screenshot' のいずれかを指定してください"
        )

    try:
        result = await service.get_all_images(
            db,
            user_id,
            source_filter=source_filter,
            category=category.value if category else None,
            page=page,
            per_page=per_page,
        )
        return result
    except Exception as e:
        logger.error(f"Failed to list all images: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="画像一覧の取得に失敗しました"
        )


@router.delete("/source-images/{image_id}")
async def delete_source_image(
    image_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    動画生成の元画像を削除（参照を解除）

    video_generationsテーブルのoriginal_image_urlをNULLに設定する。
    実際の画像ファイルは削除しない（他で参照されている可能性があるため）。

    Args:
        image_id: video_generationsのID
        current_user: 現在のユーザー情報

    Returns:
        dict: 削除結果
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    # 存在確認
    result = db.table("video_generations").select("id, original_image_url").eq(
        "id", image_id
    ).eq("user_id", user_id).maybe_single().execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="画像が見つかりません"
        )

    original_url = result.data.get("original_image_url")
    if not original_url or original_url == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="この画像は既に削除されています"
        )

    # original_image_urlを空文字列に設定（NOT NULL制約のため）
    db.table("video_generations").update({
        "original_image_url": ""
    }).eq("id", image_id).eq("user_id", user_id).execute()

    logger.info(f"Source image removed from video_generation: {image_id} for user {user_id}")
    return {"message": "画像を削除しました"}
