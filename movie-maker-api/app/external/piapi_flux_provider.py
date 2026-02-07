"""
PiAPI Flux Image Provider

PiAPI経由でFlux画像生成APIを使用するプロバイダー。
"""
import httpx
import logging
import asyncio
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

PIAPI_BASE_URL = "https://api.piapi.ai/api/v1"

# ポーリング設定
MAX_POLL_ATTEMPTS = 60  # 最大60回（約5分）
POLL_INTERVAL_SECONDS = 5


class FluxImageProvider:
    """Flux画像生成プロバイダー"""

    def __init__(self, model: str = "Qubico/flux1-dev"):
        self.api_key = settings.PIAPI_API_KEY
        self.model = model
        if not self.api_key:
            raise ValueError("PIAPI_API_KEY must be configured")

    def _get_headers(self) -> dict:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    async def generate_image(
        self,
        prompt: str,
        width: int = 768,
        height: int = 1365,
        negative_prompt: str | None = None,
    ) -> str:
        """
        画像を生成してURLを返す

        Args:
            prompt: 英語プロンプト（事前に翻訳済み）
            width: 画像幅（ピクセル）
            height: 画像高さ（ピクセル）
            negative_prompt: ネガティブプロンプト（オプション）

        Returns:
            str: 生成された画像のURL

        Raises:
            ValueError: 生成に失敗した場合
        """
        # 1. タスク作成
        task_id = await self._create_task(prompt, width, height, negative_prompt)
        logger.info(f"Flux task created: {task_id}")

        # 2. ポーリングでステータス確認
        for attempt in range(MAX_POLL_ATTEMPTS):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            status, image_url = await self._check_status(task_id)
            
            # ステータスをログ出力（デバッグ用）
            logger.info(f"Flux polling attempt {attempt + 1}/{MAX_POLL_ATTEMPTS}: status={status}, has_image={image_url is not None}")

            # 大文字小文字を無視してステータスをチェック
            status_lower = status.lower() if status else ""
            
            if status_lower == "completed":
                if image_url:
                    logger.info(f"Flux image generated: {image_url}")
                    return image_url
                else:
                    logger.warning("Flux completed but no image URL returned")
            elif status_lower in ("failed", "error"):
                raise ValueError("Flux画像生成に失敗しました")

        raise ValueError("Flux画像生成がタイムアウトしました")

    async def _create_task(
        self,
        prompt: str,
        width: int,
        height: int,
        negative_prompt: str | None,
    ) -> str:
        """タスクを作成してtask_idを返す"""
        request_body = {
            "model": self.model,
            "task_type": "txt2img",
            "input": {
                "prompt": prompt,
                "width": width,
                "height": height,
            },
        }

        if negative_prompt:
            request_body["input"]["negative_prompt"] = negative_prompt

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{PIAPI_BASE_URL}/task",
                headers=self._get_headers(),
                json=request_body,
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        task_id = result.get("data", {}).get("task_id")
        if not task_id:
            raise ValueError("Flux APIからtask_idが返されませんでした")

        return task_id

    async def _check_status(self, task_id: str) -> tuple[str, str | None]:
        """タスクのステータスを確認"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{PIAPI_BASE_URL}/task/{task_id}",
                headers=self._get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

            # 完全なAPIレスポンスをログ出力
            logger.info(f"Flux API raw response: {result}")

        data = result.get("data", {}) or {}
        status = data.get("status", "Unknown")
        output = data.get("output") or {}

        # デバッグ: レスポンス構造をログ出力（INFO レベルで確実に表示）
        logger.info(f"Flux API full data: {data}")
        logger.info(f"Flux API status raw value: '{status}' (type: {type(status).__name__})")
        logger.info(f"Flux API output: {output}")
        
        image_url = output.get("image_url") or (
            output.get("image_urls", [None])[0] if output.get("image_urls") else None
        )

        return status, image_url
