"""
Omni Reference Limits Config API テスト (M-3)

Endpoint:
  - GET /api/v1/videos/config/omni-reference-limits

目的:
  Backend を source of truth として omni_reference の数値定数を Frontend に
  配信する config endpoint の動作を検証する。

検証観点:
  - 200 を返す (認証不要)
  - 期待されるフィールドが正しい値で揃っている
  - upload_file_size_limits が media_type 別 bytes 値を含む
  - asset_ttl_seconds, consent_required が含まれる
"""
from __future__ import annotations


EXPECTED_PATH = "/api/v1/videos/config/omni-reference-limits"


class TestOmniReferenceLimitsEndpoint:
    """GET /api/v1/videos/config/omni-reference-limits の基本動作"""

    def test_returns_200(self, client):
        """認証なしでも 200 を返すこと (config 系は通常認証不要)"""
        response = client.get(EXPECTED_PATH)
        assert response.status_code == 200

    def test_response_contains_all_expected_fields(self, client):
        """レスポンスに必須フィールドが全て含まれる"""
        response = client.get(EXPECTED_PATH)
        body = response.json()

        expected_keys = {
            "max_image_urls",
            "max_video_urls",
            "max_audio_urls",
            "max_video_total_seconds",
            "max_audio_total_seconds",
            "max_image_reference_asset_ids",
            "upload_file_size_limits",
            "consent_required",
            "asset_ttl_seconds",
        }
        assert expected_keys.issubset(set(body.keys()))

    def test_field_values_match_expected_constants(self, client):
        """各フィールドが Design Doc / 既存定数と一致する値を返す"""
        response = client.get(EXPECTED_PATH)
        body = response.json()

        assert body["max_image_urls"] == 9
        assert body["max_video_urls"] == 3
        assert body["max_audio_urls"] == 3
        assert body["max_video_total_seconds"] == 15.4
        assert body["max_audio_total_seconds"] == 15.0
        assert body["max_image_reference_asset_ids"] == 8
        assert body["consent_required"] is True
        assert body["asset_ttl_seconds"] == 72 * 3600

    def test_upload_file_size_limits_structure(self, client):
        """upload_file_size_limits が media_type 別 bytes 値を持つ"""
        response = client.get(EXPECTED_PATH)
        body = response.json()

        limits = body["upload_file_size_limits"]
        assert isinstance(limits, dict)
        assert limits["video"] == 50 * 1024 * 1024
        assert limits["audio"] == 10 * 1024 * 1024
        assert limits["image"] == 10 * 1024 * 1024


class TestOmniReferenceLimitsAuthOptional:
    """認証なしアクセス可否の確認 (config endpoint は通常認証不要)"""

    def test_no_auth_required(self, client):
        """Authorization ヘッダなしで 200 を返す (401/403 にならない)"""
        response = client.get(EXPECTED_PATH)
        assert response.status_code not in (401, 403)
