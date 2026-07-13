"""
GatewayRouter - ルーティングロジック

優先度とcapabilityに基づいて最適なプロバイダーを選択するルーター。
preferred_providerが指定されている場合はそれを優先し、
capabilityを持たない場合はfind_bestにフォールバックする。
"""
from typing import Optional

from app.external.model_registry import ModelRegistry
from app.external.video_provider import VideoProviderInterface


class GatewayRouter:
    """プロバイダーへのルーティングを担当するクラス"""

    def __init__(self, registry: ModelRegistry):
        self._registry = registry

    def route(
        self,
        priority: str = "quality",
        capability: str = "i2v",
        aspect_ratio: str = "9:16",
        preferred_provider: Optional[str] = None,
    ) -> VideoProviderInterface:
        """条件に合ったプロバイダーを返す

        Args:
            priority: 優先基準 ("quality" | "speed" | "cost")
            capability: 必要な機能 ("i2v" | "v2v" | "t2v")
            aspect_ratio: アスペクト比（将来的なフィルタリング用）
            preferred_provider: 優先して使用するモデル名

        Returns:
            VideoProviderInterface: 選択されたプロバイダー
        """
        # preferred_providerが指定されていれば、そのプロバイダーを試みる
        if preferred_provider:
            try:
                provider = self._registry.get_provider(preferred_provider)
                metadata = self._registry.get_metadata(preferred_provider)
                if capability in metadata.capabilities:
                    return provider
            except KeyError:
                pass

        # フォールバック: find_bestで最適なプロバイダーを選択
        return self._registry.find_best(priority=priority, capability=capability)

    def get_capabilities(self) -> dict:
        """利用可能な全capabilityとそのプロバイダー情報を返す"""
        result: dict = {}
        for model in self._registry.list_models():
            for cap in model.capabilities:
                if cap not in result:
                    result[cap] = []
                result[cap].append({"name": model.name, "provider": model.provider})
        return result
