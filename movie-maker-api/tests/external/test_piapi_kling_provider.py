"""
PiAPI Kling Provider のユニットテスト
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.external.piapi_kling_provider import (
    PiAPIKlingProvider,
    _get_camera_control,
    _make_camera_control,
    CAMERA_CONTROL_MAPPING,
)
from app.external.video_provider import VideoGenerationStatus


class TestCameraControlMapping:
    """カメラ制御マッピングのテスト"""

    def test_zoom_in(self):
        """zoom_inのマッピングを確認"""
        result = _get_camera_control("zoom_in")
        assert result is not None
        assert result["type"] == "simple"
        assert result["config"]["zoom"] == 5
        assert result["config"]["horizontal"] == 0

    def test_pan_left(self):
        """pan_leftのマッピングを確認"""
        result = _get_camera_control("pan_left")
        assert result is not None
        assert result["type"] == "simple"
        assert result["config"]["pan"] == -5

    def test_dolly_in(self):
        """dolly_inのマッピングを確認"""
        result = _get_camera_control("dolly_in")
        assert result is not None
        assert result["config"]["vertical"] == 5

    def test_static_shot_returns_none(self):
        """static_shotはNoneを返す"""
        result = _get_camera_control("static_shot")
        assert result is None

    def test_unknown_camera_work(self):
        """未知のカメラワークはNoneを返す"""
        result = _get_camera_control("unknown_camera")
        assert result is None

    def test_none_camera_work(self):
        """Noneが渡された場合はNoneを返す"""
        result = _get_camera_control(None)
        assert result is None

    def test_make_camera_control_helper(self):
        """ヘルパー関数のテスト"""
        result = _make_camera_control(horizontal=5, zoom=3)
        assert result["type"] == "simple"
        assert result["config"]["horizontal"] == 5
        assert result["config"]["zoom"] == 3
        assert result["config"]["vertical"] == 0
        assert result["config"]["pan"] == 0
        assert result["config"]["tilt"] == 0
        assert result["config"]["roll"] == 0

    def test_all_camera_mappings_have_valid_structure(self):
        """全カメラマッピングが有効な構造を持つ"""
        for name, control in CAMERA_CONTROL_MAPPING.items():
            if control is None:
                continue  # static_shot等のNoneは許可
            assert "type" in control, f"{name} missing 'type'"
            assert control["type"] == "simple", f"{name} has wrong type"
            assert "config" in control, f"{name} missing 'config'"
            config = control["config"]
            required_keys = ["horizontal", "vertical", "pan", "tilt", "roll", "zoom"]
            for key in required_keys:
                assert key in config, f"{name} missing config key '{key}'"


class TestPiAPIKlingProvider:
    """PiAPIKlingProvider のテスト"""

    @pytest.fixture
    def mock_settings(self):
        """設定をモック"""
        with patch('app.external.piapi_kling_provider.settings') as mock:
            mock.PIAPI_API_KEY = "test_api_key"
            mock.PIAPI_KLING_VERSION = "2.6"
            mock.PIAPI_KLING_MODE = "std"
            yield mock

    @pytest.fixture
    def provider(self, mock_settings):
        """プロバイダーインスタンスを作成"""
        return PiAPIKlingProvider()

    def test_provider_name(self, provider):
        """プロバイダー名を確認"""
        assert provider.provider_name == "piapi_kling"

    def test_supports_v2v(self, provider):
        """V2Vサポートを確認"""
        assert provider.supports_v2v is True

    def test_init_without_api_key_raises_error(self):
        """APIキーなしで初期化するとエラー"""
        with patch('app.external.piapi_kling_provider.settings') as mock:
            mock.PIAPI_API_KEY = None
            with pytest.raises(ValueError, match="PIAPI_API_KEY must be configured"):
                PiAPIKlingProvider()

    def test_get_headers(self, provider):
        """認証ヘッダーを確認"""
        headers = provider._get_headers()
        assert headers["x-api-key"] == "test_api_key"
        assert headers["Content-Type"] == "application/json"

    @pytest.mark.asyncio
    async def test_generate_video_success(self, provider):
        """動画生成成功のテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {"task_id": "test_task_123"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
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
            "code": 200,
            "data": {"task_id": "test_task_456"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
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
            assert "camera_control" in request_body["input"]
            assert request_body["input"]["camera_control"]["config"]["zoom"] == 5

    @pytest.mark.asyncio
    async def test_generate_video_with_custom_camera_control(self, provider):
        """カスタムカメラ制御dict付き動画生成のテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {"task_id": "test_task_custom_camera"}
        }
        mock_response.raise_for_status = MagicMock()

        custom_control = {
            "horizontal": 3,
            "vertical": 2,
            "pan": 1,
            "tilt": 0,
            "roll": 0,
            "zoom": 4,
        }

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            task_id = await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                aspect_ratio="9:16",
                camera_control=custom_control,
            )

            assert task_id == "test_task_custom_camera"
            # POSTが呼ばれたことを確認
            mock_instance.post.assert_called_once()
            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]

            # camera_controlが正しく設定されていることを確認
            assert "camera_control" in request_body["input"]
            assert request_body["input"]["camera_control"]["type"] == "simple"
            assert request_body["input"]["camera_control"]["config"] == custom_control

    @pytest.mark.asyncio
    async def test_camera_control_priority_over_camera_work(self, provider):
        """camera_control が camera_work より優先されることを確認"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {"task_id": "test_task_priority"}
        }
        mock_response.raise_for_status = MagicMock()

        custom_control = {
            "horizontal": 10,
            "vertical": 10,
            "pan": 10,
            "tilt": 10,
            "roll": 10,
            "zoom": 10,
        }

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            task_id = await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                camera_work="zoom_in",  # これは無視される
                camera_control=custom_control,  # これが優先される
            )

            assert task_id == "test_task_priority"
            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]

            # camera_controlがcustom_controlになっていることを確認
            assert request_body["input"]["camera_control"]["config"] == custom_control
            # zoom_inのマッピング（zoom=5）ではないことを確認
            assert request_body["input"]["camera_control"]["config"]["zoom"] == 10

    @pytest.mark.asyncio
    async def test_generate_video_truncates_long_prompt(self, provider):
        """長いプロンプトが切り詰められることを確認"""
        long_prompt = "a" * 3000  # 2500文字を超える

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {"task_id": "test_task_789"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt=long_prompt,
            )

            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            assert len(request_body["input"]["prompt"]) == 2500

    @pytest.mark.asyncio
    async def test_check_status_completed(self, provider):
        """完了ステータスのテスト（小文字 - 実際のAPIレスポンス）"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "completed",  # 実際のAPIは小文字で返す
                "output": {"video_url": "https://example.com/video.mp4"}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.COMPLETED
            assert status.video_url == "https://example.com/video.mp4"
            assert status.progress == 100

    @pytest.mark.asyncio
    async def test_check_status_processing(self, provider):
        """処理中ステータスのテスト（小文字 - 実際のAPIレスポンス）"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "processing",  # 実際のAPIは小文字で返す
                "output": {}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.PROCESSING
            assert status.progress == 50
            assert status.video_url is None

    @pytest.mark.asyncio
    async def test_check_status_failed(self, provider):
        """失敗ステータスのテスト（小文字 - 実際のAPIレスポンス）"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "failed",  # 実際のAPIは小文字で返す
                "error": {"message": "Generation failed due to content policy"}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.FAILED
            # 実装はコンテンツポリシー違反を日本語メッセージに変換
            assert "コンテンツポリシー" in status.error_message or "content" in status.error_message.lower()

    @pytest.mark.asyncio
    async def test_check_status_pending(self, provider):
        """待機中ステータスのテスト（小文字 - 実際のAPIレスポンス）"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "pending",  # 実際のAPIは小文字で返す
                "output": {}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.PENDING
            assert status.progress == 10

    @pytest.mark.asyncio
    async def test_check_status_staged(self, provider):
        """Staged（キュー待ち）ステータスのテスト（小文字 - 実際のAPIレスポンス）"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "staged",  # 実際のAPIは小文字で返す
                "output": {}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.PENDING
            assert status.progress == 10

    @pytest.mark.asyncio
    async def test_check_status_case_insensitive(self, provider):
        """ステータスの大文字・小文字を区別しないことを確認"""
        # 大文字でも正しく処理されることを確認
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "COMPLETED",  # 全大文字
                "output": {"video_url": "https://example.com/video.mp4"}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_get_video_url(self, provider):
        """get_video_urlのテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "completed",  # 実際のAPIは小文字で返す
                "output": {"video_url": "https://example.com/video.mp4"}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            url = await provider.get_video_url("test_task_123")

            assert url == "https://example.com/video.mp4"

    @pytest.mark.asyncio
    async def test_extend_video_success(self, provider):
        """動画延長成功のテスト"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {"task_id": "extend_task_123"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.post = AsyncMock(return_value=mock_response)

            task_id = await provider.extend_video(
                video_url="https://example.com/input.mp4",
                prompt="Continue the scene",
                aspect_ratio="16:9",
            )

            assert task_id == "extend_task_123"
            # aspect_ratioがリクエストに含まれていることを確認
            call_args = mock_instance.post.call_args
            request_body = call_args.kwargs["json"]
            assert request_body["input"]["aspect_ratio"] == "16:9"
            assert request_body["task_type"] == "extend_video"

    @pytest.mark.asyncio
    async def test_download_video_bytes_success(self, provider):
        """動画ダウンロード成功のテスト"""
        mock_status_response = MagicMock()
        mock_status_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "completed",  # 実際のAPIは小文字で返す
                "output": {"video_url": "https://example.com/video.mp4"}
            }
        }
        mock_status_response.raise_for_status = MagicMock()

        mock_download_response = MagicMock()
        mock_download_response.content = b"fake_video_content"
        mock_download_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = mock_client.return_value.__aenter__.return_value
            mock_instance.get = AsyncMock(
                side_effect=[mock_status_response, mock_download_response]
            )

            content = await provider.download_video_bytes("test_task_123")

            assert content == b"fake_video_content"

    @pytest.mark.asyncio
    async def test_download_video_bytes_not_completed(self, provider):
        """未完了時のダウンロードはNoneを返す"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "processing",  # 実際のAPIは小文字で返す
                "output": {}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            content = await provider.download_video_bytes("test_task_123")

            assert content is None


class TestVideoProviderFactory:
    """get_video_provider ファクトリー関数のテスト"""

    def test_piapi_kling_provider_registration(self):
        """piapi_klingがファクトリーに登録されていることを確認"""
        with patch('app.external.piapi_kling_provider.settings') as mock_settings:
            mock_settings.PIAPI_API_KEY = "test_key"
            mock_settings.PIAPI_KLING_VERSION = "2.6"
            mock_settings.PIAPI_KLING_MODE = "std"

            from app.external.video_provider import get_video_provider
            provider = get_video_provider("piapi_kling")

            assert provider.provider_name == "piapi_kling"
            assert isinstance(provider, PiAPIKlingProvider)
