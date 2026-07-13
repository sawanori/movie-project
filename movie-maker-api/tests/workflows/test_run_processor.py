"""Tests for app.tasks.workflow_run_processor (task_005).

DB / providers / domain services are all mocked. Covers:
  * minimal chain (Generate -> Dialogue) reaching completed with final_output_url set
  * resume of a step stuck in ``submitting`` with no external_task_id -> no resend,
    run.failed, release_video_quota called for unstarted Generate steps
  * resume of a step with external_task_id -> polling continues (no resend)
  * cancel boundary -> subsequent steps not executed, status=canceled, refund
  * step failure -> failed + subsequent steps not executed
  * semaphore: submitting N+1 runs limits active execution to N
  * Generate path never calls increment_video_count (check_009)
"""
from __future__ import annotations

import asyncio
import copy
from typing import Any, Optional

import pytest

from app.tasks import workflow_run_processor as wrp


# ---------------------------------------------------------------------------
# Fake Supabase: models a single workflow_runs row plus records RPC calls.
# Supports the chains used by the processor:
#   table("workflow_runs").update({...}).eq("id", id).execute()
#   table("workflow_runs").select("*").eq("id", id).single().execute()
#   table("workflow_runs").select("id").eq("status", s).execute()
#   table(<other>).insert({...}).execute()
#   table(<other>).select(...).eq(...).single().execute()
#   rpc(name, params).execute()
# ---------------------------------------------------------------------------
class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Query:
    def __init__(self, table: "_FakeTable", op: str, payload: Any = None) -> None:
        self._table = table
        self._op = op
        self._payload = payload
        self._filters: dict[str, Any] = {}
        self._single = False

    def eq(self, column: str, value: Any) -> "_Query":
        self._filters[column] = value
        return self

    def in_(self, column: str, values: list) -> "_Query":
        self._filters[column] = ("in", values)
        return self

    def single(self) -> "_Query":
        self._single = True
        return self

    def execute(self) -> _Result:
        if self._op == "update":
            self._table.apply_update(self._payload, self._filters)
            return _Result([self._payload])
        if self._op == "insert":
            return _Result(self._table.apply_insert(self._payload))
        # select
        rows = self._table.select_rows(self._filters)
        if self._single:
            return _Result(rows[0] if rows else None)
        return _Result(rows)


class _FakeTable:
    def __init__(self, name: str, db: "FakeSupabase") -> None:
        self.name = name
        self._db = db

    def update(self, payload: dict) -> _Query:
        return _Query(self, "update", payload)

    def insert(self, payload: dict) -> _Query:
        return _Query(self, "insert", payload)

    def select(self, *_columns: str) -> _Query:
        return _Query(self, "select")

    # --- storage-backed operations ---
    def apply_update(self, payload: dict, filters: dict) -> None:
        for row in self._db.rows_for(self.name):
            if self._matches(row, filters):
                row.update(copy.deepcopy(payload))

    def apply_insert(self, payload: dict) -> list[dict]:
        row = copy.deepcopy(payload)
        row.setdefault("id", f"{self.name}-{len(self._db.rows_for(self.name)) + 1}")
        self._db.rows_for(self.name).append(row)
        return [row]

    def select_rows(self, filters: dict) -> list[dict]:
        return [
            copy.deepcopy(r)
            for r in self._db.rows_for(self.name)
            if self._matches(r, filters)
        ]

    @staticmethod
    def _matches(row: dict, filters: dict) -> bool:
        for col, val in filters.items():
            if isinstance(val, tuple) and val[0] == "in":
                if row.get(col) not in val[1]:
                    return False
            elif row.get(col) != val:
                return False
        return True


class FakeSupabase:
    def __init__(self, tables: Optional[dict[str, list[dict]]] = None) -> None:
        self._tables: dict[str, list[dict]] = tables or {}
        self.rpc_calls: list[tuple[str, dict]] = []

    def rows_for(self, name: str) -> list[dict]:
        return self._tables.setdefault(name, [])

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(name, self)

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append((name, params))
        return _Result(None)

    # Test convenience.
    def run_row(self, run_id: str = "run-1") -> dict:
        for row in self.rows_for("workflow_runs"):
            if row["id"] == run_id:
                return row
        raise AssertionError(f"run {run_id} not found")


