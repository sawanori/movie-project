"""
ModelRegistry のユニットテスト

TDD: テストを先に書いてから実装する
"""
import pytest
from unittest.mock import MagicMock

from app.external.model_registry import ModelMetadata, ModelRegistry
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


def make_metadata(
    name: str = "test_model",
    provider: str = "test",
    capabilities: list = None,
    quality_score: int = 5,
    speed_score: int = 5,
    cost_per_second: float = 0.05,
) -> ModelMetadata:
    """テスト用のModelMetadataを生成するヘルパー"""
    return ModelMetadata(
        name=name,
        provider=provider,
        capabilities=capabilities or ["i2v"],
        quality_score=quality_score,
        speed_score=speed_score,
        cost_per_second=cost_per_second,
    )


class TestModelRegistry:
    """ModelRegistry のテスト"""

    def test_register_and_get_provider(self):
        """プロバイダーを登録して取得できる"""
        registry = ModelRegistry()
        provider = StubProvider("test_provider")
        metadata = make_metadata(name="test_model", provider="test_provider")

        registry.register(metadata, provider)

        retrieved = registry.get_provider("test_model")
        assert retrieved is provider

    def test_get_provider_unknown_raises_key_error(self):
        """未登録のモデル名でKeyErrorが発生する"""
        registry = ModelRegistry()

        with pytest.raises(KeyError, match="Model not found: unknown_model"):
            registry.get_provider("unknown_model")

    def test_get_metadata(self):
        """登録したメタデータを取得できる"""
        registry = ModelRegistry()
        provider = StubProvider("test_provider")
        metadata = make_metadata(name="test_model", quality_score=8)

        registry.register(metadata, provider)

        retrieved_metadata = registry.get_metadata("test_model")
        assert retrieved_metadata.name == "test_model"
        assert retrieved_metadata.quality_score == 8

    def test_list_models_returns_all(self):
        """全モデルを返す"""
        registry = ModelRegistry()
        registry.register(make_metadata(name="model_a"), StubProvider("a"))
        registry.register(make_metadata(name="model_b"), StubProvider("b"))
        registry.register(make_metadata(name="model_c"), StubProvider("c"))

        models = registry.list_models()

        assert len(models) == 3
        names = {m.name for m in models}
        assert names == {"model_a", "model_b", "model_c"}

    def test_list_models_with_capability_filter(self):
        """capabilityフィルタでモデルを絞り込める"""
        registry = ModelRegistry()
        registry.register(
            make_metadata(name="i2v_model", capabilities=["i2v"]),
            StubProvider("i2v"),
        )
        registry.register(
            make_metadata(name="t2v_model", capabilities=["t2v"]),
            StubProvider("t2v"),
        )
        registry.register(
            make_metadata(name="multi_model", capabilities=["i2v", "t2v"]),
            StubProvider("multi"),
        )

        i2v_models = registry.list_models(capability="i2v")
        t2v_models = registry.list_models(capability="t2v")

        assert len(i2v_models) == 2
        assert len(t2v_models) == 2
        i2v_names = {m.name for m in i2v_models}
        assert "i2v_model" in i2v_names
        assert "multi_model" in i2v_names

    def test_find_best_by_quality(self):
        """qualityで最高スコアのプロバイダーを返す"""
        registry = ModelRegistry()
        low_quality_provider = StubProvider("low")
        high_quality_provider = StubProvider("high")

        registry.register(
            make_metadata(name="low_model", quality_score=3, capabilities=["i2v"]),
            low_quality_provider,
        )
        registry.register(
            make_metadata(name="high_model", quality_score=9, capabilities=["i2v"]),
            high_quality_provider,
        )

        best = registry.find_best(priority="quality", capability="i2v")
        assert best is high_quality_provider

    def test_find_best_by_speed(self):
        """speedで最高スコアのプロバイダーを返す"""
        registry = ModelRegistry()
        slow_provider = StubProvider("slow")
        fast_provider = StubProvider("fast")

        registry.register(
            make_metadata(name="slow_model", speed_score=2, capabilities=["i2v"]),
            slow_provider,
        )
        registry.register(
            make_metadata(name="fast_model", speed_score=9, capabilities=["i2v"]),
            fast_provider,
        )

        best = registry.find_best(priority="speed", capability="i2v")
        assert best is fast_provider

    def test_find_best_by_cost(self):
        """costで最低コストのプロバイダーを返す"""
        registry = ModelRegistry()
        cheap_provider = StubProvider("cheap")
        expensive_provider = StubProvider("expensive")

        registry.register(
            make_metadata(name="cheap_model", cost_per_second=0.01, capabilities=["i2v"]),
            cheap_provider,
        )
        registry.register(
            make_metadata(name="expensive_model", cost_per_second=0.20, capabilities=["i2v"]),
            expensive_provider,
        )

        best = registry.find_best(priority="cost", capability="i2v")
        assert best is cheap_provider

    def test_find_best_no_capability_raises_value_error(self):
        """対応capabilityがない場合はValueErrorが発生する"""
        registry = ModelRegistry()
        registry.register(
            make_metadata(name="i2v_only", capabilities=["i2v"]),
            StubProvider("i2v"),
        )

        with pytest.raises(ValueError, match="No providers for capability: t2v"):
            registry.find_best(priority="quality", capability="t2v")


