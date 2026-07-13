"""workflow_runs のサーバー側耐久実行プロセッサ (task_005)。

task_004 の ``workflow_engine.compile_graph`` が生成した「コンパイル済みステップ列」を、
既存ドメインサービス経由でサーバー側で実行するバックグラウンドプロセッサ。

肝は 2 点:
  * **二重課金ゼロ (submitting プロトコル)**: 外部プロバイダへ送信する *直前* にステップを
    ``submitting`` として DB 保存 → 送信 → ``external_task_id`` を保存して ``processing`` へ。
    再開時、``submitting`` のまま task_id が無いステップは **再送信せず** run を failed 化する
    (外部で生成が進行している可能性があるため、二重課金より安全側に倒す)。
  * **プロセス全体の同時実行上限 (セマフォ)**: モジュールレベルの
    ``asyncio.Semaphore(settings.WORKFLOW_MAX_CONCURRENT_RUNS)`` を 1 個共有し、
    ``start_workflow_run`` はセマフォ取得後に実行する。超過分は取得までブロックして待機する。

このモジュールは **オーケストレーションに徹する**。新しい外部 API 呼び出しは書かず、
Generate は既存プロバイダ (submit_with_fallback + check_status + download_video_bytes) と
ffmpeg_service を、dialogue/utility は既存の processor / service を呼ぶ。

**二重課金防止の根拠**: 使用量加算 ``increment_video_count`` は router/service 層でのみ
呼ばれる。本モジュールは Generate ステップを「加算を含まない下位経路」
(プロバイダ送信 + ポーリング + ffmpeg 後処理 + R2 アップロード) で実装しており、
``increment_video_count`` を一切呼ばない。クォータは task_006 の予約で一元管理する。

compiled_steps 各要素の形 (workflow_engine の Step.to_dict() を拡張):
  {node_id, node_type, params, status, external_task_id, output_url, provider_used, error_message}
  step の status 遷移: pending -> submitting -> processing -> completed / failed / skipped
"""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from typing import Any, Awaitable, Callable, Optional

from app.core.config import settings
from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# プロセス全体で共有する同時実行セマフォ (超過分は取得までブロック)。
# ---------------------------------------------------------------------------
_semaphore = asyncio.Semaphore(settings.WORKFLOW_MAX_CONCURRENT_RUNS)

# 実行中タスクへの参照を保持する (参照を持たないと GC でタスクが消える)。
_tasks: set[asyncio.Task] = set()

# Generate ステップのポーリング設定 (story_processor と同じ 10 分 / 10 秒間隔)。
_GENERATE_POLL_INTERVAL_SECONDS = 10
_GENERATE_MAX_POLL_ATTEMPTS = 60


class WorkflowStepError(Exception):
    """ステップ実行の失敗 (ユーザー向けメッセージを保持)。"""


# ---------------------------------------------------------------------------
# 実行コンテキスト: 1 run 分の状態と、既に完了した上流ステップの出力 URL を保持する。
# ---------------------------------------------------------------------------
class RunContext:
    """1 つの workflow_run の実行状態。

    ``outputs`` は完了済みステップ node_id -> output_url のマップで、後段ステップの
    ``source_video_node_id(s)`` 解決に使う。``steps`` は compiled_steps の可変コピー。
    """

    def __init__(self, run: dict) -> None:
        self.run_id: str = run["id"]
        self.user_id: str = run["user_id"]
        self.selection_priority: Optional[str] = run.get("selection_priority")
        self.steps: list[dict] = [dict(s) for s in (run.get("compiled_steps") or [])]
        self.outputs: dict[str, str] = {}
        # 既に完了しているステップ (再開時) の出力を復元する。
        for step in self.steps:
            if step.get("status") == "completed" and step.get("output_url"):
                self.outputs[step["node_id"]] = step["output_url"]


