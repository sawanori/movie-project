"""
PiAPISeedanceProvider 詳細パラメータテスト

Design Doc: docs/plans/2026-05-18_seedance-detailed-params.md §13.2 B-1 ~ B-9 に対応。

テスト対象:
  - generate_audio (BGM 自動生成 ON/OFF)
  - seed (再現性用シード値)
  - resolution (解像度指定)
  - camera_fixed (カメラ固定)
  - C-1 修正: duration 透過送信 (VALID_DURATIONS 廃止)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.external.piapi_seedance_provider import PiAPISeedanceProvider


# ---------------------------------------------------------------------------
# Fixtures & Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def vip_provider(monkeypatch):
    """VIP task_type を持つプロバイダー"""
    monkeypatch.setattr("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE="seedance-2-preview-vip",
        PIAPI_SEEDANCE_RESOLUTION="720p",
    ))
    return PiAPISeedanceProvider()


@pytest.fixture
def standard_provider(monkeypatch):
    """非 VIP (standard) task_type を持つプロバイダー"""
    monkeypatch.setattr("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE="seedance-2-preview",
        PIAPI_SEEDANCE_RESOLUTION="720p",
    ))
    return PiAPISeedanceProvider()


def _make_mock_response(json_data: dict, status_code: int = 200):
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data
    mock_response.raise_for_status = MagicMock()
    return mock_response


async def _capture_generate_video(provider, captured_payload: dict, **kwargs) -> str:
    """generate_video を呼び出し、送信 payload を captured_payload に格納するヘルパー"""
    mock_response = _make_mock_response({"data": {"task_id": "seed_test"}})

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        return await provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="test prompt",
            duration=5,
            aspect_ratio="9:16",
            **kwargs,
        )


# ===========================================================================
# B-1: generate_audio=True → payload.input.generate_audio === True
# ===========================================================================

@pytest.mark.asyncio
async def test_generate_audio_true_included_in_payload(vip_provider):
    """generate_video(generate_audio=True) → payload.input.generate_audio === True"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, generate_audio=True)
    assert captured["input"]["generate_audio"] is True


# ===========================================================================
# B-2: generate_audio=False → payload.input.generate_audio === False (常に送信)
# ===========================================================================

@pytest.mark.asyncio
async def test_generate_audio_false_always_sent(vip_provider):
    """generate_video(generate_audio=False) → payload.input.generate_audio === False (常に含まれる)"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, generate_audio=False)
    assert "generate_audio" in captured["input"], "generate_audio は常に payload に含まれること"
    assert captured["input"]["generate_audio"] is False


@pytest.mark.asyncio
async def test_generate_audio_default_is_false_and_always_sent(vip_provider):
    """generate_audio 未指定 (default=False) でも payload に含まれること"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured)
    assert "generate_audio" in captured["input"], "generate_audio は default でも payload に含まれること"
    assert captured["input"]["generate_audio"] is False


# ===========================================================================
# B-3: seed=42 → payload.input.seed === 42
# ===========================================================================

@pytest.mark.asyncio
async def test_seed_included_in_payload(vip_provider):
    """generate_video(seed=42) → payload.input.seed === 42"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, seed=42)
    assert captured["input"]["seed"] == 42


@pytest.mark.asyncio
async def test_seed_none_not_included_in_payload(vip_provider):
    """generate_video(seed=None) → payload.input に seed キーが含まれないこと"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, seed=None)
    assert "seed" not in captured["input"], "seed=None の場合は payload に seed を含めない"


# ===========================================================================
# B-4: resolution='1080p' + VIP task_type → payload.input.resolution === '1080p'
# ===========================================================================

@pytest.mark.asyncio
async def test_resolution_1080p_vip_included_in_payload(vip_provider):
    """generate_video(resolution='1080p') + VIP → payload.input.resolution === '1080p'"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, resolution='1080p')
    assert captured["input"]["resolution"] == '1080p'


@pytest.mark.asyncio
async def test_resolution_720p_vip_included_in_payload(vip_provider):
    """generate_video(resolution='720p') + VIP → payload.input.resolution === '720p'"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, resolution='720p')
    assert captured["input"]["resolution"] == '720p'


# ===========================================================================
# B-5: resolution='1080p' + 非 VIP task_type → ValueError (safety net)
# ===========================================================================

@pytest.mark.asyncio
async def test_resolution_1080p_non_vip_raises_value_error(standard_provider):
    """generate_video(resolution='1080p') + 非 VIP → ValueError"""
    with pytest.raises(ValueError, match="VIP"):
        await _capture_generate_video(standard_provider, {}, resolution='1080p')


# ===========================================================================
# B-6: camera_fixed=True → payload.input.camerafixed === True
# ===========================================================================

@pytest.mark.asyncio
async def test_camera_fixed_true_included_in_payload(vip_provider):
    """generate_video(camera_fixed=True) → payload.input.camerafixed === True"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, camera_fixed=True)
    assert captured["input"]["camerafixed"] is True


@pytest.mark.asyncio
async def test_camera_fixed_false_included_in_payload(vip_provider):
    """generate_video(camera_fixed=False) → payload.input.camerafixed === False"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, camera_fixed=False)
    assert "camerafixed" in captured["input"]
    assert captured["input"]["camerafixed"] is False


