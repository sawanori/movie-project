"""
タイムラインスキーマのテスト

TransitionUpdate、TimelineTransitionType、TimelineExportRequest のバリデーションを検証する。
"""

import pytest
from pydantic import ValidationError

from app.videos.schemas import (
    TimelineTransitionType,
    TransitionUpdate,
    TimelineExportRequest,
)


class TestTransitionUpdateValid:
    """TransitionUpdate の有効な値のテスト"""

    def test_default_values(self):
        """デフォルト値が正しく設定されること"""
        update = TransitionUpdate()
        assert update.transition_type == TimelineTransitionType.NONE
        assert update.transition_duration == 0.5

    def test_crossfade_type(self):
        """crossfade タイプが設定できること"""
        update = TransitionUpdate(
            transition_type=TimelineTransitionType.CROSSFADE,
            transition_duration=0.5,
        )
        assert update.transition_type == TimelineTransitionType.CROSSFADE
        assert update.transition_duration == 0.5

    def test_fade_black_type(self):
        """fade_black タイプが設定できること"""
        update = TransitionUpdate(
            transition_type=TimelineTransitionType.FADE_BLACK,
            transition_duration=1.0,
        )
        assert update.transition_type == TimelineTransitionType.FADE_BLACK
        assert update.transition_duration == 1.0

    def test_min_duration_boundary(self):
        """最小有効 duration (0.1) が受け入れられること"""
        update = TransitionUpdate(
            transition_type=TimelineTransitionType.CROSSFADE,
            transition_duration=0.1,
        )
        assert update.transition_duration == 0.1

    def test_max_duration_boundary(self):
        """最大有効 duration (2.0) が受け入れられること"""
        update = TransitionUpdate(
            transition_type=TimelineTransitionType.CROSSFADE,
            transition_duration=2.0,
        )
        assert update.transition_duration == 2.0


class TestTransitionUpdateDurationOutOfRange:
    """TransitionUpdate の duration 範囲外バリデーションテスト"""

    def test_duration_below_minimum_raises(self):
        """duration が 0.1 未満の場合はバリデーションエラーになること"""
        with pytest.raises(ValidationError):
            TransitionUpdate(
                transition_type=TimelineTransitionType.CROSSFADE,
                transition_duration=0.0,
            )

    def test_duration_above_maximum_raises(self):
        """duration が 2.0 超の場合はバリデーションエラーになること"""
        with pytest.raises(ValidationError):
            TransitionUpdate(
                transition_type=TimelineTransitionType.CROSSFADE,
                transition_duration=2.1,
            )


class TestTimelineTransitionTypeEnum:
    """TimelineTransitionType 列挙値のテスト"""

    def test_none_value(self):
        """NONE の値が 'none' であること"""
        assert TimelineTransitionType.NONE == "none"

    def test_crossfade_value(self):
        """CROSSFADE の値が 'crossfade' であること"""
        assert TimelineTransitionType.CROSSFADE == "crossfade"

    def test_fade_black_value(self):
        """FADE_BLACK の値が 'fade_black' であること"""
        assert TimelineTransitionType.FADE_BLACK == "fade_black"

    def test_fade_white_value(self):
        """FADE_WHITE の値が 'fade_white' であること"""
        assert TimelineTransitionType.FADE_WHITE == "fade_white"

    def test_wipe_left_value(self):
        """WIPE_LEFT の値が 'wipe_left' であること"""
        assert TimelineTransitionType.WIPE_LEFT == "wipe_left"

    def test_all_values_are_strings(self):
        """全ての値が文字列であること"""
        for member in TimelineTransitionType:
            assert isinstance(member.value, str)


class TestTimelineExportRequestDefaults:
    """TimelineExportRequest のデフォルト値テスト"""

    def test_default_values(self):
        """デフォルト値が正しく設定されること"""
        request = TimelineExportRequest()
        assert request.include_bgm is True
        assert request.include_transitions is True
        assert request.output_format == "mp4"

    def test_custom_values(self):
        """カスタム値が設定できること"""
        request = TimelineExportRequest(
            include_bgm=False,
            include_transitions=False,
            output_format="mov",
        )
        assert request.include_bgm is False
        assert request.include_transitions is False
        assert request.output_format == "mov"
