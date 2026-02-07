"""
動画アップスケール機能のテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import uuid


class TestUpscaleEndpoint:
    """アップスケールエンドポイントのテスト"""

    def test_upscale_original_resolution(self, auth_client):
        """オリジナル解像度の場合は即座に完了を返す"""
        storyboard_id = str(uuid.uuid4())
        final_video_url = "https://example.com/video.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            # Storyboard exists with final_video_url
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
                "final_video_url": final_video_url,
                "status": "completed",
            }

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/upscale",
                json={"resolution": "original"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["resolution"] == "original"
            assert data["upscaled_video_url"] == final_video_url
            assert data["progress"] == 100

    def test_upscale_no_final_video(self, auth_client):
        """結合動画がない場合は400エラー"""
        storyboard_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            # Storyboard exists but no final_video_url
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
                "final_video_url": None,
                "status": "draft",
            }

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/upscale",
                json={"resolution": "4k"}
            )

            assert response.status_code == 400
            assert "結合動画がありません" in response.json()["detail"]

    def test_upscale_storyboard_not_found(self, auth_client):
        """存在しないストーリーボードは404エラー"""
        storyboard_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/upscale",
                json={"resolution": "4k"}
            )

            assert response.status_code == 404

    def test_upscale_4k_starts_processing(self, auth_client):
        """4Kアップスケールはバックグラウンド処理を開始"""
        storyboard_id = str(uuid.uuid4())
        final_video_url = "https://example.com/video.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            # Storyboard exists with final_video_url
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
                "final_video_url": final_video_url,
                "status": "completed",
            }
            # Mock insert for video_upscales table
            mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

            with patch("app.tasks.start_upscale_processing"):
                response = auth_client.post(
                    f"/api/v1/videos/storyboard/{storyboard_id}/upscale",
                    json={"resolution": "4k"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "pending"
                assert data["resolution"] == "4k"
                assert data["original_video_url"] == final_video_url
                assert data["progress"] == 0

    def test_upscale_hd_starts_processing(self, auth_client):
        """HDアップスケールはバックグラウンド処理を開始"""
        storyboard_id = str(uuid.uuid4())
        final_video_url = "https://example.com/video.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
                "final_video_url": final_video_url,
                "status": "completed",
            }
            mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

            with patch("app.tasks.start_upscale_processing"):
                response = auth_client.post(
                    f"/api/v1/videos/storyboard/{storyboard_id}/upscale",
                    json={"resolution": "hd"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "pending"
                assert data["resolution"] == "hd"


class TestUpscaleStatusEndpoint:
    """アップスケールステータスエンドポイントのテスト"""

    def test_get_upscale_status_completed(self, auth_client):
        """完了したアップスケールのステータスを取得"""
        storyboard_id = str(uuid.uuid4())
        upscale_id = str(uuid.uuid4())
        upscaled_url = "https://example.com/upscaled.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": upscale_id,
                "status": "completed",
                "progress": 100,
                "upscaled_video_url": upscaled_url,
                "resolution": "4k",
            }]

            response = auth_client.get(
                f"/api/v1/videos/storyboard/{storyboard_id}/upscale/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["progress"] == 100
            assert data["upscaled_video_url"] == upscaled_url
            assert "完了" in data["message"]

    def test_get_upscale_status_processing(self, auth_client):
        """処理中のアップスケールのステータスを取得"""
        storyboard_id = str(uuid.uuid4())
        upscale_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": upscale_id,
                "status": "processing",
                "progress": 50,
                "upscaled_video_url": None,
                "resolution": "4k",
            }]

            response = auth_client.get(
                f"/api/v1/videos/storyboard/{storyboard_id}/upscale/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            assert data["progress"] == 50
            assert "処理中" in data["message"]

    def test_get_upscale_status_not_found(self, auth_client):
        """アップスケールタスクが存在しない場合は404"""
        storyboard_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

            response = auth_client.get(
                f"/api/v1/videos/storyboard/{storyboard_id}/upscale/status"
            )

            assert response.status_code == 404


class TestSceneUpscaleEndpoint:
    """シーン単位のアップスケールエンドポイントのテスト"""

    def test_scene_upscale_original_resolution(self, auth_client):
        """シーンのオリジナル解像度の場合は即座に完了を返す"""
        storyboard_id = str(uuid.uuid4())
        scene_number = 1
        video_url = "https://example.com/scene1.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            # Storyboard exists
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
            }
            # Scene exists with video_url
            mock_scene = MagicMock()
            mock_scene.data = {
                "id": str(uuid.uuid4()),
                "video_url": video_url,
                "status": "completed",
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = [
                MagicMock(data={"id": storyboard_id}),
                mock_scene,
            ]

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/scene/{scene_number}/upscale",
                json={"resolution": "original"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["resolution"] == "original"
            assert data["upscaled_video_url"] == video_url
            assert data["progress"] == 100
            assert data["scene_number"] == scene_number

    def test_scene_upscale_no_video(self, auth_client):
        """シーンに動画がない場合は400エラー"""
        storyboard_id = str(uuid.uuid4())
        scene_number = 1

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = [
                MagicMock(data={"id": storyboard_id}),
                MagicMock(data={"id": str(uuid.uuid4()), "video_url": None, "status": "pending"}),
            ]

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/scene/{scene_number}/upscale",
                json={"resolution": "4k"}
            )

            assert response.status_code == 400
            assert "シーンの動画がありません" in response.json()["detail"]

    def test_scene_upscale_scene_not_found(self, auth_client):
        """存在しないシーンは404エラー"""
        storyboard_id = str(uuid.uuid4())
        scene_number = 99

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = [
                MagicMock(data={"id": storyboard_id}),
                MagicMock(data=None),
            ]

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/scene/{scene_number}/upscale",
                json={"resolution": "4k"}
            )

            assert response.status_code == 404

    def test_scene_upscale_4k_starts_processing(self, auth_client):
        """シーンの4Kアップスケールはバックグラウンド処理を開始"""
        storyboard_id = str(uuid.uuid4())
        scene_number = 2
        video_url = "https://example.com/scene2.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = [
                MagicMock(data={"id": storyboard_id}),
                MagicMock(data={"id": str(uuid.uuid4()), "video_url": video_url, "status": "completed"}),
            ]
            mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

            with patch("app.tasks.start_upscale_processing"):
                response = auth_client.post(
                    f"/api/v1/videos/storyboard/{storyboard_id}/scene/{scene_number}/upscale",
                    json={"resolution": "4k"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "pending"
                assert data["resolution"] == "4k"
                assert data["original_video_url"] == video_url
                assert data["progress"] == 0
                assert data["scene_number"] == scene_number


class TestSceneUpscaleStatusEndpoint:
    """シーンアップスケールステータスエンドポイントのテスト"""

    def test_get_scene_upscale_status_completed(self, auth_client):
        """完了したシーンアップスケールのステータスを取得"""
        storyboard_id = str(uuid.uuid4())
        scene_number = 1
        upscale_id = str(uuid.uuid4())
        upscaled_url = "https://example.com/scene1_upscaled.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": upscale_id,
                "status": "completed",
                "progress": 100,
                "upscaled_video_url": upscaled_url,
                "resolution": "4k",
            }]

            response = auth_client.get(
                f"/api/v1/videos/storyboard/{storyboard_id}/scene/{scene_number}/upscale/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["progress"] == 100
            assert data["upscaled_video_url"] == upscaled_url
            assert "完了" in data["message"]

    def test_get_scene_upscale_status_not_found(self, auth_client):
        """シーンアップスケールタスクが存在しない場合は404"""
        storyboard_id = str(uuid.uuid4())
        scene_number = 1

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

            response = auth_client.get(
                f"/api/v1/videos/storyboard/{storyboard_id}/scene/{scene_number}/upscale/status"
            )

            assert response.status_code == 404


class TestRunwayProviderUpscale:
    """RunwayProviderのアップスケール機能テスト"""

    @pytest.mark.asyncio
    async def test_upscale_video_success(self):
        """upscale_videoが正常にタスクIDを返す"""
        from app.external.runway_provider import RunwayProvider

        provider = RunwayProvider()
        video_url = "https://example.com/video.mp4"
        task_id = "test-task-id"

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"id": task_id}
            mock_response.raise_for_status = MagicMock()

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            result = await provider.upscale_video(video_url)
            assert result == task_id

    @pytest.mark.asyncio
    async def test_upscale_video_no_task_id(self):
        """upscale_videoがタスクIDなしでエラーを投げる"""
        from app.external.runway_provider import RunwayProvider
        from app.external.video_provider import VideoProviderError

        provider = RunwayProvider()
        video_url = "https://example.com/video.mp4"

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {}  # No id
            mock_response.raise_for_status = MagicMock()

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            with pytest.raises(VideoProviderError) as exc_info:
                await provider.upscale_video(video_url)
            assert "タスクID" in str(exc_info.value)
