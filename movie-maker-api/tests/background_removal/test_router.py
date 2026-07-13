"""
背景削除ルーターのテスト
"""
import pytest
from unittest.mock import patch, AsyncMock
import uuid


MOCK_USER = {
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}


class TestBackgroundRemovalRouter:
    """背景削除ルーターのテスト"""

    def test_post_background_removal_success(self, auth_client):
        """POST /background-removal が成功してレコードを返す"""
        mock_generation = {
            "id": "gen-bg-001",
            "status": "pending",
            "progress": 0,
            "source_type": "video",
            "output_format": "webm",
            "output_url": None,
            "created_at": "2026-06-12T00:00:00Z",
        }

        with patch(
            "app.background_removal.router.create_background_removal", new_callable=AsyncMock
        ) as mock_create:
            mock_create.return_value = mock_generation

            with patch(
                "app.background_removal.router.start_bg_removal_processing",
                new_callable=AsyncMock,
            ) as mock_start:
                response = auth_client.post(
                    "/api/v1/background-removal",
                    json={
                        "source_type": "video",
                        "source_url": "https://example.com/video.mp4",
                        "output_format": "webm",
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "gen-bg-001"
        assert data["status"] == "pending"
        assert data["source_type"] == "video"
        assert data["output_format"] == "webm"

        # バックグラウンドタスクが開始されたことを確認
        mock_start.assert_called_once_with("gen-bg-001")

    def test_post_background_removal_image_success(self, auth_client):
        """POST /background-removal が画像ソースでも成功する（出力は png）"""
        mock_generation = {
            "id": "gen-bg-002",
            "status": "pending",
            "progress": 0,
            "source_type": "image",
            "output_format": "png",
            "output_url": None,
            "created_at": "2026-06-12T00:00:00Z",
        }

        with patch(
            "app.background_removal.router.create_background_removal", new_callable=AsyncMock
        ) as mock_create:
            mock_create.return_value = mock_generation

            with patch(
                "app.background_removal.router.start_bg_removal_processing",
                new_callable=AsyncMock,
            ):
                response = auth_client.post(
                    "/api/v1/background-removal",
                    json={
                        "source_type": "image",
                        "source_url": "https://example.com/image.png",
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["output_format"] == "png"

    def test_post_background_removal_invalid_source_type_returns_422(self, auth_client):
        """POST /background-removal に無効な source_type を送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/background-removal",
            json={
                "source_type": "audio",
                "source_url": "https://example.com/audio.mp3",
            },
        )

        assert response.status_code == 422

    def test_post_background_removal_invalid_source_url_returns_422(self, auth_client):
        """POST /background-removal に URL でない source_url を送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/background-removal",
            json={
                "source_type": "video",
                "source_url": "not-a-url",
            },
        )

        assert response.status_code == 422

    def test_post_background_removal_invalid_output_format_returns_422(self, auth_client):
        """POST /background-removal に無効な output_format を送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/background-removal",
            json={
                "source_type": "video",
                "source_url": "https://example.com/video.mp4",
                "output_format": "avi",
            },
        )

        assert response.status_code == 422

    def test_get_background_removal_status_success(self, auth_client):
        """GET /background-removal/{id}/status が成功してステータスを返す"""
        generation_id = str(uuid.uuid4())

        mock_status = {
            "id": generation_id,
            "status": "completed",
            "progress": 100,
            "output_url": "https://r2.example.com/bg-removal/output.webm",
            "error_message": None,
        }

        with patch(
            "app.background_removal.router.get_background_removal_status",
            new_callable=AsyncMock,
        ) as mock_get_status:
            mock_get_status.return_value = mock_status

            response = auth_client.get(f"/api/v1/background-removal/{generation_id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == generation_id
        assert data["status"] == "completed"
        assert data["output_url"] == "https://r2.example.com/bg-removal/output.webm"

    def test_get_background_removal_status_not_found(self, auth_client):
        """GET /background-removal/{id}/status で存在しない ID は 404 を返す"""
        generation_id = str(uuid.uuid4())

        with patch(
            "app.background_removal.router.get_background_removal_status",
            new_callable=AsyncMock,
        ) as mock_get_status:
            mock_get_status.return_value = None

            response = auth_client.get(f"/api/v1/background-removal/{generation_id}/status")

        assert response.status_code == 404

    def test_other_user_cannot_access_background_removal(self, auth_client):
        """別ユーザーの背景削除レコードにはアクセスできない（404）

        get_background_removal_status は user_id でフィルタするため、
        他ユーザーのレコードは None を返し 404 になる（RLS 的セキュリティ）
        """
        generation_id = str(uuid.uuid4())

        with patch(
            "app.background_removal.router.get_background_removal_status",
            new_callable=AsyncMock,
        ) as mock_get_status:
            mock_get_status.return_value = None  # 他ユーザーのレコード → None

            response = auth_client.get(f"/api/v1/background-removal/{generation_id}/status")

        assert response.status_code == 404

    def test_get_background_removal_list_returns_user_jobs(self, auth_client):
        """GET /background-removal がユーザーのジョブ一覧を返す"""
        mock_result = {
            "items": [
                {
                    "id": "gen-bg-001",
                    "status": "completed",
                    "progress": 100,
                    "source_type": "video",
                    "output_format": "webm",
                    "output_url": "https://r2.example.com/bg-removal/output1.webm",
                    "created_at": "2026-06-12T00:00:00Z",
                },
                {
                    "id": "gen-bg-002",
                    "status": "pending",
                    "progress": 0,
                    "source_type": "image",
                    "output_format": "png",
                    "output_url": None,
                    "created_at": "2026-06-11T00:00:00Z",
                },
            ],
            "total": 2,
            "page": 1,
            "per_page": 20,
        }

        with patch(
            "app.background_removal.router.list_background_removals", new_callable=AsyncMock
        ) as mock_list:
            mock_list.return_value = mock_result

            response = auth_client.get("/api/v1/background-removal?page=1&per_page=20")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["items"][0]["id"] == "gen-bg-001"
        assert data["items"][1]["id"] == "gen-bg-002"

    def test_get_background_removal_empty_list(self, auth_client):
        """GET /background-removal がジョブがない場合に空リストを返す"""
        mock_result = {"items": [], "total": 0, "page": 1, "per_page": 20}

        with patch(
            "app.background_removal.router.list_background_removals", new_callable=AsyncMock
        ) as mock_list:
            mock_list.return_value = mock_result

            response = auth_client.get("/api/v1/background-removal")

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
