"""
Templates Router のテスト
"""
import pytest
from unittest.mock import patch, MagicMock


class TestListTemplates:
    """GET /api/v1/templates のテスト"""

    def test_list_templates_success(self, auth_client):
        """テンプレート一覧を取得できる"""
        mock_templates = [
            {
                "id": "template-1",
                "name": "Zoom In",
                "description": "ゆっくりとズームイン",
                "prompt_template": "Zoom in slowly",
                "style_keywords": ["zoom", "slow"],
                "thumbnail_url": "https://example.com/preview1.mp4",
                "is_active": True,
            },
            {
                "id": "template-2",
                "name": "Pan Left",
                "description": "左へパン",
                "prompt_template": "Pan to the left",
                "style_keywords": ["pan", "left"],
                "thumbnail_url": "https://example.com/preview2.mp4",
                "is_active": True,
            },
        ]

        with patch("app.templates.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=mock_templates
            )

            response = auth_client.get("/api/v1/templates")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["name"] == "Zoom In"

    def test_list_templates_empty(self, auth_client):
        """テンプレートが空の場合"""
        with patch("app.templates.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[]
            )

            response = auth_client.get("/api/v1/templates")
            assert response.status_code == 200
            data = response.json()
            assert data == []


class TestGetTemplate:
    """GET /api/v1/templates/{id} のテスト"""

    def test_get_template_success(self, auth_client):
        """テンプレート詳細を取得できる"""
        mock_template = {
            "id": "template-1",
            "name": "Zoom In",
            "description": "ゆっくりとズームイン",
            "prompt_template": "Zoom in slowly",
            "style_keywords": ["zoom", "slow"],
            "thumbnail_url": "https://example.com/preview1.mp4",
            "is_active": True,
        }

        with patch("app.templates.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=mock_template
            )

            response = auth_client.get("/api/v1/templates/template-1")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "template-1"
            assert data["name"] == "Zoom In"

    def test_get_template_not_found(self, auth_client):
        """存在しないテンプレートを取得しようとすると404"""
        with patch("app.templates.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=None
            )

            response = auth_client.get("/api/v1/templates/nonexistent-id")
            assert response.status_code == 404


class TestListBgm:
    """GET /api/v1/templates/bgm/list のテスト"""

    def test_list_bgm_success(self, auth_client):
        """BGM一覧を取得できる"""
        mock_bgm_list = [
            {
                "id": "bgm-1",
                "name": "Upbeat Energy",
                "description": "エネルギッシュな曲",
                "mood": "energetic",
                "duration_seconds": 30,
                "file_url": "https://example.com/bgm1.mp3",
                "is_active": True,
            },
            {
                "id": "bgm-2",
                "name": "Calm Piano",
                "description": "落ち着いたピアノ曲",
                "mood": "calm",
                "duration_seconds": 45,
                "file_url": "https://example.com/bgm2.mp3",
                "is_active": True,
            },
        ]

        with patch("app.templates.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=mock_bgm_list
            )

            response = auth_client.get("/api/v1/templates/bgm/list")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["name"] == "Upbeat Energy"

    def test_list_bgm_empty(self, auth_client):
        """BGMが空の場合"""
        with patch("app.templates.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[]
            )

            response = auth_client.get("/api/v1/templates/bgm/list")
            assert response.status_code == 200
            data = response.json()
            assert data == []
