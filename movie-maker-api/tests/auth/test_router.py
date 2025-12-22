"""
Auth Router のテスト
"""
import pytest


class TestGetMe:
    """GET /api/v1/auth/me のテスト"""

    def test_get_me_authenticated(self, auth_client):
        """認証済みユーザーの情報を取得できる"""
        response = auth_client.get("/api/v1/auth/me")
        assert response.status_code == 200
        data = response.json()
        # UserResponseスキーマでは "id" として返される
        assert "id" in data
        assert "email" in data
        assert data["email"] == "test@example.com"
        assert data["plan_type"] == "free"


class TestGetUsage:
    """GET /api/v1/auth/usage のテスト"""

    def test_get_usage_authenticated(self, auth_client):
        """認証済みユーザーの使用状況を取得できる"""
        # get_current_userがモックされているので、Supabaseをパッチする必要はない
        response = auth_client.get("/api/v1/auth/usage")
        assert response.status_code == 200
        data = response.json()
        assert "plan_type" in data
        assert "videos_used" in data
        assert "videos_limit" in data
        assert "videos_remaining" in data
        assert data["plan_type"] == "free"
        assert data["videos_limit"] == 3  # freeプランのリミット
        assert data["videos_used"] == 0  # モックユーザーのvideo_count_this_month
        assert data["videos_remaining"] == 3
