"""
Dialogue ルーターのテスト

POST /api/v1/dialogue  — Dialogue 生成を開始する
GET  /api/v1/dialogue/{id}/status  — ステータスを返す
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

MOCK_USER = {
    "user_id": "test-user-00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}


def _make_record(generation_id: str | None = None, status: str = "pending") -> dict:
    gid = generation_id or str(uuid.uuid4())
    return {
        "id": gid,
        "user_id": MOCK_USER["user_id"],
        "video_url": "https://example.com/video.mp4",
        "text": "こんにちは",
        "voice_id": "voice_ja_001",
        "language": "ja",
        "speed": 1.0,
        "status": status,
        "provider": "elevenlabs",
        "output_video_url": "https://example.com/out.mp4" if status == "completed" else None,
        "error_message": None,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }


class TestCreateDialogue:
    def test_create_dialogue_success(self, auth_client):
        """POST /dialogue が成功して pending レコードを返す"""
        record = _make_record()

        with patch(
            "app.dialogue.router.create_dialogue_generation",
            new_callable=AsyncMock,
            return_value=record,
        ):
            with patch(
                "app.dialogue.router.start_dialogue_processing",
                new_callable=AsyncMock,
            ):
                response = auth_client.post(
                    "/api/v1/dialogue",
                    json={
                        "video_url": "https://example.com/video.mp4",
                        "text": "こんにちは",
                        "voice_id": "voice_ja_001",
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        # id は UUID 形式であること
        assert uuid.UUID(data["id"])

    def test_create_dialogue_text_too_long(self, auth_client):
        """5001 文字超のテキストを送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/dialogue",
            json={
                "video_url": "https://example.com/video.mp4",
                "text": "あ" * 5001,
                "voice_id": "voice_ja_001",
            },
        )
        assert response.status_code == 422

    def test_create_dialogue_empty_text(self, auth_client):
        """空テキストを送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/dialogue",
            json={
                "video_url": "https://example.com/video.mp4",
                "text": "",
                "voice_id": "voice_ja_001",
            },
        )
        assert response.status_code == 422

    def test_create_dialogue_speed_out_of_range(self, auth_client):
        """speed が 0.24 (下限未満) のとき 422 を返す"""
        response = auth_client.post(
            "/api/v1/dialogue",
            json={
                "video_url": "https://example.com/video.mp4",
                "text": "こんにちは",
                "voice_id": "voice_ja_001",
                "speed": 0.24,
            },
        )
        assert response.status_code == 422


class TestGetDialogueStatus:
    def test_get_status_pending(self, auth_client):
        """GET /dialogue/{id}/status で pending を返す"""
        generation_id = str(uuid.uuid4())
        record = {
            "id": generation_id,
            "status": "pending",
            "output_video_url": None,
            "error_message": None,
            "created_at": "2026-05-14T00:00:00Z",
        }

        with patch(
            "app.dialogue.router.get_dialogue_status",
            new_callable=AsyncMock,
            return_value=record,
        ):
            response = auth_client.get(f"/api/v1/dialogue/{generation_id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == generation_id
        assert data["status"] == "pending"
        assert data["output_video_url"] is None

    def test_get_status_completed(self, auth_client):
        """GET /dialogue/{id}/status で completed と output_video_url を返す"""
        generation_id = str(uuid.uuid4())
        record = {
            "id": generation_id,
            "status": "completed",
            "output_video_url": "https://r2.example.com/output.mp4",
            "error_message": None,
            "created_at": "2026-05-14T00:00:00Z",
        }

        with patch(
            "app.dialogue.router.get_dialogue_status",
            new_callable=AsyncMock,
            return_value=record,
        ):
            response = auth_client.get(f"/api/v1/dialogue/{generation_id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["output_video_url"] == "https://r2.example.com/output.mp4"

    def test_get_status_not_found_other_user(self, auth_client):
        """他ユーザーのレコード (or 存在しない ID) は 404 を返す"""
        generation_id = str(uuid.uuid4())

        with patch(
            "app.dialogue.router.get_dialogue_status",
            new_callable=AsyncMock,
            return_value=None,
        ):
            response = auth_client.get(f"/api/v1/dialogue/{generation_id}/status")

        assert response.status_code == 404
