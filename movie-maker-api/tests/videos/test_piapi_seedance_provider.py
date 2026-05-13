"""
PiAPISeedanceProvider ユニットテスト

実 API コールなし。httpx.AsyncClient をモックして全テストケースを実行する。
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.external.piapi_seedance_provider import PiAPISeedanceProvider
from app.external.video_provider import VideoGenerationStatus, VideoStatus


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def provider(monkeypatch):
    """PIAPI_API_KEY をモックした PiAPISeedanceProvider インスタンス"""
    monkeypatch.setattr("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE="seedance-2-preview-vip",
        PIAPI_SEEDANCE_RESOLUTION="720p",
    ))
    return PiAPISeedanceProvider()


def _make_mock_response(json_data: dict, status_code: int = 200):
    """httpx レスポンスのモックを作成するヘルパー"""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data
    mock_response.raise_for_status = MagicMock()
    return mock_response


# ---------------------------------------------------------------------------
# T2-6 テストケース 1: test_generate_video_success
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_video_success(provider):
    """
    generate_video() が正常に task_id を返すことを確認する。
    - POST /api/v1/task → {"data": {"task_id": "seed_123"}}
    - 戻り値が "seed_123" であること
    - request body に `audio` フィールドが含まれないこと
    """
    mock_response = _make_mock_response({"data": {"task_id": "seed_123"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="test prompt",
            duration=5,
            aspect_ratio="9:16",
        )

    assert task_id == "seed_123"
    # audio フィールドが含まれないことを確認
    assert "audio" not in captured_payload
    assert "audio" not in captured_payload.get("input", {})


# ---------------------------------------------------------------------------
# T2-6 テストケース 2: test_check_status_completed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_status_completed(provider):
    """
    check_status() が Completed ステータスを正しく返すことを確認する。
    - GET /api/v1/task/seed_123 → Completed + video URL
    - VideoStatus.status == COMPLETED
    - VideoStatus.progress == 100
    - VideoStatus.video_url == "https://mp4.example/out.mp4"
    """
    mock_response = _make_mock_response({
        "data": {
            "status": "Completed",
            "output": {"video": "https://mp4.example/out.mp4"},
        }
    })

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        status = await provider.check_status("seed_123")

    assert status.status == VideoGenerationStatus.COMPLETED
    assert status.progress == 100
    assert status.video_url == "https://mp4.example/out.mp4"


# ---------------------------------------------------------------------------
# 回帰防止: PiAPI の実 API は lowercase ステータスを返す
# 実 E2E (T2-8) で発覚: 公式ドキュメントには Title case と書いてあるが
# 実 API レスポンスは "pending"/"processing"/"completed"/"failed"。
# 大文字小文字どちらでも動くように Title case 正規化を行う。
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize("raw_status,expected", [
    ("pending", VideoGenerationStatus.PENDING),
    ("processing", VideoGenerationStatus.PROCESSING),
    ("completed", VideoGenerationStatus.COMPLETED),
    ("failed", VideoGenerationStatus.FAILED),
    ("staged", VideoGenerationStatus.PENDING),
])
async def test_check_status_handles_lowercase_status(provider, raw_status, expected):
    """PiAPI 実 API の lowercase ステータスでも正しくマップされること"""
    payload = {"data": {"status": raw_status, "output": {"video": "https://mp4.example/out.mp4"}}}
    if raw_status == "failed":
        payload["data"]["error"] = {"message": "insufficient_credit"}
    mock_response = _make_mock_response(payload)

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        status = await provider.check_status("seed_lc")

    assert status.status == expected, f"raw='{raw_status}' should map to {expected}"


# ---------------------------------------------------------------------------
# T2-6 テストケース 3: test_check_status_failed_credit
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_status_failed_credit(provider):
    """
    クレジット不足エラーが日本語メッセージに変換されることを確認する。
    - GET → Failed + error.message "insufficient credit balance"
    - VideoStatus.status == FAILED
    - error_message に "クレジット" が含まれること
    """
    mock_response = _make_mock_response({
        "data": {
            "status": "Failed",
            "error": {"message": "insufficient credit balance"},
        }
    })

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        status = await provider.check_status("seed_123")

    assert status.status == VideoGenerationStatus.FAILED
    assert "クレジット" in status.error_message


# ---------------------------------------------------------------------------
# T2-6 テストケース 4: test_duration_clamping
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_duration_clamping(provider):
    """
    duration のクランプが正しく動作することを確認する。
    - duration=7 → payload の input.duration が 5
    - duration=12 → payload の input.duration が 10
    """
    mock_response = _make_mock_response({"data": {"task_id": "seed_clamp"}})

    for input_duration, expected_duration in [(7, 5), (12, 10), (4, 5), (20, 15)]:
        captured_payload = {}

        async def fake_post(url, headers, json, timeout, _exp=expected_duration):
            captured_payload.update(json)
            return mock_response

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=fake_post)

        with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
            await provider.generate_video(
                image_url="https://example.com/img.png",
                prompt="clamp test",
                duration=input_duration,
                aspect_ratio="9:16",
            )

        actual_duration = captured_payload.get("input", {}).get("duration")
        assert actual_duration == expected_duration, (
            f"duration={input_duration} should clamp to {expected_duration}, got {actual_duration}"
        )


# ---------------------------------------------------------------------------
# T2-6 テストケース 5: test_camera_work_ignored
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_camera_work_ignored(provider):
    """
    camera_work 引数を渡しても request body に camera_control が含まれないことを確認する。
    Seedance はAPIレベルのカメラ制御なし。
    """
    mock_response = _make_mock_response({"data": {"task_id": "seed_cam"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="camera test",
            duration=5,
            aspect_ratio="9:16",
            camera_work="zoom_in",
        )

    assert "camera_control" not in captured_payload
    assert "camera_control" not in captured_payload.get("input", {})


# ---------------------------------------------------------------------------
# Additional: get_video_provider("seedance") returns PiAPISeedanceProvider
# ---------------------------------------------------------------------------

def test_get_video_provider_seedance(monkeypatch):
    """
    get_video_provider("seedance") が PiAPISeedanceProvider を返すことを確認する。
    """
    monkeypatch.setattr("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE="seedance-2-preview-vip",
        PIAPI_SEEDANCE_RESOLUTION="720p",
    ))
    # get_video_provider() imports settings from app.core.config at call time
    with patch("app.core.config.settings", MagicMock(
        GATEWAY_ENABLED=False,
        VIDEO_PROVIDER="runway",
    )):
        from app.external.video_provider import get_video_provider
        p = get_video_provider("seedance")
        assert type(p).__name__ == "PiAPISeedanceProvider"
        assert p.provider_name == "seedance"
        assert p.supports_t2v is True


# ---------------------------------------------------------------------------
# B2: test_resolution_omitted_for_standard_tier
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resolution_omitted_for_standard_tier(monkeypatch):
    """
    standard tier (non-VIP) では request body の input に resolution が含まれないことを確認する。
    PiAPI は standard タスクに resolution フィールドを受け付けない。
    """
    monkeypatch.setattr("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE="seedance-2-preview",
        PIAPI_SEEDANCE_RESOLUTION="720p",
    ))
    provider = PiAPISeedanceProvider()

    mock_response = _make_mock_response({"data": {"task_id": "seed_std_001"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="standard tier test",
            duration=5,
            aspect_ratio="9:16",
        )

    assert task_id == "seed_std_001"
    assert "resolution" not in captured_payload.get("input", {}), (
        "resolution must not be sent for standard (non-VIP) task_type"
    )