def _make_run(
    *,
    run_id: str = "run-1",
    user_id: str = "user-1",
    steps: Optional[list[dict]] = None,
    status: str = "pending",
    selection_priority: Optional[str] = "quality",
) -> dict:
    return {
        "id": run_id,
        "user_id": user_id,
        "status": status,
        "current_step": 0,
        "selection_priority": selection_priority,
        "final_output_url": None,
        "error_message": None,
        "compiled_steps": steps if steps is not None else [],
    }


def _step(node_id: str, node_type: str, **overrides) -> dict:
    step = {
        "node_id": node_id,
        "node_type": node_type,
        "params": {},
        "status": "pending",
        "external_task_id": None,
        "output_url": None,
        "provider_used": None,
        "error_message": None,
    }
    step.update(overrides)
    return step


def _patch_supabase(monkeypatch, fake: FakeSupabase) -> None:
    monkeypatch.setattr(wrp, "get_supabase", lambda: fake)


# ===========================================================================
# 1. Minimal chain (Generate -> Dialogue) reaches completed with final_output_url.
# ===========================================================================
@pytest.mark.asyncio
async def test_minimal_chain_completes(monkeypatch):
    steps = [
        _step("gen-1", "generate", params={"image_url": "i", "story_text": "t"}),
        _step("dlg-1", "dialogue", params={"source_video_node_id": "gen-1", "text": "hi"}),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps)]})
    _patch_supabase(monkeypatch, fake)

    async def fake_generate(supabase, ctx, index):
        return "https://r2/gen-1.mp4"

    async def fake_dialogue(supabase, ctx, index):
        # Chain wiring: upstream output must be resolvable.
        assert ctx.outputs["gen-1"] == "https://r2/gen-1.mp4"
        return "https://r2/dlg-1.mp4"

    dispatch = {"generate": fake_generate, "dialogue": fake_dialogue}
    await wrp.start_workflow_run("run-1", dispatch=dispatch)

    row = fake.run_row()
    assert row["status"] == "completed"
    assert row["final_output_url"] == "https://r2/dlg-1.mp4"
    assert row["compiled_steps"][0]["status"] == "completed"
    assert row["compiled_steps"][0]["output_url"] == "https://r2/gen-1.mp4"
    assert row["compiled_steps"][1]["status"] == "completed"
    assert row["current_step"] == 2
    # Fully completed run: nothing unstarted, so no refund.
    assert fake.rpc_calls == []


# ===========================================================================
# 2. Resume: submitting with no external_task_id -> no resend + failed + refund.
# ===========================================================================
@pytest.mark.asyncio
async def test_resume_stuck_submitting_fails_without_resend_and_refunds(monkeypatch):
    steps = [
        # Step 0 was mid-submit when the process died (submitting, no task_id).
        _step(
            "gen-1",
            "generate",
            params={"image_url": "i", "story_text": "t"},
            status="submitting",
            external_task_id=None,
        ),
        # Step 1 never started -> refundable.
        _step("gen-2", "generate", params={"image_url": "i2", "story_text": "t2"}),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps, status="processing")]})
    _patch_supabase(monkeypatch, fake)

    calls = {"generate": 0}

    async def fake_generate(supabase, ctx, index):
        calls["generate"] += 1
        return "https://r2/should-not-run.mp4"

    await wrp.start_workflow_run(
        "run-1", resume=True, dispatch={"generate": fake_generate}
    )

    # No resend of the external submission.
    assert calls["generate"] == 0
    row = fake.run_row()
    assert row["status"] == "failed"
    assert row["compiled_steps"][0]["status"] == "failed"
    assert row["compiled_steps"][0]["error_message"]
    # Refund: only the 1 unstarted (pending) Generate step (gen-2). The stuck
    # submitting step (gen-1) is consumption-confirmed and NOT refunded.
    assert ("release_video_quota", {"p_user_id": "user-1", "p_count": 1}) in fake.rpc_calls


