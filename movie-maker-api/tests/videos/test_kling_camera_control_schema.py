"""
KlingCameraControl Schema のテスト
"""
import pytest
from pydantic import ValidationError
from app.videos.schemas import KlingCameraControl, StoryVideoCreate


class TestKlingCameraControl:
    """KlingCameraControl スキーマのテスト"""

    def test_default_values(self):
        """デフォルト値（すべて0）のテスト"""
        camera = KlingCameraControl()
        assert camera.horizontal == 0
        assert camera.vertical == 0
        assert camera.pan == 0
        assert camera.tilt == 0
        assert camera.roll == 0
        assert camera.zoom == 0

    def test_valid_positive_values(self):
        """正の値の範囲内のテスト"""
        camera = KlingCameraControl(
            horizontal=5,
            vertical=3,
            pan=8,
            tilt=2,
            roll=7,
            zoom=10
        )
        assert camera.horizontal == 5
        assert camera.vertical == 3
        assert camera.pan == 8
        assert camera.tilt == 2
        assert camera.roll == 7
        assert camera.zoom == 10

    def test_valid_negative_values(self):
        """負の値の範囲内のテスト"""
        camera = KlingCameraControl(
            horizontal=-5,
            vertical=-3,
            pan=-8,
            tilt=-2,
            roll=-7,
            zoom=-10
        )
        assert camera.horizontal == -5
        assert camera.vertical == -3
        assert camera.pan == -8
        assert camera.tilt == -2
        assert camera.roll == -7
        assert camera.zoom == -10

    def test_max_boundary_values(self):
        """最大値（10）の境界値テスト"""
        camera = KlingCameraControl(
            horizontal=10,
            vertical=10,
            pan=10,
            tilt=10,
            roll=10,
            zoom=10
        )
        assert camera.horizontal == 10
        assert camera.vertical == 10
        assert camera.pan == 10
        assert camera.tilt == 10
        assert camera.roll == 10
        assert camera.zoom == 10

    def test_min_boundary_values(self):
        """最小値（-10）の境界値テスト"""
        camera = KlingCameraControl(
            horizontal=-10,
            vertical=-10,
            pan=-10,
            tilt=-10,
            roll=-10,
            zoom=-10
        )
        assert camera.horizontal == -10
        assert camera.vertical == -10
        assert camera.pan == -10
        assert camera.tilt == -10
        assert camera.roll == -10
        assert camera.zoom == -10

    def test_horizontal_exceeds_max(self):
        """horizontal が最大値を超える場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(horizontal=11)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("horizontal",)
        assert errors[0]["type"] == "less_than_equal"

    def test_horizontal_below_min(self):
        """horizontal が最小値を下回る場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(horizontal=-11)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("horizontal",)
        assert errors[0]["type"] == "greater_than_equal"

    def test_vertical_exceeds_max(self):
        """vertical が最大値を超える場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(vertical=11)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("vertical",)
        assert errors[0]["type"] == "less_than_equal"

    def test_pan_exceeds_max(self):
        """pan が最大値を超える場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(pan=15)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("pan",)
        assert errors[0]["type"] == "less_than_equal"

    def test_tilt_below_min(self):
        """tilt が最小値を下回る場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(tilt=-20)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("tilt",)
        assert errors[0]["type"] == "greater_than_equal"

    def test_roll_exceeds_max(self):
        """roll が最大値を超える場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(roll=100)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("roll",)
        assert errors[0]["type"] == "less_than_equal"

    def test_zoom_below_min(self):
        """zoom が最小値を下回る場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(zoom=-50)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("zoom",)
        assert errors[0]["type"] == "greater_than_equal"

    def test_multiple_fields_out_of_range(self):
        """複数フィールドが範囲外の場合のバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            KlingCameraControl(horizontal=20, vertical=-30, zoom=50)

        errors = exc_info.value.errors()
        # 3つのエラーがあるはず
        assert len(errors) == 3
        error_fields = {error["loc"][0] for error in errors}
        assert error_fields == {"horizontal", "vertical", "zoom"}

    def test_model_dump(self):
        """model_dump() で正しく辞書に変換できるかテスト"""
        camera = KlingCameraControl(
            horizontal=3,
            vertical=-2,
            pan=5,
            tilt=-1,
            roll=0,
            zoom=7
        )
        data = camera.model_dump()

        assert data == {
            "horizontal": 3,
            "vertical": -2,
            "pan": 5,
            "tilt": -1,
            "roll": 0,
            "zoom": 7
        }

    def test_model_dump_json(self):
        """model_dump_json() で正しくJSON文字列に変換できるかテスト"""
        camera = KlingCameraControl(horizontal=5, zoom=3)
        json_str = camera.model_dump_json()

        # JSON文字列に含まれる値を確認
        assert '"horizontal":5' in json_str or '"horizontal": 5' in json_str
        assert '"zoom":3' in json_str or '"zoom": 3' in json_str


