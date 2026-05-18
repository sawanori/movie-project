"""
TTS プロセッサーのテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestTTSProcessor:
    """TTS バックグラウンドタスクのテスト"""

    @pytest.mark.asyncio
    async def test_process_tts_generation_success_sync_provider(self):
        """同期プロバイダーで TTS 生成が成功する"""
        from app.tasks.tts_processor import process_tts_generation

        generation_id = "gen-test-001"
        mock_audio_url = "https://r2.example.com/tts/audio.mp3"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "text": "こんにちは",
            "voice_id": "voice_123",
            "language": "ja",
            "speed": 1.0,
            "status": "pending",
        }

        with patch("app.tasks.tts_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()

            # DB レコード取得
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record

            # ステータス更新
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.tts_processor.get_tts_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.is_synchronous = True
                mock_provider.generate_speech = AsyncMock(return_value=mock_audio_url)
                mock_provider.get_audio_url = AsyncMock(return_value=mock_audio_url)
                mock_get_provider.return_value = mock_provider

                await process_tts_generation(generation_id)

        # generate_speech が呼ばれたことを確認
        mock_provider.generate_speech.assert_called_once_with(
            text="こんにちは",
            voice_id="voice_123",
            language="ja",
            speed=1.0,
            instructions=None,
        )

        # DB が completed で更新されたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            "completed" in str(call) for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_tts_generation_async_provider_polling(self):
        """非同期プロバイダーでポーリングして TTS 生成が成功する"""
        from app.tasks.tts_processor import process_tts_generation
        from app.external.tts_provider import TTSStatus

        generation_id = "gen-test-002"
        task_id = "external-task-001"
        mock_audio_url = "https://r2.example.com/tts/audio2.mp3"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "text": "テスト",
            "voice_id": "voice_456",
            "language": "ja",
            "speed": 1.0,
            "status": "pending",
        }

        with patch("app.tasks.tts_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.tts_processor.get_tts_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.is_synchronous = False
                mock_provider.generate_speech = AsyncMock(return_value=task_id)
                mock_provider.check_status = AsyncMock(
                    return_value=TTSStatus(
                        status="completed",
                        audio_url=mock_audio_url,
                        duration_seconds=2.5,
                        error_message=None,
                    )
                )
                mock_get_provider.return_value = mock_provider

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    await process_tts_generation(generation_id)

        mock_provider.check_status.assert_called_with(task_id)

        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            "completed" in str(call) for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_tts_generation_handles_provider_error(self):
        """プロバイダーエラーを適切に処理する"""
        from app.tasks.tts_processor import process_tts_generation

        generation_id = "gen-test-003"

        mock_db_record = {
            "id": generation_id,
            "user_id": "user-001",
            "text": "テスト",
            "voice_id": "voice_123",
            "language": "ja",
            "speed": 1.0,
            "status": "pending",
        }

        with patch("app.tasks.tts_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_db_record
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            with patch("app.tasks.tts_processor.get_tts_provider") as mock_get_provider:
                mock_provider = AsyncMock()
                mock_provider.is_synchronous = True
                mock_provider.generate_speech = AsyncMock(
                    side_effect=Exception("API error from provider")
                )
                mock_get_provider.return_value = mock_provider

                # エラーでも例外を再送出しない（バックグラウンドタスクなので）
                await process_tts_generation(generation_id)

        # failed でステータス更新されたことを確認
        update_calls = mock_supabase.table.return_value.update.call_args_list
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_tts_generation_handles_missing_record(self):
        """DB レコードが存在しない場合を適切に処理する"""
        from app.tasks.tts_processor import process_tts_generation

        generation_id = "gen-nonexistent"

        with patch("app.tasks.tts_processor.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            # レコードが見つからない
            mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
            mock_get_supabase.return_value = mock_supabase

            # 例外を再送出しない
            await process_tts_generation(generation_id)

        # update は呼ばれないはず
        mock_supabase.table.return_value.update.assert_not_called()
