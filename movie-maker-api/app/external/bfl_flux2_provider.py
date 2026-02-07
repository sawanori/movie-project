"""
BFL (Black Forest Labs) FLUX.2 Image Provider

Black Forest Labs公式APIを使用してFLUX.2画像生成を行うプロバイダー。
"""
import httpx
import logging
import asyncio
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

BFL_API_BASE_URL = "https://api.bfl.ai"

# ポーリング設定
MAX_POLL_ATTEMPTS = 60  # 最大60回（約5分）
POLL_INTERVAL_SECONDS = 5


class BFLFlux2Provider:
    """BFL FLUX.2 画像生成プロバイダー"""

    def __init__(self, model: str = "flux-2-pro"):
        """
        Args:
            model: 使用するモデル ("flux-2-pro" or "flux-2-flex")
        """
        self.api_key = settings.BFL_API_KEY
        self.model = model
        if not self.api_key:
            raise ValueError("BFL_API_KEY must be configured")

    def _get_headers(self) -> dict:
        return {
            "x-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def generate_image(
        self,
        prompt: str,
        width: int = 768,
        height: int = 1344,
        seed: Optional[int] = None,
        guidance: float = 3.5,
        steps: int = 28,
        output_format: str = "png",
        input_images: Optional[list[str]] = None,
        negative_prompt: Optional[str] = None,
    ) -> str:
        """
        画像を生成してURLを返す

        Args:
            prompt: 英語プロンプト（事前に翻訳済み）
            width: 画像幅（ピクセル）
            height: 画像高さ（ピクセル）
            seed: 再現性のためのシード値（オプション）
            guidance: プロンプト追従度（1.5-10.0、flex のみ）
            steps: 生成ステップ数（1-50、flex のみ）
            output_format: 出力形式（"png" or "jpeg"）
            input_images: 参照画像のURLリスト（最大8枚）
            negative_prompt: 除外したい要素（オプション）

        Returns:
            str: 生成された画像のURL

        Raises:
            ValueError: 生成に失敗した場合
        """
        # 1. タスク作成
        task_id, polling_url = await self._create_task(
            prompt=prompt,
            width=width,
            height=height,
            seed=seed,
            guidance=guidance,
            steps=steps,
            output_format=output_format,
            input_images=input_images,
            negative_prompt=negative_prompt,
        )
        logger.info(f"BFL FLUX.2 task created: {task_id}")

        # 2. ポーリングでステータス確認
        for attempt in range(MAX_POLL_ATTEMPTS):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            status, image_url = await self._check_status(task_id, polling_url)

            logger.info(
                f"BFL polling attempt {attempt + 1}/{MAX_POLL_ATTEMPTS}: "
                f"status={status}, has_image={image_url is not None}"
            )

            status_lower = status.lower() if status else ""

            if status_lower == "ready":
                if image_url:
                    logger.info(f"BFL FLUX.2 image generated: {image_url}")
                    return image_url
                else:
                    logger.warning("BFL task Ready but no image URL returned")
            elif status_lower in ("error", "content moderated", "request moderated"):
                raise ValueError(f"BFL画像生成に失敗しました: {status}")
            elif status_lower == "task not found":
                raise ValueError("BFLタスクが見つかりません")

        raise ValueError("BFL画像生成がタイムアウトしました")

    async def _create_task(
        self,
        prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        guidance: float,
        steps: int,
        output_format: str,
        input_images: Optional[list[str]] = None,
        negative_prompt: Optional[str] = None,
    ) -> tuple[str, str]:
        """タスクを作成してtask_idとpolling_urlを返す"""
        endpoint = f"/v1/{self.model}"

        request_body = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "output_format": output_format,
        }

        if seed is not None:
            request_body["seed"] = seed

        # ネガティブプロンプトを追加
        if negative_prompt:
            request_body["negative_prompt"] = negative_prompt
            logger.info(f"BFL request includes negative_prompt: {negative_prompt[:50]}...")

        # 参照画像を追加（最大8枚）
        if input_images:
            # BFL APIは input_image, input_image_2, ... input_image_8 の形式
            for i, img_url in enumerate(input_images[:8]):
                if i == 0:
                    request_body["input_image"] = img_url
                else:
                    request_body[f"input_image_{i + 1}"] = img_url
            logger.info(f"BFL request includes {len(input_images[:8])} reference image(s)")

        # flex モデルの場合は追加パラメータ
        if self.model == "flux-2-flex":
            request_body["guidance"] = guidance
            request_body["steps"] = steps

        # リクエストボディの詳細をログ出力（参照画像のデバッグ用）
        log_body = {k: (v[:50] + "..." if isinstance(v, str) and len(v) > 50 else v) for k, v in request_body.items()}
        logger.info(f"BFL request to {endpoint}: {log_body}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BFL_API_BASE_URL}{endpoint}",
                headers=self._get_headers(),
                json=request_body,
                timeout=30.0,
            )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"BFL API error: {response.status_code} - {error_detail}")
                raise ValueError(f"BFL APIエラー: {response.status_code}")

            result = response.json()

        task_id = result.get("id")
        polling_url = result.get("polling_url")

        if not task_id:
            raise ValueError("BFL APIからtask_idが返されませんでした")

        logger.info(f"BFL task created: id={task_id}, polling_url={polling_url}")
        return task_id, polling_url

    async def _check_status(
        self, task_id: str, polling_url: Optional[str]
    ) -> tuple[str, Optional[str]]:
        """タスクのステータスを確認"""
        # polling_url がある場合はそれを使用、なければ get_result エンドポイント
        if polling_url:
            url = polling_url
        else:
            url = f"{BFL_API_BASE_URL}/v1/get_result?id={task_id}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=self._get_headers(),
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.warning(f"BFL status check failed: {response.status_code}")
                return "Pending", None

            result = response.json()

        logger.debug(f"BFL status response: {result}")

        status = result.get("status", "Unknown")

        # 結果からimage URLを取得
        image_url = None
        if status.lower() == "ready":
            # result.result.sample に画像URLがある
            result_data = result.get("result", {})
            image_url = result_data.get("sample")

        return status, image_url


# 便利な関数
async def generate_flux2_image(
    prompt: str,
    width: int = 768,
    height: int = 1344,
    model: str = "flux-2-pro",
) -> str:
    """
    FLUX.2で画像を生成するヘルパー関数

    Args:
        prompt: 英語プロンプト
        width: 画像幅
        height: 画像高さ
        model: モデル名 ("flux-2-pro" or "flux-2-flex")

    Returns:
        str: 生成された画像のURL
    """
    provider = BFLFlux2Provider(model=model)
    return await provider.generate_image(
        prompt=prompt,
        width=width,
        height=height,
    )
