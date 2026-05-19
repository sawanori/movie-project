"""
PiAPISeedanceProvider.generate_video_with_omni_references() tests

v3 計画書 §15.1 B-1〜B-12, B-29〜B-31 に対応。

検証観点:
  - input.{image_urls, video_urls, audio_urls} payload 構築
  - 既存 task_type をそのまま使用 (omni 専用 task_type 不要)
  - input.mode は送信しない (preview 系統不要)
  - VIP 必須チェック
  - 各個別上限 (image≤9, video≤3, audio≤3)
  - audio 単独不可 / 全 0 個不可
  - prompt 4000 文字 truncate
  - duration 整数透過送信
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.external.piapi_seedance_provider import PiAPISeedanceProvider
from app.external.video_provider import VideoProviderError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_provider(task_type: str = "seedance-2-preview-vip") -> PiAPISeedanceProvider:
    """指定した task_type を持つ PiAPISeedanceProvider インスタンスを返す"""
    with patch("app.external.piapi_seedance_provider.settings", MagicMock(
        PIAPI_API_KEY="test-api-key",
        PIAPI_SEEDANCE_TASK_TYPE=task_type,
        PIAPI_SEEDANCE_RESOLUTION="720p",
    )):
        return PiAPISeedanceProvider()


def _make_mock_response(json_data: dict) -> MagicMock:
    mock_response = MagicMock()
    mock_response.json.return_value = json_data
    mock_response.raise_for_status = MagicMock()
    return mock_response


def _patched_httpx(captured_payload: dict, task_id: str = "seed_omni_001"):
    """httpx.AsyncClient を mock し、POST された json を captured_payload に保存する context manager."""
    mock_response = _make_mock_response({"data": {"task_id": task_id}})

    async def fake_post(url, headers, json, timeout):
        captured_payload.update(json)
        return mock_response

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    return patch(
        "app.external.piapi_seedance_provider.httpx.AsyncClient",
        return_value=mock_client,
    )


# ---------------------------------------------------------------------------
# B-1: image + video → image_urls / video_urls 送信
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b1_image_and_video_payload():
    """B-1: image_urls + video_urls が input に含まれる"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b1"):
        task_id = await provider.generate_video_with_omni_references(
            prompt="A cinematic shot",
            duration=5,
            aspect_ratio="9:16",
            image_urls=["https://example.com/img1.png"],
            video_urls=["https://example.com/vid1.mp4"],
        )

    assert task_id == "seed_b1"
    input_payload = captured["input"]
    assert input_payload["image_urls"] == ["https://example.com/img1.png"]
    assert input_payload["video_urls"] == ["https://example.com/vid1.mp4"]
    assert "audio_urls" not in input_payload


# ---------------------------------------------------------------------------
# B-2: audio + image → audio_urls / image_urls 送信
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b2_audio_and_image_payload():
    """B-2: audio_urls + image_urls が input に含まれる"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b2"):
        task_id = await provider.generate_video_with_omni_references(
            prompt="A musical scene",
            image_urls=["https://example.com/img1.png"],
            audio_urls=["https://example.com/audio1.mp3"],
        )

    assert task_id == "seed_b2"
    input_payload = captured["input"]
    assert input_payload["image_urls"] == ["https://example.com/img1.png"]
    assert input_payload["audio_urls"] == ["https://example.com/audio1.mp3"]
    assert "video_urls" not in input_payload


# ---------------------------------------------------------------------------
# B-3: 3 種 mix
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b3_three_kinds_mix_payload():
    """B-3: image + video + audio の 3 種同時送信"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b3"):
        await provider.generate_video_with_omni_references(
            prompt="mix test",
            image_urls=["https://example.com/img1.png", "https://example.com/img2.png"],
            video_urls=["https://example.com/vid1.mp4"],
            audio_urls=["https://example.com/audio1.mp3"],
        )

    input_payload = captured["input"]
    assert len(input_payload["image_urls"]) == 2
    assert len(input_payload["video_urls"]) == 1
    assert len(input_payload["audio_urls"]) == 1


# ---------------------------------------------------------------------------
# B-4: mode=None → task_type=seedance-2-preview-vip
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b4_mode_none_uses_env_task_type():
    """B-4: mode=None で env (preview-vip) がそのまま使われる"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b4"):
        await provider.generate_video_with_omni_references(
            prompt="default mode",
            mode=None,
            image_urls=["https://example.com/img.png"],
        )

    assert captured["task_type"] == "seedance-2-preview-vip"


# ---------------------------------------------------------------------------
# B-5: mode='fast' → task_type=seedance-2-fast-preview-vip
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b5_mode_fast_switches_to_fast_preview():
    """B-5: mode='fast' で fast-preview-vip に解決される"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b5"):
        await provider.generate_video_with_omni_references(
            prompt="fast mode",
            mode="fast",
            image_urls=["https://example.com/img.png"],
        )

    assert captured["task_type"] == "seedance-2-fast-preview-vip"


