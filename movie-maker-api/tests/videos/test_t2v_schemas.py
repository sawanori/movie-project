"""
Tests for T2V Pydantic schemas
"""
import pytest
from pydantic import ValidationError


class TestT2VVideoCreate:
    """Test T2VVideoCreate schema"""

    def test_valid_t2v_video_create(self):
        """T2VVideoCreate should accept valid data"""
        from app.videos.schemas import T2VVideoCreate
        data = T2VVideoCreate(
            prompt="A beautiful sunset over the ocean",
            duration=5,
            aspect_ratio="9:16",
        )
        assert data.prompt == "A beautiful sunset over the ocean"
        assert data.duration == 5
        assert data.aspect_ratio == "9:16"
        assert data.video_provider is None

    def test_t2v_video_create_empty_prompt_rejected(self):
        """T2VVideoCreate should reject empty prompts"""
        from app.videos.schemas import T2VVideoCreate
        with pytest.raises(ValidationError):
            T2VVideoCreate(prompt="")

    def test_t2v_video_create_with_provider_override(self):
        """T2VVideoCreate should accept optional video_provider"""
        from app.videos.schemas import T2VVideoCreate
        data = T2VVideoCreate(
            prompt="Test scene",
            video_provider="veo",
        )
        assert data.video_provider == "veo"
        assert data.duration == 5  # default
        assert data.aspect_ratio == "9:16"  # default

    def test_t2v_video_response_creation(self):
        """T2VVideoResponse should be created from valid data"""
        from app.videos.schemas import T2VVideoResponse
        data = T2VVideoResponse(
            id="test-video-id-001",
            status="pending",
            progress=0,
            video_url=None,
            created_at="2026-03-15T00:00:00",
        )
        assert data.id == "test-video-id-001"
        assert data.status == "pending"
        assert data.progress == 0
        assert data.video_url is None
        assert data.created_at == "2026-03-15T00:00:00"
