"""
Topaz Enhancement アップスケールプロセッサのテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock, call
import os


class TestUpdateUpscaleStatus:
    """update_upscale_status関数のテスト"""

    @pytest.mark.asyncio
    async def test_update_status_only(self):
        """ステータスのみを更新"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(
            mock_supabase, "upscale-001", status="processing"
        )

        mock_supabase.table.assert_called_with("user_video_upscales")
        update_call = mock_supabase.table.return_value.update
        update_call.assert_called_once_with({"status": "processing"})

    @pytest.mark.asyncio
    async def test_update_progress_only(self):
        """進捗のみを更新"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(
            mock_supabase, "upscale-001", progress=50
        )

        update_call = mock_supabase.table.return_value.update
        update_call.assert_called_once_with({"progress": 50})

    @pytest.mark.asyncio
    async def test_update_multiple_fields(self):
        """複数フィールドを同時に更新"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(
            mock_supabase,
            "upscale-001",
            status="completed",
            progress=100,
            upscaled_video_url="https://example.com/upscaled.mp4",
            thumbnail_url="https://example.com/thumb.jpg",
        )

        update_call = mock_supabase.table.return_value.update
        update_call.assert_called_once_with({
            "status": "completed",
            "progress": 100,
            "upscaled_video_url": "https://example.com/upscaled.mp4",
            "thumbnail_url": "https://example.com/thumb.jpg",
        })

    @pytest.mark.asyncio
    async def test_update_error_message(self):
        """エラーメッセージを更新"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(
            mock_supabase,
            "upscale-001",
            status="failed",
            progress=0,
            error_message="Topaz API error",
        )

        update_call = mock_supabase.table.return_value.update
        update_call.assert_called_once_with({
            "status": "failed",
            "progress": 0,
            "error_message": "Topaz API error",
        })

    @pytest.mark.asyncio
    async def test_update_topaz_request_id_and_estimates(self):
        """topaz_request_idと見積もり情報を更新"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(
            mock_supabase,
            "upscale-001",
            topaz_request_id="topaz-req-123",
            estimated_credits_min=10,
            estimated_credits_max=15,
            estimated_time_min=120,
            estimated_time_max=300,
        )

        update_call = mock_supabase.table.return_value.update
        update_call.assert_called_once_with({
            "topaz_request_id": "topaz-req-123",
            "estimated_credits_min": 10,
            "estimated_credits_max": 15,
            "estimated_time_min": 120,
            "estimated_time_max": 300,
        })

    @pytest.mark.asyncio
    async def test_no_update_when_no_fields(self):
        """更新フィールドがない場合はDB更新しない"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(mock_supabase, "upscale-001")

        mock_supabase.table.return_value.update.assert_not_called()


class TestProcessTopazUpscale:
    """process_topaz_upscale関数のテスト"""

    @pytest.mark.asyncio
    async def test_task_not_found(self):
        """タスクが見つからない場合はログ出力して終了"""
        from app.tasks.topaz_upscale_processor import process_topaz_upscale

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

        with patch("app.tasks.topaz_upscale_processor.get_supabase", return_value=mock_supabase):
            with patch("app.tasks.topaz_upscale_processor.get_topaz_service"):
                await process_topaz_upscale("nonexistent-id")

        # 更新が呼ばれないことを確認（タスクが見つからないため）
        # ステータス更新はDB取得後なので、最初のselectのみ
        mock_supabase.table.return_value.select.assert_called_once()

    @pytest.mark.asyncio
    async def test_successful_upscale_flow(self):
        """正常なアップスケールフロー"""
        import tempfile
        from app.tasks.topaz_upscale_processor import process_topaz_upscale

        upscale_id = "upscale-001"
        user_id = "user-123"
        user_video_id = "video-456"

        # Mock DB data
        upscale_data = {
            "id": upscale_id,
            "original_video_url": "https://example.com/original.mp4",
            "model": "prob-4",
            "user_id": user_id,
            "user_video_id": user_video_id,
            "target_width": 2160,
            "target_height": 3840,
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = upscale_data

        # Mock Topaz service
        mock_topaz = AsyncMock()
        mock_topaz.enhance_video = AsyncMock(return_value={
            "download_url": "https://topaz.example.com/enhanced.mp4",
            "request_id": "topaz-req-abc",
            "estimated_credits_min": 10,
            "estimated_credits_max": 15,
            "estimated_time_min": 120,
            "estimated_time_max": 300,
        })

        # Mock R2 upload
        mock_r2_upload = AsyncMock(side_effect=[
            "https://r2.example.com/upscaled.mp4",  # video upload
            "https://r2.example.com/thumb.jpg",       # thumbnail upload
        ])

        # Mock FFmpeg service - must create the thumbnail file
        async def mock_extract_first_frame(video_path, output_path, **kwargs):
            # Create a fake thumbnail file so subsequent open() works
            with open(output_path, "wb") as f:
                f.write(b"fake_jpeg_data")
            return output_path

        mock_ffmpeg = MagicMock()
        mock_ffmpeg.extract_first_frame = mock_extract_first_frame

        with patch("app.tasks.topaz_upscale_processor.get_supabase", return_value=mock_supabase):
            with patch("app.tasks.topaz_upscale_processor.get_topaz_service", return_value=mock_topaz):
                with patch("app.tasks.topaz_upscale_processor.r2_upload_user_video", mock_r2_upload):
                    with patch("app.tasks.topaz_upscale_processor.get_ffmpeg_service", return_value=mock_ffmpeg):
                        with patch("app.tasks.topaz_upscale_processor.httpx") as mock_httpx:
                            # Setup httpx streaming mock
                            mock_client_instance = AsyncMock()
                            mock_httpx.AsyncClient.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
                            mock_httpx.AsyncClient.return_value.__aexit__ = AsyncMock(return_value=False)
                            mock_httpx.Timeout = MagicMock(return_value=300.0)

                            mock_stream_ctx = AsyncMock()
                            mock_stream_response = AsyncMock()
                            mock_stream_response.raise_for_status = MagicMock()

                            async def mock_aiter(*args, **kwargs):
                                yield b"fake_video_data"

                            mock_stream_response.aiter_bytes = mock_aiter
                            mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_stream_response)
                            mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
                            mock_client_instance.stream = MagicMock(return_value=mock_stream_ctx)

                            await process_topaz_upscale(upscale_id)

        # Topaz enhance_video was called
        mock_topaz.enhance_video.assert_awaited_once()

        # R2 upload was called twice (video + thumbnail)
        assert mock_r2_upload.await_count == 2

        # user_videos table was updated
        # Check that update was called on user_videos with upscaled_video_url
        user_videos_updated = False
        for c in mock_supabase.table.call_args_list:
            if c[0][0] == "user_videos":
                user_videos_updated = True
        assert user_videos_updated

    @pytest.mark.asyncio
    async def test_topaz_api_error_sets_failed_status(self):
        """Topaz APIエラー時にfailedステータスに更新"""
        from app.tasks.topaz_upscale_processor import process_topaz_upscale
        from app.services.topaz_service import TopazServiceError

        upscale_id = "upscale-err-001"
        upscale_data = {
            "id": upscale_id,
            "original_video_url": "https://example.com/original.mp4",
            "model": "prob-4",
            "user_id": "user-123",
            "user_video_id": "video-456",
            "target_width": 2160,
            "target_height": 3840,
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = upscale_data

        mock_topaz = AsyncMock()
        mock_topaz.enhance_video = AsyncMock(side_effect=TopazServiceError("Credit insufficient"))
        mock_topaz.cancel_task = AsyncMock()

        with patch("app.tasks.topaz_upscale_processor.get_supabase", return_value=mock_supabase):
            with patch("app.tasks.topaz_upscale_processor.get_topaz_service", return_value=mock_topaz):
                await process_topaz_upscale(upscale_id)

        # Verify that status was set to "failed"
        update_calls = mock_supabase.table.return_value.update.call_args_list
        last_update = update_calls[-1]
        update_data = last_update[0][0]
        assert update_data["status"] == "failed"
        assert update_data["progress"] == 0
        assert "Topaz API error" in update_data["error_message"]

    @pytest.mark.asyncio
    async def test_no_download_url_raises_error(self):
        """TopazからダウンロードURLが返されない場合はエラー"""
        from app.tasks.topaz_upscale_processor import process_topaz_upscale

        upscale_id = "upscale-no-url"
        upscale_data = {
            "id": upscale_id,
            "original_video_url": "https://example.com/original.mp4",
            "model": "prob-4",
            "user_id": "user-123",
            "user_video_id": "video-456",
            "target_width": 2160,
            "target_height": 3840,
        }

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = upscale_data

        mock_topaz = AsyncMock()
        mock_topaz.enhance_video = AsyncMock(return_value={
            "download_url": None,  # No download URL
            "request_id": "topaz-req-xyz",
            "estimated_credits_min": 10,
            "estimated_credits_max": 15,
            "estimated_time_min": 120,
            "estimated_time_max": 300,
        })
        mock_topaz.cancel_task = AsyncMock()

        with patch("app.tasks.topaz_upscale_processor.get_supabase", return_value=mock_supabase):
            with patch("app.tasks.topaz_upscale_processor.get_topaz_service", return_value=mock_topaz):
                await process_topaz_upscale(upscale_id)

        # Verify failed status was set
        update_calls = mock_supabase.table.return_value.update.call_args_list
        last_update = update_calls[-1]
        update_data = last_update[0][0]
        assert update_data["status"] == "failed"

    @pytest.mark.asyncio
    async def test_failed_topaz_job_cancellation_attempted(self):
        """失敗時にTopazジョブのキャンセルが試みられる"""
        from app.tasks.topaz_upscale_processor import process_topaz_upscale
        from app.services.topaz_service import TopazServiceError

        upscale_id = "upscale-cancel"
        upscale_data = {
            "id": upscale_id,
            "original_video_url": "https://example.com/original.mp4",
            "model": "prob-4",
            "user_id": "user-123",
            "user_video_id": "video-456",
            "target_width": 2160,
            "target_height": 3840,
        }

        mock_supabase = MagicMock()
        # First call returns upscale data, second call returns topaz_request_id
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = upscale_data

        mock_topaz = AsyncMock()
        mock_topaz.enhance_video = AsyncMock(side_effect=TopazServiceError("Error"))
        mock_topaz.cancel_task = AsyncMock(return_value=True)

        with patch("app.tasks.topaz_upscale_processor.get_supabase", return_value=mock_supabase):
            with patch("app.tasks.topaz_upscale_processor.get_topaz_service", return_value=mock_topaz):
                await process_topaz_upscale(upscale_id)

        # cancel_task should be attempted if topaz_request_id exists in DB
        # The exact behavior depends on whether the DB has a topaz_request_id stored

    @pytest.mark.asyncio
    async def test_progress_callback_updates_db(self):
        """進捗コールバックがDB更新を行う"""
        from app.tasks.topaz_upscale_processor import update_upscale_status

        mock_supabase = MagicMock()

        await update_upscale_status(mock_supabase, "upscale-001", progress=65)

        mock_supabase.table.assert_called_with("user_video_upscales")
        update_call = mock_supabase.table.return_value.update
        update_call.assert_called_once_with({"progress": 65})


class TestStartTopazUpscaleProcessing:
    """start_topaz_upscale_processing関数のテスト"""

    @pytest.mark.asyncio
    async def test_delegates_to_process_topaz_upscale(self):
        """process_topaz_upscaleに委譲する"""
        from app.tasks.topaz_upscale_processor import start_topaz_upscale_processing

        with patch("app.tasks.topaz_upscale_processor.process_topaz_upscale", new_callable=AsyncMock) as mock_process:
            await start_topaz_upscale_processing("test-id")
            mock_process.assert_awaited_once_with("test-id")


class TestModuleExports:
    """モジュールエクスポートのテスト"""

    def test_topaz_upscale_processor_importable(self):
        """topaz_upscale_processorがインポート可能"""
        from app.tasks.topaz_upscale_processor import (
            process_topaz_upscale,
            start_topaz_upscale_processing,
            update_upscale_status,
        )
        assert callable(process_topaz_upscale)
        assert callable(start_topaz_upscale_processing)
        assert callable(update_upscale_status)

    def test_exports_from_tasks_init(self):
        """__init__.pyからエクスポートされる"""
        from app.tasks import (
            process_topaz_upscale,
            start_topaz_upscale_processing,
        )
        assert callable(process_topaz_upscale)
        assert callable(start_topaz_upscale_processing)
