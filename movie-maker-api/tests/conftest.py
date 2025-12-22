"""
共通テストフィクスチャ
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.core.dependencies import get_current_user, check_usage_limit


# テスト用モックユーザー
MOCK_USER = {
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}


@pytest.fixture
def client():
    """TestClient フィクスチャ"""
    return TestClient(app)


@pytest.fixture
def auth_client():
    """認証済みTestClient フィクスチャ"""
    # 認証をモックでバイパス
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    app.dependency_overrides[check_usage_limit] = lambda: MOCK_USER
    client = TestClient(app)
    yield client
    # クリーンアップ
    app.dependency_overrides.clear()


@pytest.fixture
def mock_supabase_client():
    """Supabaseクライアントのモック（各テストで使用）"""
    mock_client = MagicMock()
    return mock_client
