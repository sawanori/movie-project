"""task_003: おまかせモデル選択 (router 時点解決) + 送信時フォールバック のテスト

カバレッジ (5 シナリオ):
  1. selection_priority="quality" かつ video_provider 未指定
     → router が最高 quality_score のプロバイダ名 (veo) に解決し DB 保存値がそれになる
  2. video_provider 明示時 → priority を無視して従来通り (回帰)
  3. 両方未指定 → settings.VIDEO_PROVIDER (回帰)
  4. 送信時失敗 → 次点へ 1 回フォールバック、
     video_generations.video_provider が実使用プロバイダに更新される
  5. 2 連続失敗 → failed (フォールバックは 1 回だけ)

テスト流儀は tests/videos/test_story_router_omni.py を踏襲
(auth_client fixture / Supabase MagicMock / start_story_processing パッチ)。
プロバイダは全てモック。
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.external.video_provider import VideoProviderError


MOCK_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"
BASE_IMAGE_URL = "https://cdn.example.com/base/image.jpg"


# ---------------------------------------------------------------------------
# Router 層: 3 段解決 (video_provider > selection_priority > settings) の検証
# ---------------------------------------------------------------------------


class _SupabaseMock:
    """create_story_video が要求する Supabase chain を再現する MagicMock ラッパ。

    video_generations.insert() の payload を captured_insert に記録する。
    omni_reference_assets は本テストでは未使用 (空)。
    """

    def __init__(self):
        self.captured_insert: dict | None = None
        self.mock = MagicMock()
        self.mock.table.side_effect = self._table_side_effect
        self.mock.rpc.return_value.execute.return_value = MagicMock(data=None)

    def _table_side_effect(self, name: str):
        table_mock = MagicMock()
        if name == "omni_reference_assets":
            select_mock = MagicMock()
            in_mock = MagicMock()
            in_mock.execute.return_value = MagicMock(data=[])
            select_mock.in_.return_value = in_mock
            table_mock.select.return_value = select_mock
        elif name == "video_generations":
            def _insert_side_effect(payload):
                self.captured_insert = payload
                exec_mock = MagicMock()
                exec_mock.execute.return_value = MagicMock(data=[dict(payload)])
                return exec_mock

            table_mock.insert.side_effect = _insert_side_effect
        else:
            table_mock.insert.return_value.execute.return_value = MagicMock(data=None)
        return table_mock


def _patch_router(monkeypatch, sb: _SupabaseMock):
    from app.videos import router as router_module

    monkeypatch.setattr(router_module, "get_supabase", lambda: sb.mock)
    # BG タスクは起動させない (Router の解決/INSERT 層のみ検証)
    monkeypatch.setattr(router_module, "start_story_processing", lambda *a, **kw: None)


def _base_payload(**overrides) -> dict:
    payload = {
        "image_url": BASE_IMAGE_URL,
        "story_text": "テストストーリー",
        "aspect_ratio": "9:16",
    }
    payload.update(overrides)
    return payload


class TestRouterPriorityResolution:
    """selection_priority による router 時点解決"""

    def test_priority_quality_resolves_to_highest_quality_provider(
        self, auth_client, monkeypatch
    ):
        """selection_priority=quality + video_provider 未指定
        → 最高 quality_score のプロバイダ (veo) に解決され DB 保存される。

        登録スコア (gateway_init.py): veo=9, runway=9 (veo が登録順で先), その他 <9。
        安定ソートで tie の先頭 = veo。
        """
        sb = _SupabaseMock()
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(selection_priority="quality"),
        )

        assert response.status_code == 201, response.text
        assert sb.captured_insert is not None
        assert sb.captured_insert["video_provider"] == "veo"

    def test_priority_cost_resolves_to_cheapest_provider(
        self, auth_client, monkeypatch
    ):
        """selection_priority=cost → 最安 (hailuo=0.04) に解決される。"""
        sb = _SupabaseMock()
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(selection_priority="cost"),
        )

        assert response.status_code == 201, response.text
        assert sb.captured_insert["video_provider"] == "hailuo"

    def test_explicit_provider_wins_over_priority(self, auth_client, monkeypatch):
        """video_provider 明示時は priority を無視 (回帰)。
        video_provider=runway + selection_priority=quality → runway が保存される。
        """
        sb = _SupabaseMock()
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(
                video_provider="runway",
                selection_priority="quality",
            ),
        )

        assert response.status_code == 201, response.text
        assert sb.captured_insert["video_provider"] == "runway"

    def test_neither_specified_falls_back_to_settings(
        self, auth_client, monkeypatch
    ):
        """video_provider も selection_priority も未指定
        → settings.VIDEO_PROVIDER (回帰)。
        """
        from app.core.config import settings

        sb = _SupabaseMock()
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(),
        )

        assert response.status_code == 201, response.text
        assert sb.captured_insert["video_provider"] == settings.VIDEO_PROVIDER.lower()


# ---------------------------------------------------------------------------
# resolve_provider_with_priority: レジストリ解決の単体検証
# ---------------------------------------------------------------------------


class TestResolveProviderWithPriority:
    def test_quality_returns_veo(self):
        from app.external.video_provider import resolve_provider_with_priority

        assert resolve_provider_with_priority("quality", "i2v") == "veo"

    def test_speed_returns_runway(self):
        from app.external.video_provider import resolve_provider_with_priority

        assert resolve_provider_with_priority("speed", "i2v") == "runway"

    def test_cost_returns_hailuo(self):
        from app.external.video_provider import resolve_provider_with_priority

        assert resolve_provider_with_priority("cost", "i2v") == "hailuo"

    def test_no_candidate_falls_back_to_settings(self, monkeypatch):
        """該当 capability が無い場合は settings.VIDEO_PROVIDER にフォールバック。"""
        from app.core.config import settings
        import app.external.video_provider as vp_module

        monkeypatch.setattr(settings, "VIDEO_PROVIDER", "runway", raising=False)
        # 存在しない capability を指定 → find_best_metadata が None
        result = vp_module.resolve_provider_with_priority("quality", "nonexistent_cap")
        assert result == "runway"


# ---------------------------------------------------------------------------
# submit_with_fallback: 送信時フォールバック (1 回のみ) の単体検証
# ---------------------------------------------------------------------------


class _StubProvider:
    """generate_video の成否を制御できるスタブプロバイダー。"""

    def __init__(self, name: str, *, fail: bool = False):
        self._name = name
        self._fail = fail
        self.generate_called = 0

    @property
    def provider_name(self) -> str:
        return self._name

    async def generate_video(self, **kwargs) -> str:
        self.generate_called += 1
        if self._fail:
            raise VideoProviderError(f"{self._name} send failed")
        return f"task_{self._name}"


def _install_two_provider_registry(monkeypatch, first, second, order: list[str]):
    """resolve/rank を差し替え、first→second のランキングを固定するヘルパ。

    submit_with_fallback が内部で使うレジストリ取得関数を差し替える。
    """
    import app.external.video_provider as vp_module

    providers = {first.provider_name: first, second.provider_name: second}

    def fake_get_provider(name):
        return providers[name]

    def fake_rank_names(priority, capability):
        return list(order)

    monkeypatch.setattr(vp_module, "_get_provider_for_fallback", fake_get_provider)
    monkeypatch.setattr(vp_module, "_ranked_provider_names", fake_rank_names)


class TestSubmitWithFallback:
    @pytest.mark.asyncio
    async def test_first_success_no_fallback(self, monkeypatch):
        from app.external.video_provider import submit_with_fallback

        first = _StubProvider("veo", fail=False)
        second = _StubProvider("runway", fail=False)
        _install_two_provider_registry(monkeypatch, first, second, ["veo", "runway"])

        task_id, provider_used, fallback_occurred = await submit_with_fallback(
            provider_name="veo",
            priority="quality",
            capability="i2v",
            generate_kwargs={
                "image_url": BASE_IMAGE_URL,
                "prompt": "p",
                "duration": 5,
                "aspect_ratio": "9:16",
                "camera_work": None,
            },
        )

        assert task_id == "task_veo"
        assert provider_used == "veo"
        assert fallback_occurred is False
        assert first.generate_called == 1
        assert second.generate_called == 0

    @pytest.mark.asyncio
    async def test_send_failure_falls_back_once(self, monkeypatch):
        from app.external.video_provider import submit_with_fallback

        first = _StubProvider("veo", fail=True)
        second = _StubProvider("runway", fail=False)
        _install_two_provider_registry(monkeypatch, first, second, ["veo", "runway"])

        task_id, provider_used, fallback_occurred = await submit_with_fallback(
            provider_name="veo",
            priority="quality",
            capability="i2v",
            generate_kwargs={
                "image_url": BASE_IMAGE_URL,
                "prompt": "p",
                "duration": 5,
                "aspect_ratio": "9:16",
                "camera_work": None,
            },
        )

        assert task_id == "task_runway"
        assert provider_used == "runway"
        assert fallback_occurred is True
        assert first.generate_called == 1
        assert second.generate_called == 1

    @pytest.mark.asyncio
    async def test_two_failures_raises_and_only_one_fallback(self, monkeypatch):
        """1 番目・2 番目とも失敗 → 例外送出 (フォールバックは 1 回だけ、3 番目は試さない)。"""
        from app.external.video_provider import submit_with_fallback

        first = _StubProvider("veo", fail=True)
        second = _StubProvider("runway", fail=True)
        _install_two_provider_registry(monkeypatch, first, second, ["veo", "runway"])

        with pytest.raises(VideoProviderError):
            await submit_with_fallback(
                provider_name="veo",
                priority="quality",
                capability="i2v",
                generate_kwargs={
                    "image_url": BASE_IMAGE_URL,
                    "prompt": "p",
                    "duration": 5,
                    "aspect_ratio": "9:16",
                    "camera_work": None,
                },
            )

        assert first.generate_called == 1
        assert second.generate_called == 1


# ---------------------------------------------------------------------------
# story_processor: フォールバック時に video_provider を UPDATE する統合検証
# ---------------------------------------------------------------------------


class TestStoryProcessorFallbackUpdatesProvider:
    @pytest.mark.asyncio
    async def test_fallback_updates_video_provider_column(self, monkeypatch):
        """process_story_video: 送信フォールバックが起きたら
        video_generations.video_provider を実使用プロバイダに UPDATE する。
        """
        import app.tasks.story_processor as sp

        video_id = "vid-fallback-1"
        video_row = {
            "id": video_id,
            "user_id": MOCK_USER_ID,
            "original_image_url": BASE_IMAGE_URL,
            "image_urls": [BASE_IMAGE_URL],
            "story_text": "story",
            "user_prompt": "story",
            "camera_work": None,
            "aspect_ratio": "9:16",
            "video_provider": "veo",
        }

        # Supabase: select→single→execute で video_row を返し、update をキャプチャ
        captured_updates: list[dict] = []

        supa = MagicMock()

        def table_side_effect(name):
            tm = MagicMock()
            if name == "video_generations":
                tm.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                    data=video_row
                )

                def update_side_effect(payload):
                    captured_updates.append(payload)
                    upd = MagicMock()
                    upd.eq.return_value.execute.return_value = MagicMock(data=[payload])
                    return upd

                tm.update.side_effect = update_side_effect
            else:
                tm.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                    data=None
                )
            return tm

        supa.table.side_effect = table_side_effect
        monkeypatch.setattr(sp, "get_supabase", lambda: supa)

        # update_video_status は副作用を伴うので no-op 化
        async def _noop_status(*a, **kw):
            return None

        monkeypatch.setattr(sp, "update_video_status", _noop_status)

        # submit_with_fallback: フォールバック発生 (runway 使用) を模倣
        async def fake_submit(**kwargs):
            return ("task_runway", "runway", True)

        monkeypatch.setattr(sp, "submit_with_fallback", fake_submit)

        # 完了ステータスを即返し、以降の FFmpeg/R2 に到達する前に打ち切る。
        # check_status が COMPLETED を返した直後の download で例外 → 早期 return させ、
        # UPDATE(video_provider) の呼び出しだけを検証する。
        from app.external.video_provider import VideoGenerationStatus, VideoStatus

        fake_provider = MagicMock()
        fake_provider.provider_name = "runway"

        async def fake_check_status(task_id):
            return VideoStatus(
                status=VideoGenerationStatus.COMPLETED,
                progress=100,
                video_url="https://cdn.example.com/out.mp4",
            )

        async def fake_download(task_id):
            raise RuntimeError("stop-after-provider-update")

        fake_provider.check_status.side_effect = fake_check_status
        fake_provider.download_video_bytes.side_effect = fake_download
        monkeypatch.setattr(sp, "get_video_provider", lambda name: fake_provider)

        # asyncio.sleep を即時化してポーリング待ちを飛ばす
        async def _fast_sleep(*a, **kw):
            return None

        monkeypatch.setattr(sp.asyncio, "sleep", _fast_sleep)

        await sp.process_story_video(video_id, "veo", None)

        # video_provider が実使用 (runway) に UPDATE されたことを検証
        provider_updates = [
            u for u in captured_updates if u.get("video_provider") == "runway"
        ]
        assert provider_updates, f"expected video_provider update to runway, got {captured_updates}"
