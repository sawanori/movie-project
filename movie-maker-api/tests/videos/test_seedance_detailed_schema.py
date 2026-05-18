"""
Seedance 詳細パラメータ スキーマバリデーションテスト

Design Doc: docs/plans/2026-05-18_seedance-detailed-params.md §13.2 B-10 ~ B-17 に対応。

テスト対象:
  - StoryVideoCreate の seedance_generate_audio, seedance_seed, seedance_resolution,
    seedance_camera_fixed の 4 フィールド
  - validate_seedance_only_fields 統合 cross-validator
  - 1080p VIP チェック関数
"""
import pytest
from unittest.mock import MagicMock, patch
from pydantic import ValidationError
from fastapi import HTTPException

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
# B-10: validate_seedance_only_fields — seedance_seed=42 + provider=seedance → valid
# ===========================================================================

class TestSeedanceDetailedSchemaValid:

    def test_seedance_seed_with_seedance_provider_valid(self):
        """seedance_seed=42 + provider=seedance → valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_seed=42,
            video_provider="seedance",
        ))
        assert obj.seedance_seed == 42

    def test_seedance_resolution_with_seedance_provider_valid(self):
        """seedance_resolution='720p' + provider=seedance → valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_resolution="720p",
            video_provider="seedance",
        ))
        assert obj.seedance_resolution == "720p"

    def test_seedance_generate_audio_true_with_seedance_provider_valid(self):
        """seedance_generate_audio=True + provider=seedance → valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_generate_audio=True,
            video_provider="seedance",
        ))
        assert obj.seedance_generate_audio is True

    def test_seedance_camera_fixed_true_with_seedance_provider_valid(self):
        """seedance_camera_fixed=True + provider=seedance → valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_camera_fixed=True,
            video_provider="seedance",
        ))
        assert obj.seedance_camera_fixed is True

    def test_all_new_fields_with_seedance_provider_valid(self):
        """全新規フィールド + provider=seedance → valid"""
        obj = StoryVideoCreate(**_make_request(
            video_provider="seedance",
            seedance_generate_audio=True,
            seedance_seed=12345,
            seedance_resolution="1080p",
            seedance_camera_fixed=True,
        ))
        assert obj.seedance_generate_audio is True
        assert obj.seedance_seed == 12345
        assert obj.seedance_resolution == "1080p"
        assert obj.seedance_camera_fixed is True


# ===========================================================================
# B-11: seedance_seed < 0 → 422 (ge=0)
# ===========================================================================