# ---------------------------------------------------------------------------
# DB 更新ヘルパ (service-role で workflow_runs を直接更新する)。
# ---------------------------------------------------------------------------
def _persist_steps(supabase, run_id: str, steps: list[dict], current_step: int) -> None:
    """compiled_steps と current_step を DB に書き戻す (内部用)。"""
    supabase.table("workflow_runs").update(
        {"compiled_steps": steps, "current_step": current_step}
    ).eq("id", run_id).execute()


def _set_run_status(
    supabase,
    run_id: str,
    status: str,
    *,
    final_output_url: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """workflow_runs.status を更新する (内部用)。"""
    update: dict[str, Any] = {"status": status}
    if final_output_url is not None:
        update["final_output_url"] = final_output_url
    if error_message is not None:
        update["error_message"] = error_message
    supabase.table("workflow_runs").update(update).eq("id", run_id).execute()


def _read_run_status(supabase, run_id: str) -> Optional[str]:
    """workflow_runs.status を再読込する (キャンセル境界判定用、内部用)。

    ``.single()`` は 0 行時に例外を投げ得る。キャンセル境界のこの再読込が失敗しても
    run 全体を failed 化させない (誤返金の原因になる) ため、例外・0 行は ``None`` を返して
    「キャンセル未確定」として続行する。
    """
    try:
        response = (
            supabase.table("workflow_runs")
            .select("status")
            .eq("id", run_id)
            .single()
            .execute()
        )
    except Exception:
        logger.warning(f"workflow_run status re-read failed (continuing): run={run_id}")
        return None
    if not response.data:
        return None
    return response.data.get("status")


def _count_pending_generate_steps(steps: list[dict]) -> int:
    """未着手 (pending のまま) の Generate ステップ数を数える (返金額算出、内部用)。

    submitting 以降 (submitting/processing/completed/failed) は消費確定とみなし返金しない。
    """
    return sum(
        1
        for s in steps
        if s.get("node_type") == "generate" and (s.get("status") or "pending") == "pending"
    )


def _refund_unstarted_generations(supabase, ctx: "RunContext") -> None:
    """run が failed/canceled 確定時、未着手 Generate 分を release_video_quota で返金する。

    submitting プロトコル上、送信に着手したステップ (submitting 以降) は消費確定なので
    返金対象外。RPC 失敗で run 確定処理をクラッシュさせない (ログのみ)。
    """
    refund = _count_pending_generate_steps(ctx.steps)
    if refund <= 0:
        return
    try:
        supabase.rpc(
            "release_video_quota",
            {"p_user_id": ctx.user_id, "p_count": refund},
        ).execute()
        logger.info(
            f"workflow_run refund: run={ctx.run_id} released {refund} unstarted generations"
        )
    except Exception:
        logger.exception(
            f"workflow_run refund failed: run={ctx.run_id} count={refund}"
        )


# ---------------------------------------------------------------------------
# チェーン配線: 後段ステップの入力動画 URL を上流ステップの出力から解決する。
# ---------------------------------------------------------------------------
def _resolve_source_url(ctx: "RunContext", node_id: Optional[str]) -> str:
    if not node_id:
        raise WorkflowStepError("後段ステップの入力動画が指定されていません")
    url = ctx.outputs.get(node_id)
    if not url:
        raise WorkflowStepError(
            f"上流ステップ ({node_id}) の出力動画がまだありません"
        )
    return url


def _resolve_source_urls(ctx: "RunContext", node_ids: list[str]) -> list[str]:
    return [_resolve_source_url(ctx, nid) for nid in (node_ids or [])]


# ===========================================================================
# ステップ実行関数 (node_type -> executor)。
# 各 executor は (supabase, ctx, step_index) を受け取り output_url を返す。
# step_index は compiled_steps 内の位置で、submitting プロトコルの DB 保存に使う。
# ===========================================================================
async def _execute_generate_step(supabase, ctx: "RunContext", step_index: int) -> str:
    """Generate ステップ: 増分なしのプロバイダ送信 + ポーリング + ffmpeg 後処理 + R2 アップロード。

    **increment_video_count は呼ばない** (router/service 層の責務)。この関数は story_processor の
    下位ロジック (submit_with_fallback / check_status / download_video_bytes / process_video) のみを
    使い、クォータ加算経路を通らない。

    submitting プロトコル:
      1. step.status = 'submitting' にして compiled_steps を DB 保存 (送信の直前)。
      2. submit_with_fallback で送信し external_task_id を得る。
      3. step.external_task_id を保存し step.status = 'processing' に更新。
      4. 完了までポーリング → 後処理 → R2 アップロード → output_url を返す。

    **再開時の二重課金防止**: 既に ``external_task_id`` があるステップ (プロセス死亡前に
    送信済み) は、送信フェーズ (1)〜(3) を **スキップ** し、既存 task_id で (4) 以降の
    ポーリングから再開する。既存 task_id の分岐を必須パラメータチェックより前に置くことで、
    万一 params が欠けていてもポーリング再開を阻害しない。
    """
    from app.external.r2 import upload_video
    from app.external.video_provider import (
        get_video_provider,
        submit_with_fallback,
    )
    from app.services.ffmpeg_service import FFmpegError, get_ffmpeg_service

    step = ctx.steps[step_index]
    params = step.get("params") or {}

    existing_task_id = step.get("external_task_id")
    if existing_task_id:
        # 再開: 既に外部へ送信済み。再送信 (二重課金) せず既存 task_id をポーリングする。
        provider_used = step.get("provider_used") or params.get("video_provider") or "runway"
        task_id = existing_task_id
        provider = get_video_provider(provider_used)
        logger.info(
            f"workflow generate resume (no resend): run={ctx.run_id} "
            f"node={step['node_id']} task_id={task_id} provider={provider_used}"
        )
    else:
        image_url = params.get("image_url")
        story_text = params.get("story_text")
        if not image_url:
            raise WorkflowStepError("生成ステップに画像 URL がありません")
        if not story_text:
            raise WorkflowStepError("生成ステップにプロンプトがありません")

        provider_name = params.get("video_provider") or "runway"
        aspect_ratio = params.get("aspect_ratio", "9:16")
        camera_work = params.get("camera_work")
        duration = _generate_duration(params, provider_name)

        # (1) submitting プロトコル: 送信の直前に submitting を DB 保存する。
        step["status"] = "submitting"
        _persist_steps(supabase, ctx.run_id, ctx.steps, step_index)

        # (2) 送信: 送信時失敗なら priority ランキング次点へ 1 回フォールバックする。
        fallback_priority = ctx.selection_priority or "quality"
        task_id, provider_used, _fallback = await submit_with_fallback(
            provider_name=provider_name,
            priority=fallback_priority,
            capability="i2v",
            generate_kwargs={
                "image_url": image_url,
                "prompt": story_text,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "camera_work": camera_work,
            },
        )
        if not task_id:
            raise WorkflowStepError(f"{provider_used} の動画生成タスク作成に失敗しました")

        # (3) external_task_id を保存して processing へ。
        step["external_task_id"] = task_id
        step["provider_used"] = provider_used
        step["status"] = "processing"
        _persist_steps(supabase, ctx.run_id, ctx.steps, step_index)

        provider = get_video_provider(provider_used)

    # (4) 完了までポーリングする。
    raw_video_url = await _poll_generate_until_done(provider, task_id, provider_used)

    # 後処理 (BGM/オーバーレイ) → R2 アップロード。
    video_bytes = await provider.download_video_bytes(task_id)
    if not video_bytes:
        raise WorkflowStepError(f"{provider_used} からの動画ダウンロードに失敗しました")

    with tempfile.TemporaryDirectory() as temp_dir:
        raw_path = os.path.join(temp_dir, "raw.mp4")
        out_path = os.path.join(temp_dir, "out.mp4")
        with open(raw_path, "wb") as f:
            f.write(video_bytes)

        bgm_path = await _prepare_bgm(supabase, params, temp_dir)
        overlay = params.get("overlay") or {}
        ffmpeg = get_ffmpeg_service()
        try:
            await ffmpeg.process_video(
                video_path=raw_path,
                output_path=out_path,
                text=overlay.get("text"),
                text_position=overlay.get("position") or "bottom",
                text_font=overlay.get("font") or "NotoSansJP",
                text_color=overlay.get("color") or "#FFFFFF",
                bgm_path=bgm_path,
                target_fps=None,
            )
            final_path = out_path
        except FFmpegError as e:
            logger.warning(f"workflow generate ffmpeg failed, using raw video: {e}")
            final_path = raw_path

        with open(final_path, "rb") as f:
            final_bytes = f.read()

    filename = f"{ctx.user_id}/{ctx.run_id}/{step['node_id']}.mp4"
    output_url = await upload_video(final_bytes, filename)
    logger.info(f"workflow generate completed: run={ctx.run_id} node={step['node_id']}")
    return output_url


def _generate_duration(params: dict, provider_name: str) -> int:
    """StoryVideoCreate 互換 params からプロバイダ別 duration を決める (既定 5 秒)。"""
    if provider_name == "piapi_kling" and params.get("kling_duration"):
        return int(params["kling_duration"])
    if provider_name == "seedance" and params.get("seedance_duration"):
        return int(params["seedance_duration"])
    if provider_name == "veo" and params.get("veo_duration"):
        return int(params["veo_duration"])
    return 5


async def _poll_generate_until_done(provider, task_id: str, provider_name: str) -> str:
    """provider.check_status をポーリングし、完了時に動画 URL を返す (内部用)。"""
    from app.external.video_provider import VideoGenerationStatus

    for _attempt in range(_GENERATE_MAX_POLL_ATTEMPTS):
        await asyncio.sleep(_GENERATE_POLL_INTERVAL_SECONDS)
        status_result = await provider.check_status(task_id)
        if not status_result:
            continue
        if status_result.status == VideoGenerationStatus.COMPLETED:
            if not status_result.video_url:
                raise WorkflowStepError(
                    f"{provider_name} は完了しましたが動画 URL がありません"
                )
            return status_result.video_url
        if status_result.status == VideoGenerationStatus.FAILED:
            error = status_result.error_message or "Unknown error"
            raise WorkflowStepError(f"{provider_name} の動画生成に失敗しました: {error}")
    raise WorkflowStepError(f"{provider_name} の動画生成がタイムアウトしました")


async def _prepare_bgm(supabase, params: dict, temp_dir: str) -> Optional[str]:
    """BGM (custom_bgm_url 優先、なければ bgm_track_id) をダウンロードしてローカルパスを返す。

    ダウンロード失敗は握り潰し None を返す (BGM は必須ではない)。
    """
    from app.external.r2 import download_file
    # SSRF 対策: custom_bgm_url はユーザー自由入力のため、最終的に fetch する URL の
    # ホストを bg_removal と同じ許可リスト (R2 公開ホスト + *.r2.dev) で検証する。
    # プリセット bgm_track も同じ最終 URL 検証に通す (防御を一箇所に集約)。
    from app.tasks.bg_removal_processor import _validate_source_host

    bgm_url = params.get("custom_bgm_url")
    if not bgm_url and params.get("bgm_track_id"):
        try:
            resp = (
                supabase.table("bgm_tracks")
                .select("file_url")
                .eq("id", params["bgm_track_id"])
                .single()
                .execute()
            )
            if resp.data and resp.data.get("file_url"):
                bgm_url = resp.data["file_url"]
        except Exception:
            logger.warning("workflow generate: failed to resolve preset BGM")
            return None
    if not bgm_url:
        return None
    try:
        # 許可外ホスト (内部/RFC1918/loopback 等) は例外を送出 → 下の except で
        # None を返し、内部ホストへの fetch を一切発生させない (BGM は任意なので安全側)。
        _validate_source_host(bgm_url)
        ext = bgm_url.split(".")[-1] if "." in bgm_url else "mp3"
        bgm_path = os.path.join(temp_dir, f"bgm.{ext}")
        # follow_redirects=False: 許可ホストからの 302 内部リダイレクトによる
        # 許可リスト回避を塞ぐ (他の download_file 呼び出し元の既定挙動は不変)。
        content = await download_file(bgm_url, follow_redirects=False)
        with open(bgm_path, "wb") as f:
            f.write(content)
        return bgm_path
    except Exception as e:
        logger.warning(f"workflow generate: failed to download BGM: {e}")
        return None


async def _execute_dialogue_step(supabase, ctx: "RunContext", step_index: int) -> str:
    """Dialogue ステップ: 既存の dialogue_generations レコードを作成し processor を直列 await する。

    上流の出力動画を video_url に解決し、dialogue_generations に insert してから
    process_dialogue_generation (TTS + ffmpeg / Hedra リップシンク) を実行する。
    完了後にレコードを再 fetch して output_video_url を返す。
    """
    from app.tasks.dialogue_processor import process_dialogue_generation

    step = ctx.steps[step_index]
    params = step.get("params") or {}
    video_url = _resolve_source_url(ctx, params.get("source_video_node_id"))

    record: dict[str, Any] = {
        "user_id": ctx.user_id,
        "video_url": video_url,
        "text": params.get("text", ""),
        "voice_id": params.get("voice_id"),
        "speed": params.get("speed", 1.0),
        "use_lip_sync": bool(params.get("use_lip_sync", False)),
        "status": "pending",
    }
    if params.get("tts_instructions"):
        record["tts_instructions"] = params["tts_instructions"]
    if params.get("use_kana_mode") and params.get("kana_text"):
        record["kana_text"] = params["kana_text"]

    insert = supabase.table("dialogue_generations").insert(record).execute()
    if not insert.data:
        raise WorkflowStepError("Dialogue 生成レコードの作成に失敗しました")
    generation_id = insert.data[0]["id"]

    await process_dialogue_generation(generation_id)

    fetched = (
        supabase.table("dialogue_generations")
        .select("status, output_video_url, error_message")
        .eq("id", generation_id)
        .single()
        .execute()
    )
    data = fetched.data or {}
    if data.get("status") != "completed" or not data.get("output_video_url"):
        raise WorkflowStepError(
            data.get("error_message") or "Dialogue 生成に失敗しました"
        )
    return data["output_video_url"]


async def _execute_get_video_frame_step(supabase, ctx: "RunContext", step_index: int) -> str:
    """GetVideoFrame ステップ: 上流動画からフレームを抽出して画像 URL を返す (ffmpeg + R2)。"""
    from app.external.r2 import download_file, upload_image
    from app.services.ffmpeg_service import get_ffmpeg_service

    step = ctx.steps[step_index]
    params = step.get("params") or {}
    video_url = _resolve_source_url(ctx, params.get("source_video_node_id"))
    direction = params.get("direction", "first")

    ffmpeg = get_ffmpeg_service()
    with tempfile.TemporaryDirectory() as temp_dir:
        video_path = os.path.join(temp_dir, "video.mp4")
        frame_path = os.path.join(temp_dir, "frame.jpg")
        content = await download_file(video_url)
        with open(video_path, "wb") as f:
            f.write(content)
        if direction == "first":
            await ffmpeg.extract_first_frame(video_path, frame_path)
        else:
            await ffmpeg.extract_last_frame(video_path, frame_path)
        with open(frame_path, "rb") as f:
            frame_bytes = f.read()

    filename = f"{ctx.user_id}/{ctx.run_id}/{step['node_id']}_{direction}.jpg"
    return await upload_image(frame_bytes, filename)


async def _execute_trim_video_step(supabase, ctx: "RunContext", step_index: int) -> str:
    """TrimVideo ステップ: 上流動画を start/end でトリムして R2 の URL を返す (ffmpeg + R2)。"""
    from app.external.r2 import download_file, upload_video
    from app.services.ffmpeg_service import get_ffmpeg_service

    step = ctx.steps[step_index]
    params = step.get("params") or {}
    video_url = _resolve_source_url(ctx, params.get("source_video_node_id"))

    ffmpeg = get_ffmpeg_service()
    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = os.path.join(temp_dir, "input.mp4")
        output_path = os.path.join(temp_dir, "trimmed.mp4")
        content = await download_file(video_url)
        with open(input_path, "wb") as f:
            f.write(content)
        await ffmpeg.trim_video(
            input_path=input_path,
            output_path=output_path,
            start_time=params.get("start_seconds", 0),
            end_time=params.get("end_seconds"),
        )
        with open(output_path, "rb") as f:
            trimmed = f.read()

    filename = f"{ctx.user_id}/{ctx.run_id}/{step['node_id']}_trimmed.mp4"
    return await upload_video(trimmed, filename)


async def _execute_stitch_videos_step(supabase, ctx: "RunContext", step_index: int) -> str:
    """StitchVideos ステップ: 上流の複数動画を連結して R2 の URL を返す (ffmpeg + R2)。"""
    from app.external.r2 import download_file, upload_video
    from app.services.ffmpeg_service import get_ffmpeg_service

    step = ctx.steps[step_index]
    params = step.get("params") or {}
    source_urls = _resolve_source_urls(ctx, params.get("source_video_node_ids") or [])
    if len(source_urls) < 2:
        raise WorkflowStepError("連結には 2 本以上の動画が必要です")
    transition = params.get("transition", "none")

    ffmpeg = get_ffmpeg_service()
    with tempfile.TemporaryDirectory() as temp_dir:
        local_paths: list[str] = []
        for idx, url in enumerate(source_urls):
            path = os.path.join(temp_dir, f"clip_{idx}.mp4")
            content = await download_file(url)
            with open(path, "wb") as f:
                f.write(content)
            local_paths.append(path)
        output_path = os.path.join(temp_dir, "stitched.mp4")
        await ffmpeg.concat_videos(
            video_paths=local_paths,
            output_path=output_path,
            transition=transition,
        )
        with open(output_path, "rb") as f:
            stitched = f.read()

    filename = f"{ctx.user_id}/{ctx.run_id}/{step['node_id']}_stitched.mp4"
    return await upload_video(stitched, filename)


# node_type -> 実行関数のディスパッチマップ (テスト差し替え可能: build_default_dispatch を上書き)。
StepExecutor = Callable[[Any, "RunContext", int], Awaitable[str]]


def build_default_dispatch() -> dict[str, StepExecutor]:
    """既定の node_type -> executor マップを返す (テストは戻り値を差し替えて注入する)。"""
    return {
        "generate": _execute_generate_step,
        "dialogue": _execute_dialogue_step,
        "getVideoFrame": _execute_get_video_frame_step,
        "trimVideo": _execute_trim_video_step,
        "stitchVideos": _execute_stitch_videos_step,
    }


# ===========================================================================
# run 実行本体。
# ===========================================================================
async def _run_steps(
    supabase,
    ctx: "RunContext",
    dispatch: dict[str, StepExecutor],
) -> None:
    """compiled_steps を先頭から逐次実行する。

    - 各ステップ開始前に workflow_runs.status を再読込し ``canceled`` なら以降を実行しない。
    - ステップ完了ごとに compiled_steps (status/output_url/provider_used/error_message) と
      current_step を DB 保存する。
    - 最終ステップ完了で run.status=completed & final_output_url を設定する。
    - ステップ失敗で run.status=failed (後続は実行しない) にし、未着手 Generate 分を返金する。
    - キャンセル確定時も未着手 Generate 分を返金する。
    """
    total = len(ctx.steps)
    for index in range(total):
        step = ctx.steps[index]

        # 既に完了済み (再開時) はスキップして出力を引き継ぐ。
        if step.get("status") == "completed" and step.get("output_url"):
            ctx.outputs[step["node_id"]] = step["output_url"]
            continue

        # キャンセル境界: 各ステップ開始前に status を再読込する。
        if _read_run_status(supabase, ctx.run_id) == "canceled":
            logger.info(f"workflow_run canceled before step {index}: run={ctx.run_id}")
            _refund_unstarted_generations(supabase, ctx)
            return

        executor = dispatch.get(step["node_type"])
        if executor is None:
            _fail_step(supabase, ctx, index, f"未対応のステップ: {step['node_type']}")
            _refund_unstarted_generations(supabase, ctx)
            return

        try:
            output_url = await executor(supabase, ctx, index)
        except Exception as e:  # noqa: BLE001 - ステップ失敗は run を failed にして確定
            logger.exception(
                f"workflow_run step failed: run={ctx.run_id} index={index} "
                f"node={step.get('node_id')}"
            )
            _fail_step(supabase, ctx, index, str(e))
            _refund_unstarted_generations(supabase, ctx)
            return

        step["status"] = "completed"
        step["output_url"] = output_url
        step["error_message"] = None
        ctx.outputs[step["node_id"]] = output_url
        _persist_steps(supabase, ctx.run_id, ctx.steps, index + 1)

    final_output_url = ctx.steps[-1].get("output_url") if ctx.steps else None
    _set_run_status(
        supabase, ctx.run_id, "completed", final_output_url=final_output_url
    )
    logger.info(f"workflow_run completed: run={ctx.run_id} final={final_output_url}")


def _fail_step(supabase, ctx: "RunContext", index: int, message: str) -> None:
    """ステップを failed にして run を failed 化する (内部用)。"""
    step = ctx.steps[index]
    step["status"] = "failed"
    step["error_message"] = message
    _persist_steps(supabase, ctx.run_id, ctx.steps, index)
    _set_run_status(supabase, ctx.run_id, "failed", error_message=message)


async def _process_workflow_run(
    run_id: str,
    *,
    resume: bool = False,
    dispatch: Optional[dict[str, StepExecutor]] = None,
) -> None:
    """1 つの workflow_run を実行する (セマフォ取得は呼び出し元 start_workflow_run が行う)。

    Args:
        run_id: workflow_runs.id
        resume: True の場合、``submitting`` のまま external_task_id が無い現在ステップは
            **再送信せず** run を failed 化する (二重課金回避)。external_task_id ありは
            通常フローで継続する (ポーリングから再開)。
        dispatch: node_type -> executor マップ (テスト注入用。None なら既定)。
    """
    supabase = get_supabase()
    dispatch = dispatch or build_default_dispatch()

    try:
        response = (
            supabase.table("workflow_runs")
            .select("*")
            .eq("id", run_id)
            .single()
            .execute()
        )
        if not response.data:
            logger.error(f"workflow_run not found: {run_id}")
            return
        run = response.data

        if run.get("status") == "canceled":
            logger.info(f"workflow_run already canceled: {run_id}")
            return

        ctx = RunContext(run)

        # 再開時の submitting プロトコル判定: 現在ステップが submitting のまま
        # external_task_id を持たなければ、再送信せず failed 化する。
        if resume and _is_stuck_submitting(ctx):
            index = _current_stuck_index(ctx)
            logger.warning(
                f"workflow_run stuck in submitting without task_id, failing without resend: "
                f"run={run_id} index={index}"
            )
            _fail_step(
                supabase,
                ctx,
                index,
                "送信中に中断されました (二重課金防止のため再送信しません)",
            )
            _refund_unstarted_generations(supabase, ctx)
            return

        _set_run_status(supabase, run_id, "processing")
        await _run_steps(supabase, ctx, dispatch)

    except Exception as e:
        logger.exception(f"workflow_run processing failed: {run_id}")
        try:
            _set_run_status(supabase, run_id, "failed", error_message=str(e))
        except Exception:
            logger.exception(f"failed to mark run failed: {run_id}")


def _is_stuck_submitting(ctx: "RunContext") -> bool:
    """現在の未完了ステップが submitting のまま external_task_id を持たないか。"""
    for step in ctx.steps:
        status = step.get("status") or "pending"
        if status in ("completed", "skipped"):
            continue
        return status == "submitting" and not step.get("external_task_id")
    return False


def _current_stuck_index(ctx: "RunContext") -> int:
    """最初の未完了ステップのインデックスを返す (submitting 検出時に使う)。"""
    for index, step in enumerate(ctx.steps):
        status = step.get("status") or "pending"
        if status in ("completed", "skipped"):
            continue
        return index
    return 0


# ===========================================================================
# 公開 API: セマフォ制御つき起動と、起動時再開スイープ。
# ===========================================================================
async def start_workflow_run(
    run_id: str,
    *,
    resume: bool = False,
    dispatch: Optional[dict[str, StepExecutor]] = None,
) -> None:
    """workflow_run をセマフォ取得後に実行する。

    プロセス全体で同時実行数を ``WORKFLOW_MAX_CONCURRENT_RUNS`` に制限する。超過分は
    セマフォ取得までブロックして待機する (run は pending のまま枠が空くのを待つ)。
    """
    async with _semaphore:
        await _process_workflow_run(run_id, resume=resume, dispatch=dispatch)


def schedule_workflow_run(
    run_id: str,
    *,
    resume: bool = False,
    dispatch: Optional[dict[str, StepExecutor]] = None,
) -> asyncio.Task:
    """workflow_run をバックグラウンドタスクとして起動する (セマフォ取得込み)。

    起動元 (task_006 のエンドポイント / 再開スイープ) をブロックしない。返り値の Task は
    GC 消失防止のためモジュールレベルの集合で保持する。
    """
    task = asyncio.create_task(
        start_workflow_run(run_id, resume=resume, dispatch=dispatch)
    )
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


async def resume_stuck_workflow_runs() -> None:
    """起動時に 'processing' のまま取り残された workflow_run を **逐次** 再開するスイープ。

    uvicorn のリロードや Railway の再デプロイで実行中の asyncio タスクが失われると、
    行が 'processing' のまま取り残される。起動時に本関数を呼び、対象行を **逐次**
    (同時一斉再開しない = サンダリングハード防止) 再実行する。

    - external_task_id を持つステップはポーリングから再開する (再送信しない)。
    - submitting のまま task_id 無しなら再送信せず failed 化し、未着手 Generate 分を返金する。
    """
    try:
        supabase = get_supabase()
        response = (
            supabase.table("workflow_runs")
            .select("id")
            .eq("status", "processing")
            .execute()
        )
        rows = response.data or []
    except Exception:
        logger.exception("workflow_run 再開スイープ: 対象行の取得に失敗しました")
        return

    if not rows:
        logger.info("workflow_run 再開スイープ: 対象行はありません")
        return

    logger.info(f"workflow_run 再開スイープ: {len(rows)}件を逐次再開します")
    for row in rows:
        # 逐次: 1 件ずつ await する (セマフォ取得込みで同時一斉起動を避ける)。
        try:
            await start_workflow_run(row["id"], resume=True)
        except Exception:
            logger.exception(f"workflow_run の再開に失敗しました: row={row}")


async def start_resume_stuck_workflow_runs() -> None:
    """再開スイープをバックグラウンドで開始 (起動処理をブロックしない)。"""
    task = asyncio.create_task(resume_stuck_workflow_runs())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
