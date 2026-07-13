"""
タイムラインルーターのテスト

PATCH /api/v1/videos/storyboards/{id}/scenes/{scene_id}/transition
POST  /api/v1/videos/storyboards/{id}/export-timeline
エンドポイントを検証する。
"""

import pytest
from unittest.mock import patch, MagicMock
import uuid


STORYBOARD_ID = str(uuid.uuid4())
SCENE_ID = str(uuid.uuid4())
OTHER_USER_ID = "other-user-00000000-0000-0000-0000-000000000099"


class TestPatchTransitionSuccess:
    """PATCH トランジション更新成功テスト"""

    def test_update_transition_success(self, auth_client):
        """有効なトランジション種類・時間でシーンが更新されること"""
        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_client = MagicMock()
            mock_supabase.return_value = mock_client

            # ストーリーボードの所有権確認：成功
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": STORYBOARD_ID,
            }
            # シーン更新：成功
            mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"id": SCENE_ID, "transition_type": "crossfade", "transition_duration": 0.5}
            ]

            response = auth_client.patch(
                f"/api/v1/videos/storyboards/{STORYBOARD_ID}/scenes/{SCENE_ID}/transition",
                json={"transition_type": "crossfade", "transition_duration": 0.5},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["transition_type"] == "crossfade"
        assert data["transition_duration"] == 0.5


class TestPatchTransitionInvalidType:
    """PATCH トランジション無効な種類のテスト"""

    def test_invalid_transition_type_returns_422(self, auth_client):
        """無効なトランジション種類は 422 エラーを返すこと"""
        response = auth_client.patch(
            f"/api/v1/videos/storyboards/{STORYBOARD_ID}/scenes/{SCENE_ID}/transition",
            json={"transition_type": "invalid_unknown_type", "transition_duration": 0.5},
        )

        assert response.status_code == 422


class TestPostExportTimelineSuccess:
    """POST export-timeline 成功テスト"""

    def test_export_timeline_success(self, auth_client):
        """export-timeline エンドポイントが成功レスポンスを返すこと"""
        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_client = MagicMock()
            mock_supabase.return_value = mock_client

            # ストーリーボードの所有権確認：成功
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": STORYBOARD_ID,
                "final_video_url": "https://example.com/video.mp4",
                "status": "completed",
            }

            response = auth_client.post(
                f"/api/v1/videos/storyboards/{STORYBOARD_ID}/export-timeline",
                json={
                    "include_bgm": True,
                    "include_transitions": True,
                    "output_format": "mp4",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "storyboard_id" in data
        assert data["storyboard_id"] == STORYBOARD_ID


class TestPatchTransitionSecurity:
    """PATCH トランジション セキュリティテスト"""

    def test_other_user_cannot_update_transition(self, auth_client):
        """他ユーザーのストーリーボードのトランジションは更新できないこと（404）"""
        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_client = MagicMock()
            mock_supabase.return_value = mock_client

            # ストーリーボードが見つからない（他ユーザーのもの）
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.patch(
                f"/api/v1/videos/storyboards/{STORYBOARD_ID}/scenes/{SCENE_ID}/transition",
                json={"transition_type": "crossfade", "transition_duration": 0.5},
            )

        assert response.status_code == 404
