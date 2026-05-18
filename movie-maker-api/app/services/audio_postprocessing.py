"""TTS 音声の後処理 (ffmpeg) + MP3 変換"""
import asyncio
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def apply_audio_postprocessing(wav_bytes: bytes) -> bytes:
    """
    ffmpeg で WAV を処理して MP3 バイトを返す

    フィルタ:
    - highpass=f=80: 低域ノイズ除去
    - lowpass=f=18000: 超高域ノイズ除去
    - dynaudnorm: 音量正規化
    - loudnorm=I=-16:LRA=11:TP=-1.5: 放送品質ラウドネス
    - libmp3lame 320kbps エンコード

    Args:
        wav_bytes: 入力 WAV バイナリ

    Returns:
        bytes: 処理済み MP3 バイナリ

    Raises:
        RuntimeError: ffmpeg 失敗時 (呼び出し元は WAV フォールバック推奨)
    """
    if not wav_bytes:
        raise RuntimeError("apply_audio_postprocessing: wav_bytes must not be empty")

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as wav_f:
        wav_f.write(wav_bytes)
        wav_path = wav_f.name

    mp3_path = wav_path.replace('.wav', '.mp3')

    try:
        cmd = [
            'ffmpeg', '-i', wav_path,
            '-af', 'highpass=f=80,lowpass=f=18000,dynaudnorm,loudnorm=I=-16:LRA=11:TP=-1.5',
            '-codec:a', 'libmp3lame',
            '-b:a', '320k',
            '-y',  # overwrite
            mp3_path,
        ]
        logger.info(
            "audio_postprocessing: starting ffmpeg (input=%d bytes)", len(wav_bytes)
        )
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"ffmpeg postprocessing failed (returncode={proc.returncode}): "
                f"{stderr.decode()[:200]}"
            )

        mp3_data = Path(mp3_path).read_bytes()
        logger.info(
            "audio_postprocessing: done (output=%d bytes)", len(mp3_data)
        )
        return mp3_data
    finally:
        Path(wav_path).unlink(missing_ok=True)
        Path(mp3_path).unlink(missing_ok=True)
