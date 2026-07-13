"""Tests for the server-side workflow execution API (task_006).

The DB (supabase), the run processor (start_workflow_run) and the graph compiler
are all mocked/stubbed. These tests verify that the HTTP layer + service layer:
  * compile the saved graph and map validation errors to 400,
  * enforce plan-based batch limits (403) and atomic quota reservation (403),
  * insert B workflow_runs and register B background tasks on success,
  * refund via release_video_quota when insertion fails after a successful reserve,
  * scope list/detail/cancel to the caller's own runs (404 for others),
  * keep runs routes from being captured by GET /workflows/{workflow_id}.

NOTE on atomicity: the *DB-level* atomicity of ``reserve_video_quota`` (only one of two
concurrent execute calls succeeds) is guaranteed by the SQL function itself and is verified
in task_001. Here we only fix ``reserve_video_quota`` return values via a mock and assert the
API maps a false result to 403 and a true result to a reservation; the mock does not reproduce
real concurrency.
"""
from __future__ import annotations

import copy
import uuid
from typing import Any, Optional

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_current_user
import app.workflows.service as wf_service
import app.workflows.router as wf_router


# ---------------------------------------------------------------------------
# Fake Supabase: models user_workflows + workflow_runs, records RPC calls, and
# lets each test dictate the reserve_video_quota return value.
# Supported chains:
#   table(t).select("*").eq(col,val).single().execute()
#   table(t).select("*").eq(col,val)[.eq(...)][.order(...)][.range(...)].execute()
#   table(t).insert({...}).execute()
#   table(t).update({...}).eq(col,val).execute()
#   rpc(name, params).execute()
# ---------------------------------------------------------------------------
class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _RpcCall:
    """Mirrors the real supabase client's ``rpc(name, params).execute()`` shape."""

    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _Query:
    def __init__(self, table: "_FakeTable", op: str, payload: Any = None) -> None:
        self._table = table
        self._op = op
        self._payload = payload
        self._filters: dict[str, Any] = {}
        self._single = False
        self._range: Optional[tuple[int, int]] = None

    def eq(self, column: str, value: Any) -> "_Query":
        self._filters[column] = value
        return self

    def order(self, *_args, **_kwargs) -> "_Query":
        return self

    def range(self, start: int, end: int) -> "_Query":
        self._range = (start, end)
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
        rows = self._table.select_rows(self._filters)
        if self._single:
            if self._table._db.raise_on_missing_single and not rows:
                raise RuntimeError("no rows for single()")
            return _Result(rows[0] if rows else None)
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        return _Result(rows)


class _FakeTable:
    def __init__(self, name: str, db: "FakeSupabase") -> None:
        self.name = name
        self._db = db

    def update(self, payload: dict) -> _Query:
        return _Query(self, "update", payload)

    def insert(self, payload: dict) -> _Query:
        if self._db.insert_error:
            raise RuntimeError("insert boom")
        return _Query(self, "insert", payload)

    def select(self, *_columns: str) -> _Query:
        return _Query(self, "select")

    def apply_update(self, payload: dict, filters: dict) -> None:
        for row in self._db.rows_for(self.name):
            if self._matches(row, filters):
                row.update(copy.deepcopy(payload))

    def apply_insert(self, payload: dict) -> list[dict]:
        row = copy.deepcopy(payload)
        # Real Postgres assigns a UUID id; mirror that so UUID-typed responses validate.
        row.setdefault("id", str(uuid.uuid4()))
        row.setdefault("created_at", "2026-07-11T00:00:00Z")
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
            if row.get(col) != val:
                return False
        return True


class FakeSupabase:
    def __init__(self, tables: Optional[dict[str, list[dict]]] = None) -> None:
        self._tables: dict[str, list[dict]] = tables or {}
        self.rpc_calls: list[tuple[str, dict]] = []
        self.reserve_result: bool = True  # reserve_video_quota return value
        self.insert_error: bool = False  # raise on the next insert()
        self.raise_on_missing_single: bool = False

    def rows_for(self, name: str) -> list[dict]:
        return self._tables.setdefault(name, [])

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(name, self)

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append((name, params))
        data = self.reserve_result if name == "reserve_video_quota" else None
        return _RpcCall(data)