# ===========================================================================
# 3. Resume: step with external_task_id -> polling continues (NO resend).
#    Behavior test: runs the REAL _execute_generate_step (default dispatch) with
#    submit_with_fallback / provider.check_status / download / ffmpeg / r2 mocked.
#    Asserts submit_with_fallback is called 0 times (no double-billing) and that
#    the existing task_id is polled to completion. This test FAILS before the
#    C-1 fix (which resends) and PASSES after it (which reuses the task_id).
# ===========================================================================
@pytest.mark.asyncio
async def test_resume_with_task_id_polls_existing_and_never_resubmits(monkeypatch):
    from app.external.video_provider import VideoGenerationStatus

    # Step 0 already submitted (processing, has task_id + provider_used). On resume
    # the real executor must reuse task_id and poll, NOT call submit_with_fallback.
    steps = [
        _step(
            "gen-1",
            "generate",
            params={
                "image_url": "https://r2/in.png",
                "story_text": "a scene",
                "video_provider": "runway",
                "aspect_ratio": "9:16",
            },
            status="processing",
            external_task_id="task-abc",
            provider_used="runway",
        ),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps, status="processing")]})
    _patch_supabase(monkeypatch, fake)

    import app.external.video_provider as vp

    # submit_with_fallback MUST NOT be called on resume with an existing task_id.
    submit_calls = {"count": 0}

    async def fake_submit(**kwargs):
        submit_calls["count"] += 1
        return "task-NEW-should-not-happen", "runway", False

    monkeypatch.setattr(vp, "submit_with_fallback", fake_submit)

    # The existing task_id must be the one polled.
    polled_task_ids: list[str] = []

    class _FakeStatus:
        status = VideoGenerationStatus.COMPLETED
        video_url = "https://provider/out.mp4"
        error_message = None

    class _FakeProvider:
        async def check_status(self, task_id):
            polled_task_ids.append(task_id)
            return _FakeStatus()

        async def download_video_bytes(self, task_id):
            return b"video-bytes"

    monkeypatch.setattr(vp, "get_video_provider", lambda name: _FakeProvider())

    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr(wrp.asyncio, "sleep", _no_sleep)

    import app.services.ffmpeg_service as ffs

    class _FakeFFmpeg:
        async def process_video(self, video_path, output_path, **kwargs):
            with open(output_path, "wb") as f:
                f.write(b"processed")
            return output_path

    monkeypatch.setattr(ffs, "get_ffmpeg_service", lambda: _FakeFFmpeg())

    import app.external.r2 as r2

    async def fake_upload_video(content, filename):
        return f"https://r2/{filename}"

    monkeypatch.setattr(r2, "upload_video", fake_upload_video)

    # Default dispatch (real _execute_generate_step) — do NOT inject a fake executor.
    await wrp.start_workflow_run("run-1", resume=True)

    # C-1: the external submission must NEVER be re-sent.
    assert submit_calls["count"] == 0, "resume must not re-submit an existing task"
    # The existing task_id was polled to completion.
    assert polled_task_ids == ["task-abc"]
    row = fake.run_row()
    assert row["status"] == "completed"
    assert row["final_output_url"] == "https://r2/user-1/run-1/gen-1.mp4"
    assert row["compiled_steps"][0]["status"] == "completed"
    # task_id preserved (not overwritten by a resend).
    assert row["compiled_steps"][0]["external_task_id"] == "task-abc"
    # No refund (the step completed).
    assert fake.rpc_calls == []


# ===========================================================================
# 4. Cancel boundary: subsequent steps not executed + status stays canceled + refund.
# ===========================================================================
@pytest.mark.asyncio
async def test_cancel_boundary_stops_and_refunds(monkeypatch):
    steps = [
        _step("gen-1", "generate", params={"image_url": "i", "story_text": "t"}),
        _step("gen-2", "generate", params={"image_url": "i2", "story_text": "t2"}),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps)]})
    _patch_supabase(monkeypatch, fake)

    calls = {"count": 0}

    async def fake_generate(supabase, ctx, index):
        calls["count"] += 1
        # After the first step completes, the user cancels the run.
        fake.run_row()["status"] = "canceled"
        return f"https://r2/{ctx.steps[index]['node_id']}.mp4"

    await wrp.start_workflow_run("run-1", dispatch={"generate": fake_generate})

    # First step ran; second step must NOT run (cancel detected at its boundary).
    assert calls["count"] == 1
    row = fake.run_row()
    assert row["status"] == "canceled"
    assert row["compiled_steps"][1]["status"] == "pending"
    # Refund the 1 unstarted Generate step (gen-2). gen-1 completed = consumed.
    assert ("release_video_quota", {"p_user_id": "user-1", "p_count": 1}) in fake.rpc_calls


