"""
Tests for T2V (Text-to-Video) extension of VideoProviderInterface
"""
import pytest
from app.external.video_provider import (
    VideoProviderInterface,
    VideoProviderError,
    VideoStatus,
    VideoGenerationStatus,
)


class ConcreteT2VProvider(VideoProviderInterface):
    """Concrete implementation for testing T2V methods"""

    @property
    def provider_name(self) -> str:
        return "test_t2v_provider"

    async def generate_video(self, image_url, prompt, duration=5, aspect_ratio="9:16", camera_work=None) -> str:
        return "test_task_id"

    async def check_status(self, task_id) -> VideoStatus:
        return VideoStatus(status=VideoGenerationStatus.COMPLETED, progress=100)

    async def get_video_url(self, task_id):
        return "https://example.com/video.mp4"

    @property
    def supports_t2v(self) -> bool:
        return True

    async def generate_video_from_text(self, prompt, duration=5, aspect_ratio="9:16") -> str:
        return f"t2v_task_{prompt}"


class MinimalProvider(VideoProviderInterface):
    """Minimal concrete provider that does not override T2V methods"""

    @property
    def provider_name(self) -> str:
        return "minimal_provider"

    async def generate_video(self, image_url, prompt, duration=5, aspect_ratio="9:16", camera_work=None) -> str:
        return "task_id"

    async def check_status(self, task_id) -> VideoStatus:
        return VideoStatus(status=VideoGenerationStatus.PENDING, progress=0)

    async def get_video_url(self, task_id):
        return None


class TestVideoProviderT2VDefaults:
    """Test T2V default behavior in VideoProviderInterface"""

    def test_supports_t2v_defaults_to_false(self):
        """supports_t2v should default to False for providers that don't override it"""
        provider = MinimalProvider()
        assert provider.supports_t2v is False

    @pytest.mark.asyncio
    async def test_generate_video_from_text_raises_not_implemented_by_default(self):
        """generate_video_from_text should raise NotImplementedError by default"""
        provider = MinimalProvider()
        with pytest.raises(NotImplementedError):
            await provider.generate_video_from_text(prompt="A sunny beach scene")

    def test_concrete_subclass_can_override_supports_t2v_to_true(self):
        """A concrete subclass should be able to override supports_t2v to True"""
        provider = ConcreteT2VProvider()
        assert provider.supports_t2v is True

    @pytest.mark.asyncio
    async def test_generate_video_from_text_with_concrete_implementation(self):
        """A concrete subclass should be able to provide a working generate_video_from_text"""
        provider = ConcreteT2VProvider()
        task_id = await provider.generate_video_from_text(
            prompt="A sunny beach",
            duration=5,
            aspect_ratio="9:16",
        )
        assert task_id == "t2v_task_A sunny beach"

    @pytest.mark.asyncio
    async def test_error_message_includes_provider_name(self):
        """The NotImplementedError message should include the provider name"""
        provider = MinimalProvider()
        with pytest.raises(NotImplementedError) as exc_info:
            await provider.generate_video_from_text(prompt="Test prompt")
        assert "minimal_provider" in str(exc_info.value)
