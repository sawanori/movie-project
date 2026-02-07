"""
アニメーションスタイルテンプレート機能のユニットテスト
"""
import pytest
from pydantic import ValidationError

from app.videos.schemas import (
    TranslateStoryPromptRequest,
    SubjectType,
    AnimationCategory,
    AnimationTemplateId,
    VideoProvider,
)
from app.external.gemini_client import load_prompt_template, _load_animation_template


class TestAnimationEnums:
    """アニメーション関連Enumのテスト"""

    def test_subject_type_has_animation(self):
        """SubjectTypeにanimation値が存在すること"""
        assert SubjectType.ANIMATION.value == "animation"

    def test_animation_category_values(self):
        """AnimationCategoryが2dと3dを持つこと"""
        assert AnimationCategory.TWO_D.value == "2d"
        assert AnimationCategory.THREE_D.value == "3d"

    def test_animation_template_id_values(self):
        """AnimationTemplateIdが8種類のIDを持つこと"""
        expected = ["A-1", "A-2", "A-3", "A-4", "B-1", "B-2", "B-3", "B-4"]
        actual = [t.value for t in AnimationTemplateId]
        assert actual == expected


class TestTranslateStoryPromptRequest:
    """翻訳リクエストスキーマのテスト"""

    def test_person_type_no_animation_params(self):
        """person選択時はアニメーションパラメータ不要"""
        request = TranslateStoryPromptRequest(
            description_ja="テスト説明",
            video_provider=VideoProvider.RUNWAY,
            subject_type=SubjectType.PERSON,
        )
        assert request.subject_type == SubjectType.PERSON
        assert request.animation_category is None
        assert request.animation_template is None

    def test_animation_type_without_category_allowed(self):
        """animation選択時でもcategory省略可能（翻訳用エンドポイント）

        Note: TranslateStoryPromptRequestは翻訳用なので緩いバリデーション。
        実際の動画生成時にはSceneGenerateRequestで厳密にバリデーションされる。
        """
        # 翻訳エンドポイント用なので、animation_template/categoryは必須としない
        request = TranslateStoryPromptRequest(
            description_ja="テスト説明",
            subject_type=SubjectType.ANIMATION,
            animation_template=AnimationTemplateId.A_1,
            # animation_category missing - allowed for translation endpoint
        )
        assert request.subject_type == SubjectType.ANIMATION
        assert request.animation_template == AnimationTemplateId.A_1
        assert request.animation_category is None

    def test_animation_type_without_template_allowed(self):
        """animation選択時でもtemplate省略可能（翻訳用エンドポイント）

        Note: TranslateStoryPromptRequestは翻訳用なので緩いバリデーション。
        """
        request = TranslateStoryPromptRequest(
            description_ja="テスト説明",
            subject_type=SubjectType.ANIMATION,
            animation_category=AnimationCategory.TWO_D,
            # animation_template missing - allowed for translation endpoint
        )
        assert request.subject_type == SubjectType.ANIMATION
        assert request.animation_category == AnimationCategory.TWO_D
        assert request.animation_template is None

    def test_animation_type_valid_2d_template(self):
        """2Dカテゴリと2Dテンプレートの組み合わせが有効"""
        request = TranslateStoryPromptRequest(
            description_ja="テスト説明",
            subject_type=SubjectType.ANIMATION,
            animation_category=AnimationCategory.TWO_D,
            animation_template=AnimationTemplateId.A_1,
        )
        assert request.animation_category == AnimationCategory.TWO_D
        assert request.animation_template == AnimationTemplateId.A_1

    def test_animation_type_valid_3d_template(self):
        """3Dカテゴリと3Dテンプレートの組み合わせが有効"""
        request = TranslateStoryPromptRequest(
            description_ja="テスト説明",
            subject_type=SubjectType.ANIMATION,
            animation_category=AnimationCategory.THREE_D,
            animation_template=AnimationTemplateId.B_3,
        )
        assert request.animation_category == AnimationCategory.THREE_D
        assert request.animation_template == AnimationTemplateId.B_3

    def test_animation_type_mismatched_category_template(self):
        """カテゴリとテンプレートの不一致でエラー"""
        with pytest.raises(ValidationError) as exc_info:
            TranslateStoryPromptRequest(
                description_ja="テスト説明",
                subject_type=SubjectType.ANIMATION,
                animation_category=AnimationCategory.TWO_D,
                animation_template=AnimationTemplateId.B_1,  # 3D template
            )
        assert "not a 2D template" in str(exc_info.value)