# ===========================================================================
# 5. Step failure -> failed + subsequent steps not executed.
# ===========================================================================
@pytest.mark.asyncio
async def test_step_failure_marks_failed_and_stops(monkeypatch):
    steps = [
        _step("gen-1", "generate", params={"image_url": "i", "story_text": "t"}),
        _step("dlg-1", "dialogue", params={"source_video_node_id": "gen-1"}),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps)]})
    _patch_supabase(monkeypatch, fake)

    dialogue_ran = {"value": False}

    async def fake_generate(supabase, ctx, index):
        raise wrp.WorkflowStepError("provider exploded")

    async def fake_dialogue(supabase, ctx, index):
        dialogue_ran["value"] = True
        return "https://r2/dlg-1.mp4"

    await wrp.start_workflow_run(
        "run-1", dispatch={"generate": fake_generate, "dialogue": fake_dialogue}
    )

    assert dialogue_ran["value"] is False
    row = fake.run_row()
    assert row["status"] == "failed"
    assert row["compiled_steps"][0]["status"] == "failed"
    assert row["compiled_steps"][0]["error_message"] == "provider exploded"
    assert row["error_message"] == "provider exploded"


# ===========================================================================
# 6. Semaphore: N+1 concurrent runs limit active execution to N.
# ===========================================================================
@pytest.mark.asyncio
async def test_semaphore_limits_concurrency(monkeypatch):
    limit = 3
    # Replace the module semaphore with a small one to test the bound.
    monkeypatch.setattr(wrp, "_semaphore", asyncio.Semaphore(limit))

    n_runs = limit + 1
    runs = [_make_run(run_id=f"run-{i}", steps=[_step(f"g-{i}", "generate")]) for i in range(n_runs)]
    fake = FakeSupabase({"workflow_runs": runs})
    _patch_supabase(monkeypatch, fake)

    active = 0
    max_active = 0
    release = asyncio.Event()

    async def fake_generate(supabase, ctx, index):
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        # Hold the semaphore slot until the test releases it.
        await release.wait()
        active -= 1
        return "https://r2/x.mp4"

    dispatch = {"generate": fake_generate}
    tasks = [
        asyncio.create_task(wrp.start_workflow_run(f"run-{i}", dispatch=dispatch))
        for i in range(n_runs)
    ]

    # Let the scheduler run; only `limit` executors should be active.
    for _ in range(10):
        await asyncio.sleep(0)
    assert max_active == limit, f"expected {limit} active, saw {max_active}"
    assert active == limit

    # Release; all runs finish and the (limit+1)-th gets its turn.
    release.set()
    await asyncio.gather(*tasks)
    assert max_active == limit
    for i in range(n_runs):
        assert fake.run_row(f"run-{i}")["status"] == "completed"


