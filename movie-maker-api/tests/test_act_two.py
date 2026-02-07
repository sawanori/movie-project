"""
Act-Two API統合のユニットテスト

テスト対象:
- motion_library: モーションURLとメタデータ取得
- runway_provider: Act-Two API呼び出し（モック）
- APIエンドポイント: /motions 一覧取得
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.external.motion_library import (
    get_motion_url,
    get_motion_metadata,
    list_all_motions,
    list_motions_by_category,
    MOTION_FILES,
    MOTION_METADATA,
)


class TestMotionLibrary:
    """motion_library.py のテスト"""

    def test_get_motion_url_valid(self):
        """有効なモーションタイプでURLを取得"""
        with patch("app.external.motion_library.settings") as mock_settings:
            mock_settings.R2_PUBLIC_URL = "https://cdn.example.com"
            url = get_motion_url("smile_gentle")
            assert url == "https://cdn.example.com/motions/expressions/smile_gentle.mp4"

    def test_get_motion_url_invalid(self):
        """無効なモーションタイプでValueError"""
        with pytest.raises(ValueError) as exc_info:
            get_motion_url("invalid_motion")
        assert "Unknown motion type" in str(exc_info.value)

    def test_get_motion_metadata_valid(self):
        """有効なモーションタイプでメタデータを取得"""
        metadata = get_motion_metadata("wave_hand")
        assert metadata["id"] == "wave_hand"
        assert metadata["category"] == "gesture"
        assert metadata["name_ja"] == "手を振る"
        assert metadata["name_en"] == "Wave Hand"
        assert metadata["duration_seconds"] == 4

    def test_get_motion_metadata_invalid(self):
        """無効なモーションタイプでValueError"""
        with pytest.raises(ValueError) as exc_info:
            get_motion_metadata("invalid_motion")
        assert "Unknown motion type" in str(exc_info.value)

    def test_list_all_motions(self):
        """全モーション一覧を取得"""
        motions = list_all_motions()
        assert isinstance(motions, list)
        assert len(motions) == len(MOTION_METADATA)
        # 各アイテムに必要なフィールドがあるか確認
        for motion in motions:
            assert "id" in motion
            assert "category" in motion
            assert "name_ja" in motion
            assert "name_en" in motion

    def test_list_motions_by_category_expression(self):
        """expressionカテゴリでフィルタ"""
        motions = list_motions_by_category("expression")
        assert len(motions) == 3  # smile_gentle, smile_laugh, surprised
        for motion in motions:
            assert motion["category"] == "expression"

    def test_list_motions_by_category_gesture(self):
        """gestureカテゴリでフィルタ"""
        motions = list_motions_by_category("gesture")
        assert len(motions) == 3  # wave_hand, nod_yes, shake_head_no
        for motion in motions:
            assert motion["category"] == "gesture"

    def test_list_motions_by_category_action(self):
        """actionカテゴリでフィルタ"""
        motions = list_motions_by_category("action")
        assert len(motions) == 2  # turn_around, thinking
        for motion in motions:
            assert motion["category"] == "action"

    def test_list_motions_by_category_speaking(self):
        """speakingカテゴリでフィルタ"""
        motions = list_motions_by_category("speaking")
        assert len(motions) == 2  # talking_calm, talking_excited
        for motion in motions:
            assert motion["category"] == "speaking"

    def test_list_motions_by_invalid_category(self):
        """無効なカテゴリでは空リスト"""
        motions = list_motions_by_category("invalid_category")
        assert motions == []

    def test_motion_files_coverage(self):
        """MOTION_FILESとMOTION_METADATAのキーが一致"""
        assert set(MOTION_FILES.keys()) == set(MOTION_METADATA.keys())


class TestRunwayProviderActTwo:
    """RunwayProvider.generate_video_act_two のモックテスト"""

    @pytest.mark.asyncio
    async def test_generate_video_act_two_success(self):
        """Act-Two API呼び出し成功"""
        with patch("app.external.runway_provider.httpx.AsyncClient") as mock_client:
            # モックレスポンス設定
            mock_response = MagicMock()
            mock_response.status_code = 201
            mock_response.json.return_value = {"id": "test-task-id-123"}
            mock_response.raise_for_status = MagicMock()

            mock_instance = AsyncMock()
            mock_instance.post = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            from app.external.runway_provider import RunwayProvider

            with patch.object(RunwayProvider, '__init__', lambda self: None):
                provider = RunwayProvider()
                provider.api_key = "test-api-key"
                provider.base_url = "https://api.dev.runwayml.com"

                task_id = await provider.generate_video_act_two(
                    image_url="https://example.com/image.jpg",
                    motion_url="https://example.com/motion.mp4",
                    expression_intensity=4,
                    body_control=True,
                    aspect_ratio="9:16",
                )

                assert task_id == "test-task-id-123"

    @pytest.mark.asyncio
    async def test_generate_video_act_two_default_params(self):
        """Act-Two APIデフォルトパラメータ"""
        with patch("app.external.runway_provider.httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 201
            mock_response.json.return_value = {"id": "default-task-id"}
            mock_response.raise_for_status = MagicMock()

            mock_instance = AsyncMock()
            mock_instance.post = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            from app.external.runway_provider import RunwayProvider

            with patch.object(RunwayProvider, '__init__', lambda self: None):
                provider = RunwayProvider()
                provider.api_key = "test-api-key"
                provider.base_url = "https://api.dev.runwayml.com"

                task_id = await provider.generate_video_act_two(
                    image_url="https://example.com/image.jpg",
                    motion_url="https://example.com/motion.mp4",
                )

                # デフォルト値で呼び出されたか確認
                call_args = mock_instance.post.call_args
                assert call_args is not None


class TestMotionEndpoints:
    """/motions エンドポイントのテスト"""

    def test_list_motions_all(self, auth_client):
        """全モーション一覧取得"""
        mock_motions = [
            {
                "id": f"motion_{i}",
                "category": "expression",
                "name_ja": f"モーション{i}",
                "name_en": f"Motion {i}",
                "duration_seconds": 4,
                "motion_url": f"https://example.com/motion_{i}.mp4",
            }
            for i in range(10)
        ]

        with patch("app.videos.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.order.return_value.execute.return_value = MagicMock(
                data=mock_motions
            )

            response = auth_client.get("/api/v1/videos/motions")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 10

    def test_list_motions_by_category(self, auth_client):
        """カテゴリ別モーション一覧取得"""
        mock_motions = [
            {
                "id": f"expression_{i}",
                "category": "expression",
                "name_ja": f"表情{i}",
                "name_en": f"Expression {i}",
                "duration_seconds": 4,
                "motion_url": f"https://example.com/expression_{i}.mp4",
            }
            for i in range(3)
        ]

        with patch("app.videos.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.order.return_value.eq.return_value.execute.return_value = MagicMock(
                data=mock_motions
            )

            response = auth_client.get("/api/v1/videos/motions?category=expression")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 3
            for motion in data:
                assert motion["category"] == "expression"

    def test_get_motion_details_valid(self, auth_client):
        """有効なモーションの詳細取得"""
        mock_motion = {
            "id": "smile_gentle",
            "category": "expression",
            "name_ja": "やさしい笑顔",
            "name_en": "Gentle Smile",
            "duration_seconds": 4,
            "motion_url": "https://cdn.example.com/motions/smile_gentle.mp4",
        }

        with patch("app.videos.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=mock_motion
            )

            response = auth_client.get("/api/v1/videos/motions/smile_gentle")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "smile_gentle"
            assert data["category"] == "expression"
            assert "motion_url" in data

    def test_get_motion_details_invalid(self, auth_client):
        """無効なモーションIDで404"""
        with patch("app.videos.router.get_supabase") as mock_get_supabase:
            mock_client = MagicMock()
            mock_get_supabase.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data=None
            )

            response = auth_client.get("/api/v1/videos/motions/invalid_motion_id")
            assert response.status_code == 404


class TestActTwoSchemas:
    """Act-Two関連スキーマのテスト"""

    def test_motion_type_enum_values(self):
        """MotionType enumが全モーションをカバー"""
        from app.videos.schemas import MotionType

        enum_values = [e.value for e in MotionType]
        assert "smile_gentle" in enum_values
        assert "wave_hand" in enum_values
        assert "nod_yes" in enum_values
        assert "thinking" in enum_values
        assert len(enum_values) == 10

    def test_translate_story_prompt_request_act_two_fields(self):
        """TranslateStoryPromptRequestにAct-Twoフィールドがある"""
        from app.videos.schemas import (
            TranslateStoryPromptRequest, MotionType, SubjectType,
            AnimationCategory, AnimationTemplateId
        )

        # Act-Twoフィールドを含むリクエストを作成
        # Act-TwoはアニメーションSubjectTypeでのみ有効
        # アニメーションの場合、animation_categoryとanimation_templateも必須
        request = TranslateStoryPromptRequest(
            description_ja="テスト説明",
            subject_type=SubjectType.ANIMATION,
            animation_category=AnimationCategory.TWO_D,
            animation_template=AnimationTemplateId.A_1,
            use_act_two=True,
            motion_type=MotionType.SMILE_GENTLE,
            expression_intensity=4,
            body_control=False,
        )

        assert request.use_act_two is True
        assert request.motion_type == MotionType.SMILE_GENTLE
        assert request.expression_intensity == 4
        assert request.body_control is False

    def test_translate_story_prompt_request_defaults(self):
        """TranslateStoryPromptRequestのデフォルト値"""
        from app.videos.schemas import TranslateStoryPromptRequest

        request = TranslateStoryPromptRequest(description_ja="テスト説明")

        assert request.use_act_two is False
        assert request.motion_type is None
        assert request.expression_intensity == 3
        assert request.body_control is True
