"""
HailuoAI (MiniMax) Provider のユニットテスト
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.external.hailuo_provider import (
    HailuoProvider,
    HAILUO_CAMERA_MAPPING,
)
from app.external.video_provider import VideoGenerationStatus


class TestCameraControlMapping:
    """カメラ制御マッピングのテスト"""

    def test_push_in_mapping(self):
        """push_inのマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["push_in"] == "[Push in]"

    def test_pull_out_mapping(self):
        """pull_outのマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["pull_out"] == "[Pull out]"

    def test_pan_left_mapping(self):
        """pan_leftのマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["pan_left"] == "[Pan left]"

    def test_zoom_in_mapping(self):
        """zoom_inのマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["zoom_in"] == "[Zoom in]"

    def test_static_shot_mapping(self):
        """static_shotのマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["static_shot"] == "[Static shot]"

    def test_tracking_shot_mapping(self):
        """tracking_shotのマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["tracking_shot"] == "[Tracking shot]"

    def test_arc_left_composite_mapping(self):
        """arc_left（複合コマンド）のマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["arc_left"] == "[Truck left, Pan right]"

    def test_crane_up_composite_mapping(self):
        """crane_up（複合コマンド）のマッピングを確認"""
        assert HAILUO_CAMERA_MAPPING["crane_up"] == "[Pedestal up, Tilt down]"

    def test_all_mappings_are_valid_format(self):
        """全マッピングが有効な[command]形式であることを確認"""
        for name, command in HAILUO_CAMERA_MAPPING.items():
            assert command.startswith("["), f"{name} should start with '['"
            assert command.endswith("]"), f"{name} should end with ']'"


