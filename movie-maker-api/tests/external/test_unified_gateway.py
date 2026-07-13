"""
UnifiedGateway のユニットテスト

TDD: テストを先に書いてから実装する
"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.external.model_registry import ModelMetadata, ModelRegistry
from app.external.gateway_router import GatewayRouter
from app.external.unified_gateway import UnifiedGateway
from app.external.video_provider import VideoProviderInterface, VideoStatus, VideoGenerationStatus


class StubProvider(VideoProviderInterface):
    """テスト用のスタブプロバイダー"""

    def __init__(self, name: str, capabilities: list = None):
        self._name = name
        self._capabilities = capabilities or ["i2v"]

    @property
    def provider_name(self) -> str:
        return self._name

    async def generate_video(self, image_url, prompt, duration=5, aspect_ratio="9:16", camera_work=None) -> str:
        return f"task_from_{self._name}"

    async def generate_video_from_text(self, prompt, duration=5, aspect_ratio="9:16") -> str:
        return f"t2v_task_from_{self._name}"

    async def check_status(self, task_id) -> VideoStatus:
        return VideoStatus(status=VideoGenerationStatus.PENDING, progress=0)

    async def get_video_url(self, task_id):
        return None

    @property
    def supports_t2v(self) -> bool:
        return "t2v" in self._capabilities


def build_gateway() -> tuple[UnifiedGateway, dict[str, StubProvider]]:
    """テスト用のUnifiedGatewayとプロバイダー辞書を作成するヘルパー"""
    registry = ModelRegistry()
    providers = {
        "i2v_provider": StubProvider("i2v_provider", capabilities=["i2v"]),
        "t2v_provider": StubProvider("t2v_provider", capabilities=["t2v"]),
        "multi_provider": StubProvider("multi_provider", capabilities=["i2v", "t2v"]),
    }

    registry.register(
        ModelMetadata(
            name="i2v_provider",
            provider="i2v_provider",
            capabilities=["i2v"],
            quality_score=9,
            speed_score=5,
            cost_per_second=0.10,
        ),
        providers["i2v_provider"],
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
            name="multi_provider",
            provider="multi_provider",
            capabilities=["i2v", "t2v"],
            quality_score=6,
            speed_score=6,
            cost_per_second=0.05,
        ),
        providers["multi_provider"],
    )

    router = GatewayRouter(registry)
    gateway = UnifiedGateway(router)
    return gateway, providers


class TestUnifiedGateway:
    """UnifiedGateway のテスト"""

    @pytest.mark.asyncio
    async def test_generate_video_routes_to_correct_provider(self):
        """generate_videoが正しいプロバイダーにルーティングされる"""
        gateway, providers = build_gateway()

        task_id, provider_name = await gateway.generate_video(
            image_url="https://example.com/image.jpg",
            prompt="Test prompt",
            priority="quality",
        )

        # quality優先でi2v_provider (quality=9) が選ばれる
        assert provider_name == "i2v_provider"

    @pytest.mark.asyncio
    async def test_generate_video_returns_task_id_and_provider_name(self):
        """generate_videoがtask_idとprovider_nameのタプルを返す"""
        gateway, providers = build_gateway()

        result = await gateway.generate_video(
            image_url="https://example.com/image.jpg",
            prompt="Test prompt",
        )

        assert isinstance(result, tuple)
        assert len(result) == 2
        task_id, provider_name = result
        assert isinstance(task_id, str)
        assert isinstance(provider_name, str)
        assert len(task_id) > 0
        assert len(provider_name) > 0

    @pytest.mark.asyncio
    async def test_generate_video_from_text_routes_to_t2v_capable_provider(self):
        """generate_video_from_textがt2v対応プロバイダーにルーティングされる"""
        gateway, providers = build_gateway()

        task_id, provider_name = await gateway.generate_video_from_text(
            prompt="A beautiful landscape",
            priority="quality",
        )

        # t2v capabilityがある t2v_provider (quality=8) が選ばれる
        assert provider_name == "t2v_provider"
        assert "t2v_task_from_t2v_provider" == task_id

    @pytest.mark.asyncio
    async def test_check_status_delegates_to_correct_provider(self):
        """check_statusが指定されたプロバイダーに委譲される"""
        gateway, providers = build_gateway()

        status = await gateway.check_status(
            task_id="some_task_id",
            provider_name="i2v_provider",
        )

        assert isinstance(status, VideoStatus)
        assert status.status == VideoGenerationStatus.PENDING

    @pytest.mark.asyncio
    async def test_generate_video_with_preferred_provider(self):
        """generate_videoがpreferred_providerを使用する"""
        gateway, providers = build_gateway()

        task_id, provider_name = await gateway.generate_video(
            image_url="https://example.com/image.jpg",
            prompt="Test prompt",
            preferred_provider="multi_provider",
        )

        assert provider_name == "multi_provider"
        assert task_id == "task_from_multi_provider"

    def test_list_available_models(self):
        """list_available_modelsが全モデルの情報を返す"""
        gateway, providers = build_gateway()

        models = gateway.list_available_models()

        assert len(models) == 3
        for model in models:
            assert "name" in model
            assert "provider" in model
            assert "quality" in model
            assert "speed" in model
            assert "cost" in model

    def test_list_available_models_filtered_by_capability(self):
        """list_available_modelsがcapabilityでフィルタリングできる"""
        gateway, providers = build_gateway()

        i2v_models = gateway.list_available_models(capability="i2v")
        t2v_models = gateway.list_available_models(capability="t2v")

        # i2v: i2v_provider + multi_provider
        assert len(i2v_models) == 2
        i2v_names = {m["name"] for m in i2v_models}
        assert "i2v_provider" in i2v_names
        assert "multi_provider" in i2v_names

        # t2v: t2v_provider + multi_provider
        assert len(t2v_models) == 2
        t2v_names = {m["name"] for m in t2v_models}
        assert "t2v_provider" in t2v_names
        assert "multi_provider" in t2v_names
