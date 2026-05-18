"""
Duration フィールドのスキーマバリデーションテスト

対象:
  - seedance_duration: ge=4, le=15 (int)
  - veo_duration: ge=4, le=8, 離散値 [4, 6, 8] のみ valid
  - validate_provider_specific_durations cross-validator
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
# seedance_duration
# ===========================================================================

class TestSeedanceDuration:

    # -----------------------------------------------------------------------
    # Valid values
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("duration", [4, 5, 7, 10, 12, 15])
    def test_valid_seedance_duration(self, duration):
        """4-15 の整数は valid"""
        data = _make_request(
            seedance_duration=duration,
            video_provider="seedance",
        )
        obj = StoryVideoCreate(**data)
        assert obj.seedance_duration == duration

    def test_seedance_duration_none_is_valid(self):
        """None (未指定) は valid"""
        obj = StoryVideoCreate(**_make_request())
        assert obj.seedance_duration is None

    def test_seedance_duration_existing_values_still_valid(self):
        """既存値 5, 10, 15 が引き続き valid であること (後方互換)"""
        for v in [5, 10, 15]:
            obj = StoryVideoCreate(**_make_request(seedance_duration=v, video_provider="seedance"))
            assert obj.seedance_duration == v

    # -----------------------------------------------------------------------
    # Invalid: out of range
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("duration", [3, 16, 0, -1])
    def test_seedance_duration_out_of_range_raises(self, duration):
        """ge=4, le=15 の範囲外は ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_duration=duration,
                video_provider="seedance",
            ))

    # -----------------------------------------------------------------------
    # Cross-validator: provider mismatch
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "domoai", "hailuo"])
    def test_seedance_duration_with_wrong_provider_raises(self, provider):
        """seedance_duration + provider != seedance → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_duration=5,
                video_provider=provider,
            ))

    def test_seedance_duration_with_no_provider_is_valid(self):
        """seedance_duration + video_provider=None は valid (§7.1 の None 許容)"""
        obj = StoryVideoCreate(**_make_request(seedance_duration=7))
        assert obj.seedance_duration == 7


# ===========================================================================
# veo_duration
# ===========================================================================

class TestVeoDuration:

    # -----------------------------------------------------------------------
    # Valid discrete values
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("duration", [4, 6, 8])
    def test_valid_veo_duration(self, duration):
        """4, 6, 8 は valid"""
        obj = StoryVideoCreate(**_make_request(
            veo_duration=duration,
            video_provider="veo",
        ))
        assert obj.veo_duration == duration

    def test_veo_duration_none_is_valid(self):
        """None (未指定) は valid"""
        obj = StoryVideoCreate(**_make_request())
        assert obj.veo_duration is None

    # -----------------------------------------------------------------------
    # Invalid: out of [4, 6, 8]
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("duration", [3, 5, 7, 9])
    def test_veo_duration_invalid_value_raises(self, duration):
        """4/6/8 以外は ValidationError (field_validator)"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                veo_duration=duration,
                video_provider="veo",
            ))

    # -----------------------------------------------------------------------
    # Cross-validator: provider mismatch
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "seedance", "domoai", "hailuo"])
    def test_veo_duration_with_wrong_provider_raises(self, provider):
        """veo_duration + provider != veo → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                veo_duration=6,
                video_provider=provider,
            ))

    def test_veo_duration_with_no_provider_is_valid(self):
        """veo_duration + video_provider=None は valid (§7.1 の None 許容)"""
        obj = StoryVideoCreate(**_make_request(veo_duration=6))
        assert obj.veo_duration == 6