class TestFindBestMetadata:
    """find_best_metadata のテスト（find_best と同一の選択規則でメタデータを返す）"""

    def test_returns_metadata_by_quality(self):
        """qualityで最高スコアのメタデータを返す"""
        registry = ModelRegistry()
        registry.register(
            make_metadata(name="low_model", quality_score=3, capabilities=["i2v"]),
            StubProvider("low"),
        )
        registry.register(
            make_metadata(name="high_model", quality_score=9, capabilities=["i2v"]),
            StubProvider("high"),
        )

        best = registry.find_best_metadata(priority="quality", capability="i2v")

        assert isinstance(best, ModelMetadata)
        assert best.name == "high_model"

    def test_returns_metadata_by_speed(self):
        """speedで最高スコアのメタデータを返す"""
        registry = ModelRegistry()
        registry.register(
            make_metadata(name="slow_model", speed_score=2, capabilities=["i2v"]),
            StubProvider("slow"),
        )
        registry.register(
            make_metadata(name="fast_model", speed_score=9, capabilities=["i2v"]),
            StubProvider("fast"),
        )

        best = registry.find_best_metadata(priority="speed", capability="i2v")

        assert best.name == "fast_model"

    def test_returns_metadata_by_cost(self):
        """costで最低コストのメタデータを返す"""
        registry = ModelRegistry()
        registry.register(
            make_metadata(name="cheap_model", cost_per_second=0.01, capabilities=["i2v"]),
            StubProvider("cheap"),
        )
        registry.register(
            make_metadata(name="expensive_model", cost_per_second=0.20, capabilities=["i2v"]),
            StubProvider("expensive"),
        )

        best = registry.find_best_metadata(priority="cost", capability="i2v")

        assert best.name == "cheap_model"

    def test_returns_none_when_no_capability(self):
        """対応capabilityがない場合はNoneを返す"""
        registry = ModelRegistry()
        registry.register(
            make_metadata(name="i2v_only", capabilities=["i2v"]),
            StubProvider("i2v"),
        )

        assert registry.find_best_metadata(priority="quality", capability="t2v") is None

    @pytest.mark.parametrize("priority", ["quality", "speed", "cost"])
    @pytest.mark.parametrize("capability", ["i2v", "t2v"])
    def test_matches_find_best_selection(self, priority, capability):
        """find_best_metadata の選択結果が find_best と一致する（同一入力・同一並び）"""
        registry = ModelRegistry()
        specs = [
            ("alpha", 9, 4, 0.10, ["i2v", "t2v"]),
            ("bravo", 7, 8, 0.03, ["i2v"]),
            ("charlie", 8, 6, 0.05, ["i2v", "t2v"]),
            ("delta", 5, 9, 0.01, ["t2v"]),
        ]
        for name, q, s, c, caps in specs:
            registry.register(
                make_metadata(
                    name=name,
                    quality_score=q,
                    speed_score=s,
                    cost_per_second=c,
                    capabilities=caps,
                ),
                StubProvider(name),
            )

        provider = registry.find_best(priority=priority, capability=capability)
        metadata = registry.find_best_metadata(priority=priority, capability=capability)

        # find_best が返した provider に対応する登録名と、metadata.name が一致すること
        assert metadata is not None
        assert registry.get_provider(metadata.name) is provider
