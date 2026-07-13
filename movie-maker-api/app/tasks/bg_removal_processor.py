"""
背景削除（Background Removal）のバックグラウンドタスク

fal.ai プロバイダー → R2 アップロード → DB 更新 の一連の処理を行う

動画ソースの「マスター + マット合成」パイプライン:
- fal/Bria は 8bit (yuv420p) の H.264/H.265/VP9/AV1 入力しか受け付けないため、
  10bit+ マスター（ProRes / 10bit HEVC / DNxHR 等）はソースをプローブし、
  必要なら 8bit H.264 プロキシを作成して fal へ投入する。
- output_format == "prores" の場合、fal の WebM 結果は「アルファマット」として
  のみ使用し、オリジナルマスターと合成して ProRes 4444 を出力する
  （Bria の 8bit 再エンコードではなく元の色情報を完全に保持する）。
"""

import asyncio
import logging
import os
from typing import Optional
from urllib.parse import urlparse

from app.core.config import settings
from app.core.supabase import get_supabase
from app.external.fal_provider import (
    FalBackgroundRemovalProvider,
    FalJobRef,
    FalProviderError,
    validate_result_url,
)

logger = logging.getLogger(__name__)

# ポーリング設定（Bria 動画は実測数分想定）
POLLING_INTERVAL_SECONDS = 5
MAX_POLLING_ATTEMPTS = 144  # 最大12分

# 一時エラー（retryable な FalProviderError）時の再投入設定
# fal.ai 側のジョブが一時障害で terminal になっても、同一リクエストの
# 再投入で成功することがあるため、submit からやり直す
MAX_GENERATION_ATTEMPTS = 2
RETRY_DELAY_SECONDS = 10

# 実行中タスクへの参照を保持する（参照を持たないと GC でタスクが消える可能性がある）
_tasks: set[asyncio.Task] = set()

# output_format → (拡張子, Content-Type)
OUTPUT_FORMAT_MAP: dict[str, tuple[str, str]] = {
    "webm": ("webm", "video/webm"),
    "prores": ("mov", "video/quicktime"),
    "png": ("png", "image/png"),
}

# 進捗マイルストーン
PROBE_DONE_PROGRESS = 10        # ソースのプローブ完了後
PROXY_UPLOAD_PROGRESS = 25      # プロキシの R2 アップロード完了後（プロキシ作成時のみ）
PRORES_TRANSCODE_PROGRESS = 75  # 合成 / 変換フェーズ（ダウンロード完了後・変換開始前）

# fal/Bria がそのまま受け付けられるコーデック（8bit yuv420p のみ）
FAL_COMPATIBLE_CODECS = frozenset({"h264", "hevc", "vp9", "av1", "mjpeg"})
FAL_COMPATIBLE_PIX_FMT = "yuv420p"


