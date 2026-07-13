"""
Gateway 設定エンドポイント (app/gateway/router.py) のテスト

対象エンドポイント:
- GET /api/v1/config/models          -> ProviderMetadata[]（バックエンド実フィールド名）
- GET /api/v1/config/capabilities    -> {capability: [{name, provider}]}
- GET /api/v1/config/recommended     -> {name, provider}

認証は全エンドポイントで必須（Depends(get_current_user)）。
テストは DEBUG バイパスに依存せず、dependency override で制御する。
"""
import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_current_user
from app.external.model_registry import ModelMetadata, ModelRegistry
from app.external.video_provider import (
    VideoProviderInterface,
    VideoStatus,
    VideoGenerationStatus,
)
from app.gateway.router import get_registry


class StubProvider(VideoProviderInterface):
    """テスト用スタブプロバイダー"""

    def __init__(self, name: str):
        self._name = name

    @property
    def provider_name(self) -> str:
        return self._name

    async def generate_video(
        self, image_url, prompt, duration=5, aspect_ratio="9:16", camera_work=None
    ) -> str:
        return f"task_{self._name}"

    async def check_status(self, task_id) -> VideoStatus:
        return VideoStatus(status=VideoGenerationStatus.PENDING, progress=0)

    async def get_video_url(self, task_id):
        return None


MOCK_USER = {
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}


def _build_registry() -> ModelRegistry:
    """決定的なテスト用レジストリ（環境のAPIキー有無に依存しない）"""
    registry = ModelRegistry()
    registry.register(
        ModelMetadata(
            name="seedance",
            provider="piapi",
            capabilities=["i2v", "t2v"],
            quality_score=9,
            speed_score=6,
            cost_per_second=0.05,
            max_duration=15,
            supported_aspect_ratios=["9:16", "16:9"],
        ),
        StubProvider("seedance"),
    )
    registry.register(
        ModelMetadata(
            name="hailuo",
            provider="minimax",
            capabilities=["i2v"],
            quality_score=7,
            speed_score=8,
            cost_per_second=0.04,
            max_duration=6,
            supported_aspect_ratios=["9:16"],
        ),
        StubProvider("hailuo"),
    )
    registry.register(
        ModelMetadata(
            name="veo",
            provider="google",
            capabilities=["t2v"],
            quality_score=8,
            speed_score=5,
            cost_per_second=0.20,
            max_duration=8,
            supported_aspect_ratios=["16:9"],
        ),
        StubProvider("veo"),
    )
    return registry


@pytest.fixture
def registry() -> ModelRegistry:
    return _build_registry()


@pytest.fixture
def auth_client(registry):
    """認証済み + 決定的レジストリを注入した TestClient"""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    app.dependency_overrides[get_registry] = lambda: registry
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# ---------- GET /config/models ----------

class TestListModels:
    def test_returns_all_models_with_backend_field_names(self, auth_client):
        resp = auth_client.get("/api/v1/config/models")
        assert resp.status_code == 200

        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 3

        seedance = next(m for m in body if m["name"] == "seedance")
        assert seedance == {
            "name": "seedance",
            "provider": "piapi",
            "capabilities": ["i2v", "t2v"],
            "quality_score": 9,
            "speed_score": 6,
            "cost_per_second": 0.05,
            "max_duration": 15,
            "supported_aspect_ratios": ["9:16", "16:9"],
        }

    def test_filters_by_capability(self, auth_client):
        resp = auth_client.get("/api/v1/config/models?capability=t2v")
        assert resp.status_code == 200
        names = {m["name"] for m in resp.json()}
        assert names == {"seedance", "veo"}  # hailuo は t2v 非対応

    def test_unknown_capability_returns_empty_list(self, auth_client):
        resp = auth_client.get("/api/v1/config/models?capability=v2v")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------- GET /config/capabilities ----------

class TestGetCapabilities:
    def test_returns_capability_to_providers_map(self, auth_client):
        resp = auth_client.get("/api/v1/config/capabilities")
        assert resp.status_code == 200

        body = resp.json()
        assert set(body.keys()) == {"i2v", "t2v"}

        i2v_names = {entry["name"] for entry in body["i2v"]}
        assert i2v_names == {"seedance", "hailuo"}

        t2v_names = {entry["name"] for entry in body["t2v"]}
        assert t2v_names == {"seedance", "veo"}

        # 各エントリは {name, provider} の形
        for entry in body["i2v"]:
            assert set(entry.keys()) == {"name", "provider"}


# ---------- GET /config/recommended ----------

class TestGetRecommended:
    def test_recommended_by_quality_matches_find_best_metadata(self, auth_client, registry):
        resp = auth_client.get("/api/v1/config/recommended?priority=quality&capability=i2v")
        assert resp.status_code == 200

        body = resp.json()
        expected = registry.find_best_metadata(priority="quality", capability="i2v")
        assert body == {"name": expected.name, "provider": expected.provider}
        # seedance が最高 quality(9) の i2v
        assert body == {"name": "seedance", "provider": "piapi"}

    def test_recommended_by_speed(self, auth_client):
        resp = auth_client.get("/api/v1/config/recommended?priority=speed&capability=i2v")
        assert resp.status_code == 200
        # hailuo が最高 speed(8) の i2v
        assert resp.json() == {"name": "hailuo", "provider": "minimax"}

    def test_recommended_by_cost(self, auth_client):
        resp = auth_client.get("/api/v1/config/recommended?priority=cost&capability=i2v")
        assert resp.status_code == 200
        # hailuo が最低 cost(0.04) の i2v
        assert resp.json() == {"name": "hailuo", "provider": "minimax"}

    def test_invalid_priority_returns_422(self, auth_client):
        resp = auth_client.get("/api/v1/config/recommended?priority=bogus&capability=i2v")
        assert resp.status_code == 422

    def test_missing_priority_returns_422(self, auth_client):
        resp = auth_client.get("/api/v1/config/recommended?capability=i2v")
        assert resp.status_code == 422

    def test_missing_capability_returns_422(self, auth_client):
        resp = auth_client.get("/api/v1/config/recommended?priority=quality")
        assert resp.status_code == 422

    def test_no_match_returns_404(self, auth_client):
        # v2v に対応するモデルは無い
        resp = auth_client.get("/api/v1/config/recommended?priority=quality&capability=v2v")
        assert resp.status_code == 404


# ---------- 認証 ----------

class TestAuthentication:
    def _unauthorized(self):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/config/models",
            "/api/v1/config/capabilities",
            "/api/v1/config/recommended?priority=quality&capability=i2v",
        ],
    )
    def test_unauthenticated_returns_401(self, path, registry):
        # DEBUG バイパスを外し、get_current_user を 401 送出に差し替える
        app.dependency_overrides[get_current_user] = self._unauthorized
        app.dependency_overrides[get_registry] = lambda: registry
        client = TestClient(app)
        try:
            resp = client.get(path)
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()
