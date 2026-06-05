"""
LipSync サービスのテスト
"""
import pytest
from unittest.mock import patch, MagicMock


class TestLipSyncService:
    """LipSync サービスのテスト"""

    @pytest.mark.asyncio
    async def test_create_lip_sync_generation(self):
        """create_lip_sync_generation が DB に生成レコードを作成して返す"""
        from app.lip_sync.service import create_lip_sync_generation

        user_id = "user-001"
        source_type = "image"
        source_url = "https://example.com/image.jpg"
        audio_url = "https://example.com/audio.mp3"

        mock_record = {
            "id": "gen-lip-001",
            "user_id": user_id,
            "source_type": source_type,
            "source_url": source_url,
            "audio_url": audio_url,
            "provider": "hedra",
            "status": "pending",
            "progress": 0,
            "output_video_url": None,
            "error_message": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.lip_sync.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [mock_record]
            mock_get_supabase.return_value = mock_supabase

            result = await create_lip_sync_generation(
                user_id=user_id,
                source_type=source_type,
                source_url=source_url,
                audio_url=audio_url,
            )

        assert result["id"] == "gen-lip-001"
        assert result["status"] == "pending"
        assert result["source_type"] == source_type
        assert result["source_url"] == source_url

    @pytest.mark.asyncio
    async def test_create_lip_sync_generation_uses_settings_provider_by_default(self):
        """provider 未指定時は settings.LIP_SYNC_PROVIDER が insert に使われる"""
        from app.lip_sync.service import create_lip_sync_generation

        mock_record = {
            "id": "gen-lip-001",
            "user_id": "user-001",
            "source_type": "video",
            "source_url": "https://example.com/video.mp4",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "piapi_kling",
            "status": "pending",
            "progress": 0,
            "output_video_url": None,
            "error_message": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.lip_sync.service.get_supabase") as mock_get_supabase, patch(
            "app.lip_sync.service.settings.LIP_SYNC_PROVIDER", "piapi_kling"
        ):
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
                mock_record
            ]
            mock_get_supabase.return_value = mock_supabase

            result = await create_lip_sync_generation(
                user_id="user-001",
                source_type="video",
                source_url="https://example.com/video.mp4",
                audio_url="https://example.com/audio.mp3",
            )

        # insert に渡った record_data の provider が設定値になっている
        insert_call = mock_supabase.table.return_value.insert.call_args
        inserted_data = insert_call.args[0]
        assert inserted_data["provider"] == "piapi_kling"
        assert result["provider"] == "piapi_kling"

    @pytest.mark.asyncio
    async def test_create_lip_sync_generation_explicit_provider_takes_priority(self):
        """provider を明示指定した場合はその値が使われる"""
        from app.lip_sync.service import create_lip_sync_generation

        mock_record = {
            "id": "gen-lip-002",
            "user_id": "user-001",
            "source_type": "video",
            "source_url": "https://example.com/video.mp4",
            "audio_url": "https://example.com/audio.mp3",
            "provider": "hedra",
            "status": "pending",
            "progress": 0,
            "output_video_url": None,
            "error_message": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }

        with patch("app.lip_sync.service.get_supabase") as mock_get_supabase, patch(
            "app.lip_sync.service.settings.LIP_SYNC_PROVIDER", "piapi_kling"
        ):
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
                mock_record
            ]
            mock_get_supabase.return_value = mock_supabase

            await create_lip_sync_generation(
                user_id="user-001",
                source_type="video",
                source_url="https://example.com/video.mp4",
                audio_url="https://example.com/audio.mp3",
                provider="hedra",
            )

        insert_call = mock_supabase.table.return_value.insert.call_args
        inserted_data = insert_call.args[0]
        assert inserted_data["provider"] == "hedra"

    @pytest.mark.asyncio
    async def test_get_lip_sync_status(self):
        """get_lip_sync_status が DB から生成レコードのステータスを返す"""
        from app.lip_sync.service import get_lip_sync_status

        user_id = "user-001"
        generation_id = "gen-lip-001"

        mock_record = {
            "id": generation_id,
            "status": "completed",
            "progress": 100,
            "output_video_url": "https://r2.example.com/output.mp4",
            "error_message": None,
        }

        with patch("app.lip_sync.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = mock_record
            mock_get_supabase.return_value = mock_supabase

            result = await get_lip_sync_status(user_id, generation_id)

        assert result is not None
        assert result["id"] == generation_id
        assert result["status"] == "completed"
        assert result["output_video_url"] == "https://r2.example.com/output.mp4"

    @pytest.mark.asyncio
    async def test_list_lip_sync_generations(self):
        """list_lip_sync_generations がユーザーの生成履歴を返す"""
        from app.lip_sync.service import list_lip_sync_generations

        user_id = "user-001"

        mock_records = [
            {
                "id": "gen-lip-001",
                "status": "completed",
                "progress": 100,
                "output_video_url": "https://r2.example.com/output1.mp4",
                "created_at": "2026-01-02T00:00:00Z",
            },
            {
                "id": "gen-lip-002",
                "status": "pending",
                "progress": 0,
                "output_video_url": None,
                "created_at": "2026-01-01T00:00:00Z",
            },
        ]

        with patch("app.lip_sync.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = mock_records
            mock_get_supabase.return_value = mock_supabase

            results = await list_lip_sync_generations(user_id)

        assert len(results) == 2
        assert results[0]["id"] == "gen-lip-001"
        assert results[1]["id"] == "gen-lip-002"

    @pytest.mark.asyncio
    async def test_update_lip_sync_status(self):
        """update_lip_sync_status が DB のステータスを更新する"""
        from app.lip_sync.service import update_lip_sync_status

        generation_id = "gen-lip-001"

        with patch("app.lip_sync.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            await update_lip_sync_status(
                generation_id=generation_id,
                status="completed",
                output_video_url="https://r2.example.com/output.mp4",
                progress=100,
            )

        mock_supabase.table.return_value.update.assert_called_once()
        call_args = mock_supabase.table.return_value.update.call_args
        update_data = call_args[0][0]
        assert update_data["status"] == "completed"
        assert update_data["output_video_url"] == "https://r2.example.com/output.mp4"
        assert update_data["progress"] == 100