# ===========================================================================
# 7. Generate path never calls increment_video_count (check_009).
#    Runs the REAL _execute_generate_step with provider/ffmpeg/r2 mocked.
# ===========================================================================
@pytest.mark.asyncio
async def test_generate_step_never_increments_video_count(monkeypatch):
    from app.external.video_provider import VideoGenerationStatus

    steps = [
        _step(
            "gen-1",
            "generate",
            params={
                "image_url": "https://r2/in.png",
                "story_text": "a scene",
                "video_provider": "runway",
                "aspect_ratio": "9:16",
            },
        ),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps)]})
    _patch_supabase(monkeypatch, fake)

    # Mock submit_with_fallback -> (task_id, provider, fallback).
    async def fake_submit(**kwargs):
        return "task-xyz", "runway", False

    monkeypatch.setattr(wrp, "get_supabase", lambda: fake)
    import app.external.video_provider as vp

    monkeypatch.setattr(vp, "submit_with_fallback", fake_submit)

    class _FakeStatus:
        status = VideoGenerationStatus.COMPLETED
        video_url = "https://provider/out.mp4"
        error_message = None

    class _FakeProvider:
        async def check_status(self, task_id):
            return _FakeStatus()

        async def download_video_bytes(self, task_id):
            return b"video-bytes"

    monkeypatch.setattr(vp, "get_video_provider", lambda name: _FakeProvider())

    # Avoid real polling sleep.
    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr(wrp.asyncio, "sleep", _no_sleep)

    # Mock ffmpeg + R2.
    import app.services.ffmpeg_service as ffs

    class _FakeFFmpeg:
        async def process_video(self, video_path, output_path, **kwargs):
            with open(output_path, "wb") as f:
                f.write(b"processed")
            return output_path

    monkeypatch.setattr(ffs, "get_ffmpeg_service", lambda: _FakeFFmpeg())

    import app.external.r2 as r2

    async def fake_upload_video(content, filename):
        return f"https://r2/{filename}"

    monkeypatch.setattr(r2, "upload_video", fake_upload_video)

    await wrp.start_workflow_run("run-1")

    row = fake.run_row()
    assert row["status"] == "completed"
    assert row["compiled_steps"][0]["external_task_id"] == "task-xyz"
    assert row["compiled_steps"][0]["provider_used"] == "runway"
    assert row["final_output_url"].startswith("https://r2/")

    # check_009: the Generate path must NEVER call increment_video_count.
    assert all(name != "increment_video_count" for name, _ in fake.rpc_calls)


# ===========================================================================
# 8. submitting protocol persists 'submitting' before external_task_id.
#    Verifies the state transition order pending -> submitting -> processing.
# ===========================================================================
@pytest.mark.asyncio
async def test_submitting_protocol_state_order(monkeypatch):
    from app.external.video_provider import VideoGenerationStatus

    steps = [
        _step(
            "gen-1",
            "generate",
            params={
                "image_url": "https://r2/in.png",
                "story_text": "a scene",
                "video_provider": "runway",
            },
        ),
    ]
    fake = FakeSupabase({"workflow_runs": [_make_run(steps=steps)]})
    _patch_supabase(monkeypatch, fake)

    observed: list[tuple[str, Optional[str]]] = []

    import app.external.video_provider as vp

    async def fake_submit(**kwargs):
        # At submit time the persisted step must already be 'submitting' with no task_id.
        step = fake.run_row()["compiled_steps"][0]
        observed.append((step["status"], step["external_task_id"]))
        return "task-xyz", "runway", False

    monkeypatch.setattr(vp, "submit_with_fallback", fake_submit)

    class _FakeStatus:
        status = VideoGenerationStatus.COMPLETED
        video_url = "https://provider/out.mp4"
        error_message = None

    class _FakeProvider:
        async def check_status(self, task_id):
            return _FakeStatus()

        async def download_video_bytes(self, task_id):
            return b"bytes"

    monkeypatch.setattr(vp, "get_video_provider", lambda name: _FakeProvider())

    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr(wrp.asyncio, "sleep", _no_sleep)

    import app.services.ffmpeg_service as ffs

    class _FakeFFmpeg:
        async def process_video(self, video_path, output_path, **kwargs):
            with open(output_path, "wb") as f:
                f.write(b"processed")
            return output_path

    monkeypatch.setattr(ffs, "get_ffmpeg_service", lambda: _FakeFFmpeg())

    import app.external.r2 as r2

    async def fake_upload_video(content, filename):
        return "https://r2/out.mp4"

    monkeypatch.setattr(r2, "upload_video", fake_upload_video)

    await wrp.start_workflow_run("run-1")

    # At submit time: status was 'submitting' and task_id was still None.
    assert observed == [("submitting", None)]
    row = fake.run_row()
    assert row["compiled_steps"][0]["status"] == "completed"
    assert row["compiled_steps"][0]["external_task_id"] == "task-xyz"


