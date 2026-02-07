"""Tests for Image Library Service"""
import io
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from PIL import Image

from app.library.schemas import (
    AspectRatio,
    ImageCategory,
    ImageLibraryCreate,
    ImageLibraryFromGeneration,
    ImageLibraryListParams,
    ImageLibraryUpdate,
    ImageSource,
)
from app.library.service import (
    create_library_image,
    create_library_image_from_generation,
    delete_library_image,
    generate_thumbnail,
    get_all_images,
    get_library_image,
    get_library_images,
    update_library_image,
    _determine_aspect_ratio,
)


# ===== Helper Functions Tests =====

def test_determine_aspect_ratio_portrait():
    """9:16の縦長画像"""
    assert _determine_aspect_ratio(720, 1280) == AspectRatio.PORTRAIT
    assert _determine_aspect_ratio(1080, 1920) == AspectRatio.PORTRAIT


def test_determine_aspect_ratio_landscape():
    """16:9の横長画像"""
    assert _determine_aspect_ratio(1920, 1080) == AspectRatio.LANDSCAPE
    assert _determine_aspect_ratio(1280, 720) == AspectRatio.LANDSCAPE


def test_determine_aspect_ratio_square():
    """1:1の正方形画像"""
    assert _determine_aspect_ratio(1000, 1000) == AspectRatio.SQUARE
    assert _determine_aspect_ratio(512, 512) == AspectRatio.SQUARE


# ===== Thumbnail Generation Tests =====

