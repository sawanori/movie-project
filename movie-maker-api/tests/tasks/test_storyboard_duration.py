"""
storyboard_processor の generate_video_with_v2v_fallback における
Veo provider 時 duration=None / 他 provider 時 duration=5 のテスト

Design Doc §7.3 参照
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ===========================================================================
# Helpers
# ===========================================================================

def _make_provider(name: str) -> MagicMock:
    provider = MagicMock()
    provider.provider_name = name
    provider.generate_video = AsyncMock(return_value=f"task_{name}_001")
    provider.supports_t2v = True
    return provider


def _make_scene(scene_number: int = 1) -> dict:
    return {
        "scene_number": scene_number,
        "image_url": "https://example.com/scene.jpg",
        "runway_prompt": "Test scene prompt",
        "camera_work": None,
    }


# ===========================================================================
# Veo provider: duration=None が渡されること
# ===========================================================================

@pytest.mark.asyncio
async def test_veo_provider_passes_duration_none():
    """
    provider=veo の場合、generate_video が duration=None で呼ばれること
    (Storyboard 経路では Veo は 8 秒固定を維持)
    """
    from app.tasks.storyboard_processor import generate_video_with_v2v_fallback

    veo_provider = _make_provider("veo")
    scene = _make_scene()

    with patch("app.tasks.storyboard_processor.get_supabase"):
        await generate_video_with_v2v_fallback(
            provider=veo_provider,
            scene=scene,
            previous_video_url=None,
            scene_image_url="https://example.com/scene.jpg",
            aspect_ratio="9:16",
            kling_duration=None,
            image_tail_url=None,
            element_images=None,
        )

    # generate_video が呼ばれたか確認
    assert veo_provider.generate_video.called
    call_kwargs = veo_provider.generate_video.call_args
    # duration=None が渡されていること
    kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
    args = call_kwargs.args if call_kwargs.args else ()
    # generate_video(image_url=..., prompt=..., duration=..., aspect_ratio=..., camera_work=...)
    # duration は positional 3rd arg か keyword arg
    if "duration" in kwargs:
        assert kwargs["duration"] is None, (
            f"Expected duration=None for veo provider, got {kwargs['duration']}"
        )
    else:
        # positional: (image_url, prompt, duration, ...)
        assert len(args) >= 3 and args[2] is None, (
            f"Expected positional duration=None for veo provider, got args={args}"
        )


# ===========================================================================
# 他 provider: duration=5 が渡されること
# ===========================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize("provider_name", ["piapi_kling", "seedance", "runway", "hailuo"])
async def test_non_veo_provider_passes_duration_5(provider_name):
    """
    provider != veo の場合、generate_video が duration=5 (kling_duration or 5) で呼ばれること
    """
    from app.tasks.storyboard_processor import generate_video_with_v2v_fallback

    provider = _make_provider(provider_name)
    scene = _make_scene()

    with patch("app.tasks.storyboard_processor.get_supabase"):
        await generate_video_with_v2v_fallback(
            provider=provider,
            scene=scene,
            previous_video_url=None,
            scene_image_url="https://example.com/scene.jpg",
            aspect_ratio="9:16",
            kling_duration=None,
            image_tail_url=None,
            element_images=None,
        )

    assert provider.generate_video.called
    call_kwargs = provider.generate_video.call_args
    kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
    args = call_kwargs.args if call_kwargs.args else ()

    if "duration" in kwargs:
        assert kwargs["duration"] == 5, (
            f"Expected duration=5 for {provider_name}, got {kwargs['duration']}"
        )
    else:
        assert len(args) >= 3 and args[2] == 5, (
            f"Expected positional duration=5 for {provider_name}, got args={args}"
        )


@pytest.mark.asyncio
async def test_non_veo_provider_with_kling_duration_10():
    """
    kling_duration=10 が渡された場合、veo 以外 provider は duration=10 で呼ばれること
    """
    from app.tasks.storyboard_processor import generate_video_with_v2v_fallback

    kling_provider = _make_provider("piapi_kling")
    scene = _make_scene()

    with patch("app.tasks.storyboard_processor.get_supabase"):
        await generate_video_with_v2v_fallback(
            provider=kling_provider,
            scene=scene,
            previous_video_url=None,
            scene_image_url="https://example.com/scene.jpg",
            aspect_ratio="9:16",
            kling_duration=10,
            image_tail_url=None,
            element_images=None,
        )

    assert kling_provider.generate_video.called
    call_kwargs = kling_provider.generate_video.call_args
    kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
    args = call_kwargs.args if call_kwargs.args else ()

    if "duration" in kwargs:
        assert kwargs["duration"] == 10, (
            f"Expected duration=10, got {kwargs['duration']}"
        )
    else:
        assert len(args) >= 3 and args[2] == 10, (
            f"Expected positional duration=10, got args={args}"
        )
