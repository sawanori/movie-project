"""
Topaz Enhancement アップスケール関連スキーマのテスト
"""
import pytest
from datetime import datetime
from pydantic import ValidationError

from app.videos.schemas import (
    EnhanceModel,
    TopazUpscaleScale,
    UserVideoResponse,
    UserVideoUpscaleRequest,
    UserVideoUpscaleEstimateResponse,
    UserVideoUpscaleResponse,
    UserVideoUpscaleStatusResponse,
)


class TestEnhanceModelEnum:
    """EnhanceModel enum のテスト"""

    def test_all_models_have_correct_values(self):
        """全モデルが正しい値を持つこと"""
        assert EnhanceModel.PROTEUS.value == "prob-4"
        assert EnhanceModel.ARTEMIS_HQ.value == "ahq-12"
        assert EnhanceModel.ARTEMIS_MQ.value == "amq-13"
        assert EnhanceModel.ARTEMIS_LQ.value == "alq-13"
        assert EnhanceModel.GAIA_HQ.value == "ghq-5"
        assert EnhanceModel.GAIA_CG.value == "gcg-5"
        assert EnhanceModel.NYX.value == "nyk-3"
        assert EnhanceModel.RHEA.value == "rhea-1"
        assert EnhanceModel.IRIS.value == "iris-3"
        assert EnhanceModel.THEIA_DETAIL.value == "thd-3"
        assert EnhanceModel.THEIA_FINE.value == "thf-4"

    def test_model_count(self):
        """11種類のモデルが定義されていること"""
        assert len(EnhanceModel) == 11

    def test_is_string_enum(self):
        """str型のEnumであること"""
        assert isinstance(EnhanceModel.PROTEUS, str)
        assert EnhanceModel.PROTEUS == "prob-4"


class TestTopazUpscaleScaleEnum:
    """TopazUpscaleScale enum のテスト"""

    def test_scale_values(self):
        """倍率の値が正しいこと"""
        assert TopazUpscaleScale.TWO_X.value == "2x"
        assert TopazUpscaleScale.FOUR_X.value == "4x"

    def test_scale_count(self):
        """2種類の倍率が定義されていること"""
        assert len(TopazUpscaleScale) == 2

    def test_is_string_enum(self):
        """str型のEnumであること"""
        assert isinstance(TopazUpscaleScale.TWO_X, str)
        assert TopazUpscaleScale.TWO_X == "2x"


class TestUserVideoResponseUpscaledField:
    """UserVideoResponse に upscaled_video_url フィールドが追加されたことのテスト"""

    def _create_user_video_response(self, **kwargs):
        """テスト用の UserVideoResponse を生成するヘルパー"""
        defaults = {
            "id": "test-id",
            "user_id": "user-123",
            "title": "Test Video",
            "video_url": "https://example.com/video.mp4",
            "duration_seconds": 30.0,
            "width": 1920,
            "height": 1080,
            "file_size_bytes": 5000000,
            "mime_type": "video/mp4",
            "created_at": datetime(2026, 1, 1),
            "updated_at": datetime(2026, 1, 2),
        }
        defaults.update(kwargs)
        return UserVideoResponse(**defaults)

    def test_upscaled_video_url_defaults_to_none(self):
        """upscaled_video_url がデフォルトで None であること"""
        response = self._create_user_video_response()
        assert response.upscaled_video_url is None

    def test_upscaled_video_url_can_be_set(self):
        """upscaled_video_url に値を設定できること"""
        url = "https://example.com/upscaled.mp4"
        response = self._create_user_video_response(upscaled_video_url=url)
        assert response.upscaled_video_url == url

    def test_upscaled_video_url_in_serialized_output(self):
        """シリアライズ結果に upscaled_video_url が含まれること"""
        url = "https://example.com/upscaled.mp4"
        response = self._create_user_video_response(upscaled_video_url=url)
        data = response.model_dump()
        assert "upscaled_video_url" in data
        assert data["upscaled_video_url"] == url


class TestUserVideoUpscaleRequest:
    """UserVideoUpscaleRequest スキーマのテスト"""

    def test_default_values(self):
        """デフォルト値が正しいこと"""
        request = UserVideoUpscaleRequest()
        assert request.model == EnhanceModel.PROTEUS
        assert request.scale == TopazUpscaleScale.TWO_X

    def test_custom_model_and_scale(self):
        """カスタムモデルと倍率を指定できること"""
        request = UserVideoUpscaleRequest(
            model=EnhanceModel.RHEA,
            scale=TopazUpscaleScale.FOUR_X
        )
        assert request.model == EnhanceModel.RHEA
        assert request.scale == TopazUpscaleScale.FOUR_X

    def test_from_json_string_values(self):
        """JSON文字列値からの生成が正しく動作すること"""
        request = UserVideoUpscaleRequest(
            model="prob-4",
            scale="4x"
        )
        assert request.model == EnhanceModel.PROTEUS
        assert request.scale == TopazUpscaleScale.FOUR_X

    def test_invalid_model_raises_error(self):
        """無効なモデル値でバリデーションエラーが発生すること"""
        with pytest.raises(ValidationError):
            UserVideoUpscaleRequest(model="invalid-model")

    def test_invalid_scale_raises_error(self):
        """無効な倍率値でバリデーションエラーが発生すること"""
        with pytest.raises(ValidationError):
            UserVideoUpscaleRequest(scale="8x")