@pytest.mark.asyncio
async def test_camera_fixed_none_not_included_in_payload(vip_provider):
    """generate_video(camera_fixed=None) → payload.input に camerafixed キーが含まれないこと"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured, camera_fixed=None)
    assert "camerafixed" not in captured["input"], "camera_fixed=None の場合は payload に含めない"


# ===========================================================================
# B-7: 全引数省略 → 既存挙動と同一 (generate_audio=False は含まれる)
# ===========================================================================

@pytest.mark.asyncio
async def test_default_args_payload_structure(vip_provider):
    """全新規引数省略時のデフォルト payload が正しいこと"""
    captured: dict = {}
    await _capture_generate_video(vip_provider, captured)

    inp = captured["input"]
    assert "prompt" in inp
    assert "duration" in inp
    assert "aspect_ratio" in inp
    assert "image_urls" in inp
    assert "resolution" in inp  # VIP なので env fallback resolution が入る
    assert "generate_audio" in inp
    assert inp["generate_audio"] is False
    assert "seed" not in inp
    assert "camerafixed" not in inp


# ===========================================================================
# B-8: C-1 バグ修正検証 — duration=7 が payload に 7 として送信されること
# ===========================================================================

@pytest.mark.asyncio
async def test_seedance_duration_7_passes_through(vip_provider):
    """
    C-1 バグ修正: duration=7 → payload.input.duration === 7
    旧実装では VALID_DURATIONS=[5,10,15] により 5 または 10 に丸められていた。
    """
    mock_response = _make_mock_response({"data": {"task_id": "seed_dur7"}})

    captured: dict = {}

    async def fake_post(url, headers, json, timeout):
        captured.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await vip_provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="duration 7 test",
            duration=7,
            aspect_ratio="9:16",
        )

    assert task_id == "seed_dur7"
    assert captured["input"]["duration"] == 7, (
        "C-1 修正: duration=7 は 5 や 10 に丸められず 7 がそのまま送信される"
    )


# ===========================================================================
# B-9: C-1 クランプ検証 — 範囲外 duration が正しくクランプされること
# ===========================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize("input_duration,expected_duration", [
    (3, 4),   # 下限未満 → 4 にクランプ
    (20, 15), # 上限超過 → 15 にクランプ
    (4, 4),   # 境界値: 最小
    (15, 15), # 境界値: 最大
])
async def test_seedance_duration_outside_range_clamped(vip_provider, input_duration, expected_duration):
    """C-1 修正: 4-15 範囲外の duration は範囲にクランプされること"""
    mock_response = _make_mock_response({"data": {"task_id": f"seed_clamp_{input_duration}"}})

    captured: dict = {}

    async def fake_post(url, headers, json, timeout):
        captured.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        await vip_provider.generate_video(
            image_url="https://example.com/img.png",
            prompt="clamp test",
            duration=input_duration,
            aspect_ratio="9:16",
        )

    assert captured["input"]["duration"] == expected_duration, (
        f"duration={input_duration} should clamp to {expected_duration}, "
        f"got {captured['input']['duration']}"
    )


# ===========================================================================
# generate_video_from_text でも同様のパラメータが正しく送信されること
# ===========================================================================

@pytest.mark.asyncio
async def test_generate_video_from_text_detailed_params(vip_provider):
    """generate_video_from_text も generate_audio / seed / camera_fixed を正しく送信すること"""
    mock_response = _make_mock_response({"data": {"task_id": "seed_t2v_detail"}})

    captured: dict = {}

    async def fake_post(url, headers, json, timeout):
        captured.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        task_id = await vip_provider.generate_video_from_text(
            prompt="t2v detailed test",
            duration=8,
            aspect_ratio="16:9",
            generate_audio=True,
            seed=999,
            camera_fixed=True,
        )

    assert task_id == "seed_t2v_detail"
    inp = captured["input"]
    assert inp["duration"] == 8  # 8 は 4-15 範囲内、透過送信
    assert inp["generate_audio"] is True
    assert inp["seed"] == 999
    assert inp["camerafixed"] is True
    assert "image_urls" not in inp  # T2V は image_urls を送信しない


@pytest.mark.asyncio
async def test_generate_video_from_text_t2v_duration_passthrough(vip_provider):
    """generate_video_from_text で duration=7 が透過送信されること (C-1 修正)"""
    mock_response = _make_mock_response({"data": {"task_id": "seed_t2v_7"}})

    captured: dict = {}

    async def fake_post(url, headers, json, timeout):
        captured.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("app.external.piapi_seedance_provider.httpx.AsyncClient", return_value=mock_client):
        await vip_provider.generate_video_from_text(
            prompt="t2v duration 7",
            duration=7,
            aspect_ratio="9:16",
        )

    assert captured["input"]["duration"] == 7, "T2V も C-1 修正: duration=7 が 7 のまま送信"
