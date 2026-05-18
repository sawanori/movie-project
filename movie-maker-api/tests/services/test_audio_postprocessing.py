"""
audio_postprocessing.apply_audio_postprocessing のユニットテスト

ffmpeg が実環境にインストールされていない場合は実 ffmpeg 呼び出しテストをスキップする。
"""
import asyncio
import shutil
import struct
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _is_ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _make_minimal_wav(num_samples: int = 44100, sample_rate: int = 44100) -> bytes:
    """サイン波を含む WAV バイナリを生成するヘルパー (16bit mono PCM, 440Hz A4)

    NOTE: 無音 (ゼロサンプル) は dynaudnorm フィルタで psymodel assertion を引き起こすため
          440Hz のサイン波を使用する。
    """
    import math

    amplitude = 16000
    freq = 440  # Hz (A4)
    samples_bytes = b""
    for i in range(num_samples):
        val = int(amplitude * math.sin(2 * math.pi * freq * i / sample_rate))
        samples_bytes += struct.pack("<h", val)

    data_size = len(samples_bytes)
    riff_size = 36 + data_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        riff_size,
        b"WAVE",
        b"fmt ",
        16,              # PCM chunk size
        1,               # PCM format
        1,               # mono
        sample_rate,
        sample_rate * 2, # byte rate
        2,               # block align
        16,              # bits per sample
        b"data",
        data_size,
    )
    return header + samples_bytes


# ---------------------------------------------------------------------------
# apply_audio_postprocessing — 実 ffmpeg を使ったテスト (ffmpeg 必須)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _is_ffmpeg_available(),
    reason="ffmpeg not found in PATH"
)
@pytest.mark.asyncio
async def test_apply_audio_postprocessing_returns_mp3():
    """有効な WAV を渡すと MP3 バイトが返る (ffmpeg 実行)"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    wav_bytes = _make_minimal_wav(num_samples=22050, sample_rate=44100)
    result = await apply_audio_postprocessing(wav_bytes)

    assert isinstance(result, bytes)
    assert len(result) > 0


@pytest.mark.skipif(
    not _is_ffmpeg_available(),
    reason="ffmpeg not found in PATH"
)
@pytest.mark.asyncio
async def test_apply_audio_postprocessing_output_is_mp3_magic_bytes():
    """ffmpeg 出力の先頭バイトが MP3 フレームヘッダ (ID3 or 0xff 0xfb/0xf3/0xf2)"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    wav_bytes = _make_minimal_wav(num_samples=22050, sample_rate=44100)
    result = await apply_audio_postprocessing(wav_bytes)

    # ID3 タグ付き MP3 または raw フレームヘッダのどちらかを許容
    is_id3 = result[:3] == b"ID3"
    is_raw_frame = result[0] == 0xFF and (result[1] & 0xE0) == 0xE0
    assert is_id3 or is_raw_frame, (
        f"Output does not look like MP3: first bytes = {result[:4].hex()}"
    )


@pytest.mark.skipif(
    not _is_ffmpeg_available(),
    reason="ffmpeg not found in PATH"
)
@pytest.mark.asyncio
async def test_apply_audio_postprocessing_reduces_size():
    """MP3 出力サイズが WAV より小さい"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    # 約 0.5 秒の WAV (22050 サンプル @ 44100 Hz)
    wav_bytes = _make_minimal_wav(num_samples=22050, sample_rate=44100)
    result = await apply_audio_postprocessing(wav_bytes)

    assert len(result) < len(wav_bytes), (
        f"MP3 ({len(result)} bytes) is not smaller than WAV ({len(wav_bytes)} bytes)"
    )


@pytest.mark.skipif(
    not _is_ffmpeg_available(),
    reason="ffmpeg not found in PATH"
)
@pytest.mark.asyncio
async def test_apply_audio_postprocessing_cleans_up_tempfiles():
    """処理後に一時ファイル (wav / mp3) が確実に削除される"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    created_paths: list[str] = []
    original_named_temp = tempfile.NamedTemporaryFile

    def tracking_named_temp(**kwargs):
        f = original_named_temp(**kwargs)
        created_paths.append(f.name)
        return f

    with patch("app.services.audio_postprocessing.tempfile.NamedTemporaryFile", side_effect=tracking_named_temp):
        wav_bytes = _make_minimal_wav(num_samples=22050, sample_rate=44100)
        await apply_audio_postprocessing(wav_bytes)

    # 追跡した WAV パスと対応する MP3 パスが両方削除されている
    for wav_path in created_paths:
        mp3_path = wav_path.replace('.wav', '.mp3')
        assert not Path(wav_path).exists(), f"WAV tempfile not deleted: {wav_path}"
        assert not Path(mp3_path).exists(), f"MP3 tempfile not deleted: {mp3_path}"


# ---------------------------------------------------------------------------
# apply_audio_postprocessing — mock によるエラーケーステスト
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_audio_postprocessing_raises_on_empty_input():
    """空バイト入力は RuntimeError を送出する"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    with pytest.raises(RuntimeError, match="wav_bytes must not be empty"):
        await apply_audio_postprocessing(b"")


@pytest.mark.asyncio
async def test_apply_audio_postprocessing_raises_on_ffmpeg_failure():
    """ffmpeg subprocess が returncode != 0 を返した場合 RuntimeError を送出する"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.communicate = AsyncMock(return_value=(b"", b"ffmpeg: Invalid data found"))

    with patch(
        "app.services.audio_postprocessing.asyncio.create_subprocess_exec",
        new_callable=AsyncMock,
        return_value=mock_proc,
    ):
        with pytest.raises(RuntimeError, match="ffmpeg postprocessing failed"):
            await apply_audio_postprocessing(b"RIFF\x00\x00\x00\x00WAVEfmt ")


@pytest.mark.asyncio
async def test_apply_audio_postprocessing_tempfile_cleanup_on_ffmpeg_failure():
    """ffmpeg 失敗時も finally ブロックで一時ファイルが削除される"""
    from app.services.audio_postprocessing import apply_audio_postprocessing

    created_paths: list[str] = []
    original_named_temp = tempfile.NamedTemporaryFile

    def tracking_named_temp(**kwargs):
        f = original_named_temp(**kwargs)
        created_paths.append(f.name)
        return f

    mock_proc = MagicMock()
    mock_proc.returncode = 2
    mock_proc.communicate = AsyncMock(return_value=(b"", b"error"))

    with patch("app.services.audio_postprocessing.tempfile.NamedTemporaryFile", side_effect=tracking_named_temp):
        with patch(
            "app.services.audio_postprocessing.asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=mock_proc,
        ):
            with pytest.raises(RuntimeError):
                await apply_audio_postprocessing(b"RIFF\x00\x00\x00\x00WAVEfmt ")

    # 失敗してもクリーンアップされる (ファイルはもともと存在しないため missing_ok=True で OK)
    for wav_path in created_paths:
        assert not Path(wav_path).exists(), f"WAV tempfile not deleted after failure: {wav_path}"
