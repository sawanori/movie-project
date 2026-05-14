"""
dialogue_processor.py の単体テスト

実際の TTS API / ffmpeg / R2 は呼び出さない (すべてモック)
"""
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch, call

import httpx
import pytest

from app.services.ffmpeg_service import FFmpegError
from app.tasks.dialogue_processor import (
    _download_file,
    _run_tts_and_get_audio_url,
    process_dialogue_generation,
)


# ---------------------------------------------------------------------------
# ヘルパー
# ---------------------------------------------------------------------------


def _make_dialogue_record(
    generation_id: str | None = None,
    status: str = "processing",
) -> dict:
    return {
        "id": generation_id or str(uuid.uuid4()),
        "user_id": "user-001",
        "video_url": "https://example.com/video.mp4",
        "text": "こんにちは",
        "voice_id": "voice_ja_001",
        "language": "ja",
        "speed": 1.0,
        "status": status,
        "provider": "elevenlabs",
        "output_video_url": None,
        "error_message": None,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }


def _make_supabase_mock(record: dict) -> MagicMock:
    """Supabase クライアントのモックを返す"""
    mock_supabase = MagicMock()
    mock_response = MagicMock()
    mock_response.data = record
    (
        mock_supabase.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
    ) = mock_response
    return mock_supabase


# ---------------------------------------------------------------------------
# _run_tts_and_get_audio_url
# ---------------------------------------------------------------------------


class TestRunTtsAndGetAudioUrl:
    @pytest.mark.asyncio
    async def test_success(self):
        """TTS が completed のとき audio_url を返す"""
        tts_record = {"id": "tts-001"}
        tts_status = {
            "id": "tts-001",
            "status": "completed",
            "audio_url": "https://example.com/audio.mp3",
            "error_message": None,
        }

        with patch(
            "app.tasks.dialogue_processor.create_tts_generation",
            new_callable=AsyncMock,
            return_value=tts_record,
        ) as mock_create:
            with patch(
                "app.tasks.dialogue_processor.process_tts_generation",
                new_callable=AsyncMock,
            ) as mock_process:
                with patch(
                    "app.tasks.dialogue_processor.get_tts_status",
                    new_callable=AsyncMock,
                    return_value=tts_status,
                ) as mock_get_status:
                    with patch(
                        "app.tasks.dialogue_processor.update_dialogue_status",
                        new_callable=AsyncMock,
                    ):
                        audio_url = await _run_tts_and_get_audio_url(
                            text="こんにちは",
                            voice_id="voice_ja_001",
                            language="ja",
                            speed=1.0,
                            user_id="user-001",
                            generation_id="dial-001",
                        )

        assert audio_url == "https://example.com/audio.mp3"
        mock_create.assert_called_once()
        mock_process.assert_awaited_once_with("tts-001")
        mock_get_status.assert_awaited_once_with("user-001", "tts-001")

    @pytest.mark.asyncio
    async def test_tts_failed_raises_value_error(self):
        """TTS が failed のとき ValueError が raise される"""
        tts_record = {"id": "tts-002"}
        tts_status = {
            "id": "tts-002",
            "status": "failed",
            "audio_url": None,
            "error_message": "Voice not found",
        }

        with patch(
            "app.tasks.dialogue_processor.create_tts_generation",
            new_callable=AsyncMock,
            return_value=tts_record,
        ):
            with patch(
                "app.tasks.dialogue_processor.process_tts_generation",
                new_callable=AsyncMock,
            ):
                with patch(
                    "app.tasks.dialogue_processor.get_tts_status",
                    new_callable=AsyncMock,
                    return_value=tts_status,
                ):
                    with patch(
                        "app.tasks.dialogue_processor.update_dialogue_status",
                        new_callable=AsyncMock,
                    ):
                        with pytest.raises(ValueError, match="Voice not found"):
                            await _run_tts_and_get_audio_url(
                                text="こんにちは",
                                voice_id="voice_bad",
                                language="ja",
                                speed=1.0,
                                user_id="user-001",
                                generation_id="dial-001",
                            )


