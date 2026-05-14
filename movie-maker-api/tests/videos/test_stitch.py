"""
POST /api/v1/videos/stitch および GET /api/v1/videos/stitch/{id} の単体テスト
既存 video_concat_processor を thin wrapper として流用していることを検証する。
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_current_user


@pytest.fixture
def unauth_client():
    """401 を返す認証なし TestClient"""
    def raise_401():
        raise HTTPException(status_code=401, detail="Unauthorized")

    app.dependency_overrides[get_current_user] = raise_401
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestPostStitch:
    """POST /api/v1/videos/stitch のテスト"""

    def test_stitch_two_videos_returns_202(self, auth_client):
        """動画2本で POST /stitch → 202 + id, status='pending'"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "test-stitch-id"}]
        )

        with patch("app.videos.router.get_supabase", return_value=mock_supabase), \
             patch("app.videos.router.start_concat_processing", new_callable=AsyncMock) as mock_proc:

            response = auth_client.post(
                "/api/v1/videos/stitch",
                json={
                    "video_urls": [
                        "https://example.com/video1.mp4",
                        "https://example.com/video2.mp4",
                    ]
                },
            )

        assert response.status_code == 202
        data = response.json()
        assert "id" in data
        assert data["status"] == "pending"

    def test_stitch_two_videos_calls_start_concat_processing(self, auth_client):
        """start_concat_processing が direct_video_urls 付きで呼ばれる"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])

        with patch("app.videos.router.get_supabase", return_value=mock_supabase), \
             patch("app.videos.router.start_concat_processing") as mock_proc:

            video_urls = [
                "https://example.com/video1.mp4",
                "https://example.com/video2.mp4",
            ]
            auth_client.post(
                "/api/v1/videos/stitch",
                json={"video_urls": video_urls},
            )

        # BackgroundTask は add_task で登録されるため呼び出し確認
        mock_proc.assert_called_once()
        call_args = mock_proc.call_args
        # 第2引数が video_urls であること
        assert call_args.args[1] == video_urls

    def test_stitch_five_videos_returns_202(self, auth_client):
        """動画5本（上限）で POST /stitch → 202"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])

        with patch("app.videos.router.get_supabase", return_value=mock_supabase), \
             patch("app.videos.router.start_concat_processing"):

            response = auth_client.post(
                "/api/v1/videos/stitch",
                json={
                    "video_urls": [
                        "https://example.com/v1.mp4",
                        "https://example.com/v2.mp4",
                        "https://example.com/v3.mp4",
                        "https://example.com/v4.mp4",
                        "https://example.com/v5.mp4",
                    ]
                },
            )

        assert response.status_code == 202

    def test_stitch_one_video_returns_422(self, auth_client):
        """動画1本（min_length=2 違反）→ 422"""
        response = auth_client.post(
            "/api/v1/videos/stitch",
            json={"video_urls": ["https://example.com/v1.mp4"]},
        )
        assert response.status_code == 422

    def test_stitch_six_videos_returns_422(self, auth_client):
        """動画6本（max_length=5 超過）→ 422"""
        response = auth_client.post(
            "/api/v1/videos/stitch",
            json={
                "video_urls": [
                    "https://example.com/v1.mp4",
                    "https://example.com/v2.mp4",
                    "https://example.com/v3.mp4",
                    "https://example.com/v4.mp4",
                    "https://example.com/v5.mp4",
                    "https://example.com/v6.mp4",
                ]
            },
        )
        assert response.status_code == 422

    def test_stitch_crossfade_transition_returns_422(self, auth_client):
        """transition='crossfade' は Phase 1 で拒否 → 422"""
        response = auth_client.post(
            "/api/v1/videos/stitch",
            json={
                "video_urls": [
                    "https://example.com/v1.mp4",
                    "https://example.com/v2.mp4",
                ],
                "transition": "crossfade",
            },
        )
        assert response.status_code == 422

    def test_stitch_unauthenticated_returns_401(self, unauth_client):
        """認証失敗 → 401"""
        response = unauth_client.post(
            "/api/v1/videos/stitch",
            json={
                "video_urls": [
                    "https://example.com/v1.mp4",
                    "https://example.com/v2.mp4",
                ]
            },
        )
        assert response.status_code == 401


class TestGetStitchStatus:
    """GET /api/v1/videos/stitch/{id} のテスト"""

    def _mock_supabase_with_record(self, record: dict) -> MagicMock:
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data=record
        )
        return mock

    def test_get_status_pending(self, auth_client):
        """pending ジョブ → status='pending', progress=0, output_video_url=None"""
        record = {
            "id": "stitch-1",
            "status": "pending",
            "progress": 0,
            "final_video_url": None,
            "error_message": None,
        }
        mock_supabase = self._mock_supabase_with_record(record)

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get("/api/v1/videos/stitch/stitch-1")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "stitch-1"
        assert data["status"] == "pending"
        assert data["progress"] == 0
        assert data["output_video_url"] is None

    def test_get_status_processing(self, auth_client):
        """processing ジョブ → status='processing', progress=45"""
        record = {
            "id": "stitch-2",
            "status": "processing",
            "progress": 45,
            "final_video_url": None,
            "error_message": None,
        }
        mock_supabase = self._mock_supabase_with_record(record)

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get("/api/v1/videos/stitch/stitch-2")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"
        assert data["progress"] == 45

    def test_get_status_completed(self, auth_client):
        """completed ジョブ → status='completed', output_video_url が設定される"""
        record = {
            "id": "stitch-3",
            "status": "completed",
            "progress": 100,
            "final_video_url": "https://example.com/output.mp4",
            "error_message": None,
        }
        mock_supabase = self._mock_supabase_with_record(record)

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get("/api/v1/videos/stitch/stitch-3")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["output_video_url"] == "https://example.com/output.mp4"

    def test_get_status_failed(self, auth_client):
        """failed ジョブ → status='failed', error_message が設定される"""
        record = {
            "id": "stitch-4",
            "status": "failed",
            "progress": 30,
            "final_video_url": None,
            "error_message": "動画のダウンロードに失敗しました",
        }
        mock_supabase = self._mock_supabase_with_record(record)

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get("/api/v1/videos/stitch/stitch-4")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error_message"] == "動画のダウンロードに失敗しました"

    def test_get_status_other_user_job_returns_404(self, auth_client):
        """他ユーザーのジョブ（user_id 不一致）→ 404"""
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data=None
        )

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get("/api/v1/videos/stitch/other-user-job")

        assert response.status_code == 404

    def test_get_status_unauthenticated_returns_401(self, unauth_client):
        """認証失敗 → 401"""
        response = unauth_client.get("/api/v1/videos/stitch/stitch-1")
        assert response.status_code == 401
