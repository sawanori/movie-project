"""
BGM API エンドポイントのテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_current_user, check_usage_limit


# テスト用モックユーザー
MOCK_USER = {
    "user_id": "test-user-bgm-00000000-0000-0000-0000-000000000001",
    "email": "test-bgm@example.com",
    "display_name": "BGM Test User",
    "plan_type": "pro",
    "video_count_this_month": 0,
}


@pytest.fixture
def auth_client():
    """認証済みTestClient フィクスチャ"""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    app.dependency_overrides[check_usage_limit] = lambda: MOCK_USER
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestBGMGenerateEndpoint:
    """BGM生成エンドポイントのテスト"""

    def test_generate_bgm_success(self, auth_client):
        """BGM生成開始の成功ケース"""
        concat_id = "test-concat-id-123"

        # Supabaseのモック - video_concatenationsテーブルのクエリ
        mock_concat_response = MagicMock()
        mock_concat_response.data = {
            "id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "completed",
            "final_video_url": "https://example.com/video.mp4",
        }

        # bgm_generationsテーブルのinsert
        mock_insert_response = MagicMock()
        mock_insert_response.data = [{"id": "bgm-gen-id-123"}]

        mock_supabase = MagicMock()

        def mock_table(table_name):
            mock_table_obj = MagicMock()
            if table_name == "video_concatenations":
                mock_table_obj.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_concat_response
            elif table_name == "bgm_generations":
                mock_table_obj.insert.return_value.execute.return_value = mock_insert_response
            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.post(
                f"/api/v1/videos/concat/{concat_id}/generate-bgm",
                json={
                    "auto_analyze": True,
                    "sync_to_beats": True,
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        assert "bgm_generation_id" in data

    def test_generate_bgm_concat_not_found(self, auth_client):
        """結合動画が見つからない場合"""
        concat_id = "non-existent-concat-id"

        mock_concat_response = MagicMock()
        mock_concat_response.data = None

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_concat_response

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.post(
                f"/api/v1/videos/concat/{concat_id}/generate-bgm",
                json={}
            )

        # 実装は404を返す（結合動画が見つからない場合）
        assert response.status_code == 404

    def test_generate_bgm_not_completed(self, auth_client):
        """結合動画が未完了の場合"""
        concat_id = "processing-concat-id"

        mock_concat_response = MagicMock()
        mock_concat_response.data = {
            "id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "processing",  # まだ処理中
            "final_video_url": None,
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_concat_response

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.post(
                f"/api/v1/videos/concat/{concat_id}/generate-bgm",
                json={}
            )

        assert response.status_code == 400


class TestBGMStatusEndpoint:
    """BGMステータス取得エンドポイントのテスト"""

    def test_get_bgm_status_success(self, auth_client):
        """ステータス取得の成功ケース"""
        concat_id = "test-concat-id-123"

        # routerがユーザーIDで検証するためのモック
        mock_bgm_record = {
            "id": "bgm-gen-id-123",
            "concat_id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "generating",
            "progress": 50,
            "bgm_url": None,
            "bgm_duration_seconds": None,
            "auto_generated_prompt": "upbeat electronic music",
            "detected_mood": "energetic",
            "detected_genre": "electronic",
            "detected_tempo_bpm": 128,
            "sync_quality_score": None,
            "error_message": None,
        }

        mock_supabase = MagicMock()
        # eq().eq()のチェーンを設定（user_id と concat_id でフィルタ）
        mock_execute = MagicMock()
        mock_execute.data = [mock_bgm_record]
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_execute

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get(f"/api/v1/videos/concat/{concat_id}/bgm-status")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "generating"
        assert data["progress"] == 50
        assert data["detected_mood"] == "energetic"

    def test_get_bgm_status_completed(self, auth_client):
        """完了ステータスの取得"""
        concat_id = "test-concat-id-123"

        mock_bgm_record = {
            "id": "bgm-gen-id-123",
            "concat_id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "completed",
            "progress": 100,
            "bgm_url": "https://example.com/bgm.mp3",
            "bgm_duration_seconds": 30.5,
            "auto_generated_prompt": "cinematic orchestral",
            "detected_mood": "cinematic",
            "detected_genre": "orchestral",
            "detected_tempo_bpm": 90,
            "sync_quality_score": 0.85,
            "error_message": None,
        }

        mock_supabase = MagicMock()
        mock_execute = MagicMock()
        mock_execute.data = [mock_bgm_record]
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_execute

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get(f"/api/v1/videos/concat/{concat_id}/bgm-status")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["bgm_url"] == "https://example.com/bgm.mp3"
        assert data["sync_quality_score"] == 0.85

    def test_get_bgm_status_not_found(self, auth_client):
        """BGM生成が見つからない場合"""
        concat_id = "no-bgm-concat-id"

        mock_supabase = MagicMock()
        mock_execute = MagicMock()
        mock_execute.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_execute

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.get(f"/api/v1/videos/concat/{concat_id}/bgm-status")

        assert response.status_code == 404


class TestBGMApplyEndpoint:
    """BGM適用エンドポイントのテスト"""

    def test_apply_bgm_success(self, auth_client):
        """BGM適用の成功ケース"""
        concat_id = "test-concat-id-123"

        mock_bgm_response = MagicMock()
        mock_bgm_response.data = {
            "id": "bgm-gen-id-123",
            "concat_id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "completed",
            "bgm_url": "https://example.com/bgm.mp3",
        }

        mock_concat_response = MagicMock()
        mock_concat_response.data = {
            "id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "completed",
            "final_video_url": "https://example.com/video.mp4",
        }

        mock_supabase = MagicMock()

        def mock_table(table_name):
            mock_table_obj = MagicMock()
            if table_name == "bgm_generations":
                mock_table_obj.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_bgm_response
            elif table_name == "video_concatenations":
                mock_table_obj.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_concat_response
            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        # start_bgm_applyをモックして実際のバックグラウンド処理を防止
        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            with patch("app.tasks.bgm_ai_generator.start_bgm_apply", new_callable=AsyncMock):
                response = auth_client.post(
                    f"/api/v1/videos/concat/{concat_id}/apply-bgm",
                    json={
                        "bgm_generation_id": "bgm-gen-id-123",
                        "volume": 0.7,
                        "original_audio_volume": 0.3,
                        "fade_in_seconds": 0.5,
                        "fade_out_seconds": 1.0,
                    }
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"

    def test_apply_bgm_not_completed(self, auth_client):
        """BGM生成が未完了の場合"""
        concat_id = "test-concat-id-123"

        mock_bgm_response = MagicMock()
        mock_bgm_response.data = {
            "id": "bgm-gen-id-123",
            "concat_id": concat_id,
            "user_id": MOCK_USER["user_id"],
            "status": "generating",  # まだ生成中
            "bgm_url": None,
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_bgm_response

        with patch("app.videos.router.get_supabase", return_value=mock_supabase):
            response = auth_client.post(
                f"/api/v1/videos/concat/{concat_id}/apply-bgm",
                json={
                    "bgm_generation_id": "bgm-gen-id-123",
                }
            )

        assert response.status_code == 400
