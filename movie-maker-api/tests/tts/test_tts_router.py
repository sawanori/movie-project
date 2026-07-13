"""
TTS ルーターのテスト
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


class TestTTSRouter:
    """TTS ルーターのテスト"""

    def test_post_tts_success(self, auth_client):
        """POST /tts が成功して生成レコードを返す"""
        mock_generation = {
            "id": "gen-001",
            "user_id": MOCK_USER["user_id"],
            "text": "こんにちは",
            "voice_id": "voice_123",
            "language": "ja",
            "speed": 1.0,
            "status": "pending",
            "audio_url": None,
            "duration_seconds": None,
            "error_message": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.tts.router.create_tts_generation", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_generation

            with patch("app.tts.router.start_tts_processing", new_callable=AsyncMock):
                response = auth_client.post(
                    "/api/v1/tts",
                    json={
                        "text": "こんにちは",
                        "voice_id": "voice_123",
                        "language": "ja",
                        "speed": 1.0,
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "gen-001"
        assert data["status"] == "pending"

    def test_post_tts_with_empty_text_returns_422(self, auth_client):
        """POST /tts に空のテキストを送ると 422 を返す"""
        response = auth_client.post(
            "/api/v1/tts",
            json={
                "text": "",
                "voice_id": "voice_123",
            },
        )

        assert response.status_code == 422

    def test_post_tts_with_special_characters(self, auth_client):
        """POST /tts が特殊文字を含むテキストを処理できる"""
        mock_generation = {
            "id": "gen-002",
            "user_id": MOCK_USER["user_id"],
            "text": "こんにちは！テスト「テキスト」。",
            "voice_id": "voice_123",
            "language": "ja",
            "speed": 1.0,
            "status": "pending",
            "audio_url": None,
            "duration_seconds": None,
            "error_message": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.tts.router.create_tts_generation", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_generation

            with patch("app.tts.router.start_tts_processing", new_callable=AsyncMock):
                response = auth_client.post(
                    "/api/v1/tts",
                    json={
                        "text": "こんにちは！テスト「テキスト」。",
                        "voice_id": "voice_123",
                    },
                )

        assert response.status_code == 200

    def test_get_tts_status_success(self, auth_client):
        """GET /tts/{id}/status が成功してステータスを返す"""
        generation_id = str(uuid.uuid4())

        mock_status = {
            "id": generation_id,
            "status": "completed",
            "audio_url": "https://example.com/audio.mp3",
            "duration_seconds": 3.5,
            "error_message": None,
        }

        with patch("app.tts.router.get_tts_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = mock_status

            response = auth_client.get(f"/api/v1/tts/{generation_id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == generation_id
        assert data["status"] == "completed"
        assert data["audio_url"] == "https://example.com/audio.mp3"

    def test_get_tts_status_not_found(self, auth_client):
        """GET /tts/{id}/status で存在しない ID は 404 を返す"""
        generation_id = str(uuid.uuid4())

        with patch("app.tts.router.get_tts_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = None

            response = auth_client.get(f"/api/v1/tts/{generation_id}/status")

        assert response.status_code == 404

    def test_get_tts_voices_returns_list(self, auth_client):
        """GET /tts/voices が音声リストを返す"""
        mock_voices = [
            {"voice_id": "voice_ja_1", "name": "Japanese Voice", "language": "ja", "preview_url": None},
            {"voice_id": "voice_en_1", "name": "English Voice", "language": "en", "preview_url": None},
        ]

        with patch("app.tts.router.get_tts_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.list_voices = AsyncMock(return_value=mock_voices)
            mock_get_provider.return_value = mock_provider

            response = auth_client.get("/api/v1/tts/voices")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["voice_id"] == "voice_ja_1"

    def test_get_tts_voices_with_language_filter(self, auth_client):
        """GET /tts/voices?lang=ja が言語フィルタリングされた音声を返す"""
        mock_voices = [
            {"voice_id": "voice_ja_1", "name": "Japanese Voice", "language": "ja", "preview_url": None},
        ]

        with patch("app.tts.router.get_tts_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.list_voices = AsyncMock(return_value=mock_voices)
            mock_get_provider.return_value = mock_provider

            response = auth_client.get("/api/v1/tts/voices?lang=ja")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["language"] == "ja"

    def test_other_user_cannot_access_tts_generation(self, auth_client):
        """別ユーザーの TTS 生成レコードにはアクセスできない（404）

        get_tts_status は user_id でフィルタするため、他ユーザーのレコードは
        None を返し 404 になる（RLS 的セキュリティ）
        """
        generation_id = str(uuid.uuid4())

        # user_id フィルタにより別ユーザーのレコードは見えない (= None)
        with patch("app.tts.router.get_tts_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = None  # 他ユーザーのレコード → None

            response = auth_client.get(f"/api/v1/tts/{generation_id}/status")

        assert response.status_code == 404
