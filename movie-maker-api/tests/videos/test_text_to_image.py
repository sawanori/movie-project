"""
Text-to-Image 機能のテスト

構造化入力からの画像生成機能をテストする。
- スキーマバリデーション
- エンドポイント動作
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pydantic import ValidationError

from app.videos.schemas import (
    StructuredImageInput,
    GenerateImageFromTextRequest,
    VALID_SUBJECT_POSITIONS,
    VALID_LIGHTING_OPTIONS,
    VALID_MOOD_OPTIONS,
)


class TestStructuredImageInputValidation:
    """StructuredImageInput スキーマバリデーションテスト"""

    def test_valid_minimal_input(self):
        """最小限の有効な入力（被写体のみ）"""
        input_data = StructuredImageInput(subject="コーヒーカップ")
        assert input_data.subject == "コーヒーカップ"
        assert input_data.subject_position is None
        assert input_data.lighting is None
        assert input_data.mood is None

    def test_valid_full_input(self):
        """すべてのフィールドを指定した有効な入力"""
        input_data = StructuredImageInput(
            subject="高級腕時計",
            subject_position="center",
            background="ダークグレーの背景",
            lighting="studio",
            color_palette="シルバーとブラック",
            mood="luxury",
            additional_notes="反射を美しく",
        )
        assert input_data.subject == "高級腕時計"
        assert input_data.subject_position == "center"
        assert input_data.lighting == "studio"
        assert input_data.mood == "luxury"

    def test_subject_required(self):
        """被写体は必須"""
        with pytest.raises(ValidationError) as exc_info:
            StructuredImageInput()
        assert "subject" in str(exc_info.value)

    def test_subject_empty_string_rejected(self):
        """被写体が空文字列の場合は拒否"""
        with pytest.raises(ValidationError) as exc_info:
            StructuredImageInput(subject="")
        assert "subject" in str(exc_info.value)

    def test_subject_max_length(self):
        """被写体の最大長チェック（200文字）"""
        long_subject = "a" * 201
        with pytest.raises(ValidationError) as exc_info:
            StructuredImageInput(subject=long_subject)
        assert "subject" in str(exc_info.value)

    def test_invalid_subject_position(self):
        """無効な被写体位置値"""
        with pytest.raises(ValidationError) as exc_info:
            StructuredImageInput(subject="test", subject_position="invalid_position")
        error_message = str(exc_info.value)
        assert "subject_position" in error_message

    def test_invalid_lighting(self):
        """無効な照明値"""
        with pytest.raises(ValidationError) as exc_info:
            StructuredImageInput(subject="test", lighting="invalid_lighting")
        error_message = str(exc_info.value)
        assert "lighting" in error_message

    def test_invalid_mood(self):
        """無効なムード値"""
        with pytest.raises(ValidationError) as exc_info:
            StructuredImageInput(subject="test", mood="invalid_mood")
        error_message = str(exc_info.value)
        assert "mood" in error_message

    def test_all_valid_subject_positions(self):
        """すべての有効な被写体位置値をテスト"""
        for position in VALID_SUBJECT_POSITIONS:
            input_data = StructuredImageInput(subject="test", subject_position=position)
            assert input_data.subject_position == position

    def test_all_valid_lighting_options(self):
        """すべての有効な照明値をテスト"""
        for lighting in VALID_LIGHTING_OPTIONS:
            input_data = StructuredImageInput(subject="test", lighting=lighting)
            assert input_data.lighting == lighting

    def test_all_valid_mood_options(self):
        """すべての有効なムード値をテスト"""
        for mood in VALID_MOOD_OPTIONS:
            input_data = StructuredImageInput(subject="test", mood=mood)
            assert input_data.mood == mood

    def test_background_max_length(self):
        """背景の最大長チェック（200文字）"""
        long_background = "b" * 201
        with pytest.raises(ValidationError):
            StructuredImageInput(subject="test", background=long_background)

    def test_additional_notes_max_length(self):
        """追加指示の最大長チェック（500文字）"""
        long_notes = "n" * 501
        with pytest.raises(ValidationError):
            StructuredImageInput(subject="test", additional_notes=long_notes)


class TestGenerateImageFromTextRequest:
    """GenerateImageFromTextRequest スキーマバリデーションテスト"""

    def test_valid_request_minimal(self):
        """最小限の有効なリクエスト"""
        structured_input = StructuredImageInput(subject="スニーカー")
        request = GenerateImageFromTextRequest(structured_input=structured_input)
        assert request.structured_input.subject == "スニーカー"
        assert request.reference_image_url is None
        assert request.aspect_ratio.value == "9:16"  # デフォルト

    def test_valid_request_with_reference_image(self):
        """参照画像URL付きリクエスト"""
        structured_input = StructuredImageInput(subject="化粧品ボトル")
        request = GenerateImageFromTextRequest(
            structured_input=structured_input,
            reference_image_url="https://r2.example.com/images/ref.jpg",
        )
        assert request.reference_image_url == "https://r2.example.com/images/ref.jpg"

    def test_valid_request_with_landscape_aspect(self):
        """横長アスペクト比リクエスト"""
        structured_input = StructuredImageInput(subject="風景写真")
        request = GenerateImageFromTextRequest(
            structured_input=structured_input,
            aspect_ratio="16:9",
        )
        assert request.aspect_ratio.value == "16:9"


class TestGenerateImageFromTextEndpoint:
    """POST /api/v1/videos/generate-image-from-text エンドポイントテスト"""

    def test_generate_image_success(self, auth_client):
        """画像生成成功"""
        with patch("app.videos.service.generate_image_from_text") as mock_generate:
            mock_generate.return_value = {
                "image_url": "https://r2.example.com/generated/test.png",
                "generated_prompt_ja": "テスト用日本語プロンプト",
                "generated_prompt_en": "Test English prompt",
            }

            response = auth_client.post(
                "/api/v1/videos/generate-image-from-text",
                json={
                    "structured_input": {
                        "subject": "コーヒーカップ",
                        "background": "木のテーブル",
                        "lighting": "soft_natural",
                    },
                    "aspect_ratio": "9:16",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "image_url" in data
            assert "generated_prompt_ja" in data
            assert "generated_prompt_en" in data

    def test_generate_image_missing_subject(self, auth_client):
        """被写体なしでバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "background": "木のテーブル",
                },
            },
        )
        assert response.status_code == 422

    def test_generate_image_empty_subject(self, auth_client):
        """空の被写体でバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "",
                },
            },
        )
        assert response.status_code == 422

    def test_generate_image_invalid_lighting(self, auth_client):
        """無効な照明値でバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "test",
                    "lighting": "invalid_lighting_value",
                },
            },
        )
        assert response.status_code == 422

    def test_generate_image_invalid_mood(self, auth_client):
        """無効なムード値でバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "test",
                    "mood": "invalid_mood_value",
                },
            },
        )
        assert response.status_code == 422

    def test_generate_image_invalid_aspect_ratio(self, auth_client):
        """無効なアスペクト比でバリデーションエラー"""
        response = auth_client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "test",
                },
                "aspect_ratio": "4:3",  # 無効な値
            },
        )
        assert response.status_code == 422

    def test_generate_image_with_reference(self, auth_client):
        """参照画像付きで画像生成"""
        with patch("app.videos.service.generate_image_from_text") as mock_generate:
            mock_generate.return_value = {
                "image_url": "https://r2.example.com/generated/test.png",
                "generated_prompt_ja": "参照画像を考慮したプロンプト",
                "generated_prompt_en": "Prompt considering reference image",
            }

            response = auth_client.post(
                "/api/v1/videos/generate-image-from-text",
                json={
                    "structured_input": {
                        "subject": "スニーカー",
                        "mood": "energetic",
                    },
                    "reference_image_url": "https://r2.example.com/uploads/ref.jpg",
                    "aspect_ratio": "9:16",
                },
            )

            assert response.status_code == 200
            mock_generate.assert_called_once()
            call_args = mock_generate.call_args
            assert call_args[1].get("reference_image_url") == "https://r2.example.com/uploads/ref.jpg"

    @pytest.mark.skip(reason="Development environment has default auth - test in production")
    def test_generate_image_requires_auth(self, client):
        """認証なしでは401エラー（本番環境でテスト）"""
        response = client.post(
            "/api/v1/videos/generate-image-from-text",
            json={
                "structured_input": {
                    "subject": "test",
                },
            },
        )
        assert response.status_code == 401
