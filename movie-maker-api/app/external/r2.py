import asyncio
import io
import logging

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image
from PIL.Image import Image as PILImage
from PIL import UnidentifiedImageError

from app.core.config import settings

logger = logging.getLogger(__name__)


class WebPConversionError(Exception):
    """WebP変換エラー"""
    pass


def get_r2_client():
    """Cloudflare R2クライアントを取得（S3互換）"""
    if not settings.R2_ACCOUNT_ID or not settings.R2_ACCESS_KEY_ID or not settings.R2_SECRET_ACCESS_KEY:
        raise ValueError("R2 credentials are not configured")

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def get_public_url(key: str) -> str:
    """R2オブジェクトの公開URLを取得"""
    if settings.R2_PUBLIC_URL:
        return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{key}"
    return f"https://{settings.R2_BUCKET_NAME}.r2.dev/{key}"


def convert_to_webp(
    image_content: bytes,
    quality: int = 85,
    max_size: tuple[int, int] | None = None
) -> bytes:
    """
    画像をWebP形式に変換（同期関数）
    """
    try:
        img: PILImage = Image.open(io.BytesIO(image_content))
    except UnidentifiedImageError as e:
        logger.warning(f"Failed to identify image format: {e}")
        raise WebPConversionError(f"Invalid or corrupted image: {e}") from e
    except Exception as e:
        logger.warning(f"Failed to open image: {e}")
        raise WebPConversionError(f"Failed to open image: {e}") from e

    try:
        if img.mode == 'RGBA':
            pass
        elif img.mode == 'P' and 'transparency' in img.info:
            img = img.convert('RGBA')
        elif img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')

        if max_size:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)

        output = io.BytesIO()
        img.save(output, format='WEBP', quality=quality, method=6)
        output.seek(0)
        return output.read()
    except Exception as e:
        logger.warning(f"Failed to convert image to WebP: {e}")
        raise WebPConversionError(f"Failed to convert image to WebP: {e}") from e


def _get_base_filename(filename: str) -> str:
    if '.' in filename:
        return filename.rsplit('.', 1)[0]
    return filename


def _upload_to_r2_sync(client, bucket: str, key: str, body: bytes, content_type: str, cache_control: str) -> None:
    client.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type, CacheControl=cache_control)


async def upload_image(file_content: bytes, filename: str) -> str:
    """画像をR2にアップロード"""
    client = get_r2_client()
    key = f"images/{filename}"

    # Content-Typeを推測
    content_type = "image/jpeg"
    if filename.lower().endswith(".png"):
        content_type = "image/png"
    elif filename.lower().endswith(".webp"):
        content_type = "image/webp"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)


async def upload_image_with_webp(file_content: bytes, filename: str) -> tuple[str, str]:
    """画像をオリジナルとWebP両方でアップロード"""
    client = get_r2_client()

    # Determine content type
    original_key = f"images/{filename}"
    content_type = "image/jpeg"
    if filename.lower().endswith(".png"):
        content_type = "image/png"
    elif filename.lower().endswith(".webp"):
        content_type = "image/webp"
    elif filename.lower().endswith(".gif"):
        content_type = "image/gif"

    # Upload original
    await asyncio.to_thread(
        _upload_to_r2_sync, client, settings.R2_BUCKET_NAME, original_key,
        file_content, content_type, "public, max-age=31536000, immutable"
    )
    original_url = get_public_url(original_key)

    # Convert and upload WebP
    webp_content = await asyncio.to_thread(convert_to_webp, file_content)
    base_filename = _get_base_filename(filename)
    webp_key = f"images/webp/{base_filename}.webp"
    await asyncio.to_thread(
        _upload_to_r2_sync, client, settings.R2_BUCKET_NAME, webp_key,
        webp_content, "image/webp", "public, max-age=31536000, immutable"
    )
    webp_url = get_public_url(webp_key)

    return original_url, webp_url


async def upload_image_optional_webp(
    file_content: bytes, filename: str, generate_webp: bool = True
) -> tuple[str, str | None]:
    """画像アップロード（WebP生成はオプション）"""
    if generate_webp:
        try:
            return await upload_image_with_webp(file_content, filename)
        except WebPConversionError as e:
            logger.warning(f"WebP conversion failed, uploading original only: {e}")
            original_url = await upload_image(file_content, filename)
            return original_url, None
    else:
        original_url = await upload_image(file_content, filename)
        return original_url, None


async def upload_video(file_content: bytes, filename: str) -> str:
    """動画をR2にアップロード"""
    client = get_r2_client()
    key = f"videos/{filename}"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType="video/mp4",
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)


async def upload_audio(file_content: bytes, filename: str) -> str:
    """音声ファイルをR2にアップロード"""
    client = get_r2_client()
    key = f"bgm/{filename}"

    # Content-Typeを推測
    content_type = "audio/mpeg"
    if filename.lower().endswith(".wav"):
        content_type = "audio/wav"
    elif filename.lower().endswith(".ogg"):
        content_type = "audio/ogg"
    elif filename.lower().endswith(".m4a"):
        content_type = "audio/mp4"
    elif filename.lower().endswith(".aac"):
        content_type = "audio/aac"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)


async def download_file(url: str) -> bytes:
    """外部URLからファイルをダウンロード（リダイレクト対応）"""
    import httpx

    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=120.0)
        response.raise_for_status()
        return response.content


async def delete_file(key: str) -> bool:
    """R2からファイルを削除"""
    try:
        client = get_r2_client()
        client.delete_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
        )
        return True
    except ClientError:
        return False


def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    """署名付きURLを生成（プライベートアクセス用）"""
    client = get_r2_client()
    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.R2_BUCKET_NAME,
            "Key": key,
        },
        ExpiresIn=expires_in,
    )


class R2Client:
    """R2クライアントクラス（video_processorから使用）"""

    async def upload_file(
        self,
        file_data: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """ファイルをR2にアップロード"""
        try:
            client = get_r2_client()
            client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=key,
                Body=file_data,
                ContentType=content_type,
                CacheControl="public, max-age=31536000, immutable",
            )
            return get_public_url(key)
        except ClientError as e:
            raise Exception(f"R2 upload failed: {e}")


async def upload_user_video(file_content: bytes, key: str, content_type: str) -> str:
    """ユーザー動画をR2にアップロード（keyを直接指定）"""
    client = get_r2_client()

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)


# グローバルインスタンス
r2_client = R2Client()
