"""
Videos Router のテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestListVideos:
    """GET /api/v1/videos のテスト"""

    def test_list_videos_empty(self, auth_client):
        """動画一覧が空の場合"""
        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
                data=[]
            )

            response = auth_client.get("/api/v1/videos")
            assert response.status_code == 200
            data = response.json()
            assert "videos" in data
            assert data["videos"] == []

    def test_list_videos_with_data(self, auth_client):
        """動画一覧がある場合"""
        mock_videos = [
            {
                "id": "video-1",
                "user_id": "test-user-00000000-0000-0000-0000-000000000001",
                "status": "completed",
                "progress": 100,
                "image_urls": ["https://example.com/image1.jpg"],
                "original_image_url": "https://example.com/image1.jpg",
                "user_prompt": "Test prompt 1",
                "optimized_prompt": "Optimized test prompt",
                "final_video_url": "https://example.com/video1.mp4",
                "created_at": "2025-12-22T00:00:00Z",
                "updated_at": "2025-12-22T00:00:00Z",
            }
        ]

        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
                data=mock_videos
            )

            response = auth_client.get("/api/v1/videos")
            assert response.status_code == 200
            data = response.json()
            assert len(data["videos"]) == 1
            assert data["videos"][0]["id"] == "video-1"


class TestGetVideo:
    """GET /api/v1/videos/{id} のテスト"""

    def test_get_video_success(self, auth_client):
        """動画詳細を取得できる"""
        mock_video = {
            "id": "video-1",
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "status": "completed",
            "progress": 100,
            "image_urls": ["https://example.com/image1.jpg"],
            "original_image_url": "https://example.com/image1.jpg",
            "user_prompt": "Test prompt",
            "optimized_prompt": "Optimized prompt",
            "final_video_url": "https://example.com/video1.mp4",
            "created_at": "2025-12-22T00:00:00Z",
            "updated_at": "2025-12-22T00:00:00Z",
        }

        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=mock_video
            )

            response = auth_client.get("/api/v1/videos/video-1")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "video-1"

    def test_get_video_not_found(self, auth_client):
        """存在しない動画を取得しようとすると404"""
        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=None
            )

            response = auth_client.get("/api/v1/videos/nonexistent-id")
            assert response.status_code == 404


class TestGetVideoStatus:
    """GET /api/v1/videos/{id}/status のテスト"""

    def test_get_video_status_success(self, auth_client):
        """動画のステータスを取得できる"""
        mock_video = {
            "id": "video-1",
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "status": "processing",
            "progress": 50,
        }

        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=mock_video
            )

            response = auth_client.get("/api/v1/videos/video-1/status")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            assert data["progress"] == 50


class TestDeleteVideo:
    """DELETE /api/v1/videos/{id} のテスト"""

    def test_delete_video_success(self, auth_client):
        """動画を削除できる"""
        mock_video = {
            "id": "video-1",
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
        }

        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            # 動画が存在することを確認
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=mock_video
            )
            # 削除実行
            mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()

            response = auth_client.delete("/api/v1/videos/video-1")
            assert response.status_code == 204

    def test_delete_video_not_found(self, auth_client):
        """存在しない動画を削除しようとすると404"""
        with patch("app.videos.service.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=None
            )

            response = auth_client.delete("/api/v1/videos/nonexistent-id")
            assert response.status_code == 404


class TestCreateVideo:
    """POST /api/v1/videos のテスト"""

    def test_create_video_success(self, auth_client):
        """動画生成リクエストが成功する（単一画像・後方互換）"""
        mock_video = {
            "id": "new-video-1",
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "status": "pending",
            "progress": 0,
            "image_urls": ["https://example.com/image.jpg"],
            "original_image_url": "https://example.com/image.jpg",
            "user_prompt": "Test prompt",
            "optimized_prompt": "Optimized prompt for video generation",
            "created_at": "2025-12-22T00:00:00Z",
            "updated_at": "2025-12-22T00:00:00Z",
        }

        with patch("app.videos.service.get_supabase") as mock_get_supabase, \
             patch("app.videos.service.optimize_prompt", new_callable=AsyncMock) as mock_optimize:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_optimize.return_value = "Optimized prompt for video generation"
            mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(
                data=[mock_video]
            )

            response = auth_client.post(
                "/api/v1/videos",
                json={
                    "image_url": "https://example.com/image.jpg",
                    "prompt": "Test prompt",
                },
            )
            assert response.status_code == 201
            data = response.json()
            assert data["status"] == "pending"
            assert data["user_prompt"] == "Test prompt"

    def test_create_video_multiple_images(self, auth_client):
        """複数画像での動画生成リクエストが成功する"""
        mock_video = {
            "id": "new-video-2",
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "status": "pending",
            "progress": 0,
            "image_urls": [
                "https://example.com/image1.jpg",
                "https://example.com/image2.jpg",
                "https://example.com/image3.jpg",
            ],
            "original_image_url": "https://example.com/image1.jpg",
            "user_prompt": "Multi-image test",
            "optimized_prompt": "Optimized multi-image prompt",
            "created_at": "2025-12-22T00:00:00Z",
            "updated_at": "2025-12-22T00:00:00Z",
        }

        with patch("app.videos.service.get_supabase") as mock_get_supabase, \
             patch("app.videos.service.optimize_prompt", new_callable=AsyncMock) as mock_optimize:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_optimize.return_value = "Optimized multi-image prompt"
            mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(
                data=[mock_video]
            )

            response = auth_client.post(
                "/api/v1/videos",
                json={
                    "image_urls": [
                        "https://example.com/image1.jpg",
                        "https://example.com/image2.jpg",
                        "https://example.com/image3.jpg",
                    ],
                    "prompt": "Multi-image test",
                },
            )
            assert response.status_code == 201
            data = response.json()
            assert data["status"] == "pending"
            assert len(data["image_urls"]) == 3

    def test_create_video_exceeds_max_images(self, auth_client):
        """5枚以上の画像はバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos",
            json={
                "image_urls": [
                    "https://example.com/image1.jpg",
                    "https://example.com/image2.jpg",
                    "https://example.com/image3.jpg",
                    "https://example.com/image4.jpg",
                    "https://example.com/image5.jpg",
                ],
                "prompt": "Too many images",
            },
        )
        assert response.status_code == 422

    def test_create_video_missing_fields(self, auth_client):
        """必須フィールドが欠けている場合はバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos",
            json={"prompt": "Test prompt"},  # image_url/image_urls が欠けている
        )
        assert response.status_code == 422