class TestLoadAnimationTemplate:
    """アニメーションテンプレート読み込みのテスト"""

    def test_load_2d_template_a1(self):
        """A-1テンプレートの読み込み"""
        result = _load_animation_template("2d", "A-1")
        assert "style_keywords" in result
        assert "modern anime style" in result["style_keywords"]
        assert result["reference_rule"] != ""
        # 新フォーマット：SINGLE IMAGE RULE を含む
        assert "SINGLE IMAGE RULE" in result["reference_rule"]

    def test_load_2d_template_a1_clip_specific(self):
        """A-1テンプレートのCLIP SPECIFICフォーマット確認"""
        result = _load_animation_template("2d", "A-1")
        clip = result.get("clip_specific_template", "")
        # 構造化フォーマットを持つこと
        assert "CLIP SPECIFIC" in clip
        assert "Scene:" in clip
        assert "Subject:" in clip
        assert "Motion:" in clip
        assert "Camera:" in clip
        assert "Style:" in clip
        assert "Must include:" in clip
        assert "Final note:" in clip

    def test_load_3d_template_b3(self):
        """B-3テンプレートの読み込み"""
        result = _load_animation_template("3d", "B-3")
        assert "style_keywords" in result
        assert "Pixar" in result["style_keywords"]
        # 新フォーマット：構造化されている
        assert "CLIP SPECIFIC" in result.get("clip_specific_template", "")

    def test_load_all_2d_templates(self):
        """全2Dテンプレートが構造化フォーマットで読み込めること"""
        templates = ["A-1", "A-2", "A-3", "A-4"]
        for tid in templates:
            result = _load_animation_template("2d", tid)
            assert result["style_keywords"] != "", f"{tid} has no style_keywords"
            assert "SINGLE IMAGE RULE" in result["reference_rule"], f"{tid} missing SINGLE IMAGE RULE"
            assert "CLIP SPECIFIC" in result["clip_specific_template"], f"{tid} missing CLIP SPECIFIC"

    def test_load_all_3d_templates(self):
        """全3Dテンプレートが構造化フォーマットで読み込めること"""
        templates = ["B-1", "B-2", "B-3", "B-4"]
        for tid in templates:
            result = _load_animation_template("3d", tid)
            assert result["style_keywords"] != "", f"{tid} has no style_keywords"
            assert "SINGLE IMAGE RULE" in result["reference_rule"], f"{tid} missing SINGLE IMAGE RULE"
            assert "CLIP SPECIFIC" in result["clip_specific_template"], f"{tid} missing CLIP SPECIFIC"

    def test_load_unknown_template(self):
        """存在しないテンプレートID"""
        result = _load_animation_template("2d", "Z-99")
        assert result["style_keywords"] == ""

    def test_load_prompt_template_routes_to_animation(self):
        """load_prompt_templateがアニメーションテンプレートにルーティング"""
        result = load_prompt_template(
            provider="runway",
            mode="scene",
            subject_type="animation",
            animation_category="2d",
            animation_template="A-2",
        )
        assert "Ghibli" in result.get("style_keywords", "") or "ghibli" in result.get("style_keywords", "").lower()
        # 構造化フォーマット確認
        assert "CLIP SPECIFIC" in result.get("clip_specific_template", "")

    def test_load_prompt_template_normal_mode(self):
        """通常モード（person）ではアニメーションテンプレート不使用"""
        result = load_prompt_template(
            provider="runway",
            mode="scene",
            subject_type="person",
        )
        # アニメーション用のstyle_keywordsは設定されない
        assert result.get("style_keywords") is None or result.get("style_keywords") == ""


class TestVeoAnimationTemplates:
    """Veoアニメーションテンプレートのテスト"""

    def test_load_veo_2d_template_a1(self):
        """Veo A-1テンプレートの読み込み"""
        result = _load_animation_template("2d", "A-1", "veo")
        assert "style_keywords" in result
        assert "modern anime style" in result["style_keywords"]
        assert "SINGLE IMAGE RULE" in result["reference_rule"]

    def test_load_veo_2d_template_a2(self):
        """Veo A-2（ジブリ風）テンプレートの読み込み"""
        result = _load_animation_template("2d", "A-2", "veo")
        assert "Ghibli" in result["style_keywords"] or "ghibli" in result["style_keywords"].lower()

    def test_load_veo_3d_template_b1(self):
        """Veo B-1（フォトリアル）テンプレートの読み込み"""
        result = _load_animation_template("3d", "B-1", "veo")
        assert "photorealistic" in result["style_keywords"]

    def test_load_veo_3d_template_b3(self):
        """Veo B-3（ピクサー風）テンプレートの読み込み"""
        result = _load_animation_template("3d", "B-3", "veo")
        assert "Pixar" in result["style_keywords"]

    def test_load_all_veo_2d_templates(self):
        """全Veo 2Dテンプレートが読み込めること"""
        templates = ["A-1", "A-2", "A-3", "A-4"]
        for tid in templates:
            result = _load_animation_template("2d", tid, "veo")
            assert result["style_keywords"] != "", f"Veo {tid} has no style_keywords"
            assert "SINGLE IMAGE RULE" in result["reference_rule"], f"Veo {tid} missing SINGLE IMAGE RULE"

    def test_load_all_veo_3d_templates(self):
        """全Veo 3Dテンプレートが読み込めること"""
        templates = ["B-1", "B-2", "B-3", "B-4"]
        for tid in templates:
            result = _load_animation_template("3d", tid, "veo")
            assert result["style_keywords"] != "", f"Veo {tid} has no style_keywords"
            assert "SINGLE IMAGE RULE" in result["reference_rule"], f"Veo {tid} missing SINGLE IMAGE RULE"

    def test_load_prompt_template_routes_to_veo(self):
        """load_prompt_templateがVeoテンプレートにルーティング"""
        result = load_prompt_template(
            provider="veo",
            mode="scene",
            subject_type="animation",
            animation_category="2d",
            animation_template="A-1",
        )
        assert "modern anime style" in result.get("style_keywords", "")

    def test_runway_templates_still_work(self):
        """既存Runwayテンプレートが引き続き動作"""
        result = _load_animation_template("2d", "A-1", "runway")
        assert result["style_keywords"] != ""
        assert "modern anime style" in result["style_keywords"]
