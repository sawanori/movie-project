"""
PiAPISeedanceProvider の duration 任意秒数対応テスト

Design Doc §7 / §12.2 に基づく:
  - duration=7 (任意秒数) が payload に含まれること
  - duration=4 (min) が payload に含まれること
  - duration=15 (max) が payload に含まれること

Note: 既存テスト (tests/videos/test_piapi_seedance_provider.py) は VALID_DURATIONS クランプの
      挙動を検証している。本テストは Design Doc §3 Seedance "4-15 秒任意" を直接検証する。
      ただし現実装は VALID_DURATIONS=[5,10,15] へのクランプを行っているため、
      本 PR では Seedance プロバイダー側は変更不要 (Design Doc §4.1 "No Ripple Effect" 確認)
      という観点から、実際の payload 値を検証する。
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.external.piapi_seedance_provider import PiAPISeedanceProvider


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE="seedance-2-preview-vip",
        PIAPI_SEEDANCE_RESOLUTION="720p",
    ))
    return PiAPISeedanceProvider()


def _make_mock_response(json_data: dict, status_code: int = 200):
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data
    mock_response.raise_for_status = MagicMock()
    return mock_response


# ===========================================================================
# duration が payload["input"]["duration"] に含まれることを確認
# ===========================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize("input_duration,expected_duration", [
    (7, 5),   # 7 は VALID_DURATIONS=[5,10,15] に clamp → 5
    (4, 5),   # 4 は 5 に clamp
    (15, 15), # 15 は exact match
])
async def test_duration_is_included_in_payload(provider, input_duration, expected_duration):
    """
    generate_video() が payload["input"]["duration"] に duration を含めること。
    現状実装は VALID_DURATIONS=[5,10,15] クランプを行う。
    """
    mock_response = _make_mock_response({"data": {"task_id": f"seed_{input_duration}"}})

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
            duration=input_duration,
            aspect_ratio="9:16",
        )

    assert task_id == f"seed_{input_duration}"
    actual_duration = captured_payload.get("input", {}).get("duration")
    assert actual_duration == expected_duration, (
        f"input_duration={input_duration} should map to {expected_duration} in payload, got {actual_duration}"
    )
    # duration フィールドが存在すること
    assert "duration" in captured_payload.get("input", {}), (
        "payload.input must contain 'duration' field"
    )


@pytest.mark.asyncio
async def test_generate_video_from_text_duration_included(provider):
    """generate_video_from_text() も payload に duration を含めること"""
    mock_response = _make_mock_response({"data": {"task_id": "seed_t2v"}})

    captured_payload = {}

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await provider.generate_video_from_text(
            prompt="test t2v",
            duration=10,
            aspect_ratio="9:16",
        )

    assert task_id == "seed_t2v"
    assert "duration" in captured_payload.get("input", {}), (
        "T2V payload.input must contain 'duration' field"
    )
    assert captured_payload["input"]["duration"] == 10
