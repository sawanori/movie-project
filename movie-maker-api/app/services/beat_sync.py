"""
ビート同期サービス

動画のカット位置とBGMのビート位置を同期させます。
"""

import logging
from typing import Optional

from app.videos.schemas import SyncResult

logger = logging.getLogger(__name__)


class BeatSynchronizer:
    """ビート同期サービス"""

    # 許容するズレの最大値（秒）
    MAX_ADJUSTMENT = 0.3

    # タイムストレッチの許容範囲
    MIN_STRETCH_RATIO = 0.9
    MAX_STRETCH_RATIO = 1.1

    def calculate_sync_adjustments(
        self,
        cut_points: list[float],
        beat_times: list[float],
        video_duration: float,
        bgm_duration: float,
    ) -> SyncResult:
        """
        カット位置をビートに合わせるための調整を計算

        Args:
            cut_points: 動画のカット位置（秒）
            beat_times: BGMのビート位置（秒）
            video_duration: 動画の長さ（秒）
            bgm_duration: BGMの長さ（秒）

        Returns:
            SyncResult: 同期結果（調整後カット位置、ストレッチ比率、品質スコア）
        """
        if not cut_points or not beat_times:
            return SyncResult(
                original_cut_points=cut_points,
                adjusted_cut_points=cut_points,
                time_stretch_ratio=1.0,
                sync_quality_score=0.0,
            )

        # 1. まずタイムストレッチ比率を計算（BGMを動画長に合わせる）
        stretch_ratio = video_duration / bgm_duration
        stretch_ratio = max(
            self.MIN_STRETCH_RATIO,
            min(self.MAX_STRETCH_RATIO, stretch_ratio)
        )

        # ストレッチ後のビート位置を計算
        adjusted_beat_times = [t * stretch_ratio for t in beat_times]

        # 2. 各カット位置を最も近いビートに調整
        adjusted_cuts = []
        total_quality = 0.0

        for cut in cut_points:
            nearest_beat = min(adjusted_beat_times, key=lambda b: abs(b - cut))
            diff = abs(nearest_beat - cut)

            if diff <= self.MAX_ADJUSTMENT:
                # 許容範囲内なら調整
                adjusted_cuts.append(nearest_beat)
                # 品質スコア：ズレが小さいほど高い
                quality = 1.0 - (diff / self.MAX_ADJUSTMENT)
            else:
                # 許容範囲外なら元のまま
                adjusted_cuts.append(cut)
                quality = 0.0

            total_quality += quality

        avg_quality = total_quality / len(cut_points) if cut_points else 0.0

        logger.info(
            f"Sync calculation: stretch_ratio={stretch_ratio:.3f}, "
            f"avg_quality={avg_quality:.2f}, "
            f"adjusted {len([c for i, c in enumerate(adjusted_cuts) if c != cut_points[i]])} cuts"
        )

        return SyncResult(
            original_cut_points=cut_points,
            adjusted_cut_points=adjusted_cuts,
            time_stretch_ratio=stretch_ratio,
            sync_quality_score=avg_quality,
        )

    def find_best_stretch_ratio(
        self,
        cut_points: list[float],
        beat_times: list[float],
        video_duration: float,
        bgm_duration: float,
    ) -> tuple[float, float]:
        """
        最適なストレッチ比率を探索

        Args:
            cut_points: 動画のカット位置
            beat_times: BGMのビート位置
            video_duration: 動画の長さ
            bgm_duration: BGMの長さ

        Returns:
            tuple[float, float]: (最適ストレッチ比率, 品質スコア)
        """
        best_ratio = video_duration / bgm_duration
        best_score = 0.0

        # 基本比率の前後10%を0.5%刻みで探索
        base_ratio = video_duration / bgm_duration
        for delta in range(-20, 21):
            test_ratio = base_ratio + (delta * 0.005)
            if not (self.MIN_STRETCH_RATIO <= test_ratio <= self.MAX_STRETCH_RATIO):
                continue

            # このストレッチ比率での同期品質を計算
            adjusted_beats = [t * test_ratio for t in beat_times]
            total_quality = 0.0

            for cut in cut_points:
                nearest_beat = min(adjusted_beats, key=lambda b: abs(b - cut))
                diff = abs(nearest_beat - cut)
                if diff <= self.MAX_ADJUSTMENT:
                    total_quality += 1.0 - (diff / self.MAX_ADJUSTMENT)

            avg_quality = total_quality / len(cut_points) if cut_points else 0.0

            if avg_quality > best_score:
                best_score = avg_quality
                best_ratio = test_ratio

        return best_ratio, best_score


# シングルトン
beat_synchronizer = BeatSynchronizer()