async def process_background_removal(generation_id: str, resume: bool = False) -> None:
    """
    背景削除のバックグラウンド処理

    1. DB からレコードを取得
    2. 動画ソースの場合: R2 からダウンロードしてプローブ
       （fal 非互換なら 8bit H.264 プロキシを作成して R2 へアップロード）
    3. fal.ai プロバイダーへジョブを投入（プロキシ作成時はプロキシ URL を投入）
    4. provider_request_id / status_url / response_url を DB 保存
    5. check_status をポーリングして完了を待つ
    6. 完了したら結果を R2 にアップロード
       （prores 出力はマスターとアルファマットをローカル合成してからアップロード）
    7. DB を結果で更新
    8. finally でプロキシ R2 オブジェクトと一時ファイルを必ず削除

    Args:
        generation_id: background_removals レコードの ID
        resume: True の場合、DB に保存済みの fal ジョブ参照があれば
            再投入せずにポーリングのみ再開する（サーバー再起動後の復旧用）。
            参照がない場合は通常のフル処理にフォールバックする。
    """
    supabase = get_supabase()

    # finally で必ず後始末する対象
    proxy_r2_key: Optional[str] = None  # R2 上のプロキシオブジェクトのキー
    temp_paths: list[str] = []          # ローカル一時ファイル

    try:
        # レコードを取得
        response = (
            supabase.table("background_removals")
            .select("*")
            .eq("id", generation_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.error(f"Background removal record not found: {generation_id}")
            return

        record = response.data
        user_id = record["user_id"]
        source_type = record["source_type"]
        source_url = record["source_url"]
        output_format = record.get("output_format", "webm")

        # ステータスを processing に更新
        _update_status(supabase, generation_id, "processing", progress=0)
        logger.info(f"Starting background removal processing: {generation_id}")

        provider = FalBackgroundRemovalProvider()

        # 動画ソースの準備: ダウンロード → プローブ → プロキシ要否判定
        # （画像ジョブとモックモードはスキップ: 従来どおり source_url を直接使う）
        master_path: Optional[str] = None
        master_info: Optional[dict] = None
        needs_proxy = False
        if source_type == "video" and not settings.BG_REMOVAL_MOCK:
            # SSRF 防止: ダウンロード前にソース URL のホストを検証する
            _validate_source_host(source_url)

            master_path = await _download_source_to_temp(source_url)
            temp_paths.append(master_path)

            from app.services.ffmpeg_service import get_ffmpeg_service

            master_info = await get_ffmpeg_service().probe_video_info(master_path)
            needs_proxy = _needs_proxy(master_info)
            _update_status(
                supabase, generation_id, "processing", progress=PROBE_DONE_PROGRESS
            )
            logger.info(
                f"Source probed: {generation_id} codec={master_info.get('codec_name')} "
                f"pix_fmt={master_info.get('pix_fmt')} needs_proxy={needs_proxy}"
            )

            if needs_proxy:
                # 削除対象キーを先に確定する（過去の中断実行が残した
                # プロキシも含めて finally で必ず削除するため）
                proxy_r2_key = f"bg-removal/{user_id}/{generation_id}_proxy.mp4"

        # resume モード: 保存済みのジョブ参照があれば再投入せずポーリングのみ再開する
        if resume:
            existing_ref = _build_existing_job_ref(record)
            if existing_ref is not None:
                try:
                    logger.info(
                        f"Resuming background removal polling: {generation_id} "
                        f"(request_id={existing_ref.request_id})"
                    )
                    await _poll_and_transfer(
                        supabase,
                        provider,
                        existing_ref,
                        generation_id,
                        user_id,
                        output_format,
                        master_path=master_path,
                        master_info=master_info,
                    )
                    return
                except FalProviderError as e:
                    if not e.retryable:
                        raise
                    # 一時エラーは通常の再投入リトライ（下のループ）にフォールバックする
                    logger.warning(
                        f"再開ポーリングが一時エラーのため再投入にフォールバックします: "
                        f"{generation_id}: {e}"
                    )
                    await asyncio.sleep(RETRY_DELAY_SECONDS)

        # 投入用 URL を決定: fal 非互換ソースは H.264 プロキシを作成・アップロードする
        submit_url = source_url
        if needs_proxy and master_path is not None and proxy_r2_key is not None:
            submit_url = await _create_and_upload_proxy(
                supabase, master_path, proxy_r2_key, generation_id
            )

        # submit → ポーリング → 結果転写 を実行する
        # （fal.ai の一時エラーは MAX_GENERATION_ATTEMPTS 回まで submit からやり直す）
        for generation_attempt in range(1, MAX_GENERATION_ATTEMPTS + 1):
            try:
                await _run_generation_attempt(
                    supabase,
                    provider,
                    generation_id,
                    user_id,
                    source_type,
                    submit_url,
                    output_format,
                    master_path=master_path,
                    master_info=master_info,
                )
                return
            except FalProviderError as e:
                if e.retryable and generation_attempt < MAX_GENERATION_ATTEMPTS:
                    logger.warning(
                        f"fal.ai一時エラーのため再試行します "
                        f"(attempt {generation_attempt + 1}/{MAX_GENERATION_ATTEMPTS}): {e}"
                    )
                    await asyncio.sleep(RETRY_DELAY_SECONDS)
                    continue
                raise

    except Exception as e:
        logger.exception(f"Background removal processing failed: {generation_id}, error={e}")
        try:
            _update_status(
                supabase,
                generation_id,
                "failed",
                error_message=str(e),
            )
        except Exception:
            # failed 更新自体の失敗でタスクをクラッシュさせない（再送出しない）
            logger.exception(f"Failed to update 'failed' status: {generation_id}")
    finally:
        # 成否にかかわらずプロキシ R2 オブジェクトを削除する
        if proxy_r2_key:
            try:
                from app.external.r2 import delete_file

                await delete_file(proxy_r2_key)
                logger.info(f"Deleted proxy from R2: {proxy_r2_key}")
            except Exception:
                logger.warning(f"プロキシの R2 削除に失敗しました: {proxy_r2_key}")
        # ローカル一時ファイルを削除する
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass


def _validate_source_host(source_url: str) -> None:
    """
    ソース URL のホストが自前の R2 配信ドメインであることを検証する（内部用）

    サーバー側で source_url を直接ダウンロードするため、SSRF を防止する。
    許可: settings.R2_PUBLIC_URL のホスト / *.r2.dev

    Raises:
        Exception: 許可外ホストの場合（日本語メッセージ）
    """
    hostname = (urlparse(source_url).hostname or "").lower()

    allowed_hosts: set[str] = set()
    if settings.R2_PUBLIC_URL:
        r2_host = urlparse(settings.R2_PUBLIC_URL).hostname
        if r2_host:
            allowed_hosts.add(r2_host.lower())

    if hostname and (hostname in allowed_hosts or hostname.endswith(".r2.dev")):
        return

    logger.warning(f"bg-removal source URL rejected (host not allowed): {source_url}")
    raise Exception("入力動画のURLが不正です（R2以外のURLからのダウンロードは許可されません）")


def _needs_proxy(master_info: dict) -> bool:
    """
    fal/Bria へ直接投入できないソース（10bit / ProRes 等）かを判定する（内部用）

    fal 互換 = コーデックが H.264/H.265/VP9/AV1/MJPEG かつ pix_fmt が yuv420p。
    それ以外（ProRes / DNxHR / 10bit HEVC 等）は H.264 プロキシが必要。
    """
    return not (
        master_info.get("codec_name") in FAL_COMPATIBLE_CODECS
        and master_info.get("pix_fmt") == FAL_COMPATIBLE_PIX_FMT
    )


async def _download_source_to_temp(source_url: str) -> str:
    """ソース動画を一時ファイルへダウンロードしてパスを返す（内部用）

    呼び出し元（process_background_removal）の finally で削除される。
    """
    import tempfile

    from app.external.r2 import download_file

    suffix = os.path.splitext(urlparse(source_url).path)[1] or ".mp4"
    content = await download_file(source_url)

    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
    except Exception:
        # 書き込み失敗時は呼び出し元に渡る前に自分で削除する
        try:
            os.remove(path)
        except OSError:
            pass
        raise
    return path


async def _create_and_upload_proxy(
    supabase,
    master_path: str,
    proxy_r2_key: str,
    generation_id: str,
) -> str:
    """
    8bit H.264 プロキシを作成して R2 にアップロードし、公開 URL を返す（内部用）

    プロキシのローカル一時ファイルは成否にかかわらず削除する。
    R2 オブジェクトの削除は呼び出し元の finally で行う。
    """
    import tempfile

    from app.external.r2 import upload_with_key
    from app.services.ffmpeg_service import get_ffmpeg_service

    proxy_fd, proxy_path = tempfile.mkstemp(suffix=".mp4")
    os.close(proxy_fd)
    try:
        await get_ffmpeg_service().create_h264_proxy(master_path, proxy_path)
        with open(proxy_path, "rb") as f:
            proxy_content = f.read()
    finally:
        try:
            os.remove(proxy_path)
        except OSError:
            pass

    proxy_url = await upload_with_key(proxy_content, proxy_r2_key, "video/mp4")
    _update_status(
        supabase, generation_id, "processing", progress=PROXY_UPLOAD_PROGRESS
    )
    logger.info(f"Uploaded H.264 proxy to R2: {proxy_url}")
    return proxy_url


async def _run_generation_attempt(
    supabase,
    provider: FalBackgroundRemovalProvider,
    generation_id: str,
    user_id: str,
    source_type: str,
    submit_url: str,
    output_format: str,
    master_path: Optional[str] = None,
    master_info: Optional[dict] = None,
) -> None:
    """
    submit → ポーリング → R2 転写 → DB completed 更新 の 1 試行分を実行する（内部用）

    一時エラー（retryable=True の FalProviderError）はそのまま送出し、
    呼び出し元のリトライループで再投入するかを判断する。
    ポーリングのタイムアウト上限（MAX_POLLING_ATTEMPTS）は試行ごとに適用される。

    Args:
        submit_url: fal へ投入する URL（プロキシ作成時はプロキシの R2 URL）
        master_path: オリジナルマスターのローカルパス（prores 合成用）
        master_info: マスターのプローブ結果（width / height 等）
    """
    # fal.ai プロバイダーへジョブを投入
    if source_type == "video":
        ref = await provider.submit_video(submit_url)
    else:
        ref = await provider.submit_image(submit_url)

    # ジョブ参照情報を DB に保存（再試行時は新しい参照で上書きする）
    _update_status(
        supabase,
        generation_id,
        "processing",
        provider_request_id=ref.request_id,
        provider_status_url=ref.status_url,
        provider_response_url=ref.response_url,
    )
    logger.info(
        f"Background removal job submitted: generation_id={generation_id}, "
        f"request_id={ref.request_id}"
    )

    await _poll_and_transfer(
        supabase,
        provider,
        ref,
        generation_id,
        user_id,
        output_format,
        master_path=master_path,
        master_info=master_info,
    )


async def _poll_and_transfer(
    supabase,
    provider: FalBackgroundRemovalProvider,
    ref: FalJobRef,
    generation_id: str,
    user_id: str,
    output_format: str,
    master_path: Optional[str] = None,
    master_info: Optional[dict] = None,
) -> None:
    """
    既存の fal ジョブ参照に対してポーリング → R2 転写 → DB completed 更新 を行う（内部用）

    submit 済みのジョブ参照（新規投入 / DB から復元したもの）を受け取り、
    完了まで check_status をポーリングする。再投入は行わない。
    """
    # ポーリングでステータスを確認
    last_progress = 0  # 直近に DB へ書き込んだ進捗（冗長な書き込みをスキップするため）
    for attempt in range(MAX_POLLING_ATTEMPTS):
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)

        status = await provider.check_status(ref)

        if status.status == "completed" and status.result_url:
            if settings.BG_REMOVAL_MOCK:
                # モックモード: ダウンロード / R2 転写をスキップし、結果 URL をそのまま使用
                output_url = status.result_url
            else:
                # 結果 URL のホストを検証（fal.ai 以外へのアクセスを防止）
                validate_result_url(status.result_url)

                # 結果を R2 へ転写（fal の CDN URL は恒久保証がないため）
                output_url = await _transfer_result_to_r2(
                    supabase,
                    status.result_url,
                    user_id,
                    generation_id,
                    output_format,
                    master_path=master_path,
                    master_info=master_info,
                )

            _update_status(
                supabase,
                generation_id,
                "completed",
                progress=100,
                output_url=output_url,
            )
            logger.info(f"Background removal completed: {generation_id}")
            return

        elif status.status == "failed":
            error_msg = status.error_message or "Provider reported failure"
            raise Exception(f"背景削除に失敗しました: {error_msg}")

        elif status.progress > 0 and status.progress != last_progress:
            # 進捗を更新（前回書き込んだ値と同じ場合は DB 書き込みをスキップ）
            _update_status(supabase, generation_id, "processing", progress=status.progress)
            last_progress = status.progress

        logger.debug(
            f"Background removal polling attempt {attempt + 1}: "
            f"generation_id={generation_id}, status={status.status}, progress={status.progress}"
        )

    else:
        raise Exception("処理がタイムアウトしました")


def _build_existing_job_ref(record: dict) -> Optional[FalJobRef]:
    """DB レコードに保存済みの fal ジョブ参照があれば FalJobRef を復元する（内部用）

    3 つの参照（request_id / status_url / response_url）がすべて揃っている場合のみ
    復元する。URL のホスト検証は check_status 側で通常どおり行われる。
    """
    request_id = record.get("provider_request_id")
    status_url = record.get("provider_status_url")
    response_url = record.get("provider_response_url")

    if request_id and status_url and response_url:
        return FalJobRef(
            request_id=request_id,
            status_url=status_url,
            response_url=response_url,
        )
    return None


async def start_bg_removal_processing(generation_id: str) -> None:
    """背景削除処理をバックグラウンドで開始"""
    task = asyncio.create_task(process_background_removal(generation_id))
    # GC によるタスク消失を防ぐため、完了まで参照を保持する
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def resume_stuck_background_removals() -> None:
    """
    中断された背景削除ジョブを再開するスイープ処理

    uvicorn のリロードや Railway の再デプロイで実行中の asyncio ポーリングタスクが
    失われると、行が 'pending' / 'processing' のまま取り残される。
    起動時に本関数を呼び出し、対象行ごとにバックグラウンドタスクを起動して復旧する。

    - fal のジョブ参照（request_id / status_url / response_url）が保存済み
      → 再投入せず既存ジョブのポーリングを再開する
    - 参照がない（投入前に中断された pending）
      → 通常のフル処理（submit から）を再実行する
    """
    try:
        supabase = get_supabase()
        response = (
            supabase.table("background_removals")
            .select("id, provider_request_id, provider_status_url, provider_response_url")
            .in_("status", ["pending", "processing"])
            .execute()
        )
        rows = response.data or []
    except Exception:
        logger.exception("背景削除の再開スイープ: 対象行の取得に失敗しました")
        return

    if not rows:
        logger.info("背景削除の再開スイープ: 対象行はありません")
        return

    logger.info(f"背景削除の再開スイープ: {len(rows)}件の中断ジョブを再開します")

    for row in rows:
        # 1 行の不備でスイープ全体を止めない
        try:
            generation_id = row["id"]
            has_provider_ref = _build_existing_job_ref(row) is not None

            task = asyncio.create_task(
                process_background_removal(generation_id, resume=has_provider_ref)
            )
            # GC によるタスク消失を防ぐため、完了まで参照を保持する
            _tasks.add(task)
            task.add_done_callback(_tasks.discard)
        except Exception:
            logger.exception(f"背景削除ジョブの再開に失敗しました: row={row}")


async def start_resume_stuck_background_removals() -> None:
    """再開スイープをバックグラウンドで開始（起動処理をブロックしない）"""
    task = asyncio.create_task(resume_stuck_background_removals())
    # GC によるタスク消失を防ぐため、完了まで参照を保持する
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _transfer_result_to_r2(
    supabase,
    result_url: str,
    user_id: str,
    generation_id: str,
    output_format: str,
    master_path: Optional[str] = None,
    master_info: Optional[dict] = None,
) -> str:
    """
    結果ファイルをダウンロードして R2 にアップロードし、公開 URL を返す

    output_format が "prores" の場合、fal からの結果（WebM / VP9 アルファ付き）を
    「アルファマット」として扱い、オリジナルマスターとローカルの ffmpeg で合成して
    ProRes 4444 (.mov) を生成してからアップロードする。
    （Bria の 8bit 再エンコードではなくマスター本来の色情報を保持するため、
      8bit ソースのジョブでも常に合成方式を使用する）

    Args:
        supabase: Supabase クライアント（変換中の進捗更新用）
        result_url: fal.ai の結果ファイル URL
        user_id: ユーザー ID
        generation_id: 生成 ID
        output_format: 出力形式 ("webm" | "prores" | "png")
        master_path: オリジナルマスターのローカルパス（prores 合成に必須）
        master_info: マスターのプローブ結果（width / height。prores 合成に必須）

    Returns:
        str: R2 の公開 URL
    """
    from app.external.r2 import download_file, upload_with_key

    if output_format not in OUTPUT_FORMAT_MAP:
        raise FalProviderError(f"未対応の出力形式です: {output_format}")
    ext, content_type = OUTPUT_FORMAT_MAP[output_format]

    content = await download_file(result_url)

    if output_format == "prores":
        # 合成フェーズ: 進捗を更新してからマスター + マットを ProRes 4444 へ合成する
        _update_status(
            supabase, generation_id, "processing", progress=PRORES_TRANSCODE_PROGRESS
        )
        content = await _composite_master_with_matte(content, master_path, master_info)

    key = f"bg-removal/{user_id}/{generation_id}.{ext}"
    r2_url = await upload_with_key(content, key, content_type)

    logger.info(f"Uploaded background removal result to R2: {r2_url}")
    return r2_url


async def _composite_master_with_matte(
    matte_content: bytes,
    master_path: Optional[str],
    master_info: Optional[dict],
) -> bytes:
    """
    fal のアルファマット（WebM）とオリジナルマスターを合成し、
    ProRes 4444 (.mov) のバイト列を返す（内部用）

    マットを一時ファイルに書き出して ffmpeg で合成し、合成後のバイト列を返す。
    一時ファイル（マット / 出力 .mov）は成否にかかわらず削除する。
    マスターのローカルパスは呼び出し元（process_background_removal）が管理する。
    """
    import tempfile

    from app.services.ffmpeg_service import get_ffmpeg_service

    if not master_path or not master_info:
        raise Exception("ProRes出力に必要な元動画の情報が取得できませんでした")

    matte_path = None
    mov_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as matte_file:
            matte_file.write(matte_content)
            matte_path = matte_file.name

        mov_fd, mov_path = tempfile.mkstemp(suffix=".mov")
        os.close(mov_fd)

        await get_ffmpeg_service().composite_master_with_alpha_matte(
            master_path,
            matte_path,
            mov_path,
            width=master_info["width"],
            height=master_info["height"],
        )

        with open(mov_path, "rb") as mov_file:
            return mov_file.read()
    finally:
        for path in (matte_path, mov_path):
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass


def _update_status(
    supabase,
    generation_id: str,
    status: str,
    progress: Optional[int] = None,
    output_url: Optional[str] = None,
    provider_request_id: Optional[str] = None,
    provider_status_url: Optional[str] = None,
    provider_response_url: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """背景削除ステータスを DB で更新（内部用）"""
    update_data: dict = {"status": status}

    if progress is not None:
        update_data["progress"] = progress
    if output_url is not None:
        update_data["output_url"] = output_url
    if provider_request_id is not None:
        update_data["provider_request_id"] = provider_request_id
    if provider_status_url is not None:
        update_data["provider_status_url"] = provider_status_url
    if provider_response_url is not None:
        update_data["provider_response_url"] = provider_response_url
    if error_message is not None:
        update_data["error_message"] = error_message

    supabase.table("background_removals").update(update_data).eq("id", generation_id).execute()