# ---------------------------------------------------------------------------
# _download_file
# ---------------------------------------------------------------------------


class TestDownloadFile:
    @pytest.mark.asyncio
    async def test_download_success(self, tmp_path):
        """正常ダウンロード → ファイルに書き込まれる"""
        dest = str(tmp_path / "out.mp4")
        fake_content = b"fake-video-content"

        mock_response = MagicMock()
        mock_response.content = fake_content
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            await _download_file("https://example.com/file.mp4", dest)

        with open(dest, "rb") as f:
            assert f.read() == fake_content

    @pytest.mark.asyncio
    async def test_download_http_error_raises(self, tmp_path):
        """HTTP 404 は raise_for_status で HTTPStatusError が伝播する"""
        dest = str(tmp_path / "out.mp4")

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock(
            side_effect=httpx.HTTPStatusError(
                "404",
                request=MagicMock(),
                response=MagicMock(),
            )
        )

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                await _download_file("https://example.com/missing.mp4", dest)


# ---------------------------------------------------------------------------
# process_dialogue_generation
# ---------------------------------------------------------------------------


class TestProcessDialogueGeneration:
    @pytest.mark.asyncio
    async def test_process_dialogue_success(self):
        """正常完了フロー: update_dialogue_status が 'completed' と output_video_url で呼ばれる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    return_value="https://example.com/audio.mp3",
                ):
                    with patch(
                        "app.tasks.dialogue_processor._download_file",
                        new_callable=AsyncMock,
                    ):
                        with patch(
                            "app.tasks.dialogue_processor.get_ffmpeg_service"
                        ) as mock_get_ffmpeg:
                            mock_ffmpeg = AsyncMock()
                            mock_ffmpeg.mix_audio_to_video = AsyncMock(
                                return_value="/tmp/output.mp4"
                            )
                            mock_ffmpeg._has_audio_track = MagicMock(return_value=True)
                            mock_get_ffmpeg.return_value = mock_ffmpeg

                            with patch(
                                "app.tasks.dialogue_processor.upload_video",
                                new_callable=AsyncMock,
                                return_value="https://r2.example.com/output.mp4",
                            ):
                                with patch("builtins.open", MagicMock(
                                    return_value=MagicMock(
                                        __enter__=MagicMock(return_value=MagicMock(read=MagicMock(return_value=b""))),
                                        __exit__=MagicMock(return_value=False),
                                    )
                                )):
                                    await process_dialogue_generation(generation_id)

        # completed で呼ばれていること
        completed_calls = [
            c for c in mock_update.call_args_list
            if c.args[1] == "completed" or (c.args and len(c.args) > 1 and c.args[1] == "completed")
        ]
        assert len(completed_calls) > 0
        # output_video_url が渡されていること
        last_call = mock_update.call_args_list[-1]
        assert last_call.kwargs.get("output_video_url") == "https://r2.example.com/output.mp4"
        assert last_call.args[1] == "completed"

    @pytest.mark.asyncio
    async def test_process_dialogue_tts_failed(self):
        """TTS が失敗すると update_dialogue_status が 'failed' で呼ばれる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    side_effect=ValueError("TTS generation failed: Voice not found"),
                ):
                    await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0
        last_failed = failed_calls[-1]
        assert "Voice not found" in last_failed.kwargs.get("error_message", "")

    @pytest.mark.asyncio
    async def test_process_dialogue_download_failed(self):
        """元動画ダウンロード失敗 → update_dialogue_status が 'failed' で呼ばれる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    return_value="https://example.com/audio.mp3",
                ):
                    with patch(
                        "app.tasks.dialogue_processor._download_file",
                        new_callable=AsyncMock,
                        side_effect=httpx.HTTPStatusError(
                            "404", request=MagicMock(), response=MagicMock()
                        ),
                    ):
                        await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0

    @pytest.mark.asyncio
    async def test_process_dialogue_ffmpeg_failed(self):
        """ffmpeg 失敗 → update_dialogue_status が 'failed' で呼ばれる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    return_value="https://example.com/audio.mp3",
                ):
                    with patch(
                        "app.tasks.dialogue_processor._download_file",
                        new_callable=AsyncMock,
                    ):
                        with patch(
                            "app.tasks.dialogue_processor.get_ffmpeg_service"
                        ) as mock_get_ffmpeg:
                            mock_ffmpeg = AsyncMock()
                            mock_ffmpeg.mix_audio_to_video = AsyncMock(
                                side_effect=FFmpegError("音声ミックスに失敗")
                            )
                            mock_get_ffmpeg.return_value = mock_ffmpeg

                            await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0

    @pytest.mark.asyncio
    async def test_process_dialogue_record_not_found(self):
        """DB にレコードがない場合は何もしない (例外なし)"""
        generation_id = str(uuid.uuid4())

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = None
        (
            mock_supabase.table.return_value
            .select.return_value
            .eq.return_value
            .single.return_value
            .execute.return_value
        ) = mock_response

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            # 例外なく終了すること
            await process_dialogue_generation(generation_id)

    # ------------------------------------------------------------------
    # N1: Japanese user-facing error message mapping tests
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_video_download_failure_maps_to_japanese_message(self):
        """httpx.HTTPStatusError → 日本語エラーメッセージにマッピングされる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    return_value="https://example.com/audio.mp3",
                ):
                    with patch(
                        "app.tasks.dialogue_processor._download_file",
                        new_callable=AsyncMock,
                        side_effect=httpx.HTTPStatusError(
                            "404 Not Found", request=MagicMock(), response=MagicMock()
                        ),
                    ):
                        await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0
        error_msg = failed_calls[-1].kwargs.get("error_message", "")
        assert error_msg == "入力動画を取得できませんでした。動画が削除されている可能性があります"

    @pytest.mark.asyncio
    async def test_ffmpeg_failure_maps_to_japanese_message(self):
        """FFmpegError → 日本語エラーメッセージにマッピングされる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    return_value="https://example.com/audio.mp3",
                ):
                    with patch(
                        "app.tasks.dialogue_processor._download_file",
                        new_callable=AsyncMock,
                    ):
                        with patch(
                            "app.tasks.dialogue_processor.get_ffmpeg_service"
                        ) as mock_get_ffmpeg:
                            mock_ffmpeg = AsyncMock()
                            mock_ffmpeg.mix_audio_to_video = AsyncMock(
                                side_effect=FFmpegError("unsupported codec")
                            )
                            mock_get_ffmpeg.return_value = mock_ffmpeg

                            await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0
        error_msg = failed_calls[-1].kwargs.get("error_message", "")
        assert error_msg == "音声の合成に失敗しました。対応フォーマット: mp4 / webm"

    @pytest.mark.asyncio
    async def test_tts_failure_maps_to_japanese_message(self):
        """ValueError (TTS 失敗, 英語メッセージ) → JP プレフィックス付きメッセージにラップされる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    side_effect=ValueError("OpenAI API error"),
                ):
                    await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0
        error_msg = failed_calls[-1].kwargs.get("error_message", "")
        assert error_msg == "音声生成に失敗しました: OpenAI API error"

    @pytest.mark.asyncio
    async def test_generic_failure_maps_to_japanese_message(self):
        """RuntimeError (catch-all) → 汎用日本語エラーメッセージにマッピングされる"""
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id)
        mock_supabase = _make_supabase_mock(record)

        with patch("app.tasks.dialogue_processor.get_supabase", return_value=mock_supabase):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ) as mock_update:
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    side_effect=RuntimeError("unknown internal error"),
                ):
                    await process_dialogue_generation(generation_id)

        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0
        error_msg = failed_calls[-1].kwargs.get("error_message", "")
        assert error_msg == "動画への音声合成中にエラーが発生しました"
