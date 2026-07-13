"""ワークフロー実行 (server-side run) のサービス層 (task_006)。

保存済みワークフロー (user_workflows) をサーバー実行する。責務:
  * グラフを ``workflow_engine.compile_graph`` でコンパイル (検証エラーは 400 にマップ)。
  * バッチ判定 (``input_image_urls`` 指定時) とプラン別バッチ上限の強制 (403)。
  * **原子的クォータ予約** (``reserve_video_quota`` RPC) → false は 403、成功後の失敗は
    ``release_video_quota`` で即時返金。
  * B 件の ``workflow_runs`` を **service-role クライアント** で INSERT し、各 run を
    ``start_workflow_run`` で BackgroundTasks に登録。

このモジュールは基盤 (workflow_engine / workflow_run_processor / reserve/release RPC) を
**呼ぶだけ**で、再実装しない。DB 操作は呼び出し元から渡された service-role ``supabase``
クライアント (``app.core.supabase.get_supabase()``) を使う (RLS は SELECT-only のため
INSERT には service-role が必須)。
"""
from __future__ import annotations

import copy
import logging
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.dependencies import get_plan_limits
from app.services.workflow_engine import (
    BatchPreconditionError,
    MultipleGenerateError,
    UnsupportedNodeError,
    V2vChainNotSupportedError,
    WorkflowGraphError,
    compile_graph,
    validate_batch_preconditions,
)
from app.tasks.workflow_run_processor import start_workflow_run
from .schemas import ExecuteRequest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ワークフロー取得 (所有権チェックつき)。
# ---------------------------------------------------------------------------
def _fetch_owned_workflow(supabase, user_id: str, workflow_id: str) -> dict:
    """自分が所有するワークフローを取得する。他人/不存在は 404。

    実行 (execute) は所有者のみ許可する (公開ワークフローは複製してから実行する運用)。
    """
    try:
        response = (
            supabase.table("user_workflows")
            .select("*")
            .eq("id", workflow_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.info(f"workflow not found for execute: {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません",
        )

    workflow = response.data
    if not workflow or workflow.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ワークフローが見つかりません",
        )
    return workflow


# ---------------------------------------------------------------------------
# コンパイル (検証エラー -> 400 マップ)。
# ---------------------------------------------------------------------------
def _compile_or_400(nodes: list, edges: list) -> list:
    """グラフをコンパイルする。検証系エラーは 400 にマップして再送出する。"""
    try:
        return compile_graph(nodes, edges)
    except UnsupportedNodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "未対応のノードが含まれています: "
                + ", ".join(sorted(set(e.node_types)))
            ),
        )
    except V2vChainNotSupportedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "動画から動画への連結生成 (v2v チェーン) はサーバー実行では未対応です。"
                "クライアント実行をご利用ください。"
            ),
        )
    except MultipleGenerateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except WorkflowGraphError as e:
        # 入力欠落 / 循環 / その他の構造エラー。
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


def _count_generate_steps(compiled_steps: list) -> int:
    """コンパイル済みステップ列内の Generate ステップ数を数える (予約数 N の 1 run 分)。"""
    return sum(1 for s in compiled_steps if _step_node_type(s) == "generate")


def _step_node_type(step) -> str:
    """Step オブジェクト / dict どちらでも node_type を取り出す。"""
    if isinstance(step, dict):
        return step.get("node_type", "")
    return getattr(step, "node_type", "")


def _steps_to_dicts(compiled_steps: list) -> list[dict]:
    """compiled_steps を DB 保存可能な dict 列に変換し、実行状態フィールドを付与する。

    workflow_run_processor が読む形 (node_id, node_type, params, status, external_task_id,
    output_url, provider_used, error_message) に揃える。
    """
    result: list[dict] = []
    for step in compiled_steps:
        if isinstance(step, dict):
            base = {
                "node_id": step.get("node_id"),
                "node_type": step.get("node_type"),
                "params": step.get("params") or {},
            }
        else:
            base = step.to_dict()
        base.update(
            {
                "status": "pending",
                "external_task_id": None,
                "output_url": None,
                "provider_used": None,
                "error_message": None,
            }
        )
        result.append(base)
    return result


