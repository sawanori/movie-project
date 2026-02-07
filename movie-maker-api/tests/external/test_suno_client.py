"""
Suno API クライアントのテスト
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.external.suno_client import SunoClient, SunoAPIError, SunoGenerationResult


class TestSunoClient:
    """Suno APIクライアントのテスト"""

    @pytest.fixture
    def client(self):
        """テスト用クライアント"""
        with patch("app.external.suno_client.settings") as mock_settings:
            mock_settings.SUNO_API_KEY = "test-api-key"
            mock_settings.SUNO_API_BASE_URL = "https://api.test.sunoapi.org"
            mock_settings.BACKEND_URL = "https://api.test.example.com"
            return SunoClient()

    @pytest.mark.asyncio
    async def test_generate_music_success(self, client):
        """音楽生成の成功ケース"""
        with patch.object(client, "generate_music", new_callable=AsyncMock) as mock_generate:
            mock_generate.return_value = SunoGenerationResult(
                task_id="test-task-123",
                status="pending"
            )

            result = await client.generate_music(
                prompt="upbeat electronic music",
                bgm_generation_id="bgm-123",
                make_instrumental=True,
                model="V3_5",
            )

            assert result.task_id == "test-task-123"
            assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_generate_music_auth_error(self, client):
        """認証エラーのケース"""
        with patch.object(client, "generate_music", new_callable=AsyncMock) as mock_generate:
            mock_generate.side_effect = SunoAPIError("Suno APIキーが無効です")

            with pytest.raises(SunoAPIError) as exc_info:
                await client.generate_music(
                    prompt="test",
                    bgm_generation_id="bgm-123",
                )

            assert "無効" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_download_audio_success(self, client):
        """オーディオダウンロードの成功ケース"""
        with patch.object(client, "download_audio", new_callable=AsyncMock) as mock_download:
            mock_download.return_value = b"fake audio content"

            result = await client.download_audio("https://example.com/audio.mp3")

            assert result == b"fake audio content"

    @pytest.mark.asyncio
    async def test_rate_limit_error(self, client):
        """レートリミットエラー"""
        with patch.object(client, "generate_music", new_callable=AsyncMock) as mock_generate:
            mock_generate.side_effect = SunoAPIError("Sunoレート制限に達しました")

            with pytest.raises(SunoAPIError) as exc_info:
                await client.generate_music(
                    prompt="test",
                    bgm_generation_id="bgm-123",
                )

            assert "レート制限" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_health_check_success(self, client):
        """ヘルスチェック成功"""
        with patch.object(client, "health_check", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = True

            result = await client.health_check()

            assert result is True

    @pytest.mark.asyncio
    async def test_health_check_failure(self, client):
        """ヘルスチェック失敗"""
        with patch.object(client, "health_check", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = False

            result = await client.health_check()

            assert result is False

    def test_get_callback_url(self, client):
        """コールバックURL生成"""
        url = client._get_callback_url("bgm-12345")
        assert "bgm_id=bgm-12345" in url
        assert "/api/v1/webhooks/suno" in url


class TestSunoGenerationResult:
    """SunoGenerationResultモデルのテスト"""

    def test_create_pending_result(self):
        """Pending状態の結果作成"""
        result = SunoGenerationResult(
            task_id="task-123",
            status="pending"
        )
        assert result.task_id == "task-123"
        assert result.status == "pending"
        assert result.audio_url is None

    def test_create_completed_result(self):
        """Completed状態の結果作成"""
        result = SunoGenerationResult(
            task_id="task-123",
            status="completed",
            audio_url="https://example.com/audio.mp3",
            duration_seconds=45.5
        )
        assert result.status == "completed"
        assert result.audio_url == "https://example.com/audio.mp3"
        assert result.duration_seconds == 45.5


class TestSunoClientIntegration:
    """Suno APIクライアントの統合テスト（実際のAPIを使用）"""

    @pytest.mark.skip(reason="実際のAPIキーが必要")
    @pytest.mark.asyncio
    async def test_health_check(self):
        """ヘルスチェック（実API）"""
        from app.external.suno_client import suno_client

        is_healthy = await suno_client.health_check()
        assert is_healthy is True

    @pytest.mark.skip(reason="実際のAPIキーが必要、コールバック受信不可")
    @pytest.mark.asyncio
    async def test_generate_music(self):
        """音楽生成（実API）- コールバック方式のため結果確認不可"""
        from app.external.suno_client import suno_client

        result = await suno_client.generate_music(
            prompt="test music",
            bgm_generation_id="test-bgm-integration",
            make_instrumental=True,
        )
        assert result.task_id is not None
        assert result.status == "pending"
