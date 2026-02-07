"""
ビート検出サービス

音声ファイルからビート（リズム）位置を検出します。
librosaを使用し、利用不可の場合はフォールバック処理を行います。
"""

import logging
import subprocess
import json
from typing import Optional

from app.videos.schemas import BeatInfo

logger = logging.getLogger(__name__)


class BeatDetectionError(Exception):
    """ビート検出エラー"""
    pass


class BeatDetector:
    """ビート検出サービス"""

    def detect_beats(self, audio_path: str) -> BeatInfo:
        """
        音声ファイルからビート位置を検出

        Args:
            audio_path: 音声ファイルパス（MP3, WAV等）

        Returns:
            BeatInfo: ビート情報（テンポ、ビート位置、ダウンビート位置）
        """
        try:
            return self._detect_with_librosa(audio_path)
        except ImportError:
            logger.warning("librosa not available, using fallback")
            return self._fallback_beat_detection(audio_path)
        except Exception as e:
            logger.exception(f"Beat detection failed: {e}")
            # エラー時もフォールバック
            return self._fallback_beat_detection(audio_path)

    def _detect_with_librosa(self, audio_path: str) -> BeatInfo:
        """librosaを使用したビート検出"""
        import librosa
        import numpy as np

        # 音声読み込み（モノラル、22050Hz）
        y, sr = librosa.load(audio_path, sr=22050, mono=True)

        # テンポとビート位置を検出
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # tempoがndarrayの場合は最初の値を取得
        if hasattr(tempo, '__iter__'):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)

        # 強拍（ダウンビート）を推定（4拍子と仮定）
        downbeat_times = (
            beat_times[::4].tolist()
            if len(beat_times) >= 4
            else beat_times.tolist()
        )

        logger.info(
            f"Beat detection: tempo={tempo:.1f} BPM, "
            f"beats={len(beat_times)}, downbeats={len(downbeat_times)}"
        )

        return BeatInfo(
            tempo=tempo,
            beat_times=beat_times.tolist(),
            downbeat_times=downbeat_times,
        )

    def _fallback_beat_detection(self, audio_path: str) -> BeatInfo:
        """
        librosaが使えない場合のフォールバック
        FFprobeで長さを取得し、仮定のBPMでビートを生成
        """
        # FFprobeで長さ取得
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            audio_path
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            duration = float(data["format"]["duration"])
        except Exception as e:
            logger.warning(f"Failed to get audio duration: {e}")
            duration = 30.0  # デフォルト30秒

        # 仮定: 120 BPM
        assumed_bpm = 120.0
        beat_interval = 60.0 / assumed_bpm

        beat_times = []
        t = 0.0
        while t < duration:
            beat_times.append(t)
            t += beat_interval

        downbeat_times = beat_times[::4]

        logger.info(
            f"Fallback beat detection: assumed tempo={assumed_bpm} BPM, "
            f"beats={len(beat_times)}, duration={duration:.1f}s"
        )

        return BeatInfo(
            tempo=assumed_bpm,
            beat_times=beat_times,
            downbeat_times=downbeat_times,
        )


# シングルトン
beat_detector = BeatDetector()
