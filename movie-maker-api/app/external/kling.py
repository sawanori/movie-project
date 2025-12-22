import httpx
import jwt
import time
import logging
import aiofiles
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _generate_jwt_token() -> str:
    """KlingAI API用のJWTトークンを生成"""
    if not settings.KLING_ACCESS_KEY or not settings.KLING_SECRET_KEY:
        raise ValueError("KLING_ACCESS_KEY and KLING_SECRET_KEY must be configured")

    headers = {
        "alg": "HS256",
        "typ": "JWT"
    }

    payload = {
        "iss": settings.KLING_ACCESS_KEY,
        "exp": int(time.time()) + 1800,  # 30分有効
        "nbf": int(time.time()) - 5
    }

    return jwt.encode(payload, settings.KLING_SECRET_KEY, algorithm="HS256", headers=headers)


async def generate_video(image_urls: list[str], prompt: str) -> Optional[str]:
    """
    KlingAI Multi-Image to Video APIを使用して動画を生成

    Args:
        image_urls: 入力画像のURLリスト（1〜4枚）
        prompt: 動画生成プロンプト

    Returns:
        str: タスクID（成功時）、None（失敗時）
    """
    if not 1 <= len(image_urls) <= 4:
        logger.error(f"Invalid image count: {len(image_urls)}. Must be 1-4.")
        return None

    try:
        token = _generate_jwt_token()

        # image_listを構築
        image_list = [{"image": url} for url in image_urls]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.klingai.com/v1/videos/multi-image2video",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={
                    "model_name": "kling-v1-6",
                    "image_list": image_list,
                    "prompt": prompt,
                    "duration": "5",  # 5秒
                    "aspect_ratio": "9:16",  # 縦型ショート動画
                    "mode": "std",  # standard mode
                },
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()

            # タスクIDを抽出
            task_id = result.get("data", {}).get("task_id")
            if task_id:
                logger.info(f"KlingAI task created: {task_id}")
                return task_id

            logger.error(f"KlingAI response missing task_id: {result}")
            return None

    except httpx.HTTPStatusError as e:
        logger.error(f"KlingAI HTTP error: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.exception(f"KlingAI generation failed: {e}")
        return None


async def check_video_status(task_id: str) -> Optional[dict]:
    """
    動画生成の進捗を確認

    Args:
        task_id: KlingAIのタスクID

    Returns:
        dict: ステータス情報
            - status: "pending" | "processing" | "completed" | "failed"
            - video_url: 完了時の動画URL
            - error: エラーメッセージ
    """
    try:
        token = _generate_jwt_token()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.klingai.com/v1/videos/multi-image2video/{task_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        # KlingAI APIのレスポンス構造に基づいて解析
        task_data = result.get("data", {})
        task_status = task_data.get("task_status")

        if task_status == "succeed":
            videos = task_data.get("task_result", {}).get("videos", [])
            if videos:
                return {
                    "status": "completed",
                    "video_url": videos[0].get("url"),
                    "duration": videos[0].get("duration"),
                }

        elif task_status == "failed":
            return {
                "status": "failed",
                "error": task_data.get("task_status_msg", "Unknown error"),
            }

        elif task_status == "processing":
            return {
                "status": "processing",
                "progress": 50,
            }

        elif task_status == "submitted":
            return {
                "status": "pending",
                "progress": 10,
            }

        return {
            "status": "pending",
            "progress": 0,
        }

    except Exception as e:
        logger.exception(f"KlingAI status check failed: {e}")
        return None


async def get_video_result(task_id: str) -> Optional[dict]:
    """動画生成結果を取得（check_video_statusのエイリアス）"""
    return await check_video_status(task_id)


async def download_video(video_url: str, output_path: str) -> bool:
    """
    KlingAIから生成された動画をダウンロード

    Args:
        video_url: 動画のURL
        output_path: 保存先のファイルパス

    Returns:
        bool: 成功時True
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                video_url,
                timeout=120.0,
                follow_redirects=True,
            )
            response.raise_for_status()

            async with aiofiles.open(output_path, "wb") as f:
                await f.write(response.content)

            logger.info(f"Video downloaded: {output_path}")
            return True

    except Exception as e:
        logger.exception(f"Video download failed: {e}")
        return False
