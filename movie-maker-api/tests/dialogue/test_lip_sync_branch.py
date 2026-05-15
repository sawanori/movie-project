"""
dialogue_processor.py の use_lip_sync 分岐ロジック単体テスト

実際の Hedra API / Supabase / ffmpeg / R2 は呼び出さない (すべてモック)。

Design Doc §8-1 の 5 ケース + _translate_hedra_error 3 ケース。
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.dialogue_processor import (
    _translate_hedra_error,
    process_dialogue_generation,
)


# ---------------------------------------------------------------------------
# ヘルパー
# ---------------------------------------------------------------------------


def _make_dialogue_record(
    generation_id: str | None = None,
    use_lip_sync: bool = False,
    include_use_lip_sync_key: bool = True,
) -> dict:
    """dialogue_generations のテストレコードを返す。

    include_use_lip_sync_key=False の場合は use_lip_sync キーを含めない
    (既存レコード後方互換のテスト用)。
    """
    record = {
        "id": generation_id or str(uuid.uuid4()),
        "user_id": "user-001",
        "video_url": "https://example.com/video.mp4",
        "text": "こんにちは",
        "voice_id": "voice_ja_001",
        "language": "ja",
        "speed": 1.0,
        "status": "processing",
        "provider": "elevenlabs",
        "output_video_url": None,
        "error_message": None,
        "created_at": "2026-05-15T00:00:00Z",
        "updated_at": "2026-05-15T00:00:00Z",
    }
    if include_use_lip_sync_key:
        record["use_lip_sync"] = use_lip_sync
    return record


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
# ケース 1: use_lip_sync=False で従来通り ffmpeg 経由 (regression)
# ---------------------------------------------------------------------------


class TestUseLipSyncFalseFfmpegPath:
    @pytest.mark.asyncio
    async def test_use_lip_sync_false_calls_ffmpeg_not_lip_sync(self):
        """use_lip_sync=False の場合 _run_ffmpeg_mix が呼ばれ、
        _run_lip_sync_and_get_video_url は呼ばれないこと。
        """
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id, use_lip_sync=False)
        mock_supabase = _make_supabase_mock(record)

        with patch(
            "app.tasks.dialogue_processor.get_supabase",
            return_value=mock_supabase,
        ):
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
                        "app.tasks.dialogue_processor._run_ffmpeg_mix",
                        new_callable=AsyncMock,
                        return_value="https://r2.example.com/mixed.mp4",
                    ) as mock_ffmpeg:
                        with patch(
                            "app.tasks.dialogue_processor._run_lip_sync_and_get_video_url",
                            new_callable=AsyncMock,
                        ) as mock_lip_sync:
                            await process_dialogue_generation(generation_id)

        # ffmpeg 経路が呼ばれた
        mock_ffmpeg.assert_awaited_once()
        # リップシンク経路は呼ばれていない
        mock_lip_sync.assert_not_awaited()
        # completed で update が呼ばれている
        last_call = mock_update.call_args_list[-1]
        assert last_call.args[1] == "completed"
        assert last_call.kwargs.get("output_video_url") == "https://r2.example.com/mixed.mp4"


# ---------------------------------------------------------------------------
# ケース 2: use_lip_sync=True で Hedra 経路 (正常系)
# ---------------------------------------------------------------------------


class TestUseLipSyncTrueHappyPath:
    @pytest.mark.asyncio
    async def test_use_lip_sync_true_calls_lip_sync_and_records_fk(self):
        """use_lip_sync=True の場合 _run_lip_sync_and_get_video_url が呼ばれ、
        update_dialogue_status に lip_sync_generation_id が記録されること。
        """
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id, use_lip_sync=True)
        mock_supabase = _make_supabase_mock(record)

        lip_sync_record = {"id": "lip-sync-001"}
        lip_sync_status = {
            "id": "lip-sync-001",
            "status": "completed",
            "output_video_url": "https://r2.example.com/lip_sync.mp4",
            "error_message": None,
        }

        with patch(
            "app.tasks.dialogue_processor.get_supabase",
            return_value=mock_supabase,
        ):
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
                        "app.tasks.dialogue_processor.create_lip_sync_generation",
                        new_callable=AsyncMock,
                        return_value=lip_sync_record,
                    ) as mock_create_ls:
                        with patch(
                            "app.tasks.dialogue_processor.process_lip_sync_generation",
                            new_callable=AsyncMock,
                        ) as mock_proc_ls:
                            with patch(
                                "app.tasks.dialogue_processor.get_lip_sync_status",
                                new_callable=AsyncMock,
                                return_value=lip_sync_status,
                            ) as mock_get_status:
                                with patch(
                                    "app.tasks.dialogue_processor._run_ffmpeg_mix",
                                    new_callable=AsyncMock,
                                ) as mock_ffmpeg:
                                    await process_dialogue_generation(generation_id)

        # リップシンク経路の各関数が呼ばれている
        mock_create_ls.assert_awaited_once_with(
            user_id="user-001",
            source_type="video",
            source_url="https://example.com/video.mp4",
            audio_url="https://example.com/audio.mp3",
        )
        mock_proc_ls.assert_awaited_once_with("lip-sync-001")
        mock_get_status.assert_awaited_once_with("user-001", "lip-sync-001")
        # ffmpeg 経路は呼ばれていない
        mock_ffmpeg.assert_not_awaited()

        # lip_sync_generation_id を持つ update_dialogue_status が少なくとも 1 回呼ばれた
        fk_calls = [
            c for c in mock_update.call_args_list
            if c.kwargs.get("lip_sync_generation_id") == "lip-sync-001"
        ]
        assert len(fk_calls) > 0, "lip_sync_generation_id should be recorded"

        # 完了時の URL が dialogue 側に伝わっている
        last_call = mock_update.call_args_list[-1]
        assert last_call.args[1] == "completed"
        assert (
            last_call.kwargs.get("output_video_url")
            == "https://r2.example.com/lip_sync.mp4"
        )


# ---------------------------------------------------------------------------
# ケース 3: use_lip_sync=True で Hedra 失敗 → 日本語エラー
# ---------------------------------------------------------------------------


class TestUseLipSyncTrueHedraFailed:
    @pytest.mark.asyncio
    async def test_hedra_failed_translates_to_japanese(self):
        """Hedra が failed を返した場合、error_message が日本語に翻訳されること。

        error_message='face_detection_failed' → '動画から顔を検出できませんでした...'
        """
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id, use_lip_sync=True)
        mock_supabase = _make_supabase_mock(record)

        lip_sync_record = {"id": "lip-sync-002"}
        lip_sync_status_failed = {
            "id": "lip-sync-002",
            "status": "failed",
            "output_video_url": None,
            "error_message": "face_detection_failed",
        }

        with patch(
            "app.tasks.dialogue_processor.get_supabase",
            return_value=mock_supabase,
        ):
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
                        "app.tasks.dialogue_processor.create_lip_sync_generation",
                        new_callable=AsyncMock,
                        return_value=lip_sync_record,
                    ):
                        with patch(
                            "app.tasks.dialogue_processor.process_lip_sync_generation",
                            new_callable=AsyncMock,
                        ):
                            with patch(
                                "app.tasks.dialogue_processor.get_lip_sync_status",
                                new_callable=AsyncMock,
                                return_value=lip_sync_status_failed,
                            ):
                                await process_dialogue_generation(generation_id)

        # failed で update_dialogue_status が呼ばれている
        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0, "Should call update with failed status"

        # error_message が日本語化されている
        error_msg = failed_calls[-1].kwargs.get("error_message", "")
        assert "顔を検出できませんでした" in error_msg, (
            f"Expected Japanese face-detection message, got: {error_msg}"
        )


# ---------------------------------------------------------------------------
# ケース 4: use_lip_sync=True で create_lip_sync_generation が例外
# ---------------------------------------------------------------------------


class TestUseLipSyncTrueCreateException:
    @pytest.mark.asyncio
    async def test_create_lip_sync_exception_results_in_failed_status(self):
        """create_lip_sync_generation が例外を raise した場合、
        dialogue_generations が failed になり、エラーメッセージが記録されること。
        """
        generation_id = str(uuid.uuid4())
        record = _make_dialogue_record(generation_id=generation_id, use_lip_sync=True)
        mock_supabase = _make_supabase_mock(record)

        with patch(
            "app.tasks.dialogue_processor.get_supabase",
            return_value=mock_supabase,
        ):
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
                        "app.tasks.dialogue_processor.create_lip_sync_generation",
                        new_callable=AsyncMock,
                        side_effect=Exception("Supabase error"),
                    ):
                        await process_dialogue_generation(generation_id)

        # failed で update が呼ばれている
        failed_calls = [
            c for c in mock_update.call_args_list
            if len(c.args) > 1 and c.args[1] == "failed"
        ]
        assert len(failed_calls) > 0
        # エラーメッセージが記録されている (具体的な文言は catch-all 経路の汎用メッセージ)
        error_msg = failed_calls[-1].kwargs.get("error_message", "")
        assert error_msg, "error_message should not be empty"


# ---------------------------------------------------------------------------
# ケース 5: use_lip_sync カラム未設定の既存レコード (フォールバック)
# ---------------------------------------------------------------------------


class TestUseLipSyncMissingColumnFallback:
    @pytest.mark.asyncio
    async def test_missing_use_lip_sync_column_falls_back_to_ffmpeg(self):
        """record に use_lip_sync キーが無い場合、False としてフォールバックされ
        ffmpeg 経路が選択されること (record.get("use_lip_sync", False) の保証)。
        """
        generation_id = str(uuid.uuid4())
        # use_lip_sync キーを含まないレコード (既存レコードを模擬)
        record = _make_dialogue_record(
            generation_id=generation_id, include_use_lip_sync_key=False
        )
        assert "use_lip_sync" not in record, "Test fixture should not include use_lip_sync"
        mock_supabase = _make_supabase_mock(record)

        with patch(
            "app.tasks.dialogue_processor.get_supabase",
            return_value=mock_supabase,
        ):
            with patch(
                "app.tasks.dialogue_processor.update_dialogue_status",
                new_callable=AsyncMock,
            ):
                with patch(
                    "app.tasks.dialogue_processor._run_tts_and_get_audio_url",
                    new_callable=AsyncMock,
                    return_value="https://example.com/audio.mp3",
                ):
                    with patch(
                        "app.tasks.dialogue_processor._run_ffmpeg_mix",
                        new_callable=AsyncMock,
                        return_value="https://r2.example.com/legacy.mp4",
                    ) as mock_ffmpeg:
                        with patch(
                            "app.tasks.dialogue_processor._run_lip_sync_and_get_video_url",
                            new_callable=AsyncMock,
                        ) as mock_lip_sync:
                            await process_dialogue_generation(generation_id)

        # ffmpeg 経路が呼ばれた (フォールバック動作)
        mock_ffmpeg.assert_awaited_once()
        # リップシンク経路は呼ばれていない
        mock_lip_sync.assert_not_awaited()


# ---------------------------------------------------------------------------
# _translate_hedra_error の直接テスト
# ---------------------------------------------------------------------------


class TestTranslateHedraError:
    def test_translate_hedra_error_face_detection(self):
        """face / detect / no face キーワードで顔検出失敗メッセージを返す"""
        assert "顔を検出できませんでした" in _translate_hedra_error("face_detection_failed")
        assert "顔を検出できませんでした" in _translate_hedra_error("No face detected in video")

    def test_translate_hedra_error_duration(self):
        """duration / length / too long キーワードで動画長超過メッセージを返す"""
        assert "長すぎます" in _translate_hedra_error("video duration too long")
        assert "長すぎます" in _translate_hedra_error("Video length exceeds limit")

    def test_translate_hedra_error_unknown(self):
        """None や unknown エラーで汎用メッセージを返す"""
        assert "リップシンク生成に失敗しました" in _translate_hedra_error(None)
        assert "リップシンク生成に失敗しました" in _translate_hedra_error("")
        # 不明なエラーは元エラーの先頭 200 文字を含む
        result = _translate_hedra_error("some random unknown failure xyz")
        assert "リップシンク生成に失敗しました" in result
        assert "some random unknown failure xyz" in result
