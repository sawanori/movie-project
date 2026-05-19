"""
Seedance omni_reference スキーマバリデーションテスト (v3 §6.4 / §15.1)

対象:
  - StoryVideoCreate.image_reference_asset_ids (max=8)
  - StoryVideoCreate.video_reference_asset_ids (max=3)
  - StoryVideoCreate.audio_reference_asset_ids (max=3)
  - StoryVideoCreate.validate_omni_references (cross-validator)
  - OmniReferenceAssetResponse (Upload API レスポンス)

v3 計画書 §15.1 B-13〜B-20, B-32, B-16b, B-17a-c を実装
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.videos.schemas import (
    OmniReferenceAssetResponse,
    StoryVideoCreate,
    VideoProvider,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(**kwargs) -> dict:
    """StoryVideoCreate に必要な最低限のフィールドを補完するヘルパー"""
    defaults = {
        "image_url": "https://example.com/image.jpg",
        "story_text": "test story",
        "video_provider": VideoProvider.SEEDANCE,
    }
    defaults.update(kwargs)
    return defaults


def _uuids(n: int) -> list[str]:
    return [str(uuid4()) for _ in range(n)]


# ===========================================================================
# B-13: 3 種正常 → valid
# ===========================================================================

class TestB13_AllThreeReferenceTypesValid:

    def test_image_video_audio_refs_all_present(self):
        """image_refs=2, video_refs=1, audio_refs=1, provider=seedance → OK"""
        obj = StoryVideoCreate(**_make_request(
            image_reference_asset_ids=_uuids(2),
            video_reference_asset_ids=_uuids(1),
            audio_reference_asset_ids=_uuids(1),
        ))
        assert len(obj.image_reference_asset_ids) == 2
        assert len(obj.video_reference_asset_ids) == 1
        assert len(obj.audio_reference_asset_ids) == 1


# ===========================================================================
# B-14: video 4 個 → 422 (Pydantic max_length=3)
# ===========================================================================

class TestB14_VideoRefsExceedMax:

    def test_video_refs_4_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                video_reference_asset_ids=_uuids(4),
            ))
        # Pydantic v2 max_length エラー
        errors = exc_info.value.errors()
        assert any("video_reference_asset_ids" in str(e.get("loc", ())) for e in errors)


# ===========================================================================
# B-15: refs + provider=runway → 422
# ===========================================================================

class TestB15_ProviderMismatch:

    def test_image_refs_with_runway_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                video_provider=VideoProvider.RUNWAY,
                image_reference_asset_ids=_uuids(1),
            ))
        assert "seedance" in str(exc_info.value)

    def test_video_refs_with_veo_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                video_provider=VideoProvider.VEO,
                video_reference_asset_ids=_uuids(1),
            ))
        assert "seedance" in str(exc_info.value)

    def test_audio_refs_with_kling_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                video_provider=VideoProvider.PIAPI_KLING,
                audio_reference_asset_ids=_uuids(1),
            ))
        assert "seedance" in str(exc_info.value)


# ===========================================================================
# B-16b: base image_url + audio refs のみ → valid
# ===========================================================================

class TestB16b_BaseImagePlusAudioOnly:

    def test_base_image_plus_audio_refs_valid(self):
        """image_url (base 1) + audio_refs のみ (image_refs/video_refs なし) → OK
        構造的に image_url 必須なので audio 単独は実質不可
        """
        obj = StoryVideoCreate(**_make_request(
            audio_reference_asset_ids=_uuids(2),
        ))
        assert len(obj.audio_reference_asset_ids) == 2


# ===========================================================================
# B-17a: image_url + image_refs=8 → valid (合計 9, 上限ジャスト)
# ===========================================================================

class TestB17a_ImageBoundaryJust:

    def test_base_image_plus_8_refs_total_9_valid(self):
        obj = StoryVideoCreate(**_make_request(
            image_reference_asset_ids=_uuids(8),
        ))
        assert len(obj.image_reference_asset_ids) == 8


# ===========================================================================
# B-17b: image_refs=9 → 422 (Pydantic max_length=8 で拒否)
# ===========================================================================

class TestB17b_ImageRefsExceedFieldMax:

    def test_image_refs_9_rejected_by_field_max(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                image_reference_asset_ids=_uuids(9),
            ))
        errors = exc_info.value.errors()
        assert any("image_reference_asset_ids" in str(e.get("loc", ())) for e in errors)


# ===========================================================================
# B-17c: video_refs=3, audio_refs=3 境界 → valid (個別上限ジャスト)
# ===========================================================================

class TestB17c_VideoAudioBoundaryJust:

    def test_video_refs_3_valid(self):
        obj = StoryVideoCreate(**_make_request(
            video_reference_asset_ids=_uuids(3),
        ))
        assert len(obj.video_reference_asset_ids) == 3

    def test_audio_refs_3_valid(self):
        obj = StoryVideoCreate(**_make_request(
            audio_reference_asset_ids=_uuids(3),
        ))
        assert len(obj.audio_reference_asset_ids) == 3

    def test_audio_refs_4_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                audio_reference_asset_ids=_uuids(4),
            ))
        errors = exc_info.value.errors()
        assert any("audio_reference_asset_ids" in str(e.get("loc", ())) for e in errors)


# ===========================================================================
# B-18: @video2 + refs=1 → 422 (プロンプト内タグ範囲外)
# ===========================================================================

class TestB18_PromptTagOutOfRange:

    def test_at_video2_with_only_1_ref_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                story_text="scene with @video2 motion",
                video_reference_asset_ids=_uuids(1),
            ))
        assert "@video2" in str(exc_info.value)

    def test_at_image3_with_only_1_image_total_rejected(self):
        """base image (1) + image_refs=0 → image_count=1, @image3 NG"""
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                story_text="reference @image3 strongly",
                video_reference_asset_ids=_uuids(1),  # validator 起動条件
            ))
        assert "@image3" in str(exc_info.value)

    def test_at_audio5_out_of_range_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(**_make_request(
                story_text="play @audio5 in background",
                audio_reference_asset_ids=_uuids(2),
            ))
        assert "@audio5" in str(exc_info.value)


# ===========================================================================
# B-19: @video1 + refs=1 → valid
# ===========================================================================

class TestB19_PromptTagInRange:

    def test_at_video1_with_1_ref_valid(self):
        obj = StoryVideoCreate(**_make_request(
            story_text="scene with @video1 motion",
            video_reference_asset_ids=_uuids(1),
        ))
        assert len(obj.video_reference_asset_ids) == 1

    def test_at_image1_with_base_image_only_valid(self):
        """base image_url のみ (image_count=1) + @image1 → OK"""
        obj = StoryVideoCreate(**_make_request(
            story_text="reference @image1 strongly",
            audio_reference_asset_ids=_uuids(1),  # validator 起動条件
        ))
        assert obj.image_url is not None

    def test_at_audio2_with_2_refs_valid(self):
        obj = StoryVideoCreate(**_make_request(
            story_text="use @audio1 then @audio2",
            audio_reference_asset_ids=_uuids(2),
        ))
        assert len(obj.audio_reference_asset_ids) == 2


# ===========================================================================
# B-20: 全省略 → valid (omni_reference 機能未使用は影響なし)
# ===========================================================================

class TestB20_AllOmitted:

    def test_no_refs_provided_valid(self):
        obj = StoryVideoCreate(**_make_request())
        assert obj.image_reference_asset_ids is None
        assert obj.video_reference_asset_ids is None
        assert obj.audio_reference_asset_ids is None

    def test_no_refs_with_non_seedance_provider_valid(self):
        """refs なし + provider=runway → validator はスキップされ OK"""
        obj = StoryVideoCreate(**_make_request(
            video_provider=VideoProvider.RUNWAY,
        ))
        assert obj.image_reference_asset_ids is None


# ===========================================================================
# B-32: UUID 文字列以外 ("https://...") → 422 (AC-13: 外部 URL 直接拒否)
# ===========================================================================

class TestB32_RejectNonUuidValues:

    def test_https_url_as_image_ref_rejected(self):
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                image_reference_asset_ids=["https://malicious.example.com/img.jpg"],
            ))

    def test_https_url_as_video_ref_rejected(self):
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                video_reference_asset_ids=["https://malicious.example.com/v.mp4"],
            ))

    def test_https_url_as_audio_ref_rejected(self):
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                audio_reference_asset_ids=["https://malicious.example.com/a.mp3"],
            ))

    def test_plain_string_rejected(self):
        with pytest.raises(ValidationError):
            StoryVideoCreate(**_make_request(
                image_reference_asset_ids=["not-a-uuid"],
            ))


# ===========================================================================
# OmniReferenceAssetResponse: Upload API レスポンス schema (H-1 解消)
# ===========================================================================

class TestOmniReferenceAssetResponse:

    def test_minimal_video_response_valid(self):
        asset_id = uuid4()
        resp = OmniReferenceAssetResponse(
            id=asset_id,
            url="https://r2.example.com/assets/foo.mp4",
            media_type="video",
            duration_seconds=5.4,
            content_type="video/mp4",
            file_size_bytes=1024000,
            expires_at=datetime.now(timezone.utc),
        )
        assert resp.id == asset_id
        assert resp.media_type == "video"
        assert resp.duration_seconds == 5.4

    def test_audio_response_valid(self):
        resp = OmniReferenceAssetResponse(
            id=uuid4(),
            url="https://r2.example.com/assets/foo.mp3",
            media_type="audio",
            duration_seconds=10.0,
            content_type="audio/mpeg",
            file_size_bytes=512000,
            expires_at=datetime.now(timezone.utc),
        )
        assert resp.media_type == "audio"

    def test_image_response_without_duration_valid(self):
        """image は duration_seconds=None で OK"""
        resp = OmniReferenceAssetResponse(
            id=uuid4(),
            url="https://r2.example.com/assets/foo.png",
            media_type="image",
            content_type="image/png",
            file_size_bytes=204800,
            expires_at=datetime.now(timezone.utc),
        )
        assert resp.media_type == "image"
        assert resp.duration_seconds is None

    def test_invalid_media_type_rejected(self):
        with pytest.raises(ValidationError):
            OmniReferenceAssetResponse(
                id=uuid4(),
                url="https://r2.example.com/assets/foo.txt",
                media_type="text",  # Literal["video","audio","image"] 違反
                content_type="text/plain",
                file_size_bytes=100,
                expires_at=datetime.now(timezone.utc),
            )
