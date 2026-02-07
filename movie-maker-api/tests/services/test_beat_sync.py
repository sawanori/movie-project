"""
ビート同期サービスのテスト
"""
import pytest
from app.services.beat_sync import BeatSynchronizer, beat_synchronizer


class TestBeatSynchronizer:
    """BeatSynchronizerのテスト"""

    @pytest.fixture
    def synchronizer(self):
        return BeatSynchronizer()

    def test_empty_inputs(self, synchronizer):
        """空の入力のケース"""
        result = synchronizer.calculate_sync_adjustments(
            cut_points=[],
            beat_times=[],
            video_duration=30.0,
            bgm_duration=30.0
        )

        assert result.original_cut_points == []
        assert result.adjusted_cut_points == []
        assert result.time_stretch_ratio == 1.0
        assert result.sync_quality_score == 0.0

    def test_perfect_sync(self, synchronizer):
        """完全同期のケース（カットとビートが一致）"""
        cut_points = [0.0, 2.0, 4.0, 6.0]
        beat_times = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]

        result = synchronizer.calculate_sync_adjustments(
            cut_points=cut_points,
            beat_times=beat_times,
            video_duration=8.0,
            bgm_duration=8.0
        )

        # ストレッチ比率は1.0（同じ長さ）
        assert result.time_stretch_ratio == 1.0
        # 品質スコアは高い（完全一致なので1.0に近い）
        assert result.sync_quality_score >= 0.9
        # 調整後のカット位置はビートに合っている
        for cut in result.adjusted_cut_points:
            assert any(abs(cut - beat) < 0.01 for beat in beat_times)

    def test_stretch_required(self, synchronizer):
        """タイムストレッチが必要なケース"""
        cut_points = [0.0, 5.0, 10.0]
        beat_times = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]

        result = synchronizer.calculate_sync_adjustments(
            cut_points=cut_points,
            beat_times=beat_times,
            video_duration=15.0,
            bgm_duration=10.0  # BGMが短い
        )

        # ストレッチ比率は1.5に近い（15/10 = 1.5、ただし上限あり）
        assert result.time_stretch_ratio >= 1.0
        assert result.time_stretch_ratio <= 1.1  # MAX_STRETCH_RATIO

    def test_adjustment_within_tolerance(self, synchronizer):
        """許容範囲内の調整"""
        # カット位置がビートから少しずれている
        cut_points = [0.0, 2.1, 4.2]  # 0.1秒ずれ
        beat_times = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]

        result = synchronizer.calculate_sync_adjustments(
            cut_points=cut_points,
            beat_times=beat_times,
            video_duration=6.0,
            bgm_duration=6.0
        )

        # 調整後は最も近いビートに合う
        assert result.adjusted_cut_points[0] == 0.0
        assert result.adjusted_cut_points[1] == 2.0  # 2.1 → 2.0に調整
        assert result.adjusted_cut_points[2] == 4.0  # 4.2 → 4.0に調整

    def test_adjustment_beyond_tolerance(self, synchronizer):
        """許容範囲外は調整しない"""
        # カット位置がビートから大きくずれている
        cut_points = [0.5, 3.5]  # ビートから0.5秒ずれ（MAX_ADJUSTMENT=0.3を超える）
        beat_times = [0.0, 1.0, 2.0, 3.0, 4.0]

        result = synchronizer.calculate_sync_adjustments(
            cut_points=cut_points,
            beat_times=beat_times,
            video_duration=4.0,
            bgm_duration=4.0
        )

        # 許容範囲外なので元のまま
        assert result.adjusted_cut_points[0] == 0.5
        assert result.adjusted_cut_points[1] == 3.5

    def test_find_best_stretch_ratio(self, synchronizer):
        """最適ストレッチ比率の探索"""
        cut_points = [0.0, 2.0, 4.0]
        beat_times = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]

        best_ratio, best_score = synchronizer.find_best_stretch_ratio(
            cut_points=cut_points,
            beat_times=beat_times,
            video_duration=4.0,
            bgm_duration=4.0
        )

        # 同じ長さなのでストレッチ比率は1.0付近
        assert 0.95 <= best_ratio <= 1.05
        # 品質スコアは高い
        assert best_score >= 0.8


class TestBeatSynchronizerSingleton:
    """シングルトンインスタンスのテスト"""

    def test_singleton_exists(self):
        """シングルトンが存在する"""
        assert beat_synchronizer is not None
        assert isinstance(beat_synchronizer, BeatSynchronizer)

    def test_singleton_constants(self):
        """定数が正しく設定されている"""
        assert beat_synchronizer.MAX_ADJUSTMENT == 0.3
        assert beat_synchronizer.MIN_STRETCH_RATIO == 0.9
        assert beat_synchronizer.MAX_STRETCH_RATIO == 1.1
