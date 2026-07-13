"""
GatewayRouter のユニットテスト

TDD: テストを先に書いてから実装する
"""
import pytest

from app.external.model_registry import ModelMetadata, ModelRegistry
from app.external.gateway_router import GatewayRouter
from app.external.video_provider import VideoProviderInterface, VideoStatus


class StubProvider(VideoProviderInterface):
    """テスト用のスタブプロバイダー"""

    def __init__(self, name: str):
        self._name = name

    @property
    def provider_name(self) -> str:
        return self._name

    async def generate_video(self, image_url, prompt, duration=5, aspect_ratio="9:16", camera_work=None) -> str:
        return f"task_{self._name}"

    async def check_status(self, task_id) -> VideoStatus:
        from app.external.video_provider import VideoGenerationStatus
        return VideoStatus(status=VideoGenerationStatus.PENDING, progress=0)

    async def get_video_url(self, task_id):
        return None


def build_registry_with_providers() -> tuple[ModelRegistry, dict[str, StubProvider]]:
    """テスト用のレジストリとプロバイダー辞書を作成するヘルパー"""
    registry = ModelRegistry()
    providers = {
        "quality_leader": StubProvider("quality_leader"),
        "speed_leader": StubProvider("speed_leader"),
        "cost_leader": StubProvider("cost_leader"),
        "t2v_provider": StubProvider("t2v_provider"),
        "preferred_provider": StubProvider("preferred_provider"),
    }

    registry.register(
        ModelMetadata(
            name="quality_leader",
            provider="quality_leader",
            capabilities=["i2v"],
            quality_score=9,
            speed_score=4,
            cost_per_second=0.10,
        ),
        providers["quality_leader"],
    )
    registry.register(
        ModelMetadata(
            name="speed_leader",
            provider="speed_leader",
            capabilities=["i2v"],
            quality_score=5,
            speed_score=9,
            cost_per_second=0.08,
        ),
        providers["speed_leader"],
    )
    registry.register(
        ModelMetadata(
            name="cost_leader",
            provider="cost_leader",
            capabilities=["i2v"],
            quality_score=4,
            speed_score=5,
            cost_per_second=0.01,
        ),
        providers["cost_leader"],
    )
    registry.register(
        ModelMetadata(
            name="t2v_provider",
            provider="t2v_provider",
            capabilities=["t2v"],
            quality_score=8,
            speed_score=7,
            cost_per_second=0.06,
        ),
        providers["t2v_provider"],
    )
    registry.register(
        ModelMetadata(
            name="preferred_provider",
            provider="preferred_provider",
            capabilities=["i2v", "t2v"],
            quality_score=6,
            speed_score=6,
            cost_per_second=0.05,
        ),
        providers["preferred_provider"],
    )

    return registry, providers


class TestGatewayRouter:
    """GatewayRouter のテスト"""

    def test_route_with_default_priority(self):
        """デフォルト（quality）優先でルーティングされる"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        provider = router.route(capability="i2v")

        assert provider is providers["quality_leader"]

    def test_route_with_preferred_provider(self):
        """preferred_providerが指定されていれば、そのプロバイダーを返す"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        provider = router.route(capability="i2v", preferred_provider="preferred_provider")

        assert provider is providers["preferred_provider"]

    def test_route_with_unavailable_preferred_provider_falls_back(self):
        """preferred_providerがcapabilityを持たない場合はfind_bestにフォールバック"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        # t2v_provider は i2v capabilityを持たない
        provider = router.route(capability="i2v", preferred_provider="t2v_provider")

        # フォールバックしてqualityリーダーが返る
        assert provider is providers["quality_leader"]

    def test_route_with_capability_filter(self):
        """capabilityフィルタが機能する"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        provider = router.route(capability="t2v", priority="quality")

        # t2v capabilityがある preferred_provider (quality=6) または t2v_provider (quality=8)
        # t2v_providerの方がqualityスコアが高いのでそちらが返る
        assert provider is providers["t2v_provider"]

    def test_route_with_speed_priority(self):
        """speed優先でルーティングされる"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        provider = router.route(priority="speed", capability="i2v")

        assert provider is providers["speed_leader"]

    def test_route_with_cost_priority(self):
        """cost優先でルーティングされる"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        provider = router.route(priority="cost", capability="i2v")

        assert provider is providers["cost_leader"]

    def test_get_capabilities_returns_structured_data(self):
        """get_capabilitiesが全capabilityとプロバイダー情報を返す"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        capabilities = router.get_capabilities()

        assert "i2v" in capabilities
        assert "t2v" in capabilities

        # i2v capabilityのプロバイダーを確認
        i2v_provider_names = {p["name"] for p in capabilities["i2v"]}
        assert "quality_leader" in i2v_provider_names
        assert "speed_leader" in i2v_provider_names
        assert "cost_leader" in i2v_provider_names
        assert "preferred_provider" in i2v_provider_names

        # 各エントリがnameとproviderを持つ
        for entry in capabilities["i2v"]:
            assert "name" in entry
            assert "provider" in entry

    def test_route_with_nonexistent_preferred_provider_falls_back(self):
        """存在しないpreferred_providerを指定した場合はfind_bestにフォールバック"""
        registry, providers = build_registry_with_providers()
        router = GatewayRouter(registry)

        provider = router.route(capability="i2v", preferred_provider="nonexistent_model")

        # フォールバックしてqualityリーダーが返る
        assert provider is providers["quality_leader"]