class TestStoryVideoCreateWithKlingCameraControl:
    """StoryVideoCreate に KlingCameraControl が統合されていることのテスト"""

    def test_story_video_create_without_camera_control(self):
        """camera_control なしで StoryVideoCreate を作成"""
        story = StoryVideoCreate(
            image_url="https://example.com/image.jpg",
            story_text="Test story"
        )
        assert story.kling_camera_control is None

    def test_story_video_create_with_camera_control(self):
        """camera_control ありで StoryVideoCreate を作成"""
        camera = KlingCameraControl(horizontal=5, zoom=3)
        story = StoryVideoCreate(
            image_url="https://example.com/image.jpg",
            story_text="Test story",
            kling_camera_control=camera
        )

        assert story.kling_camera_control is not None
        assert story.kling_camera_control.horizontal == 5
        assert story.kling_camera_control.zoom == 3
        assert story.kling_camera_control.vertical == 0  # デフォルト値

    def test_story_video_create_with_inline_camera_control(self):
        """camera_control をインラインで指定して StoryVideoCreate を作成"""
        story = StoryVideoCreate(
            image_url="https://example.com/image.jpg",
            story_text="Test story",
            kling_camera_control={
                "horizontal": -3,
                "pan": 7,
                "tilt": 2
            }
        )

        assert story.kling_camera_control is not None
        assert story.kling_camera_control.horizontal == -3
        assert story.kling_camera_control.pan == 7
        assert story.kling_camera_control.tilt == 2
        # 未指定のフィールドはデフォルト値
        assert story.kling_camera_control.vertical == 0
        assert story.kling_camera_control.roll == 0
        assert story.kling_camera_control.zoom == 0

    def test_story_video_create_invalid_camera_control(self):
        """無効な camera_control でバリデーションエラー"""
        with pytest.raises(ValidationError) as exc_info:
            StoryVideoCreate(
                image_url="https://example.com/image.jpg",
                story_text="Test story",
                kling_camera_control={
                    "horizontal": 100  # 範囲外
                }
            )

        errors = exc_info.value.errors()
        # kling_camera_control.horizontal のエラーがあるはず
        assert any(
            "kling_camera_control" in str(error["loc"]) and "horizontal" in str(error["loc"])
            for error in errors
        )

    def test_model_dump_with_camera_control(self):
        """camera_control を含む StoryVideoCreate の model_dump テスト"""
        story = StoryVideoCreate(
            image_url="https://example.com/image.jpg",
            story_text="Test story",
            kling_camera_control=KlingCameraControl(horizontal=2, zoom=-3)
        )

        data = story.model_dump()
        assert "kling_camera_control" in data
        assert data["kling_camera_control"]["horizontal"] == 2
        assert data["kling_camera_control"]["zoom"] == -3
        assert data["kling_camera_control"]["vertical"] == 0

    def test_kling_camera_control_with_other_kling_fields(self):
        """他のKlingフィールドと併用できることを確認"""
        from app.videos.schemas import KlingMode, ElementImage

        story = StoryVideoCreate(
            image_url="https://example.com/image.jpg",
            story_text="Test story",
            kling_mode=KlingMode.PRO,
            end_frame_image_url="https://example.com/end.jpg",
            element_images=[
                ElementImage(image_url="https://example.com/element1.jpg")
            ],
            kling_camera_control=KlingCameraControl(horizontal=5, pan=-2)
        )

        assert story.kling_mode == KlingMode.PRO
        assert story.end_frame_image_url == "https://example.com/end.jpg"
        assert len(story.element_images) == 1
        assert story.kling_camera_control.horizontal == 5
        assert story.kling_camera_control.pan == -2
