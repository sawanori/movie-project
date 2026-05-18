"""
seedance_mode フィールドのスキーマバリデーションテスト

対象:
  - seedance_mode: Optional[Literal['pro', 'fast']]
  - validate_provider_specific_durations cross-validator での seedance_mode 検証
"""
import pytest
from pydantic import ValidationError

from app.videos.schemas import StoryVideoCreate, VideoProvider


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(**kwargs) -> dict:
    """StoryVideoCreate に必要な最低限のフィールドを補完するヘルパー"""
    defaults = {
        "image_url": "https://example.com/image.jpg",
        "story_text": "test story",
    }
    defaults.update(kwargs)
    return defaults


# ===========================================================================
# seedance_mode スキーマバリデーション
# ===========================================================================

class TestSeedanceModeSchema:

    # -----------------------------------------------------------------------
    # Valid values
    # -----------------------------------------------------------------------

    def test_seedance_mode_pro_valid(self):
        """seedance_mode='pro' + provider=seedance → OK"""
        obj = StoryVideoCreate(**_make_request(
            seedance_mode="pro",
            video_provider="seedance",
        ))
        assert obj.seedance_mode == "pro"

    def test_seedance_mode_fast_valid(self):
        """seedance_mode='fast' + provider=seedance → OK"""
        obj = StoryVideoCreate(**_make_request(
            seedance_mode="fast",
            video_provider="seedance",
        ))
        assert obj.seedance_mode == "fast"

    def test_seedance_mode_none_is_valid(self):
        """seedance_mode=None (未指定) は valid"""
        obj = StoryVideoCreate(**_make_request())
        assert obj.seedance_mode is None

    def test_seedance_mode_none_with_seedance_provider(self):
        """seedance_mode=None + provider=seedance は valid"""
        obj = StoryVideoCreate(**_make_request(video_provider="seedance"))
        assert obj.seedance_mode is None

    def test_seedance_mode_with_no_provider_is_valid(self):
        """seedance_mode + video_provider=None は valid (None 許容)"""
        obj = StoryVideoCreate(**_make_request(seedance_mode="fast"))
        assert obj.seedance_mode == "fast"

    # -----------------------------------------------------------------------
    # Invalid: unsupported mode value
    # -----------------------------------------------------------------------

    def test_seedance_mode_invalid_value_raises(self):
        """'pro'/'fast' 以外は ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_mode="ultra",
                video_provider="seedance",
            ))

    # -----------------------------------------------------------------------
    # Cross-validator: provider mismatch
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "domoai", "hailuo", "veo"])
    def test_seedance_mode_invalid_provider(self, provider):
        """seedance_mode + provider != seedance → 422 / ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_mode="fast",
                video_provider=provider,
            ))

    def test_seedance_mode_pro_with_wrong_provider_raises(self):
        """seedance_mode='pro' + provider=runway → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_mode="pro",
                video_provider="runway",
            ))