class TestSeedanceSeedBoundary:

    def test_seedance_seed_negative_raises(self):
        """B-11: seedance_seed=-1 → ValidationError (ge=0)"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_seed=-1,
                video_provider="seedance",
            ))

    def test_seedance_seed_zero_valid(self):
        """seedance_seed=0 は valid (境界値)"""
        obj = StoryVideoCreate(**_make_request(
            seedance_seed=0,
            video_provider="seedance",
        ))
        assert obj.seedance_seed == 0

    def test_seedance_seed_max_valid(self):
        """seedance_seed=2147483647 (32-bit signed int 上限) は valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_seed=2147483647,
            video_provider="seedance",
        ))
        assert obj.seedance_seed == 2147483647

    # ===========================================================================
    # B-12: seedance_seed=2^31 → 422 (le=2147483647)
    # ===========================================================================

    def test_seedance_seed_above_max_raises(self):
        """B-12: seedance_seed=2147483648 (2^31) → ValidationError (le=2147483647)"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_seed=2147483648,
                video_provider="seedance",
            ))


# ===========================================================================
# B-13: seedance_resolution='2160p' → 422 (Literal mismatch)
# ===========================================================================

class TestSeedanceResolutionEnum:

    def test_seedance_resolution_invalid_value_raises(self):
        """B-13: seedance_resolution='2160p' → ValidationError (Literal mismatch)"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_resolution="2160p",
                video_provider="seedance",
            ))

    def test_seedance_resolution_480p_valid(self):
        """seedance_resolution='480p' → valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_resolution="480p",
            video_provider="seedance",
        ))
        assert obj.seedance_resolution == "480p"

    def test_seedance_resolution_720p_valid(self):
        """seedance_resolution='720p' → valid"""
        obj = StoryVideoCreate(**_make_request(
            seedance_resolution="720p",
            video_provider="seedance",
        ))
        assert obj.seedance_resolution == "720p"

    def test_seedance_resolution_1080p_valid(self):
        """seedance_resolution='1080p' → valid (schema level; VIP チェックは router で実施)"""
        obj = StoryVideoCreate(**_make_request(
            seedance_resolution="1080p",
            video_provider="seedance",
        ))
        assert obj.seedance_resolution == "1080p"


# ===========================================================================
# B-14: seedance_seed=42 + provider=runway → 422 (cross-validator)
# ===========================================================================

class TestSeedanceCrossValidator:

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "domoai", "hailuo", "veo"])
    def test_seedance_seed_with_non_seedance_provider_raises(self, provider):
        """B-14: seedance_seed + provider != seedance → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_seed=42,
                video_provider=provider,
            ))

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "domoai", "hailuo", "veo"])
    def test_seedance_generate_audio_true_with_non_seedance_provider_raises(self, provider):
        """seedance_generate_audio=True + provider != seedance → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_generate_audio=True,
                video_provider=provider,
            ))

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "domoai", "hailuo", "veo"])
    def test_seedance_resolution_with_non_seedance_provider_raises(self, provider):
        """seedance_resolution + provider != seedance → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_resolution="720p",
                video_provider=provider,
            ))

    @pytest.mark.parametrize("provider", ["runway", "piapi_kling", "domoai", "hailuo", "veo"])
    def test_seedance_camera_fixed_true_with_non_seedance_provider_raises(self, provider):
        """seedance_camera_fixed=True + provider != seedance → ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_camera_fixed=True,
                video_provider=provider,
            ))

    def test_seedance_generate_audio_false_default_with_any_provider_valid(self):
        """seedance_generate_audio=False (default) + provider=runway → valid (default 値は検査しない)"""
        # False がデフォルト値なので provider mismatch チェックは発動しない
        obj = StoryVideoCreate(**_make_request(
            seedance_generate_audio=False,
            video_provider="runway",
        ))
        assert obj.seedance_generate_audio is False

    def test_seedance_camera_fixed_none_default_with_any_provider_valid(self):
        """seedance_camera_fixed=None (new default) + provider=runway → valid (None は mismatch 対象外)"""
        obj = StoryVideoCreate(**_make_request(
            seedance_camera_fixed=None,
            video_provider="runway",
        ))
        assert obj.seedance_camera_fixed is None

    def test_seedance_camera_fixed_false_with_non_seedance_provider_raises(self):
        """seedance_camera_fixed=False (explicit) + provider=runway → ValidationError (None でない True/False は mismatch 対象)"""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_camera_fixed=False,
                video_provider="runway",
            ))


# ===========================================================================
# B-15: 全新フィールド省略 → valid + seedance_generate_audio=False
# ===========================================================================

class TestSeedanceDefaults:

    def test_all_new_fields_omitted_valid(self):
        """B-15: 全新フィールド省略 → valid + デフォルト値確認"""
        obj = StoryVideoCreate(**_make_request())
        assert obj.seedance_generate_audio is False
        assert obj.seedance_seed is None
        assert obj.seedance_resolution is None
        # seedance_camera_fixed は Optional[bool] default=None (M-1 Design Doc 整合)
        assert obj.seedance_camera_fixed is None

    def test_existing_seedance_fields_still_work(self):
        """既存 seedance_duration / seedance_mode は引き続き動作すること"""
        obj = StoryVideoCreate(**_make_request(
            seedance_duration=7,
            seedance_mode="fast",
            video_provider="seedance",
        ))
        assert obj.seedance_duration == 7
        assert obj.seedance_mode == "fast"

    def test_existing_seedance_mode_mismatch_still_raises(self):
        """既存 seedance_mode + provider != seedance → 引き続き ValidationError"""
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                seedance_mode="fast",
                video_provider="runway",
            ))


# ===========================================================================
# B-16 / B-17: 1080p VIP チェック関数のテスト
# ===========================================================================

class TestCheck1080pVipRequirement:

    def test_non_vip_with_1080p_raises_422(self):
        """B-16: 非 VIP env + seedance_resolution='1080p' → HTTPException 422"""
        from app.videos.router import _check_seedance_1080p_vip_requirement
        with pytest.raises(HTTPException) as exc_info:
            _check_seedance_1080p_vip_requirement(
                resolution='1080p',
                task_type_env="seedance-2-preview",  # 非 VIP
            )
        assert exc_info.value.status_code == 422
        assert "VIP" in exc_info.value.detail

    def test_vip_with_1080p_passes(self):
        """B-17: VIP env + seedance_resolution='1080p' → pass (例外なし)"""
        from app.videos.router import _check_seedance_1080p_vip_requirement
        # 例外が発生しないことを確認
        _check_seedance_1080p_vip_requirement(
            resolution='1080p',
            task_type_env="seedance-2-preview-vip",  # VIP
        )

    def test_non_vip_with_720p_passes(self):
        """非 VIP env + seedance_resolution='720p' → pass"""
        from app.videos.router import _check_seedance_1080p_vip_requirement
        _check_seedance_1080p_vip_requirement(
            resolution='720p',
            task_type_env="seedance-2-preview",
        )

    def test_non_vip_with_none_resolution_passes(self):
        """非 VIP env + seedance_resolution=None → pass"""
        from app.videos.router import _check_seedance_1080p_vip_requirement
        _check_seedance_1080p_vip_requirement(
            resolution=None,
            task_type_env="seedance-2-preview",
        )

    def test_vip_fast_with_1080p_passes(self):
        """VIP fast variant + seedance_resolution='1080p' → pass"""
        from app.videos.router import _check_seedance_1080p_vip_requirement
        _check_seedance_1080p_vip_requirement(
            resolution='1080p',
            task_type_env="seedance-2-fast-preview-vip",
        )
