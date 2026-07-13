"""
LipSync ルーターのテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import uuid


MOCK_USER = {
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}


class TestLipSyncRouter:
    """LipSync ルーターのテスト"""

    def test_post_lip_sync_success(self, auth_client):
        """POST /lip-sync が成功して生成レコードを返す"""
        mock_generation = {
            "id": "gen-lip-001",
            "user_id": MOCK_USER["user_id"],
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "audio_url": "https://example.com/audio.mp3",
            "status": "pending",
            "progress": 0,
            "output_video_url": None,
            "created_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.lip_sync.router.create_lip_sync_generation", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_generation

            with patch("app.lip_sync.router.start_lip_sync_processing", new_callable=AsyncMock):
                response = auth_client.post(
                    "/api/v1/lip-sync",
                    json={
                        "source_type": "image",
                        "source_url": "https://example.com/image.jpg",
                        "audio_url": "https://example.com/audio.mp3",
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "gen-lip-001"
        assert data["status"] == "pending"

    def test_post_lip_sync_with_invalid_source_type_returns_422(self, auth_client):
        """POST /lip-sync に無効な source_type を送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/lip-sync",
            json={
                "source_type": "invalid",
                "source_url": "https://example.com/image.jpg",
                "audio_url": "https://example.com/audio.mp3",
            },
        )

        assert response.status_code == 422

    def test_post_lip_sync_with_empty_audio_url_returns_422(self, auth_client):
        """POST /lip-sync に空の audio_url を送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/lip-sync",
            json={
                "source_type": "image",
                "source_url": "https://example.com/image.jpg",
                "audio_url": "",
            },
        )

        assert response.status_code == 422

    def test_get_lip_sync_status_success(self, auth_client):
        """GET /lip-sync/{id}/status が成功してステータスを返す"""
        generation_id = str(uuid.uuid4())

        mock_status = {
            "id": generation_id,
            "status": "completed",
            "progress": 100,
            "output_video_url": "https://r2.example.com/output.mp4",
            "error_message": None,
        }

        with patch("app.lip_sync.router.get_lip_sync_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = mock_status

            response = auth_client.get(f"/api/v1/lip-sync/{generation_id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == generation_id
        assert data["status"] == "completed"
        assert data["output_video_url"] == "https://r2.example.com/output.mp4"

    def test_get_lip_sync_status_not_found(self, auth_client):
        """GET /lip-sync/{id}/status で存在しない ID は 404 を返す"""
        generation_id = str(uuid.uuid4())

        with patch("app.lip_sync.router.get_lip_sync_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = None

            response = auth_client.get(f"/api/v1/lip-sync/{generation_id}/status")

        assert response.status_code == 404

    def test_get_lip_sync_list_returns_user_generations(self, auth_client):
        """GET /lip-sync がユーザーの生成履歴を返す"""
        mock_generations = [
            {
                "id": "gen-001",
                "status": "completed",
                "progress": 100,
                "output_video_url": "https://r2.example.com/output1.mp4",
                "created_at": "2026-01-01T00:00:00Z",
            },
            {
                "id": "gen-002",
                "status": "pending",
                "progress": 0,
                "output_video_url": None,
                "created_at": "2026-01-02T00:00:00Z",
            },
        ]

        with patch("app.lip_sync.router.list_lip_sync_generations", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = mock_generations

            response = auth_client.get("/api/v1/lip-sync")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == "gen-001"
        assert data[1]["id"] == "gen-002"

    def test_get_lip_sync_empty_list(self, auth_client):
        """GET /lip-sync が生成履歴がない場合に空リストを返す"""
        with patch("app.lip_sync.router.list_lip_sync_generations", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = []

            response = auth_client.get("/api/v1/lip-sync")

        assert response.status_code == 200
        data = response.json()
        assert data == []

    def test_post_lip_sync_upload_audio_success(self, auth_client):
        """POST /lip-sync/upload-audio が成功して audio_url を返す"""
        import io

        audio_content = b"fake audio content"
        mock_audio_url = "https://r2.example.com/audio/uploaded.mp3"

        with patch("app.lip_sync.router.upload_audio_to_r2", new_callable=AsyncMock) as mock_upload:
            mock_upload.return_value = {"audio_url": mock_audio_url, "duration_seconds": 2.5}

            response = auth_client.post(
                "/api/v1/lip-sync/upload-audio",
                files={"file": ("test.mp3", io.BytesIO(audio_content), "audio/mpeg")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["audio_url"] == mock_audio_url

    def test_other_user_cannot_access_lip_sync_generation(self, auth_client):
        """別ユーザーの lip sync 生成レコードにはアクセスできない（404）

        get_lip_sync_status は user_id でフィルタするため、他ユーザーのレコードは
        None を返し 404 になる（RLS 的セキュリティ）
        """
        generation_id = str(uuid.uuid4())

        with patch("app.lip_sync.router.get_lip_sync_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = None  # 他ユーザーのレコード → None

            response = auth_client.get(f"/api/v1/lip-sync/{generation_id}/status")

        assert response.status_code == 404

    def test_post_lip_sync_with_special_characters_in_urls(self, auth_client):
        """POST /lip-sync が特殊文字を含む URL を処理できる"""
        mock_generation = {
            "id": "gen-lip-special",
            "user_id": MOCK_USER["user_id"],
            "source_type": "image",
            "source_url": "https://example.com/image%20with%20spaces.jpg",
            "audio_url": "https://example.com/audio%20file.mp3",
            "status": "pending",
            "progress": 0,
            "output_video_url": None,
            "created_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.lip_sync.router.create_lip_sync_generation", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_generation

            with patch("app.lip_sync.router.start_lip_sync_processing", new_callable=AsyncMock):
                response = auth_client.post(
                    "/api/v1/lip-sync",
                    json={
                        "source_type": "image",
                        "source_url": "https://example.com/image%20with%20spaces.jpg",
                        "audio_url": "https://example.com/audio%20file.mp3",
                    },
                )

        assert response.status_code == 200
