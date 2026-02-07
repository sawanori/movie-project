"""
User Video Upload API のテスト
"""
import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from io import BytesIO


class TestUploadUserVideo:
    """POST /api/v1/videos/upload-video のテスト"""

    def test_upload_video_success(self, auth_client):
        """有効なMP4動画をアップロードできる"""
        mock_video_data = {
            "id": "test-uuid",
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "title": "test_video",
            "description": None,
            "r2_key": "user_videos/test-user/test-uuid.mp4",
            "video_url": "https://example.com/user_videos/test.mp4",
            "thumbnail_url": "https://example.com/user_videos/test_thumb.jpg",
            "duration_seconds": 5.0,
            "width": 1920,
            "height": 1080,
            "file_size_bytes": 1024000,
            "mime_type": "video/mp4",
            "created_at": "2025-12-22T00:00:00Z",
            "updated_at": "2025-12-22T00:00:00Z",
        }

        # router.pyでインポートされた関数をモック
        with patch("app.videos.router.service_upload_user_video", new_callable=AsyncMock) as mock_upload:
            mock_upload.return_value = mock_video_data

            # MP4形式のダミーファイルを作成
            file_content = b"fake mp4 content"
            files = {
                "file": ("test_video.mp4", BytesIO(file_content), "video/mp4")
            }

            response = auth_client.post(
                "/api/v1/videos/upload-video",
                files=files,
                data={"title": "My Test Video"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "test-uuid"
            assert data["video_url"] == "https://example.com/user_videos/test.mp4"

    def test_upload_video_file_too_large(self, auth_client):
        """50MBを超えるファイルはエラー（routerでチェック）"""
        # 51MB相当のファイルを作成（実際にはヘッダー情報のみ送信）
        file_content = b"x" * (51 * 1024 * 1024)
        files = {
            "file": ("large_video.mp4", BytesIO(file_content), "video/mp4")
        }

        response = auth_client.post(
            "/api/v1/videos/upload-video",
            files=files,
        )

        assert response.status_code == 400
        assert "ファイルサイズが大きすぎます" in response.json()["detail"]

    def test_upload_video_too_long(self, auth_client):
        """10秒を超える動画はエラー"""
        with patch("app.videos.router.service_upload_user_video", new_callable=AsyncMock) as mock_upload:
            mock_upload.side_effect = ValueError(
                "動画が長すぎます。最大10秒までアップロード可能です。（現在: 15.0秒）"
            )

            file_content = b"fake mp4 content"
            files = {
                "file": ("long_video.mp4", BytesIO(file_content), "video/mp4")
            }

            response = auth_client.post(
                "/api/v1/videos/upload-video",
                files=files,
            )

            assert response.status_code == 400
            assert "動画が長すぎます" in response.json()["detail"]

    def test_upload_video_invalid_format(self, auth_client):
        """MP4/MOV以外の形式はエラー（routerでチェック）"""
        file_content = b"fake avi content"
        files = {
            "file": ("video.avi", BytesIO(file_content), "video/x-msvideo")
        }

        response = auth_client.post(
            "/api/v1/videos/upload-video",
            files=files,
        )

        assert response.status_code == 400
        assert "対応していないファイル形式" in response.json()["detail"]

    def test_upload_video_resolution_too_high(self, auth_client):
        """4Kを超える解像度はエラー"""
        with patch("app.videos.router.service_upload_user_video", new_callable=AsyncMock) as mock_upload:
            mock_upload.side_effect = ValueError(
                "解像度が大きすぎます。最大4K (3840x2160) までアップロード可能です。（現在: 7680x4320）"
            )

            file_content = b"fake 8k video"
            files = {
                "file": ("8k_video.mp4", BytesIO(file_content), "video/mp4")
            }

            response = auth_client.post(
                "/api/v1/videos/upload-video",
                files=files,
            )

            assert response.status_code == 400
            assert "解像度が大きすぎます" in response.json()["detail"]


class TestListUserVideos:
    """GET /api/v1/videos/user-videos のテスト"""

    def test_list_user_videos_empty(self, auth_client):
        """ユーザー動画が空の場合"""
        mock_response = {
            "videos": [],
            "total": 0,
            "page": 1,
            "per_page": 20,
            "has_next": False,
        }

        with patch("app.videos.router.service_get_user_uploaded_videos", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = mock_response

            response = auth_client.get("/api/v1/videos/user-videos")
            assert response.status_code == 200
            data = response.json()
            assert data["videos"] == []
            assert data["total"] == 0

    def test_list_user_videos_with_data(self, auth_client):
        """ユーザー動画一覧を取得できる"""
        mock_videos = [
            {
                "id": "video-1",
                "user_id": "test-user-00000000-0000-0000-0000-000000000001",
                "title": "My Video 1",
                "description": None,
                "video_url": "https://example.com/video1.mp4",
                "thumbnail_url": "https://example.com/thumb1.jpg",
                "duration_seconds": 5.0,
                "width": 1920,
                "height": 1080,
                "file_size_bytes": 1024000,
                "mime_type": "video/mp4",
                "created_at": "2025-12-22T00:00:00Z",
                "updated_at": "2025-12-22T00:00:00Z",
            }
        ]
        mock_response = {
            "videos": mock_videos,
            "total": 1,
            "page": 1,
            "per_page": 20,
            "has_next": False,
        }

        with patch("app.videos.router.service_get_user_uploaded_videos", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = mock_response

            response = auth_client.get("/api/v1/videos/user-videos")
            assert response.status_code == 200
            data = response.json()
            assert len(data["videos"]) == 1
            assert data["videos"][0]["title"] == "My Video 1"

    def test_list_user_videos_pagination(self, auth_client):
        """ページネーションパラメータが正しく渡される"""
        mock_response = {
            "videos": [],
            "total": 50,
            "page": 2,
            "per_page": 10,
            "has_next": True,
        }

        with patch("app.videos.router.service_get_user_uploaded_videos", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = mock_response

            response = auth_client.get("/api/v1/videos/user-videos?page=2&per_page=10")
            assert response.status_code == 200
            data = response.json()
            assert data["page"] == 2
            assert data["per_page"] == 10
            assert data["has_next"] is True


class TestDeleteUserVideo:
    """DELETE /api/v1/videos/user-videos/{video_id} のテスト"""

    def test_delete_user_video_success(self, auth_client):
        """ユーザー動画を削除できる"""
        with patch("app.videos.router.service_delete_user_uploaded_video", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = True

            response = auth_client.delete("/api/v1/videos/user-videos/550e8400-e29b-41d4-a716-446655440000")
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_delete_user_video_not_found(self, auth_client):
        """存在しない動画を削除しようとすると404"""
        with patch("app.videos.router.service_delete_user_uploaded_video", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = False

            response = auth_client.delete("/api/v1/videos/user-videos/550e8400-e29b-41d4-a716-446655440000")
            assert response.status_code == 404
            assert "見つかりません" in response.json()["detail"]


class TestEstimateUserVideoUpscale:
    """POST /api/v1/videos/user-videos/{id}/upscale/estimate のテスト"""

    def test_estimate_upscale_success(self, auth_client):
        """アップスケール見積もりが正常に返る"""
        user_video_id = str(uuid.uuid4())

        mock_video = {
            "id": user_video_id,
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "video_url": "https://example.com/video.mp4",
            "width": 1080,
            "height": 1920,
        }

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_video

            with patch("app.videos.router.get_topaz_service") as mock_topaz_factory:
                mock_topaz = MagicMock()
                mock_topaz.calculate_target_resolution.return_value = {"width": 2160, "height": 3840}
                mock_topaz.estimate_enhancement_cost = AsyncMock(return_value={
                    "estimated_credits_min": 10,
                    "estimated_credits_max": 20,
                    "estimated_time_min": 60,
                    "estimated_time_max": 120,
                    "target_width": 2160,
                    "target_height": 3840,
                })
                mock_topaz_factory.return_value = mock_topaz

                response = auth_client.post(
                    f"/api/v1/videos/user-videos/{user_video_id}/upscale/estimate",
                    json={"model": "prob-4", "scale": "2x"},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["estimated_credits_min"] == 10
                assert data["estimated_credits_max"] == 20
                assert data["target_width"] == 2160
                assert data["target_height"] == 3840

    def test_estimate_upscale_video_not_found(self, auth_client):
        """動画が見つからない場合は404"""
        user_video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.post(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale/estimate",
                json={"model": "prob-4", "scale": "2x"},
            )

            assert response.status_code == 404
            assert "見つかりません" in response.json()["detail"]

    def test_estimate_upscale_already_high_resolution(self, auth_client):
        """既に目標解像度以上の場合は400"""
        user_video_id = str(uuid.uuid4())

        mock_video = {
            "id": user_video_id,
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "video_url": "https://example.com/video.mp4",
            "width": 3840,
            "height": 2160,
        }

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_video

            with patch("app.videos.router.get_topaz_service") as mock_topaz_factory:
                mock_topaz = MagicMock()
                # target is same or smaller than current
                mock_topaz.calculate_target_resolution.return_value = {"width": 3840, "height": 2160}
                mock_topaz_factory.return_value = mock_topaz

                response = auth_client.post(
                    f"/api/v1/videos/user-videos/{user_video_id}/upscale/estimate",
                    json={"model": "prob-4", "scale": "2x"},
                )

                assert response.status_code == 400
                assert "目標解像度以上" in response.json()["detail"]


class TestUpscaleUserVideo:
    """POST /api/v1/videos/user-videos/{id}/upscale のテスト"""

    def test_upscale_start_success(self, auth_client):
        """アップスケールが正常に開始される"""
        user_video_id = str(uuid.uuid4())
        upscale_id = str(uuid.uuid4())

        mock_video = {
            "id": user_video_id,
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "video_url": "https://example.com/video.mp4",
            "width": 1080,
            "height": 1920,
        }

        mock_upscale_record = {
            "id": upscale_id,
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "user_video_id": user_video_id,
            "original_video_url": "https://example.com/video.mp4",
            "model": "prob-4",
            "target_width": 2160,
            "target_height": 3840,
            "status": "pending",
            "progress": 0,
            "created_at": "2025-12-22T00:00:00Z",
        }

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_db = mock_supabase.return_value

            # video query
            mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_video

            # existing upscale check (none found)
            mock_db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value.data = []

            # insert upscale record
            mock_db.table.return_value.insert.return_value.execute.return_value.data = [mock_upscale_record]

            with patch("app.videos.router.get_topaz_service") as mock_topaz_factory:
                mock_topaz = MagicMock()
                mock_topaz.calculate_target_resolution.return_value = {"width": 2160, "height": 3840}
                mock_topaz_factory.return_value = mock_topaz

                with patch("app.tasks.topaz_upscale_processor.start_topaz_upscale_processing"):
                    response = auth_client.post(
                        f"/api/v1/videos/user-videos/{user_video_id}/upscale",
                        json={"model": "prob-4", "scale": "2x"},
                    )

                    assert response.status_code == 200
                    data = response.json()
                    assert data["id"] == upscale_id
                    assert data["user_video_id"] == user_video_id
                    assert data["status"] == "pending"
                    assert data["model"] == "prob-4"
                    assert data["target_width"] == 2160
                    assert data["target_height"] == 3840

    def test_upscale_video_not_found(self, auth_client):
        """動画が見つからない場合は404"""
        user_video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.post(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale",
                json={"model": "prob-4", "scale": "2x"},
            )

            assert response.status_code == 404
            assert "見つかりません" in response.json()["detail"]

    def test_upscale_already_processing(self, auth_client):
        """既に処理中のアップスケールがある場合は409"""
        user_video_id = str(uuid.uuid4())

        mock_video = {
            "id": user_video_id,
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "video_url": "https://example.com/video.mp4",
            "width": 1080,
            "height": 1920,
        }

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_db = mock_supabase.return_value

            # video query
            mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_video

            # existing upscale found (processing)
            mock_db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value.data = [
                {"id": str(uuid.uuid4()), "status": "processing"}
            ]

            response = auth_client.post(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale",
                json={"model": "prob-4", "scale": "2x"},
            )

            assert response.status_code == 409
            assert "処理中" in response.json()["detail"]

    def test_upscale_already_high_resolution(self, auth_client):
        """既に目標解像度以上の場合は400"""
        user_video_id = str(uuid.uuid4())

        mock_video = {
            "id": user_video_id,
            "user_id": "test-user-00000000-0000-0000-0000-000000000001",
            "video_url": "https://example.com/video.mp4",
            "width": 3840,
            "height": 2160,
        }

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_db = mock_supabase.return_value

            # video query
            mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_video

            # no existing upscale
            mock_db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value.data = []

            with patch("app.videos.router.get_topaz_service") as mock_topaz_factory:
                mock_topaz = MagicMock()
                mock_topaz.calculate_target_resolution.return_value = {"width": 3840, "height": 2160}
                mock_topaz_factory.return_value = mock_topaz

                response = auth_client.post(
                    f"/api/v1/videos/user-videos/{user_video_id}/upscale",
                    json={"model": "prob-4", "scale": "2x"},
                )

                assert response.status_code == 400
                assert "目標解像度以上" in response.json()["detail"]


class TestGetUserVideoUpscaleStatus:
    """GET /api/v1/videos/user-videos/{id}/upscale/status のテスト"""

    def test_get_upscale_status_completed(self, auth_client):
        """完了したアップスケールのステータスを取得"""
        user_video_id = str(uuid.uuid4())
        upscale_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": upscale_id,
                "status": "completed",
                "progress": 100,
                "upscaled_video_url": "https://example.com/upscaled.mp4",
                "thumbnail_url": "https://example.com/thumb.jpg",
                "error_message": None,
            }]

            response = auth_client.get(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == upscale_id
            assert data["status"] == "completed"
            assert data["progress"] == 100
            assert data["upscaled_video_url"] == "https://example.com/upscaled.mp4"
            assert data["thumbnail_url"] == "https://example.com/thumb.jpg"

    def test_get_upscale_status_processing(self, auth_client):
        """処理中のアップスケールのステータスを取得"""
        user_video_id = str(uuid.uuid4())
        upscale_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": upscale_id,
                "status": "processing",
                "progress": 50,
                "upscaled_video_url": None,
                "thumbnail_url": None,
                "error_message": None,
            }]

            response = auth_client.get(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            assert data["progress"] == 50
            assert data["upscaled_video_url"] is None

    def test_get_upscale_status_not_found(self, auth_client):
        """アップスケールタスクが存在しない場合は404"""
        user_video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

            response = auth_client.get(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale/status"
            )

            assert response.status_code == 404
            assert "見つかりません" in response.json()["detail"]

    def test_get_upscale_status_failed(self, auth_client):
        """失敗したアップスケールのステータスを取得"""
        user_video_id = str(uuid.uuid4())
        upscale_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": upscale_id,
                "status": "failed",
                "progress": 0,
                "upscaled_video_url": None,
                "thumbnail_url": None,
                "error_message": "Topaz API error: timeout",
            }]

            response = auth_client.get(
                f"/api/v1/videos/user-videos/{user_video_id}/upscale/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "failed"
            assert data["error_message"] == "Topaz API error: timeout"
