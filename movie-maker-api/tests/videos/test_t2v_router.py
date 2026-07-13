"""
Tests for T2V API endpoints
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


MOCK_USER = {
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}

OTHER_USER = {
    "user_id": "other-user-00000000-0000-0000-0000-000000000099",
    "email": "other@example.com",
    "display_name": "Other User",
    "plan_type": "free",
    "video_count_this_month": 0,
}

MOCK_T2V_DB_RECORD = {
    "id": "t2v-video-001",
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "prompt": "A serene mountain landscape",
    "duration": 5,
    "aspect_ratio": "9:16",
    "generation_mode": "t2v",
    "status": "pending",
    "progress": 0,
    "final_video_url": None,
    "created_at": "2026-03-15T00:00:00",
}


class TestT2VRouter:
    """Tests for T2V API endpoints"""

    def test_post_text_to_video_success(self, auth_client):
        """POST /videos/text-to-video should create a T2V generation record"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [MOCK_T2V_DB_RECORD]

        with patch("app.videos.router.get_supabase", return_value=mock_supabase), \
             patch("app.tasks.t2v_processor.start_t2v_processing", new_callable=AsyncMock):
            response = auth_client.post(
                "/api/v1/videos/text-to-video",
                json={
                    "prompt": "A serene mountain landscape",
                    "duration": 5,
                    "aspect_ratio": "9:16",
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["status"] == "pending"

    def test_post_text_to_video_empty_prompt_returns_422(self, auth_client):
        """POST /videos/text-to-video with empty prompt should return 422"""
        response = auth_client.post(
            "/api/v1/videos/text-to-video",
            json={
                "prompt": "",
                "duration": 5,
            },
        )
        assert response.status_code == 422

    def test_get_text_to_video_status_success(self, auth_client):
        """GET /videos/text-to-video/{id}/status should return status for owned video"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": "t2v-video-001",
            "status": "processing",
            "progress": 50,
            "final_video_url": None,
            "error_message": None,
            "expires_at": None,
        }

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get(
                "/api/v1/videos/text-to-video/t2v-video-001/status"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"
        assert data["progress"] == 50

    def test_other_user_cannot_access_t2v_generation(self, auth_client):
        """GET /videos/text-to-video/{id}/status should return 404 for another user's video"""
        mock_supabase = MagicMock()
        # Simulate no record found (different user_id in query)
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get(
                "/api/v1/videos/text-to-video/other-users-video/status"
            )

        assert response.status_code == 404
