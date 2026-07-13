"""
LipSync スキーマのテスト
"""
import pytest
from pydantic import ValidationError


class TestLipSyncRequest:
    """LipSyncRequest スキーマのテスト"""

    def test_valid_lip_sync_request_creation(self):
        """有効な LipSyncRequest が作成できる"""
        from app.lip_sync.schemas import LipSyncRequest

        request = LipSyncRequest(
            source_type="image",
            source_url="https://example.com/image.jpg",
            audio_url="https://example.com/audio.mp3",
        )

        assert request.source_type == "image"
        assert request.source_url == "https://example.com/image.jpg"
        assert request.audio_url == "https://example.com/audio.mp3"

    def test_lip_sync_request_with_invalid_source_type(self):
        """無効な source_type は ValidationError を発生させる"""
        from app.lip_sync.schemas import LipSyncRequest

        with pytest.raises(ValidationError):
            LipSyncRequest(
                source_type="invalid_type",
                source_url="https://example.com/image.jpg",
                audio_url="https://example.com/audio.mp3",
            )

    def test_lip_sync_request_empty_source_url_rejected(self):
        """空の source_url は ValidationError を発生させる"""
        from app.lip_sync.schemas import LipSyncRequest

        with pytest.raises(ValidationError):
            LipSyncRequest(
                source_type="image",
                source_url="",
                audio_url="https://example.com/audio.mp3",
            )

    def test_lip_sync_response_creation(self):
        """有効な LipSyncResponse が作成できる"""
        from app.lip_sync.schemas import LipSyncResponse

        response = LipSyncResponse(
            id="gen-001",
            status="pending",
            progress=0,
            output_video_url=None,
            created_at="2026-01-01T00:00:00Z",
        )

        assert response.id == "gen-001"
        assert response.status == "pending"
        assert response.progress == 0
        assert response.output_video_url is None
        assert response.created_at == "2026-01-01T00:00:00Z"

    def test_lip_sync_status_response_creation(self):
        """有効な LipSyncStatusResponse が作成できる"""
        from app.lip_sync.schemas import LipSyncStatusResponse

        response = LipSyncStatusResponse(
            id="gen-001",
            status="completed",
            progress=100,
            output_video_url="https://example.com/output.mp4",
            error_message=None,
        )

        assert response.id == "gen-001"
        assert response.status == "completed"
        assert response.progress == 100
        assert response.output_video_url == "https://example.com/output.mp4"
        assert response.error_message is None

    def test_audio_upload_response_creation(self):
        """有効な AudioUploadResponse が作成できる"""
        from app.lip_sync.schemas import AudioUploadResponse

        response = AudioUploadResponse(
            audio_url="https://r2.example.com/audio/upload.mp3",
            duration_seconds=3.5,
        )

        assert response.audio_url == "https://r2.example.com/audio/upload.mp3"
        assert response.duration_seconds == 3.5
