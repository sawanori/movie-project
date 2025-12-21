import httpx
from app.core.config import settings


async def generate_video(image_url: str, prompt: str) -> dict:
    """KlingAI APIを使用して動画を生成"""
    if not settings.KLING_API_KEY:
        raise ValueError("KLING_API_KEY is not configured")

    # TODO: KlingAI APIの実際のエンドポイントとリクエスト形式を確認
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.klingai.com/v1/videos/generate",  # 仮のエンドポイント
            headers={
                "Authorization": f"Bearer {settings.KLING_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "image_url": image_url,
                "prompt": prompt,
                "duration": 5,  # 5秒
                "aspect_ratio": "9:16",  # 縦型ショート動画
            },
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()


async def check_video_status(task_id: str) -> dict:
    """動画生成の進捗を確認"""
    if not settings.KLING_API_KEY:
        raise ValueError("KLING_API_KEY is not configured")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.klingai.com/v1/videos/{task_id}",  # 仮のエンドポイント
            headers={
                "Authorization": f"Bearer {settings.KLING_API_KEY}",
            },
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()
