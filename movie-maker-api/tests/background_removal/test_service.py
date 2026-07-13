"""
背景削除サービスのテスト
"""
import pytest
from unittest.mock import patch, MagicMock


class TestBackgroundRemovalService:
    """背景削除サービスのテスト"""

    @pytest.mark.asyncio
    async def test_create_background_removal_video(self):
        """create_background_removal が動画ソースのレコードを作成して返す"""
        from app.background_removal.service import create_background_removal

        user_id = "user-001"
        source_url = "https://example.com/video.mp4"

        mock_record = {
            "id": "gen-bg-001",
            "user_id": user_id,
            "source_type": "video",
            "source_url": source_url,
            "output_format": "webm",
            "provider": "fal",
            "model_id": "bria/video/background-removal/v3",
            "status": "pending",
            "progress": 0,
            "output_url": None,
            "error_message": None,
            "created_at": "2026-06-12T00:00:00Z",
            "updated_at": "2026-06-12T00:00:00Z",
        }

        with patch("app.background_removal.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
                mock_record
            ]
            mock_get_supabase.return_value = mock_supabase

            result = await create_background_removal(
                user_id=user_id,
                source_type="video",
                source_url=source_url,
                output_format="webm",
            )

        assert result["id"] == "gen-bg-001"
        assert result["status"] == "pending"
        assert result["source_type"] == "video"
        assert result["output_format"] == "webm"

        # insert に渡されたデータを検証
        insert_call = mock_supabase.table.return_value.insert.call_args
        inserted_data = insert_call.args[0]
        assert inserted_data["provider"] == "fal"
        assert inserted_data["output_format"] == "webm"
        assert inserted_data["model_id"] == "bria/video/background-removal/v3"

    @pytest.mark.asyncio
    async def test_create_background_removal_image_forces_png(self):
        """画像ソースの場合は output_format が png に強制される"""
        from app.background_removal.service import create_background_removal

        mock_record = {
            "id": "gen-bg-002",
            "user_id": "user-001",
            "source_type": "image",
            "source_url": "https://example.com/image.jpg",
            "output_format": "png",
            "provider": "fal",
            "model_id": "fal-ai/bria/background/remove",
            "status": "pending",
            "progress": 0,
            "output_url": None,
            "error_message": None,
            "created_at": "2026-06-12T00:00:00Z",
            "updated_at": "2026-06-12T00:00:00Z",
        }

        with patch("app.background_removal.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
                mock_record
            ]
            mock_get_supabase.return_value = mock_supabase

            result = await create_background_removal(
                user_id="user-001",
                source_type="image",
                source_url="https://example.com/image.jpg",
                output_format="webm",  # 指定しても png に強制される
            )

        insert_call = mock_supabase.table.return_value.insert.call_args
        inserted_data = insert_call.args[0]
        assert inserted_data["output_format"] == "png"
        assert inserted_data["model_id"] == "fal-ai/bria/background/remove"
        assert result["output_format"] == "png"

    @pytest.mark.asyncio
    async def test_get_background_removal_status(self):
        """get_background_removal_status が DB からステータスを返す"""
        from app.background_removal.service import get_background_removal_status

        user_id = "user-001"
        generation_id = "gen-bg-001"

        mock_record = {
            "id": generation_id,
            "status": "completed",
            "progress": 100,
            "output_url": "https://r2.example.com/bg-removal/output.webm",
            "error_message": None,
        }

        with patch("app.background_removal.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = mock_record
            mock_get_supabase.return_value = mock_supabase

            result = await get_background_removal_status(user_id, generation_id)

        assert result is not None
        assert result["id"] == generation_id
        assert result["status"] == "completed"
        assert result["output_url"] == "https://r2.example.com/bg-removal/output.webm"

        # id / user_id フィルタが実際に適用されていることを検証
        mock_select = mock_supabase.table.return_value.select.return_value
        mock_select.eq.assert_called_once_with("id", generation_id)
        mock_select.eq.return_value.eq.assert_called_once_with("user_id", user_id)

    @pytest.mark.asyncio
    async def test_get_background_removal_status_not_found_returns_none(self):
        """存在しないレコードは None を返す"""
        from app.background_removal.service import get_background_removal_status

        with patch("app.background_removal.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
            mock_get_supabase.return_value = mock_supabase

            result = await get_background_removal_status("user-001", "gen-nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_list_background_removals(self):
        """list_background_removals がユーザーのジョブ一覧を返す"""
        from app.background_removal.service import list_background_removals

        user_id = "user-001"

        mock_records = [
            {
                "id": "gen-bg-001",
                "status": "completed",
                "progress": 100,
                "source_type": "video",
                "output_format": "webm",
                "output_url": "https://r2.example.com/bg-removal/output1.webm",
                "created_at": "2026-06-12T00:00:00Z",
            },
            {
                "id": "gen-bg-002",
                "status": "pending",
                "progress": 0,
                "source_type": "image",
                "output_format": "png",
                "output_url": None,
                "created_at": "2026-06-11T00:00:00Z",
            },
        ]

        with patch("app.background_removal.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_execute = mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value
            mock_execute.data = mock_records
            mock_execute.count = 2
            mock_get_supabase.return_value = mock_supabase

            result = await list_background_removals(user_id, page=1, per_page=20)

        assert result["total"] == 2
        assert result["page"] == 1
        assert result["per_page"] == 20
        assert len(result["items"]) == 2
        assert result["items"][0]["id"] == "gen-bg-001"
        assert result["items"][1]["id"] == "gen-bg-002"

        # user_id フィルタが実際に適用されていることを検証
        mock_supabase.table.return_value.select.return_value.eq.assert_called_once_with(
            "user_id", user_id
        )

    @pytest.mark.asyncio
    async def test_update_background_removal_status(self):
        """update_background_removal_status が DB のステータスを更新する"""
        from app.background_removal.service import update_background_removal_status

        generation_id = "gen-bg-001"

        with patch("app.background_removal.service.get_supabase") as mock_get_supabase:
            mock_supabase = MagicMock()
            mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_get_supabase.return_value = mock_supabase

            await update_background_removal_status(
                generation_id=generation_id,
                status="completed",
                progress=100,
                output_url="https://r2.example.com/bg-removal/output.webm",
            )

        mock_supabase.table.return_value.update.assert_called_once()
        call_args = mock_supabase.table.return_value.update.call_args
        update_data = call_args[0][0]
        assert update_data["status"] == "completed"
        assert update_data["progress"] == 100
        assert update_data["output_url"] == "https://r2.example.com/bg-removal/output.webm"
