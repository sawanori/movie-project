"""
PiAPISeedanceProvider の duration 任意秒数対応テスト

C-1 バグ修正後の期待挙動:
  - VALID_DURATIONS=[5,10,15] による丸め廃止
  - 4-15 の範囲でクランプし、指定値を透過送信
  - duration=7 → payload に 7 (5 に丸めない)
  - duration=4 (min) → payload に 4
  - duration=15 (max) → payload に 15
  - duration=3 (範囲外下限) → 4 にクランプ
  - duration=20 (範囲外上限) → 15 にクランプ
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
# C-1 修正: duration が VALID_DURATIONS に丸められず透過送信されることを確認
# ===========================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize("input_duration,expected_duration", [
    (7, 7),   # C-1 修正: 7 は 5/10 に丸めず 7 のまま送信
    (4, 4),   # 範囲内最小値そのまま
    (15, 15), # 範囲内最大値そのまま
    (5, 5),   # 旧 VALID_DURATIONS 値も正しく動作
    (10, 10), # 旧 VALID_DURATIONS 値も正しく動作
])
async def test_duration_is_included_in_payload(provider, input_duration, expected_duration):
    """
    generate_video() が payload["input"]["duration"] に指定値を透過送信すること。
    C-1 修正: VALID_DURATIONS=[5,10,15] クランプを廃止し 4-15 範囲で透過送信。
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
