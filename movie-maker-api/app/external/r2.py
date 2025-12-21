import boto3
from botocore.config import Config
from app.core.config import settings


def get_r2_client():
    """Cloudflare R2クライアントを取得（S3互換）"""
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )


async def upload_image(file_content: bytes, filename: str) -> str:
    """画像をR2にアップロード"""
    client = get_r2_client()
    key = f"images/{filename}"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType="image/jpeg",
    )

    return f"https://{settings.R2_BUCKET_NAME}.r2.dev/{key}"


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

    return f"https://{settings.R2_BUCKET_NAME}.r2.dev/{key}"