# ===========================================================================
# 9. M-1: cancel-boundary status re-read that raises (race) must NOT fail the run.
#    _read_run_status must swallow the exception and return None so the run
#    keeps running to completion instead of crashing into failed + wrong refund.
# ===========================================================================
def test_read_run_status_returns_none_on_exception():
    """`.single()` raising (0-row race) → None, no propagation."""

    class _RaisingQuery:
        def eq(self, *_args, **_kwargs):
            return self

        def single(self):
            return self

        def execute(self):
            raise RuntimeError("PGRST116: JSON object requested, multiple (or no) rows returned")

    class _RaisingTable:
        def select(self, *_columns):
            return _RaisingQuery()

    class _RaisingSupabase:
        def table(self, _name):
            return _RaisingTable()

    assert wrp._read_run_status(_RaisingSupabase(), "run-1") is None


def test_read_run_status_returns_none_on_zero_rows():
    """`.single()` returning no data → None (not an exception)."""
    fake = FakeSupabase({"workflow_runs": []})
    assert wrp._read_run_status(fake, "missing-run") is None


@pytest.mark.asyncio
async def test_cancel_boundary_read_raises_does_not_fail_run(monkeypatch):
    # Two Generate steps. At the cancel boundary, the status-only re-read
    # (.select("status")...single()) raises — a .single() 0-row race. The REAL
    # _read_run_status must swallow it and return None so the run keeps running
    # to completion instead of crashing into failed + firing a wrong refund.
    # Regression for M-1. This exercises the actual _read_run_status fix (not a
    # monkeypatched stand-in).
    steps = [
        _step("gen-1", "generate", params={"image_url": "i", "story_text": "t"}),
        _step("gen-2", "generate", params={"image_url": "i2", "story_text": "t2"}),
    ]

    class _StatusReadRaisesSupabase(FakeSupabase):
        """FakeSupabase whose status-only SELECT (cancel boundary) always raises.

        _process_workflow_run reads the row via .select("*") (works), while
        _read_run_status uses .select("status") — that one raises to model the race.
        """

        def table(self, name: str):
            table = super().table(name)
            if name != "workflow_runs":
                return table
            original_select = table.select

            def select(*columns):
                if columns == ("status",):
                    class _Raising:
                        def eq(self, *_a, **_k):
                            return self

                        def single(self):
                            return self

                        def execute(self):
                            raise RuntimeError(
                                "PGRST116: JSON object requested, "
                                "multiple (or no) rows returned"
                            )

                    return _Raising()
                return original_select(*columns)

            table.select = select
            return table

    fake = _StatusReadRaisesSupabase({"workflow_runs": [_make_run(steps=steps)]})
    _patch_supabase(monkeypatch, fake)

    calls = {"count": 0}

    async def fake_generate(supabase, ctx, index):
        calls["count"] += 1
        return f"https://r2/{ctx.steps[index]['node_id']}.mp4"

    await wrp.start_workflow_run("run-1", dispatch={"generate": fake_generate})

    row = fake.run_row()
    # M-1: the raised status re-read must NOT flip the run to failed.
    assert row["status"] != "failed"
    # Both steps ran and the run completed normally.
    assert calls["count"] == 2
    assert row["status"] == "completed"
    assert row["final_output_url"] == "https://r2/gen-2.mp4"
    # No erroneous refund fired (run completed, nothing unstarted).
    assert fake.rpc_calls == []


# ===========================================================================
# C1 (SSRF): _prepare_bgm must NOT fetch internal/RFC1918/loopback hosts via
# custom_bgm_url. Host-allowlist gating is applied before download_file so the
# server never issues a server-side request to attacker-controlled internal URLs.
# ===========================================================================
_INTERNAL_BGM_URLS = [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",  # cloud metadata
    "http://localhost:8000/api/v1/videos",  # loopback port scan
    "http://127.0.0.1:6379/",  # loopback (redis)
    "http://10.0.0.5/internal.mp3",  # RFC1918
    "http://192.168.1.10:8080/secret.mp3",  # RFC1918
    "http://[::1]:8000/",  # IPv6 loopback
]