# ---------------------------------------------------------------------------
# Graph builders. A minimal single-Generate I2V graph (one ImageInput).
# ---------------------------------------------------------------------------
def _single_generate_graph() -> tuple[list[dict], list[dict]]:
    nodes = [
        {"id": "img-1", "data": {"type": "imageInput", "imageUrl": "https://r2/base.png"}},
        {"id": "prm-1", "data": {"type": "prompt", "englishPrompt": "a cat", "subjectType": "person"}},
        {"id": "prv-1", "data": {"type": "provider", "provider": "runway", "aspectRatio": "9:16"}},
        {"id": "gen-1", "data": {"type": "generate"}},
    ]
    edges = [
        {"source": "img-1", "target": "gen-1", "targetHandle": "image_url"},
        {"source": "prm-1", "target": "gen-1", "targetHandle": "story_text"},
        {"source": "prv-1", "target": "gen-1", "targetHandle": "config"},
    ]
    return nodes, edges


def _two_image_input_graph() -> tuple[list[dict], list[dict]]:
    """Two ImageInput nodes -> batch precondition violation (needs exactly one)."""
    nodes, edges = _single_generate_graph()
    nodes.append(
        {"id": "img-2", "data": {"type": "imageInput", "imageUrl": "https://r2/other.png"}}
    )
    return nodes, edges


def _unsupported_node_graph() -> tuple[list[dict], list[dict]]:
    nodes, edges = _single_generate_graph()
    nodes.append({"id": "weird-1", "data": {"type": "quantumFluxNode"}})
    return nodes, edges


def _two_generate_graph() -> tuple[list[dict], list[dict]]:
    nodes, edges = _single_generate_graph()
    nodes.append({"id": "gen-2", "data": {"type": "generate"}})
    return nodes, edges


def _workflow_row(user_id: str, nodes: list, edges: list, wf_id: str = None) -> dict:
    return {
        "id": wf_id or WF_ID,
        "user_id": user_id,
        "name": "test wf",
        "description": None,
        "nodes": nodes,
        "edges": edges,
        "is_public": False,
        "created_at": "2026-07-11T00:00:00Z",
        "updated_at": "2026-07-11T00:00:00Z",
    }


USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_ID = "22222222-2222-2222-2222-222222222222"
# Valid UUIDs for path params / response fields (the API enforces UUID types).
WF_ID = "33333333-3333-3333-3333-333333333333"
RUN_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
RUN_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
RUN_C = "cccccccc-cccc-cccc-cccc-cccccccccccc"
RUN_D = "dddddddd-dddd-dddd-dddd-dddddddddddd"
RUN_E = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
BATCH_ID = "99999999-9999-9999-9999-999999999999"


def _user(plan_type: str = "pro", video_count: int = 0) -> dict:
    return {
        "user_id": USER_ID,
        "email": "u@example.com",
        "display_name": "U",
        "plan_type": plan_type,
        "video_count_this_month": video_count,
    }


# ---------------------------------------------------------------------------
# Test harness: TestClient with get_current_user overridden, get_supabase
# patched to the fake, and start_workflow_run stubbed so background tasks
# never touch a real DB. background_tasks calls are captured.
# ---------------------------------------------------------------------------
@pytest.fixture
def client_ctx(monkeypatch):
    fake = FakeSupabase()
    started: list[str] = []

    def fake_get_supabase():
        return fake

    monkeypatch.setattr(wf_router, "get_supabase", fake_get_supabase)

    async def fake_start(run_id, *args, **kwargs):
        started.append(run_id)

    # start_workflow_run is imported into the service module namespace.
    monkeypatch.setattr(wf_service, "start_workflow_run", fake_start)

    current = {"user": _user()}

    def override_user():
        return current["user"]

    app.dependency_overrides[get_current_user] = override_user
    client = TestClient(app)
    try:
        yield client, fake, started, current
    finally:
        app.dependency_overrides.pop(get_current_user, None)