# ---------------------------------------------------------------------------
# ImageInput 画像 URL の差し替え (バッチ実行時)。
# ---------------------------------------------------------------------------
def _replace_image_input_url(nodes: list, image_url: str) -> list:
    """グラフ内の唯一の ImageInput ノードの imageUrl を差し替えたノード列を返す (深いコピー)。

    バッチ前提 (validate_batch_preconditions) により ImageInput はちょうど 1 個であることが
    保証されているため、最初に見つかった imageInput を差し替える。
    """
    new_nodes = copy.deepcopy(nodes)
    for node in new_nodes:
        data = node.get("data") or {}
        node_type = data.get("type") or node.get("type")
        if node_type == "imageInput":
            data["imageUrl"] = image_url
            node["data"] = data
            break
    return new_nodes


# ---------------------------------------------------------------------------
# 予約 (原子的) — false は 403 (不足文言つき)。
# ---------------------------------------------------------------------------
def _reserve_or_403(supabase, user: dict, count: int) -> None:
    """``reserve_video_quota`` を呼び、false なら 403 を送出する。

    reserve_video_quota は上限内なら加算して true、超過なら加算せず false を返す
    (SQL 関数側で原子的に判定; TOCTOU 安全)。不足数 = 必要 count − 残数 を文言に含める。
    残数 = 月次上限 − 今月の生成数。
    """
    limits = get_plan_limits(user["plan_type"])
    monthly_limit = limits["max_videos_per_month"]
    try:
        result = supabase.rpc(
            "reserve_video_quota",
            {
                "p_user_id": user["user_id"],
                "p_count": count,
                "p_limit": monthly_limit,
            },
        ).execute()
    except Exception as e:
        logger.error(f"reserve_video_quota RPC failed for user {user['user_id']}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="クォータ予約に失敗しました",
        )

    if result.data is not True:
        remaining = max(0, monthly_limit - user.get("video_count_this_month", 0))
        shortfall = max(1, count - remaining)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"月間の生成上限に達しています (必要 {count} 本 / 残り {remaining} 本、"
                f"{shortfall} 本不足)。プランをアップグレードしてください。"
            ),
        )


def _release_quota(supabase, user_id: str, count: int) -> None:
    """``release_video_quota`` で予約を返金する (失敗はログのみ、下限0で返金)。"""
    if count <= 0:
        return
    try:
        supabase.rpc(
            "release_video_quota",
            {"p_user_id": user_id, "p_count": count},
        ).execute()
    except Exception:
        logger.exception(
            f"release_video_quota refund failed: user={user_id} count={count}"
        )