@pytest.mark.asyncio
@pytest.mark.parametrize("bgm_url", _INTERNAL_BGM_URLS)
async def test_prepare_bgm_blocks_ssrf_internal_hosts(monkeypatch, tmp_path, bgm_url):
    """custom_bgm_url pointing at an internal host: no download_file / httpx call,
    _prepare_bgm returns None (BGM is optional -> run continues without BGM)."""
    import app.external.r2 as r2
    import httpx

    # Ensure the R2 allowlist is populated (host validation reads settings).
    monkeypatch.setattr(wrp.settings, "R2_PUBLIC_URL", "https://cdn.example.com", raising=False)

    download_calls: list[str] = []

    async def _spy_download_file(url, *args, **kwargs):
        download_calls.append(url)
        return b"SHOULD-NOT-BE-CALLED"

    monkeypatch.setattr(r2, "download_file", _spy_download_file)

    # Also guard the raw transport: httpx must not be used to reach the host.
    httpx_hosts: list[str] = []

    class _BoomClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, *a, **k):
            httpx_hosts.append(url)
            raise AssertionError(f"httpx must not fetch internal host: {url}")

    monkeypatch.setattr(httpx, "AsyncClient", _BoomClient)

    fake = FakeSupabase({})
    result = await wrp._prepare_bgm(fake, {"custom_bgm_url": bgm_url}, str(tmp_path))

    assert result is None, "internal-host BGM must not produce a downloaded file"
    assert download_calls == [], f"download_file was called for internal host: {download_calls}"
    assert httpx_hosts == [], f"httpx reached internal host: {httpx_hosts}"


@pytest.mark.asyncio
async def test_prepare_bgm_allows_r2_host_regression(monkeypatch, tmp_path):
    """Legitimate R2 custom_bgm_url still downloads (no regression)."""
    import app.external.r2 as r2

    monkeypatch.setattr(wrp.settings, "R2_PUBLIC_URL", "https://cdn.example.com", raising=False)

    download_calls: list[str] = []

    async def _spy_download_file(url, *args, **kwargs):
        download_calls.append(url)
        return b"ID3-fake-mp3-bytes"

    monkeypatch.setattr(r2, "download_file", _spy_download_file)

    r2_url = "https://cdn.example.com/bgm/track-123.mp3"
    fake = FakeSupabase({})
    result = await wrp._prepare_bgm(fake, {"custom_bgm_url": r2_url}, str(tmp_path))

    assert result is not None, "R2-hosted BGM must download successfully"
    assert download_calls == [r2_url]
    with open(result, "rb") as f:
        assert f.read() == b"ID3-fake-mp3-bytes"


@pytest.mark.asyncio
async def test_prepare_bgm_allows_r2_dev_host_regression(monkeypatch, tmp_path):
    """*.r2.dev custom_bgm_url is allowed (dev delivery domain)."""
    import app.external.r2 as r2

    monkeypatch.setattr(wrp.settings, "R2_PUBLIC_URL", "https://cdn.example.com", raising=False)

    download_calls: list[str] = []

    async def _spy_download_file(url, *args, **kwargs):
        download_calls.append(url)
        return b"ID3-fake-mp3-bytes"

    monkeypatch.setattr(r2, "download_file", _spy_download_file)

    r2_dev_url = "https://pub-abc123.r2.dev/bgm/track-9.mp3"
    fake = FakeSupabase({})
    result = await wrp._prepare_bgm(fake, {"custom_bgm_url": r2_dev_url}, str(tmp_path))

    assert result is not None
    assert download_calls == [r2_dev_url]


@pytest.mark.asyncio
async def test_prepare_bgm_download_does_not_follow_redirects(monkeypatch, tmp_path):
    """BGM download must not follow redirects (an allowed host could 302 to an
    internal one). The BGM call passes follow_redirects=False to download_file."""
    import app.external.r2 as r2

    monkeypatch.setattr(wrp.settings, "R2_PUBLIC_URL", "https://cdn.example.com", raising=False)

    captured_kwargs: dict = {}

    async def _spy_download_file(url, *args, **kwargs):
        captured_kwargs.update(kwargs)
        return b"ID3-fake-mp3-bytes"

    monkeypatch.setattr(r2, "download_file", _spy_download_file)

    r2_url = "https://cdn.example.com/bgm/track-123.mp3"
    fake = FakeSupabase({})
    result = await wrp._prepare_bgm(fake, {"custom_bgm_url": r2_url}, str(tmp_path))

    assert result is not None
    assert captured_kwargs.get("follow_redirects") is False, (
        "BGM download must be issued with follow_redirects=False to prevent "
        f"redirect-based allowlist bypass; got kwargs={captured_kwargs}"
    )