# ===========================================================================
# execute: happy path (single run, N reserved correctly, 1 insert, 1 bg task).
# ===========================================================================
def test_execute_single_run_202(client_ctx):
    client, fake, started, _ = client_ctx
    nodes, edges = _single_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    resp = client.post(f"/api/v1/workflows/{WF_ID}/execute", json={})
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert len(body["run_ids"]) == 1
    assert body["batch_id"]

    # Exactly one row inserted, one background task registered.
    runs = fake.rows_for("workflow_runs")
    assert len(runs) == 1
    assert runs[0]["reserved_generations"] == 1
    assert runs[0]["status"] == "pending"
    assert runs[0]["batch_index"] == 0
    assert started == [runs[0]["id"]]

    # reserve_video_quota called with N=1 and the pro monthly limit (15).
    reserve = [c for c in fake.rpc_calls if c[0] == "reserve_video_quota"]
    assert len(reserve) == 1
    assert reserve[0][1] == {"p_user_id": USER_ID, "p_count": 1, "p_limit": 15}
    # No refund on success.
    assert not any(c[0] == "release_video_quota" for c in fake.rpc_calls)


def test_execute_batch_reserves_N_times_B(client_ctx):
    client, fake, started, current = client_ctx
    current["user"] = _user(plan_type="pro")  # max_batch_size=3
    nodes, edges = _single_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    resp = client.post(
        f"/api/v1/workflows/{WF_ID}/execute",
        json={"input_image_urls": ["https://r2/a.png", "https://r2/b.png"]},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert len(body["run_ids"]) == 2

    runs = fake.rows_for("workflow_runs")
    assert len(runs) == 2
    assert {r["batch_index"] for r in runs} == {0, 1}
    # graph_snapshot ImageInput URL replaced per batch index.
    urls = sorted(
        next(
            n["data"]["imageUrl"]
            for n in r["graph_snapshot"]["nodes"]
            if n["data"]["type"] == "imageInput"
        )
        for r in runs
    )
    assert urls == ["https://r2/a.png", "https://r2/b.png"]
    assert len(started) == 2

    # N = Generate(1) * B(2) = 2.
    reserve = [c for c in fake.rpc_calls if c[0] == "reserve_video_quota"]
    assert reserve[0][1]["p_count"] == 2


# ===========================================================================
# execute: 400 mapping (unsupported node / multiple Generate / batch precond).
# ===========================================================================
def test_execute_unsupported_node_400_with_name(client_ctx):
    client, fake, _, _ = client_ctx
    nodes, edges = _unsupported_node_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    resp = client.post(f"/api/v1/workflows/{WF_ID}/execute", json={})
    assert resp.status_code == 400, resp.text
    assert "quantumFluxNode" in resp.json()["detail"]
    # No reservation attempted on a compile error.
    assert not any(c[0] == "reserve_video_quota" for c in fake.rpc_calls)


def test_execute_multiple_generate_400_with_guidance(client_ctx):
    client, fake, _, _ = client_ctx
    nodes, edges = _two_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    resp = client.post(f"/api/v1/workflows/{WF_ID}/execute", json={})
    assert resp.status_code == 400, resp.text
    # Guidance mentions the single-Generate limitation.
    assert "生成ノード" in resp.json()["detail"]


def test_execute_batch_precondition_violation_400(client_ctx):
    client, fake, current = client_ctx[0], client_ctx[1], client_ctx[3]
    current["user"] = _user(plan_type="business")  # batch limit high enough (10)
    nodes, edges = _two_image_input_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    # Two ImageInput nodes -> batch precondition fails (needs exactly one).
    resp = client.post(
        f"/api/v1/workflows/{WF_ID}/execute",
        json={"input_image_urls": ["https://r2/a.png", "https://r2/b.png"]},
    )
    assert resp.status_code == 400, resp.text
    assert "ImageInput" in resp.json()["detail"]
    assert not any(c[0] == "reserve_video_quota" for c in fake.rpc_calls)


# ===========================================================================
# execute: 403 (reservation false / batch limit exceeded).
# ===========================================================================
def test_execute_reservation_false_403_with_shortfall(client_ctx):
    client, fake, _, current = client_ctx
    current["user"] = _user(plan_type="free", video_count=3)  # limit 3, 0 remaining
    fake.reserve_result = False  # SQL function would return false (over limit)
    nodes, edges = _single_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    resp = client.post(f"/api/v1/workflows/{WF_ID}/execute", json={})
    assert resp.status_code == 403, resp.text
    detail = resp.json()["detail"]
    assert "不足" in detail
    # Reserve was called, but false -> no rows inserted, no bg tasks.
    assert any(c[0] == "reserve_video_quota" for c in fake.rpc_calls)
    assert fake.rows_for("workflow_runs") == []


def test_execute_batch_limit_exceeded_403(client_ctx):
    client, fake, _, current = client_ctx
    current["user"] = _user(plan_type="free")  # max_batch_size=1
    nodes, edges = _single_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))

    resp = client.post(
        f"/api/v1/workflows/{WF_ID}/execute",
        json={"input_image_urls": ["https://r2/a.png", "https://r2/b.png"]},
    )
    assert resp.status_code == 403, resp.text
    assert "バッチ" in resp.json()["detail"]
    # Batch-limit check precedes reservation.
    assert not any(c[0] == "reserve_video_quota" for c in fake.rpc_calls)