class TestUserVideoUpscaleEstimateResponse:
    """UserVideoUpscaleEstimateResponse スキーマのテスト"""

    def test_create_estimate_response(self):
        """見積もりレスポンスを正しく生成できること"""
        response = UserVideoUpscaleEstimateResponse(
            estimated_credits_min=10,
            estimated_credits_max=30,
            estimated_time_min=60,
            estimated_time_max=180,
            target_width=3840,
            target_height=2160,
        )
        assert response.estimated_credits_min == 10
        assert response.estimated_credits_max == 30
        assert response.estimated_time_min == 60
        assert response.estimated_time_max == 180
        assert response.target_width == 3840
        assert response.target_height == 2160

    def test_missing_required_fields_raises_error(self):
        """必須フィールドが欠けるとバリデーションエラーが発生すること"""
        with pytest.raises(ValidationError):
            UserVideoUpscaleEstimateResponse(
                estimated_credits_min=10,
                # 他の必須フィールドが欠けている
            )


class TestUserVideoUpscaleResponse:
    """UserVideoUpscaleResponse スキーマのテスト"""

    def test_create_full_response(self):
        """全フィールドを指定してレスポンスを生成できること"""
        now = datetime(2026, 2, 7, 12, 0, 0)
        response = UserVideoUpscaleResponse(
            id="upscale-123",
            user_video_id="video-456",
            status="processing",
            model="prob-4",
            target_width=3840,
            target_height=2160,
            original_video_url="https://example.com/original.mp4",
            upscaled_video_url=None,
            progress=50,
            estimated_credits_min=10,
            estimated_credits_max=30,
            created_at=now,
        )
        assert response.id == "upscale-123"
        assert response.user_video_id == "video-456"
        assert response.status == "processing"
        assert response.model == "prob-4"
        assert response.target_width == 3840
        assert response.target_height == 2160
        assert response.original_video_url == "https://example.com/original.mp4"
        assert response.upscaled_video_url is None
        assert response.progress == 50
        assert response.estimated_credits_min == 10
        assert response.estimated_credits_max == 30
        assert response.created_at == now

    def test_optional_fields_default_values(self):
        """オプショナルフィールドのデフォルト値が正しいこと"""
        now = datetime(2026, 2, 7, 12, 0, 0)
        response = UserVideoUpscaleResponse(
            id="upscale-123",
            user_video_id="video-456",
            status="pending",
            model="prob-4",
            target_width=3840,
            target_height=2160,
            original_video_url="https://example.com/original.mp4",
            created_at=now,
        )
        assert response.upscaled_video_url is None
        assert response.progress == 0
        assert response.estimated_credits_min is None
        assert response.estimated_credits_max is None

    def test_missing_required_field_raises_error(self):
        """必須フィールドが欠けるとバリデーションエラーが発生すること"""
        with pytest.raises(ValidationError):
            UserVideoUpscaleResponse(
                id="upscale-123",
                # user_video_id が欠けている
                status="pending",
                model="prob-4",
                target_width=3840,
                target_height=2160,
                original_video_url="https://example.com/original.mp4",
                created_at=datetime(2026, 2, 7),
            )


class TestUserVideoUpscaleStatusResponse:
    """UserVideoUpscaleStatusResponse スキーマのテスト"""

    def test_create_status_response_completed(self):
        """完了ステータスのレスポンスを生成できること"""
        response = UserVideoUpscaleStatusResponse(
            id="upscale-123",
            status="completed",
            progress=100,
            upscaled_video_url="https://example.com/upscaled.mp4",
            thumbnail_url="https://example.com/thumb.jpg",
        )
        assert response.id == "upscale-123"
        assert response.status == "completed"
        assert response.progress == 100
        assert response.upscaled_video_url == "https://example.com/upscaled.mp4"
        assert response.thumbnail_url == "https://example.com/thumb.jpg"
        assert response.error_message is None

    def test_create_status_response_failed(self):
        """失敗ステータスのレスポンスを生成できること"""
        response = UserVideoUpscaleStatusResponse(
            id="upscale-123",
            status="failed",
            progress=30,
            error_message="Topaz API timeout",
        )
        assert response.status == "failed"
        assert response.progress == 30
        assert response.upscaled_video_url is None
        assert response.thumbnail_url is None
        assert response.error_message == "Topaz API timeout"

    def test_optional_fields_default_to_none(self):
        """オプショナルフィールドがデフォルトでNoneであること"""
        response = UserVideoUpscaleStatusResponse(
            id="upscale-123",
            status="pending",
            progress=0,
        )
        assert response.upscaled_video_url is None
        assert response.thumbnail_url is None
        assert response.error_message is None

    def test_missing_required_fields_raises_error(self):
        """必須フィールドが欠けるとバリデーションエラーが発生すること"""
        with pytest.raises(ValidationError):
            UserVideoUpscaleStatusResponse(
                id="upscale-123",
                # status と progress が欠けている
            )