# ---------------------------------------------------------------------------
# 公開: create_runs (execute エンドポイント本体)。
# ---------------------------------------------------------------------------
def create_runs(
    supabase,
    user: dict,
    workflow_id: str,
    req: ExecuteRequest,
    background_tasks,
) -> dict:
    """保存済みワークフローをサーバー実行する (バッチ対応 + 原子的クォータ予約)。

    Returns:
        {"batch_id": str, "run_ids": list[str]}

    Raises:
        HTTPException 404: 他人/不存在のワークフロー。
        HTTPException 400: 未対応ノード / 複数 Generate / v2v / バッチ前提違反 / 入力欠落。
        HTTPException 403: バッチ上限超過 / クォータ予約不足。
    """
    user_id = user["user_id"]
    workflow = _fetch_owned_workflow(supabase, user_id, workflow_id)

    nodes = workflow.get("nodes") or []
    edges = workflow.get("edges") or []

    # (b) コンパイル (検証エラーは 400)。
    compiled = _compile_or_400(nodes, edges)

    # (c) バッチ判定。
    input_image_urls = req.input_image_urls
    if input_image_urls:
        try:
            validate_batch_preconditions(nodes, edges)
        except BatchPreconditionError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        batch_size = len(input_image_urls)
    else:
        batch_size = 1

    # (d) プラン別バッチ上限。
    limits = get_plan_limits(user["plan_type"])
    max_batch = limits["max_batch_size"]
    if batch_size > max_batch:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"バッチ実行の上限は {max_batch} 件です (要求: {batch_size} 件)。"
                "上位プランでより大きなバッチが利用できます。"
            ),
        )

    # (e) 予約数 N = Generate ステップ数 × バッチ数。
    generate_per_run = _count_generate_steps(compiled)
    reserve_count = generate_per_run * batch_size
    _reserve_or_403(supabase, user, reserve_count)

    # (f)(g) 予約成功後は、失敗したら必ず返金する。
    batch_id = str(uuid4())
    provider = req.video_provider
    priority = req.selection_priority

    try:
        run_ids = _insert_runs(
            supabase,
            user_id=user_id,
            workflow_id=workflow_id,
            batch_id=batch_id,
            nodes=nodes,
            edges=edges,
            compiled=compiled,
            input_image_urls=input_image_urls,
            batch_size=batch_size,
            reserved_per_run=generate_per_run,
            provider=provider,
            priority=priority,
        )
    except HTTPException:
        _release_quota(supabase, user_id, reserve_count)
        raise
    except Exception as e:
        _release_quota(supabase, user_id, reserve_count)
        logger.error(f"failed to insert workflow_runs for {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="実行の作成に失敗しました",
        )

    # (h) 各 run をバックグラウンド起動する。
    for run_id in run_ids:
        background_tasks.add_task(start_workflow_run, run_id)

    return {"batch_id": batch_id, "run_ids": run_ids}


def _insert_runs(
    supabase,
    *,
    user_id: str,
    workflow_id: str,
    batch_id: str,
    nodes: list,
    edges: list,
    compiled: list,
    input_image_urls,
    batch_size: int,
    reserved_per_run: int,
    provider,
    priority,
) -> list[str]:
    """B 件の workflow_runs を service-role クライアントで INSERT し run_id 群を返す。

    各 run は batch_id を共有し、batch_index を持つ。バッチ時は ImageInput 画像を
    input_image_urls[i] に差し替えた graph_snapshot / compiled_steps を保存する。
    """
    run_ids: list[str] = []
    for index in range(batch_size):
        if input_image_urls:
            run_nodes = _replace_image_input_url(nodes, input_image_urls[index])
            run_compiled = _compile_or_400(run_nodes, edges)
        else:
            run_nodes = nodes
            run_compiled = compiled

        record = {
            "user_id": user_id,
            "workflow_id": workflow_id,
            "batch_id": batch_id,
            "batch_index": index,
            "graph_snapshot": {"nodes": run_nodes, "edges": edges},
            "compiled_steps": _steps_to_dicts(run_compiled),
            "status": "pending",
            "current_step": 0,
            "reserved_generations": reserved_per_run,
            "video_provider": provider,
            "selection_priority": priority,
        }
        response = supabase.table("workflow_runs").insert(record).execute()
        if not response.data:
            raise RuntimeError("workflow_runs insert returned no data")
        run_ids.append(response.data[0]["id"])
    return run_ids


# ---------------------------------------------------------------------------
# 一覧 / 詳細 / キャンセル。
# ---------------------------------------------------------------------------
_PROGRESS_BY_STATUS = {
    "pending": 0,
    "submitting": 10,
    "processing": 50,
    "completed": 100,
    "failed": 100,
    "canceled": 100,
}


