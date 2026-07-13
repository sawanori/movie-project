"""
UnifiedGateway - 動画生成の統一エントリーポイント

ルーティングとプロバイダー呼び出しをラップする統合ゲートウェイ。
呼び出し元はプロバイダーの詳細を意識せず、統一インターフェースで
動画生成・ステータス確認・モデル一覧取得が行える。
"""
from typing import Optional

from app.external.gateway_router import GatewayRouter
from app.external.video_provider import VideoStatus


class UnifiedGateway:
    """動画生成の統一エントリーポイント"""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        priority: str = "quality",
        preferred_provider: Optional[str] = None,
        camera_work: Optional[str] = None,
    ) -> tuple[str, str]:
        """I2V動画生成を開始する

        Returns:
            tuple[str, str]: (task_id, provider_name)
        """
        provider = self._router.route(
            priority=priority,
            capability="i2v",
            preferred_provider=preferred_provider,
        )
        task_id = await provider.generate_video(image_url, prompt, duration, aspect_ratio, camera_work)
        return task_id, provider.provider_name

    async def generate_video_from_text(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        priority: str = "quality",
        preferred_provider: Optional[str] = None,
    ) -> tuple[str, str]:
        """T2V動画生成を開始する

        Returns:
            tuple[str, str]: (task_id, provider_name)
        """
        provider = self._router.route(
            priority=priority,
            capability="t2v",
            preferred_provider=preferred_provider,
        )
        task_id = await provider.generate_video_from_text(prompt, duration, aspect_ratio)
        return task_id, provider.provider_name

    async def check_status(self, task_id: str, provider_name: str) -> VideoStatus:
        """指定プロバイダーのタスクステータスを確認する"""
        provider = self._router._registry.get_provider(provider_name)
        return await provider.check_status(task_id)

    def list_available_models(self, capability: Optional[str] = None) -> list[dict]:
        """利用可能なモデル一覧を返す

        Args:
            capability: フィルタするcapability ("i2v" | "v2v" | "t2v")

        Returns:
            list[dict]: モデル情報のリスト
        """
        models = self._router._registry.list_models(capability)
        return [
            {
                "name": m.name,
                "provider": m.provider,
                "quality": m.quality_score,
                "speed": m.speed_score,
                "cost": m.cost_per_second,
            }
            for m in models
        ]
