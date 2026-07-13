"""
LipSync プロセッサーのテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestLipSyncProcessor:
    """LipSync バックグラウンドタスクのテスト"""

    @pytest.mark.asyncio
    async def test_process_lip_sync_generation_success(self):
        """lip sync 生成が正常に完了する"""
        from app.tasks.lip_sync_processor import process_lip_sync_generation
        from app.external.lip_sync_provider import LipSyncStatus

        generation_id = "gen-lip-001"
        mock_video_url = "https://api.hedra.com/output/video.mp4"
        r2_video_url = "https://r2.example.com/lip_sync/video.mp4"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "hedra",
            "status": "pending",
        }

        with patch("app.tasks.lip_sync_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.lip_sync_processor.get_lip_sync_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.generate_lip_sync = AsyncMock(return_value="hedra-task-001")
                mock_provider.check_status = AsyncMock(
                    return_value=LipSyncStatus(
                        status="completed",
                        progress=100,
                        video_url=mock_video_url,
                        error_message=None,
                    )
                )
                mock_get_provider.return_value = mock_provider

                with patch("app.tasks.lip_sync_processor.upload_to_r2", new_callable=AsyncMock) as mock_upload:
                    mock_upload.return_value = r2_video_url

                    with patch("asyncio.sleep", new_callable=AsyncMock):
                        await process_lip_sync_generation(generation_id)

        # generate_lip_sync が呼ばれたことを確認
        mock_provider.generate_lip_sync.assert_called_once()

        # DB が completed で更新されたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            "completed" in str(call) for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_lip_sync_handles_provider_error(self):
        """プロバイダーエラーを適切に処理する"""
        from app.tasks.lip_sync_processor import process_lip_sync_generation

        generation_id = "gen-lip-002"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "hedra",
            "status": "pending",
        }

        with patch("app.tasks.lip_sync_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.lip_sync_processor.get_lip_sync_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.generate_lip_sync = AsyncMock(
                    side_effect=Exception("Hedra API error")
                )
                mock_get_provider.return_value = mock_provider

                # エラーでも例外を再送出しない
                await process_lip_sync_generation(generation_id)

        # failed でステータス更新されたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_lip_sync_handles_missing_record(self):
        """DB レコードが存在しない場合を適切に処理する"""
        from app.tasks.lip_sync_processor import process_lip_sync_generation

        generation_id = "gen-nonexistent"

        with patch("app.tasks.lip_sync_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
            mock_get_supabase.return_value = mock_supabase

            # 例外を再送出しない
            await process_lip_sync_generation(generation_id)

        # update は呼ばれないはず
        mock_supabase.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_process_lip_sync_updates_progress_during_polling(self):
        """ポーリング中に progress が更新される"""
        from app.tasks.lip_sync_processor import process_lip_sync_generation
        from app.external.lip_sync_provider import LipSyncStatus

        generation_id = "gen-lip-003"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "hedra",
            "status": "pending",
        }

        # 最初は processing(50%), 次に completed
        status_sequence = [
            LipSyncStatus(status="processing", progress=50, video_url=None, error_message=None),
            LipSyncStatus(status="completed", progress=100, video_url="https://example.com/video.mp4", error_message=None),
        ]

        with patch("app.tasks.lip_sync_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.lip_sync_processor.get_lip_sync_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.generate_lip_sync = AsyncMock(return_value="hedra-task-003")
                mock_provider.check_status = AsyncMock(side_effect=status_sequence)
                mock_get_provider.return_value = mock_provider

                with patch("app.tasks.lip_sync_processor.upload_to_r2", new_callable=AsyncMock) as mock_upload:
                    mock_upload.return_value = "https://r2.example.com/lip_sync/video.mp4"

                    with patch("asyncio.sleep", new_callable=AsyncMock):
                        await process_lip_sync_generation(generation_id)

        # progress 更新が含まれる update が呼ばれたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert len(update_calls) >= 2, f"Expected at least 2 update calls, got: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_lip_sync_handles_failed_status_from_provider(self):
        """プロバイダーから failed ステータスを受け取った場合を処理する"""
        from app.tasks.lip_sync_processor import process_lip_sync_generation
        from app.external.lip_sync_provider import LipSyncStatus

        generation_id = "gen-lip-004"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "hedra",
            "status": "pending",
        }

        with patch("app.tasks.lip_sync_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.lip_sync_processor.get_lip_sync_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.generate_lip_sync = AsyncMock(return_value="hedra-task-004")
                mock_provider.check_status = AsyncMock(
                    return_value=LipSyncStatus(
                        status="failed",
                        progress=0,
                        video_url=None,
                        error_message="Audio format not supported",
                    )
                )
                mock_get_provider.return_value = mock_provider

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    await process_lip_sync_generation(generation_id)

        # failed でステータス更新されたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_start_lip_sync_processing_creates_task(self):
        """start_lip_sync_processing が asyncio タスクを作成する"""
        from app.tasks.lip_sync_processor import start_lip_sync_processing

        with patch("asyncio.create_task") as mock_create_task:
            await start_lip_sync_processing("gen-001")
            mock_create_task.assert_called_once()
            # Close the unawaited coroutine to prevent RuntimeWarning
            mock_create_task.call_args[0][0].close()

    @pytest.mark.asyncio
    async def test_process_lip_sync_updates_error_message_on_failure(self):
        """失敗時に error_message が更新される"""
        from app.tasks.lip_sync_processor import process_lip_sync_generation

        generation_id = "gen-lip-005"
        error_message = "Hedra API connection failed"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "hedra",
            "status": "pending",
        }

        with patch("app.tasks.lip_sync_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.lip_sync_processor.get_lip_sync_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.generate_lip_sync = AsyncMock(
                    side_effect=Exception(error_message)
                )
                mock_get_provider.return_value = mock_provider

                await process_lip_sync_generation(generation_id)

        # error_message が含まれる update が呼ばれたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            error_message in str(call) for call in update_calls
        ), f"Expected error_message in update calls: {update_calls}"
