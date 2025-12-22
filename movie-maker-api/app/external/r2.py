import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


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
    )

    return get_public_url(key)


async def upload_video(file_content: bytes, filename: str) -> str:
    """動画をR2にアップロード"""
    client = get_r2_client()
    key = f"videos/{filename}"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType="video/mp4",
    )

    return get_public_url(key)


async def download_file(url: str) -> bytes:
    """外部URLからファイルをダウンロード"""
    import httpx

    async with httpx.AsyncClient() as client:
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
            )
            return get_public_url(key)
        except ClientError as e:
            raise Exception(f"R2 upload failed: {e}")


# グローバルインスタンス
r2_client = R2Client()