# ===========================================================================
# execute: 404 for another user's workflow.
# ===========================================================================
def test_execute_other_users_workflow_404(client_ctx):
    client, fake, _, _ = client_ctx
    nodes, edges = _single_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(OTHER_ID, nodes, edges))

    resp = client.post(f"/api/v1/workflows/{WF_ID}/execute", json={})
    assert resp.status_code == 404, resp.text


# ===========================================================================
# execute: refund path (reserve succeeds, INSERT raises -> release_video_quota).
# ===========================================================================
def test_execute_refunds_on_insert_failure(client_ctx):
    client, fake, _, _ = client_ctx
    nodes, edges = _single_generate_graph()
    fake.rows_for("user_workflows").append(_workflow_row(USER_ID, nodes, edges))
    fake.insert_error = True  # workflow_runs insert will raise after a successful reserve

    resp = client.post(f"/api/v1/workflows/{WF_ID}/execute", json={})
    assert resp.status_code == 500, resp.text
    # Reserve happened, then release_video_quota refunded the same count.
    reserve = [c for c in fake.rpc_calls if c[0] == "reserve_video_quota"]
    release = [c for c in fake.rpc_calls if c[0] == "release_video_quota"]
    assert len(reserve) == 1
    assert release == [("release_video_quota", {"p_user_id": USER_ID, "p_count": 1})]


# ===========================================================================
# list / detail: only own runs, correct shape.
# ===========================================================================
def test_list_runs_returns_only_own(client_ctx):
    client, fake, _, _ = client_ctx
    fake.rows_for("workflow_runs").extend(
        [
            {
                "id": RUN_A,
                "user_id": USER_ID,
                "workflow_id": WF_ID,
                "batch_id": BATCH_ID,
                "status": "completed",
                "compiled_steps": [{"node_id": "g", "node_type": "generate", "status": "completed"}],
                "final_output_url": "https://r2/out.mp4",
                "error_message": None,
                "created_at": "2026-07-11T00:00:00Z",
            },
            {
                "id": RUN_B,
                "user_id": OTHER_ID,
                "workflow_id": WF_ID,
                "batch_id": BATCH_ID,
                "status": "processing",
                "compiled_steps": [],
                "created_at": "2026-07-11T00:00:00Z",
            },
        ]
    )

    resp = client.get("/api/v1/workflows/runs")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = [r["id"] for r in body["runs"]]
    assert ids == [RUN_A]
    assert body["runs"][0]["progress"] == 100
    assert body["runs"][0]["final_output_url"] == "https://r2/out.mp4"