def _run_progress(run: dict) -> int:
    """run の進捗率 (0-100) を算出する。

    完了/失敗/キャンセルは 100、pending は 0。processing 中はステップ進捗
    (完了ステップ数 / 総ステップ数) を 0-100 に換算する。
    """
    run_status = run.get("status", "pending")
    if run_status in ("completed", "failed", "canceled"):
        return 100
    if run_status == "pending":
        return 0
    steps = run.get("compiled_steps") or []
    if steps:
        done = sum(1 for s in steps if s.get("status") == "completed")
        return int(done * 100 / len(steps))
    return _PROGRESS_BY_STATUS.get(run_status, 0)


def _to_run_response_dict(run: dict) -> dict:
    """workflow_runs 行を RunResponse 互換 dict に整形する。"""
    return {
        "id": run["id"],
        "workflow_id": run.get("workflow_id"),
        "batch_id": run.get("batch_id"),
        "status": run.get("status", "pending"),
        "progress": _run_progress(run),
        "final_output_url": run.get("final_output_url"),
        "error_message": run.get("error_message"),
        "created_at": run.get("created_at"),
    }


def list_runs(
    supabase,
    user: dict,
    workflow_id=None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """自分の workflow_runs を作成日時の降順で取得する (任意で workflow_id 絞り込み)。"""
    user_id = user["user_id"]
    page = max(1, page)
    per_page = max(1, min(100, per_page))
    offset = (page - 1) * per_page

    try:
        query = (
            supabase.table("workflow_runs")
            .select("*")
            .eq("user_id", user_id)
        )
        if workflow_id:
            query = query.eq("workflow_id", str(workflow_id))
        response = (
            query.order("created_at", desc=True)
            .range(offset, offset + per_page - 1)
            .execute()
        )
    except Exception as e:
        logger.error(f"failed to list workflow_runs for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="実行履歴の取得に失敗しました",
        )

    rows = response.data or []
    return {
        "runs": [_to_run_response_dict(r) for r in rows],
        "total": len(rows),
        "page": page,
        "per_page": per_page,
    }


def _fetch_owned_run(supabase, user_id: str, run_id: str) -> dict:
    """自分の workflow_run を取得する。他人/不存在は 404。"""
    try:
        response = (
            supabase.table("workflow_runs")
            .select("*")
            .eq("id", str(run_id))
            .single()
            .execute()
        )
    except Exception as e:
        logger.info(f"workflow_run not found: {run_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="実行が見つかりません",
        )

    run = response.data
    if not run or run.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="実行が見つかりません",
        )
    return run


def get_run(supabase, user: dict, run_id) -> dict:
    """自分の workflow_run 詳細 (ステップ内訳つき) を取得する。他人は 404。"""
    run = _fetch_owned_run(supabase, user["user_id"], run_id)
    detail = _to_run_response_dict(run)
    detail["steps"] = [
        {
            "node_id": s.get("node_id"),
            "node_type": s.get("node_type"),
            "status": s.get("status", "pending"),
            "output_url": s.get("output_url"),
            "error_message": s.get("error_message"),
            "provider_used": s.get("provider_used"),
        }
        for s in (run.get("compiled_steps") or [])
    ]
    return detail


def cancel_run(supabase, user: dict, run_id) -> dict:
    """workflow_run をキャンセルする (pending/processing のみ → canceled)。

    completed/failed/canceled は 400。実際の停止と未着手分の返金は run_processor の
    キャンセル検知が担うため、本 API は status を canceled にする責務のみ。
    """
    user_id = user["user_id"]
    run = _fetch_owned_run(supabase, user_id, run_id)

    current = run.get("status", "pending")
    if current not in ("pending", "processing", "submitting"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"この実行はキャンセルできません (現在の状態: {current})",
        )

    try:
        supabase.table("workflow_runs").update({"status": "canceled"}).eq(
            "id", str(run_id)
        ).execute()
    except Exception as e:
        logger.error(f"failed to cancel workflow_run {run_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="実行のキャンセルに失敗しました",
        )

    run["status"] = "canceled"
    return _to_run_response_dict(run)