# ---------------------------------------------------------------------------
# B-6: env 非 VIP → VideoProviderError
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b6_non_vip_env_raises():
    """B-6: PIAPI_SEEDANCE_TASK_TYPE が非 VIP の場合 VideoProviderError"""
    provider = _make_provider("seedance-2-preview")  # 非 VIP

    with pytest.raises(VideoProviderError, match="VIP モデル必須"):
        await provider.generate_video_with_omni_references(
            prompt="non vip test",
            image_urls=["https://example.com/img.png"],
        )


# ---------------------------------------------------------------------------
# B-7: 全 0 個 → VideoProviderError
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b7_all_empty_raises():
    """B-7: image/video/audio すべて空 → VideoProviderError"""
    provider = _make_provider("seedance-2-preview-vip")

    with pytest.raises(VideoProviderError, match="参照素材を 1 つ以上"):
        await provider.generate_video_with_omni_references(
            prompt="empty test",
            image_urls=[],
            video_urls=[],
            audio_urls=[],
        )


# ---------------------------------------------------------------------------
# B-9: audio のみ → VideoProviderError (防御)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b9_audio_only_raises():
    """B-9: audio_urls のみ指定 → VideoProviderError (防御)"""
    provider = _make_provider("seedance-2-preview-vip")

    with pytest.raises(VideoProviderError, match="audio_urls 単独不可"):
        await provider.generate_video_with_omni_references(
            prompt="audio only",
            audio_urls=["https://example.com/audio1.mp3"],
        )


# ---------------------------------------------------------------------------
# B-10: image=[] + video=[v] → OK
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b10_video_only_ok():
    """B-10: image=[] + video=[v] でも video があれば OK"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b10"):
        task_id = await provider.generate_video_with_omni_references(
            prompt="video only",
            image_urls=[],
            video_urls=["https://example.com/vid1.mp4"],
        )

    assert task_id == "seed_b10"
    input_payload = captured["input"]
    assert input_payload["video_urls"] == ["https://example.com/vid1.mp4"]
    assert "image_urls" not in input_payload


# ---------------------------------------------------------------------------
# B-11: prompt 4001 文字 → 4000 切詰
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b11_prompt_truncated_to_4000():
    """B-11: 4001 文字 prompt は 4000 文字に truncate"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    long_prompt = "あ" * 4001

    with _patched_httpx(captured, task_id="seed_b11"):
        await provider.generate_video_with_omni_references(
            prompt=long_prompt,
            image_urls=["https://example.com/img.png"],
        )

    assert len(captured["input"]["prompt"]) == 4000


# ---------------------------------------------------------------------------
# B-12: duration=15 → input.duration=15
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b12_duration_15_passes_through():
    """B-12: duration=15 が input.duration に整数で送信される"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b12"):
        await provider.generate_video_with_omni_references(
            prompt="duration test",
            duration=15,
            image_urls=["https://example.com/img.png"],
        )

    assert captured["input"]["duration"] == 15
    assert isinstance(captured["input"]["duration"], int)


# ---------------------------------------------------------------------------
# Limit checks (per-kind cap, no combined cap)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_urls_over_limit_raises():
    """image_urls 10 個 → VideoProviderError (上限 9)"""
    provider = _make_provider("seedance-2-preview-vip")

    with pytest.raises(VideoProviderError, match="image_urls は最大"):
        await provider.generate_video_with_omni_references(
            prompt="over image",
            image_urls=[f"https://example.com/img{i}.png" for i in range(10)],
        )


@pytest.mark.asyncio
async def test_video_urls_over_limit_raises():
    """video_urls 4 個 → VideoProviderError (上限 3)"""
    provider = _make_provider("seedance-2-preview-vip")

    with pytest.raises(VideoProviderError, match="video_urls は最大"):
        await provider.generate_video_with_omni_references(
            prompt="over video",
            video_urls=[f"https://example.com/v{i}.mp4" for i in range(4)],
        )


@pytest.mark.asyncio
async def test_audio_urls_over_limit_raises():
    """audio_urls 4 個 → VideoProviderError (上限 3)"""
    provider = _make_provider("seedance-2-preview-vip")

    with pytest.raises(VideoProviderError, match="audio_urls は最大"):
        await provider.generate_video_with_omni_references(
            prompt="over audio",
            image_urls=["https://example.com/img.png"],  # 単独防止
            audio_urls=[f"https://example.com/a{i}.mp3" for i in range(4)],
        )


# ---------------------------------------------------------------------------
# B-29: 契約: input に image_urls / video_urls / audio_urls キー (※*_references ではない)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b29_payload_keys_are_image_urls_not_image_references():
    """B-29: payload キーは image_urls / video_urls / audio_urls (※*_references ではない)"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b29"):
        await provider.generate_video_with_omni_references(
            prompt="keys test",
            image_urls=["https://example.com/img.png"],
            video_urls=["https://example.com/v.mp4"],
            audio_urls=["https://example.com/a.mp3"],
        )

    input_payload = captured["input"]
    assert "image_urls" in input_payload
    assert "video_urls" in input_payload
    assert "audio_urls" in input_payload
    # 旧仕様 *_references は使わない
    assert "image_references" not in input_payload
    assert "video_references" not in input_payload
    assert "audio_references" not in input_payload