def test_get_run_detail_shape(client_ctx):
    client, fake, _, _ = client_ctx
    fake.rows_for("workflow_runs").append(
        {
            "id": RUN_A,
            "user_id": USER_ID,
            "workflow_id": WF_ID,
            "batch_id": BATCH_ID,
            "status": "processing",
            "compiled_steps": [
                {
                    "node_id": "gen-1",
                    "node_type": "generate",
                    "status": "completed",
                    "output_url": "https://r2/gen.mp4",
                    "provider_used": "runway",
                },
                {"node_id": "dlg-1", "node_type": "dialogue", "status": "pending"},
            ],
            "created_at": "2026-07-11T00:00:00Z",
        }
    )

    resp = client.get(f"/api/v1/workflows/runs/{RUN_A}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["steps"]) == 2
    assert body["steps"][0]["node_id"] == "gen-1"
    assert body["steps"][0]["provider_used"] == "runway"
    assert body["steps"][1]["status"] == "pending"
    # 1 of 2 steps completed -> 50% progress.
    assert body["progress"] == 50


def test_get_run_other_user_404(client_ctx):
    client, fake, _, _ = client_ctx
    fake.rows_for("workflow_runs").append(
        {
            "id": RUN_E,
            "user_id": OTHER_ID,
            "workflow_id": WF_ID,
            "batch_id": BATCH_ID,
            "status": "completed",
            "compiled_steps": [],
            "created_at": "2026-07-11T00:00:00Z",
        }
    )
    resp = client.get(f"/api/v1/workflows/runs/{RUN_E}")
    assert resp.status_code == 404, resp.text


def test_get_run_missing_404(client_ctx):
    client, fake, _, _ = client_ctx
    fake.raise_on_missing_single = True  # emulate PostgREST single() raising on no rows
    resp = client.get(f"/api/v1/workflows/runs/{RUN_A}")
    assert resp.status_code == 404, resp.text


# ===========================================================================
# cancel: pending/processing -> canceled, completed -> 400, other user -> 404.
# ===========================================================================
@pytest.mark.parametrize("start_status", ["pending", "processing"])
def test_cancel_pending_or_processing(client_ctx, start_status):
    client, fake, _, _ = client_ctx
    fake.rows_for("workflow_runs").append(
        {
            "id": RUN_C,
            "user_id": USER_ID,
            "workflow_id": WF_ID,
            "batch_id": BATCH_ID,
            "status": start_status,
            "compiled_steps": [],
            "created_at": "2026-07-11T00:00:00Z",
        }
    )
    resp = client.post(f"/api/v1/workflows/runs/{RUN_C}/cancel")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "canceled"
    assert fake.rows_for("workflow_runs")[0]["status"] == "canceled"


def test_cancel_completed_400(client_ctx):
    client, fake, _, _ = client_ctx
    fake.rows_for("workflow_runs").append(
        {
            "id": RUN_D,
            "user_id": USER_ID,
            "workflow_id": WF_ID,
            "batch_id": BATCH_ID,
            "status": "completed",
            "compiled_steps": [],
            "created_at": "2026-07-11T00:00:00Z",
        }
    )
    resp = client.post(f"/api/v1/workflows/runs/{RUN_D}/cancel")
    assert resp.status_code == 400, resp.text
    # State unchanged.
    assert fake.rows_for("workflow_runs")[0]["status"] == "completed"


def test_cancel_other_user_404(client_ctx):
    client, fake, _, _ = client_ctx
    fake.rows_for("workflow_runs").append(
        {
            "id": RUN_E,
            "user_id": OTHER_ID,
            "workflow_id": WF_ID,
            "batch_id": BATCH_ID,
            "status": "processing",
            "compiled_steps": [],
            "created_at": "2026-07-11T00:00:00Z",
        }
    )
    resp = client.post(f"/api/v1/workflows/runs/{RUN_E}/cancel")
    assert resp.status_code == 404, resp.text


# ===========================================================================
# Route order regression: GET /workflows/runs must NOT be captured by
# GET /workflows/{workflow_id} (declared later). If it were, it would try to
# treat "runs" as a workflow_id and 404/422 instead of returning the run list.
# ===========================================================================
def test_route_order_runs_not_eaten_by_workflow_id(client_ctx):
    client, fake, _, _ = client_ctx
    # No workflow with id "runs" exists; if the wildcard captured it we'd 404.
    resp = client.get("/api/v1/workflows/runs")
    assert resp.status_code == 200, resp.text
    assert resp.json()["runs"] == []
