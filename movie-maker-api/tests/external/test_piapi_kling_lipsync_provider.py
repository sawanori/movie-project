"""
PiAPIKlingLipSyncProvider のユニットテスト
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


def _make_mock_client(*, post_response=None, get_response=None):
    """httpx.AsyncClient のコンテキストマネージャをモックするヘルパー"""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    if post_response is not None:
        mock_client.post = AsyncMock(return_value=post_response)
    if get_response is not None:
        mock_client.get = AsyncMock(return_value=get_response)
    return mock_client


class TestPiAPIKlingLipSyncProvider:
    """PiAPIKlingLipSyncProvider のテスト"""

    @pytest.fixture(autouse=True)
    def _set_piapi_api_key(self):
        """テスト中は PIAPI_API_KEY を擬似値に固定する
        （未設定だと __init__ がガードで ValueError を投げるため）
        """
        with patch("app.core.config.settings.PIAPI_API_KEY", "test-piapi-key"):
            yield

    def test_provider_name_returns_piapi_kling(self):
        """provider_name が 'piapi_kling' を返す"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()
        assert provider.provider_name == "piapi_kling"

    def test_factory_returns_provider(self):
        """get_lip_sync_provider('piapi_kling') が当プロバイダーを返す"""
        from app.external.lip_sync_provider import get_lip_sync_provider
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = get_lip_sync_provider("piapi_kling")
        assert isinstance(provider, PiAPIKlingLipSyncProvider)
        assert provider.provider_name == "piapi_kling"

    def test_init_raises_when_api_key_missing(self):
        """PIAPI_API_KEY 未設定時は __init__ で明確な ValueError を投げる"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        with patch("app.core.config.settings.PIAPI_API_KEY", ""):
            with pytest.raises(ValueError, match="PIAPI_API_KEY"):
                PiAPIKlingLipSyncProvider()

    @pytest.mark.asyncio
    async def test_generate_lip_sync_with_video_source(self):
        """動画ソースで lip_sync 生成を開始し、task_id を返す"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"data": {"task_id": "piapi-lip-001"}}

        mock_client = _make_mock_client(post_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            task_id = await provider.generate_lip_sync(
                source_url="https://example.com/video.mp4",
                audio_url="https://example.com/audio.mp3",
                source_type="video",
            )

        assert task_id == "piapi-lip-001"

        # POST の送信先と body を検証
        call = mock_client.post.call_args
        assert call.args[0] == "https://api.piapi.ai/api/v1/task"
        sent_body = call.kwargs["json"]
        assert sent_body["model"] == "kling"
        assert sent_body["task_type"] == "lip_sync"
        assert sent_body["input"]["video_url"] == "https://example.com/video.mp4"
        assert sent_body["input"]["local_dubbing_url"] == "https://example.com/audio.mp3"

        # x-api-key ヘッダーを検証
        assert call.kwargs["headers"]["x-api-key"] == "test-piapi-key"

    @pytest.mark.asyncio
    async def test_generate_lip_sync_with_image_source_raises(self):
        """静止画ソースは非対応のため ValueError を投げる"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        with pytest.raises(ValueError) as exc_info:
            await provider.generate_lip_sync(
                source_url="https://example.com/image.jpg",
                audio_url="https://example.com/audio.mp3",
                source_type="image",
            )

        message = str(exc_info.value)
        assert "動画" in message
        assert "静止画" in message

    @pytest.mark.asyncio
    async def test_generate_lip_sync_empty_source_raises(self):
        """空の source_url は ValueError を発生させる"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        with pytest.raises(ValueError, match="source_url"):
            await provider.generate_lip_sync(
                source_url="",
                audio_url="https://example.com/audio.mp3",
                source_type="video",
            )

    @pytest.mark.asyncio
    async def test_generate_lip_sync_http_error_raises(self):
        """HTTP エラー時は例外を送出する"""
        import httpx
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        error_response = MagicMock()
        error_response.status_code = 400
        error_response.text = "Bad Request"
        http_error = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=error_response
        )

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock(side_effect=http_error)

        mock_client = _make_mock_client(post_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception):
                await provider.generate_lip_sync(
                    source_url="https://example.com/video.mp4",
                    audio_url="https://example.com/audio.mp3",
                    source_type="video",
                )

    @pytest.mark.asyncio
    async def test_check_status_completed_extracts_video_url(self):
        """completed で video_url を抽出する"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "completed",
                "output": {"video_url": "https://cdn.piapi.ai/lip/out.mp4"},
            }
        }

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "completed"
        assert status.progress == 100
        assert status.video_url == "https://cdn.piapi.ai/lip/out.mp4"
        assert status.error_message is None

    @pytest.mark.asyncio
    async def test_check_status_completed_extracts_works_video_url(self):
        """completed で works[0].video.resource パターンの video_url を抽出する"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "completed",
                "output": {
                    "works": [
                        {"video": {"resource": "https://cdn.piapi.ai/lip/works.mp4"}}
                    ]
                },
            }
        }

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "completed"
        assert status.video_url == "https://cdn.piapi.ai/lip/works.mp4"

    @pytest.mark.asyncio
    async def test_check_status_processing(self):
        """processing を正しくマッピングする"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"data": {"status": "processing"}}

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "processing"
        assert status.progress == 50
        assert status.video_url is None

    @pytest.mark.asyncio
    async def test_check_status_pending_from_staged(self):
        """staged は pending にマッピングする"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"data": {"status": "staged"}}

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "pending"
        assert status.progress == 10

    @pytest.mark.asyncio
    async def test_check_status_unknown_falls_back_to_processing(self):
        """未知ステータスは processing にフォールバックする"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"data": {"status": "queued_unknown"}}

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "processing"

    @pytest.mark.asyncio
    async def test_check_status_failed_with_credit_error(self):
        """failed でクレジット不足エラーを日本語化する"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "failed",
                "error": {"message": "Insufficient credit balance for this task"},
            }
        }

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "failed"
        assert status.progress == 0
        assert status.error_message == "PiAPIのクレジットが不足しています。"

    @pytest.mark.asyncio
    async def test_check_status_failed_passes_through_unknown_error(self):
        """failed で未分類のエラーは原文を error_message に設定する"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "failed",
                "error": {"message": "Face not detected in source video"},
            }
        }

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "failed"
        assert status.error_message == "Face not detected in source video"

    @pytest.mark.asyncio
    async def test_check_status_http_error_returns_failed(self):
        """ステータス確認の HTTP エラーは failed として返す"""
        import httpx
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        error_response = MagicMock()
        error_response.status_code = 500
        http_error = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=error_response
        )

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock(side_effect=http_error)

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status("piapi-lip-001")

        assert status.status == "failed"
        assert status.progress == 0
        assert "500" in status.error_message

    @pytest.mark.asyncio
    async def test_get_video_url_returns_url_when_completed(self):
        """completed 時に get_video_url が URL を返す"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "status": "completed",
                "output": {"video_url": "https://cdn.piapi.ai/lip/out.mp4"},
            }
        }

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            url = await provider.get_video_url("piapi-lip-001")

        assert url == "https://cdn.piapi.ai/lip/out.mp4"

    @pytest.mark.asyncio
    async def test_get_video_url_returns_none_when_not_completed(self):
        """未完了時に get_video_url が None を返す"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        provider = PiAPIKlingLipSyncProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"data": {"status": "processing"}}

        mock_client = _make_mock_client(get_response=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            url = await provider.get_video_url("piapi-lip-001")

        assert url is None

    def test_humanize_error_maps_free_plan_message(self):
        """Free プラン制約エラーを分かりやすい日本語に変換する"""
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider

        raw = (
            'you are on the Free Plan (also known as the "Hobbyist Plan"), '
            "Free Plan users cannot create lip_sync task. "
            "Please upgrade your subscription plan as per pricing doc"
        )
        result = PiAPIKlingLipSyncProvider._humanize_error(raw)

        assert "Free" in result
        assert "アップグレード" in result
        assert raw != result
