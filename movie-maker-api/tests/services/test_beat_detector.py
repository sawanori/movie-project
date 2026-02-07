"""
ビート検出サービスのテスト
"""
import pytest
from unittest.mock import patch, MagicMock
import subprocess

from app.services.beat_detector import BeatDetector, beat_detector


class TestBeatDetector:
    """BeatDetectorのテスト"""

    @pytest.fixture
    def detector(self):
        return BeatDetector()

    def test_fallback_detection_success(self, detector):
        """フォールバック検出の成功ケース"""
        # FFprobeの出力をモック
        mock_result = MagicMock()
        mock_result.stdout = '{"format": {"duration": "30.0"}}'
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            result = detector._fallback_beat_detection("/fake/path/audio.mp3")

        # デフォルトBPM（120）で30秒分のビート
        assert result.tempo == 120.0
        assert len(result.beat_times) > 0
        # 120 BPM = 0.5秒間隔、30秒なら60ビート
        assert len(result.beat_times) == 60
        # ダウンビートは4拍ごと
        assert len(result.downbeat_times) == 15

    def test_fallback_detection_with_error(self, detector):
        """FFprobeエラー時のフォールバック"""
        with patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffprobe")):
            result = detector._fallback_beat_detection("/fake/path/audio.mp3")

        # デフォルト30秒として処理
        assert result.tempo == 120.0
        assert len(result.beat_times) == 60

    def test_detect_beats_with_librosa_import_error(self, detector):
        """librosaがない場合はフォールバック"""
        mock_result = MagicMock()
        mock_result.stdout = '{"format": {"duration": "20.0"}}'

        with patch.object(detector, "_detect_with_librosa", side_effect=ImportError("No module named 'librosa'")):
            with patch("subprocess.run", return_value=mock_result):
                result = detector.detect_beats("/fake/path/audio.mp3")

        # フォールバックで処理される
        assert result.tempo == 120.0
        assert len(result.beat_times) == 40  # 20秒 / 0.5秒 = 40ビート

    def test_detect_beats_with_exception(self, detector):
        """例外発生時もフォールバック"""
        mock_result = MagicMock()
        mock_result.stdout = '{"format": {"duration": "15.0"}}'

        with patch.object(detector, "_detect_with_librosa", side_effect=Exception("Some error")):
            with patch("subprocess.run", return_value=mock_result):
                result = detector.detect_beats("/fake/path/audio.mp3")

        # フォールバックで処理される
        assert result.tempo == 120.0
        assert len(result.beat_times) == 30  # 15秒 / 0.5秒 = 30ビート


class TestBeatDetectorWithLibrosa:
    """librosaを使用したビート検出のテスト"""

    @pytest.fixture
    def detector(self):
        return BeatDetector()

    @pytest.mark.skip(reason="librosaがインストールされている環境でのみ実行")
    def test_detect_with_librosa(self, detector):
        """librosaを使用したビート検出"""
        # 実際の音声ファイルが必要
        result = detector._detect_with_librosa("/path/to/real/audio.mp3")

        assert result.tempo > 0
        assert len(result.beat_times) > 0
        assert len(result.downbeat_times) > 0


class TestBeatDetectorSingleton:
    """シングルトンインスタンスのテスト"""

    def test_singleton_exists(self):
        """シングルトンが存在する"""
        assert beat_detector is not None
        assert isinstance(beat_detector, BeatDetector)