@pytest.mark.asyncio
async def test_generate_thumbnail():
    """サムネイル生成のテスト"""
    # テスト画像を作成（800x600のRGB画像）
    img = Image.new('RGB', (800, 600), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    image_content = buffer.getvalue()
    
    # サムネイル生成
    thumbnail_content = await generate_thumbnail(image_content, max_size=(256, 256))
    
    # サムネイルが生成されたことを確認
    assert thumbnail_content is not None
    assert len(thumbnail_content) > 0
    
    # サムネイルサイズを確認
    thumb_img = Image.open(io.BytesIO(thumbnail_content))
    assert thumb_img.width <= 256
    assert thumb_img.height <= 256


@pytest.mark.asyncio
async def test_generate_thumbnail_rgba():
    """RGBA画像のサムネイル生成（透明度処理）"""
    # RGBA画像を作成
    img = Image.new('RGBA', (800, 600), color=(255, 0, 0, 128))
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    image_content = buffer.getvalue()
    
    # サムネイル生成（RGBに変換されるはず）
    thumbnail_content = await generate_thumbnail(image_content)
    
    thumb_img = Image.open(io.BytesIO(thumbnail_content))
    assert thumb_img.mode == 'RGB'


# ===== CRUD Operations Tests =====

@pytest.mark.asyncio
async def test_create_library_image():
    """画像アップロードのテスト"""
    # モックの設定
    mock_supabase = MagicMock()
    mock_result = MagicMock()
    mock_result.data = [{
        "id": "test-id",
        "user_id": "user-123",
        "name": "Test Image",
        "description": "Test description",
        "image_url": "https://example.com/image.png",
        "thumbnail_url": "https://example.com/thumb.jpg",
        "r2_key": "library/user-123/test.png",
        "width": 800,
        "height": 600,
        "aspect_ratio": "16:9",
        "file_size_bytes": 12345,
        "source": "uploaded",
        "image_provider": None,
        "generated_prompt_ja": None,
        "generated_prompt_en": None,
        "category": "general",
        "created_at": "2026-01-20T00:00:00Z",
        "updated_at": "2026-01-20T00:00:00Z",
    }]
    
    mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_result
    
    # テスト画像を作成
    img = Image.new('RGB', (800, 600), color='blue')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    image_content = buffer.getvalue()
    
    # テストデータ
    data = ImageLibraryCreate(
        name="Test Image",
        description="Test description",
        category=ImageCategory.GENERAL
    )
    
    # R2アップロードをモック
    with patch('app.external.r2.upload_image', new=AsyncMock(side_effect=[
        "https://example.com/image.png",
        "https://example.com/thumb.jpg"
    ])):
        result = await create_library_image(
            mock_supabase,
            "user-123",
            data,
            image_content,
            "test.png"
        )
    
    # 結果を検証
    assert result.id == "test-id"
    assert result.name == "Test Image"
    assert result.source == ImageSource.UPLOADED


@pytest.mark.asyncio
async def test_create_library_image_from_generation():
    """生成画像からライブラリ作成のテスト"""
    mock_supabase = MagicMock()
    mock_result = MagicMock()
    mock_result.data = [{
        "id": "gen-id",
        "user_id": "user-123",
        "name": "Generated Image",
        "description": None,
        "image_url": "https://example.com/gen.png",
        "thumbnail_url": "https://example.com/gen_thumb.jpg",
        "r2_key": "library/user-123/gen.png",
        "width": 768,
        "height": 1365,
        "aspect_ratio": "9:16",
        "file_size_bytes": 54321,
        "source": "generated",
        "image_provider": "nanobanana",
        "generated_prompt_ja": "テストプロンプト",
        "generated_prompt_en": "Test prompt",
        "category": "character",
        "created_at": "2026-01-20T00:00:00Z",
        "updated_at": "2026-01-20T00:00:00Z",
    }]
    
    mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_result
    
    # テスト画像を作成
    img = Image.new('RGB', (768, 1365), color='green')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    image_content = buffer.getvalue()
    
    data = ImageLibraryFromGeneration(
        name="Generated Image",
        description=None,
        image_url="https://source.com/image.png",
        image_provider="nanobanana",
        generated_prompt_ja="テストプロンプト",
        generated_prompt_en="Test prompt",
        width=768,
        height=1365,
        category=ImageCategory.CHARACTER
    )
    
    with patch('app.external.r2.download_file', new=AsyncMock(return_value=image_content)), \
         patch('app.external.r2.upload_image', new=AsyncMock(side_effect=[
             "https://example.com/gen.png",
             "https://example.com/gen_thumb.jpg"
         ])):
        result = await create_library_image_from_generation(
            mock_supabase,
            "user-123",
            data
        )
    
    assert result.id == "gen-id"
    assert result.source == ImageSource.GENERATED
    assert result.image_provider == "nanobanana"


@pytest.mark.asyncio
async def test_get_library_images():
    """画像一覧取得のテスト"""
    mock_supabase = MagicMock()
    
    # count用のモック
    mock_count_result = MagicMock()
    mock_count_result.count = 5
    mock_count_result.data = []
    
    # データ取得用のモック
    mock_data_result = MagicMock()
    mock_data_result.data = [
        {
            "id": f"img-{i}",
            "user_id": "user-123",
            "name": f"Image {i}",
            "description": None,
            "image_url": f"https://example.com/img{i}.png",
            "thumbnail_url": f"https://example.com/thumb{i}.jpg",
            "r2_key": f"library/user-123/img{i}.png",
            "width": 800,
            "height": 600,
            "aspect_ratio": "16:9",
            "file_size_bytes": 10000,
            "source": "uploaded",
            "image_provider": None,
            "generated_prompt_ja": None,
            "generated_prompt_en": None,
            "category": "general",
            "created_at": "2026-01-20T00:00:00Z",
            "updated_at": "2026-01-20T00:00:00Z",
        }
        for i in range(3)
    ]
    
    # チェーンメソッドのモック設定
    mock_chain = MagicMock()
    mock_chain.eq.return_value = mock_chain
    mock_chain.execute.side_effect = [mock_count_result, mock_data_result]
    mock_chain.order.return_value.range.return_value = mock_chain
    
    mock_supabase.table.return_value.select.return_value = mock_chain
    
    params = ImageLibraryListParams(page=1, per_page=20)
    result = await get_library_images(mock_supabase, "user-123", params)
    
    assert result.total == 5
    assert len(result.images) == 3
    assert result.page == 1


@pytest.mark.asyncio
async def test_get_library_image():
    """単一画像取得のテスト"""
    mock_supabase = MagicMock()
    mock_result = MagicMock()
    mock_result.data = {
        "id": "img-1",
        "user_id": "user-123",
        "name": "Single Image",
        "description": "Test",
        "image_url": "https://example.com/img.png",
        "thumbnail_url": "https://example.com/thumb.jpg",
        "r2_key": "library/user-123/img.png",
        "width": 1000,
        "height": 1000,
        "aspect_ratio": "1:1",
        "file_size_bytes": 20000,
        "source": "uploaded",
        "image_provider": None,
        "generated_prompt_ja": None,
        "generated_prompt_en": None,
        "category": "product",
        "created_at": "2026-01-20T00:00:00Z",
        "updated_at": "2026-01-20T00:00:00Z",
    }
    
    mock_chain = MagicMock()
    mock_chain.select.return_value = mock_chain
    mock_chain.eq.return_value = mock_chain
    mock_chain.maybe_single.return_value = mock_chain
    mock_chain.execute.return_value = mock_result
    
    mock_supabase.table.return_value = mock_chain
    
    result = await get_library_image(mock_supabase, "user-123", "img-1")
    
    assert result is not None
    assert result.id == "img-1"
    assert result.category == ImageCategory.PRODUCT


@pytest.mark.asyncio
async def test_get_library_image_not_found():
    """存在しない画像の取得テスト"""
    mock_supabase = MagicMock()
    mock_result = MagicMock()
    mock_result.data = None
    
    mock_chain = MagicMock()
    mock_chain.select.return_value = mock_chain
    mock_chain.eq.return_value = mock_chain
    mock_chain.maybe_single.return_value = mock_chain
    mock_chain.execute.return_value = mock_result
    
    mock_supabase.table.return_value = mock_chain
    
    result = await get_library_image(mock_supabase, "user-123", "nonexistent")
    
    assert result is None


@pytest.mark.asyncio
async def test_update_library_image():
    """画像更新のテスト"""
    mock_supabase = MagicMock()
    mock_result = MagicMock()
    mock_result.data = [{
        "id": "img-1",
        "user_id": "user-123",
        "name": "Updated Name",
        "description": "Updated description",
        "image_url": "https://example.com/img.png",
        "thumbnail_url": "https://example.com/thumb.jpg",
        "r2_key": "library/user-123/img.png",
        "width": 800,
        "height": 600,
        "aspect_ratio": "16:9",
        "file_size_bytes": 10000,
        "source": "uploaded",
        "image_provider": None,
        "generated_prompt_ja": None,
        "generated_prompt_en": None,
        "category": "background",
        "created_at": "2026-01-20T00:00:00Z",
        "updated_at": "2026-01-20T00:01:00Z",
    }]
    
    mock_chain = MagicMock()
    mock_chain.update.return_value = mock_chain
    mock_chain.eq.return_value = mock_chain
    mock_chain.execute.return_value = mock_result
    
    mock_supabase.table.return_value = mock_chain
    
    data = ImageLibraryUpdate(
        name="Updated Name",
        description="Updated description",
        category=ImageCategory.BACKGROUND
    )
    
    result = await update_library_image(mock_supabase, "user-123", "img-1", data)
    
    assert result is not None
    assert result.name == "Updated Name"
    assert result.category == ImageCategory.BACKGROUND


@pytest.mark.asyncio
async def test_delete_library_image():
    """画像削除のテスト"""
    # 既存画像データのモック
    existing_image_data = {
        "id": "img-1",
        "user_id": "user-123",
        "name": "To Delete",
        "description": None,
        "image_url": "https://example.com/img.png",
        "thumbnail_url": "https://example.com/thumb.jpg",
        "r2_key": "library/user-123/img.png",
        "width": 800,
        "height": 600,
        "aspect_ratio": "16:9",
        "file_size_bytes": 10000,
        "source": "uploaded",
        "image_provider": None,
        "generated_prompt_ja": None,
        "generated_prompt_en": None,
        "category": "general",
        "created_at": "2026-01-20T00:00:00Z",
        "updated_at": "2026-01-20T00:00:00Z",
    }
    
    # get_library_imageをモック
    with patch('app.library.service.get_library_image', new=AsyncMock(return_value=MagicMock(**existing_image_data))), \
         patch('app.external.r2.delete_file', new=AsyncMock(return_value=True)):
        
        mock_supabase = MagicMock()
        mock_chain = MagicMock()
        mock_chain.delete.return_value = mock_chain
        mock_chain.eq.return_value = mock_chain
        mock_chain.execute.return_value = MagicMock()
        
        mock_supabase.table.return_value = mock_chain
        
        result = await delete_library_image(mock_supabase, "user-123", "img-1")
        
        assert result is True


# ===== Unified Image Listing Tests =====

@pytest.mark.asyncio
async def test_get_all_images():
    """統合画像一覧取得のテスト"""
    mock_supabase = MagicMock()
    
    # ライブラリ画像のモック
    library_result = MagicMock()
    library_result.data = [{
        "id": "lib-1",
        "user_id": "user-123",
        "name": "Library Image",
        "description": None,
        "image_url": "https://example.com/lib.png",
        "thumbnail_url": "https://example.com/lib_thumb.jpg",
        "width": 800,
        "height": 600,
        "aspect_ratio": "16:9",
        "source": "uploaded",
        "category": "general",
        "created_at": "2026-01-20T01:00:00Z",
    }]
    
    # スクリーンショット画像のモック
    screenshot_result = MagicMock()
    screenshot_result.data = [{
        "id": "ss-1",
        "user_id": "user-123",
        "original_image_url": "https://example.com/screenshot.png",
        "created_at": "2026-01-20T00:00:00Z",
    }]
    
    # チェーンメソッドのモック
    library_chain = MagicMock()
    library_chain.select.return_value = library_chain
    library_chain.eq.return_value = library_chain
    library_chain.order.return_value = library_chain
    library_chain.execute.return_value = library_result
    
    screenshot_chain = MagicMock()
    screenshot_chain.select.return_value = screenshot_chain
    screenshot_chain.eq.return_value = screenshot_chain
    screenshot_chain.not_ = MagicMock()
    screenshot_chain.not_.is_.return_value = screenshot_chain
    screenshot_chain.order.return_value = screenshot_chain
    screenshot_chain.execute.return_value = screenshot_result
    
    # table()の呼び出しごとに異なるチェーンを返す
    mock_supabase.table.side_effect = [library_chain, screenshot_chain]
    
    result = await get_all_images(mock_supabase, "user-123", source_filter="all")
    
    assert result.total == 2
    assert len(result.images) == 2
    # ライブラリ画像が先（新しい順）
    assert result.images[0].id == "lib-1"
    assert result.images[1].id == "ss-1"