# ---------------------------------------------------------------------------
# B-30: 契約: input に mode キー無し
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b30_no_input_mode_field():
    """B-30: input に mode フィールドを送信しない (preview 系統不要)"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b30"):
        await provider.generate_video_with_omni_references(
            prompt="no mode field",
            mode="fast",
            image_urls=["https://example.com/img.png"],
        )

    assert "mode" not in captured["input"]


# ---------------------------------------------------------------------------
# H-NEW-3: resolution argument propagation (UI override > env fallback)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_omni_with_resolution_1080p_vip():
    """resolution='1080p' + VIP task_type → payload に resolution: '1080p' が含まれる"""
    provider = _make_provider("seedance-2-preview-vip")  # env resolution=720p
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_res_1080"):
        await provider.generate_video_with_omni_references(
            prompt="hi-res omni",
            image_urls=["https://example.com/img.png"],
            resolution="1080p",
        )

    assert captured["input"]["resolution"] == "1080p", (
        "UI 指定の resolution が env デフォルトを上書きしていない"
    )


@pytest.mark.asyncio
async def test_omni_with_resolution_480p_non_vip():
    """resolution='480p' + 非 VIP env でも payload に resolution: '480p' が含まれる

    注意: 現状 omni 自体が VIP 必須で非 VIP env だと別の guard で raise されるため、
    このシナリオは VIP env を使い 480p UI 指定のケースで代替検証する。
    """
    provider = _make_provider("seedance-2-preview-vip")  # VIP env、env resolution=720p
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_res_480"):
        await provider.generate_video_with_omni_references(
            prompt="low-res omni",
            image_urls=["https://example.com/img.png"],
            resolution="480p",
        )

    assert captured["input"]["resolution"] == "480p", (
        "UI 指定の 480p が payload に反映されていない"
    )


@pytest.mark.asyncio
async def test_omni_with_resolution_1080p_non_vip_rejects():
    """resolution='1080p' + 非 VIP env → 例外 raise (VIP guard が先に発火)

    omni では VIP 必須 guard が先に走るため、非 VIP env では VideoProviderError が
    raise される (resolution チェックに到達せず安全側で reject される)。
    """
    provider = _make_provider("seedance-2-preview")  # 非 VIP env

    with pytest.raises((VideoProviderError, ValueError)) as exc_info:
        await provider.generate_video_with_omni_references(
            prompt="reject",
            image_urls=["https://example.com/img.png"],
            resolution="1080p",
        )
    # VIP guard が先に発火する想定。どちらの例外でも 1080p を非 VIP で実行する経路は防がれる。
    assert exc_info.type in (VideoProviderError, ValueError)


@pytest.mark.asyncio
async def test_omni_without_resolution_uses_env_default():
    """resolution=None → env デフォルト (self.resolution=720p) を使う"""
    provider = _make_provider("seedance-2-preview-vip")  # env resolution=720p
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_res_env"):
        await provider.generate_video_with_omni_references(
            prompt="default resolution",
            image_urls=["https://example.com/img.png"],
            resolution=None,
        )

    assert captured["input"]["resolution"] == "720p", (
        "resolution=None 時に env デフォルト (720p) が使われていない"
    )


# ---------------------------------------------------------------------------
# B-31: 契約: task_type 既存通り (omni 専用 task_type 作らない)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_b31_task_type_uses_existing_no_omni_specific():
    """B-31: task_type は既存のものをそのまま使用 (omni 専用 suffix を付けない)"""
    provider = _make_provider("seedance-2-preview-vip")
    captured: dict = {}

    with _patched_httpx(captured, task_id="seed_b31"):
        await provider.generate_video_with_omni_references(
            prompt="task type test",
            image_urls=["https://example.com/img.png"],
        )

    # omni 専用 suffix (例: -omni / -reference) が含まれない
    task_type = captured["task_type"]
    assert task_type == "seedance-2-preview-vip"
    assert "omni" not in task_type
    assert "reference" not in task_type
