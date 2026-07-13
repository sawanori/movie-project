"""
TTS サービスのテスト
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone


class TestTTSService:
    """TTS サービスのテスト"""

    @pytest.mark.asyncio
    async def test_create_tts_generation(self):
        """create_tts_generation が DB に生成レコードを作成して返す"""
        from app.tts.service import create_tts_generation

        user_id = "user-001"
        text = "こんにちは世界"
        voice_id = "voice_123"

        mock_record = {
            "id": "gen-001",
            "user_id": user_id,
            "text": text,
            "voice_id": voice_id,
            "language": "ja",
            "speed": 1.0,
            "status": "pending",
            "audio_url": None,
            "duration_seconds": None,
            "error_message": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.tts.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [mock_record]
            mock_get_supabase.return_value = mock_supabase

            result = await create_tts_generation(
                user_id=user_id,
                text=text,
                voice_id=voice_id,
                language="ja",
                speed=1.0,
            )

        assert result["id"] == "gen-001"
        assert result["status"] == "pending"
        assert result["text"] == text

    @pytest.mark.asyncio
    async def test_get_tts_status(self):
        """get_tts_status が DB から生成レコードのステータスを返す"""
        from app.tts.service import get_tts_status

        user_id = "user-001"
        generation_id = "gen-001"

        mock_record = {
            "id": generation_id,
            "user_id": user_id,
            "status": "completed",
            "audio_url": "https://example.com/audio.mp3",
            "duration_seconds": 3.5,
        }

        with patch("app.tts.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = mock_record
            mock_get_supabase.return_value = mock_supabase

            result = await get_tts_status(user_id, generation_id)

        assert result is not None
        assert result["id"] == generation_id
        assert result["status"] == "completed"
        assert result["audio_url"] == "https://example.com/audio.mp3"

    @pytest.mark.asyncio
    async def test_get_tts_status_not_found(self):
        """get_tts_status がレコードが存在しない場合 None を返す"""
        from app.tts.service import get_tts_status

        with patch("app.tts.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
            mock_get_supabase.return_value = mock_supabase

            result = await get_tts_status("user-001", "gen-nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_update_tts_status(self):
        """update_tts_status が DB のステータスを更新する"""
        from app.tts.service import update_tts_status

        generation_id = "gen-001"

        with patch("app.tts.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            await update_tts_status(
                generation_id=generation_id,
                status="completed",
                audio_url="https://example.com/audio.mp3",
                duration_seconds=3.5,
            )

        mock_supabase.table.return_value.update.assert_called_once()
        call_args = mock_supabase.table.return_value.update.call_args
        update_data = call_args[0][0]
        assert update_data["status"] == "completed"
        assert update_data["audio_url"] == "https://example.com/audio.mp3"
        assert update_data["duration_seconds"] == 3.5