class TestHailuoProvider:
    """HailuoProvider のテスト"""

    @pytest.fixture
    def mock_settings(self):
        """設定をモック"""
        with patch("app.external.hailuo_provider.settings") as mock:
            mock.HAILUO_API_KEY = "test_api_key"
            mock.HAILUO_MODEL = "MiniMax-Hailuo-02"
            mock.HAILUO_PROMPT_OPTIMIZER = False
            yield mock

    @pytest.fixture
    def provider(self, mock_settings):
        """プロバイダーインスタンスを作成"""
        return HailuoProvider()

    def test_provider_name(self, provider):
        """プロバイダー名を確認"""
        assert provider.provider_name == "hailuo"

    def test_supports_v2v(self, provider):
        """V2Vサポートを確認（First/Last Frame方式）"""
        assert provider.supports_v2v is True

    def test_init_without_api_key_raises_error(self):
        """APIキーなしで初期化するとエラー"""
        with patch("app.external.hailuo_provider.settings") as mock:
            mock.HAILUO_API_KEY = None
            with pytest.raises(ValueError, match="HAILUO_API_KEY must be configured"):
                HailuoProvider()

    def test_get_headers(self, provider):
        """認証ヘッダーを確認（Bearer Token形式）"""
        headers = provider._get_headers()
        assert headers["Authorization"] == "Bearer test_api_key"
        assert headers["Content-Type"] == "application/json"

    @pytest.mark.asyncio
    async def test_generate_video_success(self, provider):
        """動画生成成功のテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            task_id = await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                aspect_ratio="9:16",
            )

            assert task_id == "test_task_123"

    @pytest.mark.asyncio
    async def test_generate_video_with_camera_work(self, provider):
        """カメラワーク付き動画生成のテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_456",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            task_id = await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                aspect_ratio="9:16",
                camera_work="zoom_in",
            )

            assert task_id == "test_task_456"
            # POSTが呼ばれたことを確認
            mock_instance.post.assert_called_once()
            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            # プロンプトにカメラコマンドが追加されていることを確認
            assert "[Zoom in]" in request_body["prompt"]

    @pytest.mark.asyncio
    async def test_generate_video_with_last_frame(self, provider):
        """Last Frame付き動画生成のテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_789",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            task_id = await provider.generate_video(
                image_url="https://example.com/first.jpg",
                prompt="Test prompt",
                last_frame_image_url="https://example.com/last.jpg",
            )

            assert task_id == "test_task_789"
            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            assert request_body["last_frame_image"] == "https://example.com/last.jpg"

    @pytest.mark.asyncio
    async def test_generate_video_duration_conversion_5_to_6(self, provider):
        """5秒→6秒への変換テスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                duration=5,
            )

            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            assert request_body["duration"] == 6

    @pytest.mark.asyncio
    async def test_generate_video_duration_conversion_8_to_10(self, provider):
        """8秒→10秒への変換テスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                duration=8,
            )

            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            assert request_body["duration"] == 10

    @pytest.mark.asyncio
    async def test_generate_video_truncates_long_prompt(self, provider):
        """長いプロンプトが2000文字に切り詰められることを確認"""
        long_prompt = "a" * 3000  # 2000文字を超える

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_789",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt=long_prompt,
            )

            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            assert len(request_body["prompt"]) == 2000

    @pytest.mark.asyncio
    async def test_check_status_completed(self, provider):
        """完了ステータスのテスト（file_id + files/retrieve方式）"""
        # ステータス確認レスポンス（file_idを返す）
        mock_status_response = MagicMock()
        mock_status_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Success",
            "file_id": 12345678,
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_status_response.raise_for_status = MagicMock()

        # ファイル取得レスポンス（download_urlを返す）
        mock_file_response = MagicMock()
        mock_file_response.json.return_value = {
            "file": {
                "file_id": 12345678,
                "download_url": "https://cdn.hailuoai.com/video.mp4",
            },
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_file_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.get = AsyncMock(
                side_effect=[mock_status_response, mock_file_response]
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.COMPLETED
            assert status.video_url == "https://cdn.hailuoai.com/video.mp4"
            assert status.progress == 100

    @pytest.mark.asyncio
    async def test_check_status_processing(self, provider):
        """処理中ステータスのテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Processing",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.PROCESSING
            assert status.progress == 50
            assert status.video_url is None

    @pytest.mark.asyncio
    async def test_check_status_pending(self, provider):
        """待機中ステータスのテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Pending",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.PENDING
            assert status.progress == 10

    @pytest.mark.asyncio
    async def test_check_status_queueing(self, provider):
        """キュー待ちステータスのテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Queueing",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.PENDING
            assert status.progress == 10

    @pytest.mark.asyncio
    async def test_check_status_failed(self, provider):
        """失敗ステータスのテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Failed",
            "base_resp": {"status_code": 1026, "status_msg": "Content policy violation"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.FAILED
            assert "Content policy violation" in status.error_message

    @pytest.mark.asyncio
    async def test_check_status_case_insensitive(self, provider):
        """ステータスの大文字・小文字を区別しないことを確認"""
        mock_status_response = MagicMock()
        mock_status_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "SUCCESS",  # 全大文字
            "file_id": 12345678,
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_status_response.raise_for_status = MagicMock()

        mock_file_response = MagicMock()
        mock_file_response.json.return_value = {
            "file": {"download_url": "https://cdn.hailuoai.com/video.mp4"},
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_file_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.get = AsyncMock(
                side_effect=[mock_status_response, mock_file_response]
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_get_video_url(self, provider):
        """get_video_urlのテスト"""
        mock_status_response = MagicMock()
        mock_status_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Success",
            "file_id": 12345678,
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_status_response.raise_for_status = MagicMock()

        mock_file_response = MagicMock()
        mock_file_response.json.return_value = {
            "file": {"download_url": "https://cdn.hailuoai.com/video.mp4"},
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_file_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.get = AsyncMock(
                side_effect=[mock_status_response, mock_file_response]
            )

            url = await provider.get_video_url("test_task_123")

            assert url == "https://cdn.hailuoai.com/video.mp4"

    @pytest.mark.asyncio
    async def test_extend_video_raises_not_implemented(self, provider):
        """extend_videoがNotImplementedErrorを発生させることを確認"""
        with pytest.raises(NotImplementedError) as exc_info:
            await provider.extend_video(
                video_url="https://example.com/video.mp4",
                prompt="Continue the scene",
            )

        assert "pre-extracted last frame" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_download_video_bytes_success(self, provider):
        """動画ダウンロード成功のテスト"""
        # 1. ステータス確認レスポンス
        mock_status_response = MagicMock()
        mock_status_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Success",
            "file_id": 12345678,
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_status_response.raise_for_status = MagicMock()

        # 2. ファイルURL取得レスポンス
        mock_file_response = MagicMock()
        mock_file_response.json.return_value = {
            "file": {"download_url": "https://cdn.hailuoai.com/video.mp4"},
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_file_response.raise_for_status = MagicMock()

        # 3. 動画ダウンロードレスポンス
        mock_download_response = MagicMock()
        mock_download_response.content = b"fake_video_content"
        mock_download_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.get = AsyncMock(
                side_effect=[mock_status_response, mock_file_response, mock_download_response]
            )

            content = await provider.download_video_bytes("test_task_123")

            assert content == b"fake_video_content"

    @pytest.mark.asyncio
    async def test_download_video_bytes_not_completed(self, provider):
        """未完了時のダウンロードはNoneを返す"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "status": "Processing",
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            content = await provider.download_video_bytes("test_task_123")

            assert content is None


class TestVideoProviderFactory:
    """get_video_provider ファクトリー関数のテスト"""

    def test_hailuo_provider_registration(self):
        """hailuoがファクトリーに登録されていることを確認"""
        with patch("app.external.hailuo_provider.settings") as mock_settings:
            mock_settings.HAILUO_API_KEY = "test_key"
            mock_settings.HAILUO_MODEL = "MiniMax-Hailuo-02"
            mock_settings.HAILUO_PROMPT_OPTIMIZER = False

            from app.external.video_provider import get_video_provider

            provider = get_video_provider("hailuo")

            assert provider.provider_name == "hailuo"
            assert isinstance(provider, HailuoProvider)
