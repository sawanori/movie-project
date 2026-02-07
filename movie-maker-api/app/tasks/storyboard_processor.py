"""
ストーリーボード処理タスク

4シーンの動画を起承転結の順番でステップバイステップ生成し、完了後に自動結合して20秒動画を作成
"""

import asyncio
import logging
import os
import tempfile
import time
from typing import Optional

from app.core.supabase import get_supabase
from app.external.video_provider import (
    get_video_provider,
    VideoProviderError,
    VideoGenerationStatus,
)
from app.external.r2 import download_file, upload_video
from app.services.ffmpeg_service import FFmpegService

logger = logging.getLogger(__name__)


import httpx


def get_previous_video_url(current_scene: dict, all_scenes: list) -> Optional[str]:
    """
    結合順で直前のシーンの動画URLを取得（V2V用）

    Args:
        current_scene: 現在のシーン
        all_scenes: 全シーンリスト

    Returns:
        str: 直前シーンの動画URL（最初のシーンの場合はNone）
    """
    # display_order でソート（フラット構造）
    # display_order がない場合は後方互換のため旧ロジックを使用
    def sort_key(s):
        if s.get("display_order") is not None:
            return (s["display_order"],)
        # 後方互換: display_order がない場合
        act_order = {"起": 1, "承": 2, "転": 3, "結": 4}
        return (
            act_order.get(s.get("act", ""), 99),
            s.get("sub_scene_order", 0),
            s.get("scene_number", 0)
        )

    sorted_scenes = sorted(all_scenes, key=sort_key)

    # 現在のシーンの位置を見つける
    current_index = None
    for i, s in enumerate(sorted_scenes):
        if s["id"] == current_scene["id"]:
            current_index = i
            break

    if current_index is None:
        logger.warning(f"Current scene not found in sorted list: {current_scene['id']}")
        return None

    # 最初のシーン → 前の動画なし（I2Vを使用）
    if current_index == 0:
        return None

    # 直前のシーンの動画URLを返す
    previous_scene = sorted_scenes[current_index - 1]
    previous_video_url = previous_scene.get("video_url")

    if previous_video_url:
        logger.info(
            f"V2V: Scene {current_scene['scene_number']} will use video from "
            f"Scene {previous_scene['scene_number']} ({previous_scene.get('act', 'sub')})"
        )

    return previous_video_url


async def generate_video_with_v2v_fallback(
    provider,
    scene: dict,
    previous_video_url: Optional[str],
    scene_image_url: str,
    aspect_ratio: str = "9:16",
    force_mode: str = None,
    image_tail_url: Optional[str] = None,
    element_images: Optional[list[str]] = None,
) -> tuple[str, str]:
    """
    V2V対応の動画生成（フォールバック付き）

    V2V条件を満たす場合はV2Vを試行し、失敗時はI2Vにフォールバック。
    V2V条件: 前の動画あり & プロバイダーがV2Vをサポート

    Args:
        provider: VideoProviderInterface
        scene: シーン情報
        previous_video_url: 直前シーンの動画URL（なければI2V）
        scene_image_url: シーンの入力画像URL（I2V用）
        aspect_ratio: アスペクト比
        force_mode: 強制モード（"i2v" or "v2v"）。指定時は自動判定を上書き
        image_tail_url: 終了フレーム画像URL（Kling専用オプション）
        element_images: Elements用追加画像URLリスト（Kling専用、最大3枚）

    Returns:
        tuple[str, str]: (task_id, generation_method)
            - generation_method: "v2v" または "i2v"
    """
    runway_prompt = scene["runway_prompt"]
    camera_work = scene.get("camera_work")

    # モード判定: ユーザー指定 > 自動判定
    if force_mode == "i2v":
        use_v2v = False
        logger.info(f"User forced I2V mode for scene {scene.get('scene_number')}")
    elif force_mode == "v2v":
        if previous_video_url and provider.supports_v2v:
            use_v2v = True
            logger.info(f"User forced V2V mode for scene {scene.get('scene_number')}")
        else:
            use_v2v = False
            logger.warning(f"User requested V2V but not available (no prev video or unsupported), falling back to I2V")
    else:
        # 自動判定: V2V条件を満たせばV2V
        use_v2v = (
            previous_video_url is not None
            and provider.supports_v2v
        )

    if use_v2v:
        try:
            logger.info(f"Attempting V2V generation with {provider.provider_name}")
            task_id = await provider.extend_video(
                video_url=previous_video_url,
                prompt=runway_prompt,
                aspect_ratio=aspect_ratio,
            )
            if task_id:
                logger.info(f"V2V task created: {task_id}")
                return task_id, "v2v"
        except Exception as e:
            logger.warning(f"V2V failed, falling back to I2V: {e}")

    # I2V（フォールバックまたはデフォルト）
    from app.external.video_provider import build_prompt_with_camera
    logger.info(f"Using I2V generation with {provider.provider_name}")

    # Kling専用オプション（image_tail_url, element_images）をサポート
    generate_kwargs = {
        "image_url": scene_image_url,
        "prompt": runway_prompt,
        "duration": 5,
        "aspect_ratio": aspect_ratio,
        "camera_work": camera_work,
    }
    if hasattr(provider, 'provider_name') and provider.provider_name == "piapi_kling":
        if image_tail_url:
            generate_kwargs["image_tail_url"] = image_tail_url
            logger.info(f"Using dual image mode with image_tail_url for scene {scene.get('scene_number')}")
        if element_images:
            # Elements使用時: ベース画像を先頭に追加
            all_elements = [scene_image_url] + element_images
            generate_kwargs["element_images"] = all_elements[:4]  # 最大4枚
            logger.info(f"Using Kling Elements with {len(generate_kwargs['element_images'])} images for scene {scene.get('scene_number')}")

    task_id = await provider.generate_video(**generate_kwargs)

    return task_id, "i2v"


async def _extract_and_upload_last_frame(
    ffmpeg,
    video_url: str,
    storyboard_id: str,
    scene_number: int,
) -> str:
    """
    動画の最終フレームを抽出してR2にアップロード

    Args:
        ffmpeg: FFmpegServiceインスタンス
        video_url: 親シーンの動画URL
        storyboard_id: ストーリーボードID
        scene_number: シーン番号

    Returns:
        アップロードされた画像のURL
    """
    from app.external.r2 import upload_image

    async with httpx.AsyncClient() as client:
        response = await client.get(video_url)
        response.raise_for_status()
        video_content = response.content

    with tempfile.TemporaryDirectory() as temp_dir:
        video_path = os.path.join(temp_dir, "video.mp4")
        frame_path = os.path.join(temp_dir, "last_frame.jpg")

        with open(video_path, "wb") as f:
            f.write(video_content)

        await ffmpeg.extract_last_frame(video_path, frame_path)

        with open(frame_path, "rb") as f:
            frame_content = f.read()

    timestamp = int(time.time())
    filename = f"{storyboard_id}/scene_{scene_number}_input_{timestamp}.jpg"
    return await upload_image(frame_content, filename)


async def poll_until_complete(
    task_id: str,
    provider=None,
    timeout: int = 300,
    interval: int = 5,
) -> Optional[str]:
    """
    動画生成タスクが完了するまでポーリング

    Args:
        task_id: タスクID
        provider: VideoProviderInterface（指定がなければ自動取得）
        timeout: タイムアウト（秒）
        interval: ポーリング間隔（秒）

    Returns:
        str: 動画URL（成功時）、None（失敗時）
    """
    if provider is None:
        provider = get_video_provider()

    elapsed = 0
    while elapsed < timeout:
        status = await provider.check_status(task_id)

        if status.status == VideoGenerationStatus.COMPLETED:
            return status.video_url
        elif status.status == VideoGenerationStatus.FAILED:
            logger.error(f"Task {task_id} failed: {status.error_message}")
            return None

        # まだ処理中
        await asyncio.sleep(interval)
        elapsed += interval

    logger.error(f"Task {task_id} timed out after {timeout}s")
    return None


async def poll_until_complete_with_progress(
    task_id: str,
    scene_id: str,
    supabase,
    provider=None,
    timeout: int = 300,
    interval: int = 5,
) -> Optional[str]:
    """
    動画生成タスクが完了するまでポーリング（進捗更新付き）

    Args:
        task_id: タスクID
        scene_id: シーンID（DB更新用）
        supabase: Supabaseクライアント
        provider: VideoProviderInterface（指定がなければ自動取得）
        timeout: タイムアウト（秒）
        interval: ポーリング間隔（秒）

    Returns:
        str: 動画URL（成功時）、None（失敗時）
    """
    if provider is None:
        provider = get_video_provider()

    elapsed = 0
    # 進捗は30%スタート（タスク作成済み）、90%で完了待ち
    base_progress = 30
    max_progress = 90

    while elapsed < timeout:
        status = await provider.check_status(task_id)

        if status.status == VideoGenerationStatus.COMPLETED:
            return status.video_url
        elif status.status == VideoGenerationStatus.FAILED:
            logger.error(f"Task {task_id} failed: {status.error_message}")
            return None

        # 進捗を更新（プロバイダーから返された進捗 or 時間ベース推定）
        if status.progress > 0:
            current_progress = min(status.progress, max_progress)
        else:
            progress_ratio = min(elapsed / timeout, 1.0)
            current_progress = int(base_progress + (max_progress - base_progress) * progress_ratio)

        supabase.table("storyboard_scenes").update({
            "progress": current_progress,
        }).eq("id", scene_id).execute()

        # まだ処理中
        await asyncio.sleep(interval)
        elapsed += interval

    logger.error(f"Task {task_id} timed out after {timeout}s")
    return None


async def process_storyboard_generation(
    storyboard_id: str,
    video_provider: str = None,
    scene_video_modes: dict = None,
    scene_end_frame_images: dict = None,
    element_images: list[str] = None,
):
    """
    ストーリーボードから全シーンを順番に生成

    処理フロー:
    1. ストーリーボードと全シーンを取得
    2. 起→承→転→結の順番で、親シーン→サブシーンの順に動画生成
    3. サブシーンは親の最終フレームを入力画像として使用
    4. 各シーンが完了してから次のシーンへ
    5. 全シーン完了後、videos_readyステータスに更新

    Args:
        storyboard_id: ストーリーボードID
        video_provider: 動画生成プロバイダー名（"runway", "veo", "domoai", "piapi_kling", "hailuo"、Noneの場合は環境変数で決定）
        scene_end_frame_images: シーンごとの終了フレーム画像URL {scene_number: url}（Kling専用）
        element_images: Elements用追加画像URLリスト（Kling専用、最大3枚）
    """
    supabase = get_supabase()
    ffmpeg = FFmpegService()

    # プロバイダーを取得（パラメータ指定があればそれを使用）
    provider = get_video_provider(video_provider)

    logger.info(f"Using video provider: {provider.provider_name}")

    act_order = {"起": 1, "承": 2, "転": 3, "結": 4}
    act_names_display = {"起": "起(Introduction)", "承": "承(Development)", "転": "転(Climax)", "結": "結(Conclusion)"}

    try:
        # ストーリーボードを取得
        sb_response = (
            supabase.table("storyboards")
            .select("*")
            .eq("id", storyboard_id)
            .single()
            .execute()
        )
        if not sb_response.data:
            logger.error(f"Storyboard not found: {storyboard_id}")
            return

        sb_data = sb_response.data
        source_image_url = sb_data["source_image_url"]
        user_id = sb_data["user_id"]
        aspect_ratio = sb_data.get("aspect_ratio", "9:16")

        # 全シーンを取得
        scenes_response = (
            supabase.table("storyboard_scenes")
            .select("*")
            .eq("storyboard_id", storyboard_id)
            .execute()
        )
        scenes = scenes_response.data or []

        if len(scenes) == 0:
            raise Exception("No scenes found")

        # シーンを display_order 順でソート（フラット構造）
        # display_order がない場合は後方互換のため旧ロジックを使用
        def sort_key(s):
            if s.get("display_order") is not None:
                return (s["display_order"],)
            return (
                act_order.get(s.get("act", ""), 99),
                s.get("sub_scene_order", 0),
                s.get("scene_number", 0)
            )
        scenes.sort(key=sort_key)

        total_scenes = len(scenes)
        logger.info(f"Starting generation for storyboard {storyboard_id} with {total_scenes} scenes")
        logger.info(f"Processing scenes in display_order")

        # 親シーンIDからシーンを引けるようにマップを作成
        scene_by_id = {s["id"]: s for s in scenes}

        # 全シーンを順番に生成
        video_urls = []
        completed_count = 0

        for scene in scenes:
            scene_id = scene["id"]
            scene_number = scene["scene_number"]
            act = scene["act"]
            sub_scene_order = scene.get("sub_scene_order", 0)
            parent_scene_id = scene.get("parent_scene_id")
            runway_prompt = scene["runway_prompt"]
            camera_work = scene.get("camera_work")

            # ラベル作成
            if sub_scene_order > 0:
                label = f"{act}-Sub{sub_scene_order}"
            else:
                label = act_names_display.get(act, act)

            # 入力画像を決定
            if parent_scene_id and parent_scene_id in scene_by_id:
                # サブシーンの場合: 親シーンの動画があればその最終フレームを使用
                parent_scene = scene_by_id[parent_scene_id]
                parent_video_url = parent_scene.get("video_url")

                if parent_video_url:
                    # 親の最終フレームを抽出して使用
                    try:
                        scene_image_url = await _extract_and_upload_last_frame(
                            ffmpeg, parent_video_url, storyboard_id, scene_number
                        )
                        logger.info(f"Scene {scene_number} ({label}): Using parent's last frame as input")
                    except Exception as e:
                        logger.warning(f"Failed to extract last frame: {e}, using scene image")
                        scene_image_url = scene.get("scene_image_url") or parent_scene.get("scene_image_url") or source_image_url
                else:
                    # 親動画がまだない場合（通常は発生しないはず）
                    scene_image_url = scene.get("scene_image_url") or source_image_url
            else:
                # 親シーンの場合: シーン画像または元画像
                scene_image_url = scene.get("scene_image_url") or source_image_url

            # 既に完了しているシーンはスキップ（リジューム対応）
            if scene.get("status") == "completed" and scene.get("video_url"):
                logger.info(f"=== Scene {scene_number} ({label}) === Already completed, skipping")
                video_urls.append(scene["video_url"])
                completed_count += 1
                continue

            try:
                logger.info(f"=== Scene {scene_number} ({label}) === [{completed_count + 1}/{total_scenes}]")

                # シーンを generating に更新
                supabase.table("storyboard_scenes").update({
                    "status": "generating",
                    "progress": 10,
                }).eq("id", scene_id).execute()

                logger.info(f"Scene {scene_number} ({label}): Starting video generation with {provider.provider_name}...")

                # V2V: 直前シーンの動画URLを取得（結合順で）
                previous_video_url = get_previous_video_url(scene, scenes)

                # V2V対応の動画生成（フォールバック付き）
                # - ユーザー指定があればそれを優先
                # - 前の動画あり & Runway → V2V試行
                # - それ以外 or V2V失敗 → I2V
                force_mode = scene_video_modes.get(scene_number) if scene_video_modes else None
                # Kling専用: シーンごとの終了フレーム画像URL
                scene_image_tail_url = scene_end_frame_images.get(scene_number) if scene_end_frame_images else None
                task_id, generation_method = await generate_video_with_v2v_fallback(
                    provider=provider,
                    scene=scene,
                    previous_video_url=previous_video_url,
                    scene_image_url=scene_image_url,
                    aspect_ratio=aspect_ratio,
                    force_mode=force_mode,
                    image_tail_url=scene_image_tail_url,
                    element_images=element_images,
                )

                if not task_id:
                    raise VideoProviderError("動画生成プロバイダーからタスクIDが返されませんでした")

                # task_idと生成方法を保存
                supabase.table("storyboard_scenes").update({
                    "runway_task_id": task_id,
                    "progress": 30,
                }).eq("id", scene_id).execute()

                logger.info(f"Scene {scene_number} ({label}): Task created: {task_id} (method: {generation_method})")

                # ポーリングで完了を待機（進捗を更新しながら）
                video_url = await poll_until_complete_with_progress(
                    task_id=task_id,
                    scene_id=scene_id,
                    supabase=supabase,
                    provider=provider,
                    timeout=300,
                    interval=5,
                )

                if not video_url:
                    raise Exception("動画生成プロバイダーからビデオURLが返されませんでした")

                # プロバイダーから動画をダウンロード（SDKを使用、認証付き）
                logger.info(f"Scene {scene_number} ({label}): Downloading video from provider...")
                video_content = await provider.download_video_bytes(task_id)
                if not video_content:
                    raise Exception("動画のダウンロードに失敗しました")

                # R2にアップロード（タイムスタンプ付きファイル名でキャッシュ回避）
                timestamp = int(time.time())
                r2_filename = f"{storyboard_id}/scene_{scene_number}_{timestamp}.mp4"
                r2_url = await upload_video(video_content, r2_filename)
                logger.info(f"Scene {scene_number} ({label}): Uploaded to R2: {r2_url}")

                # シーンを完了に更新（R2のURLを保存）
                supabase.table("storyboard_scenes").update({
                    "status": "completed",
                    "progress": 100,
                    "video_url": r2_url,
                }).eq("id", scene_id).execute()

                logger.info(f"Scene {scene_number} ({label}): Completed ✓")
                video_urls.append(r2_url)
                completed_count += 1

                # シーンマップを更新（後続のサブシーンが参照できるように）
                scene["video_url"] = r2_url
                scene["status"] = "completed"

            except Exception as e:
                logger.exception(f"Scene {scene_number} ({label}) failed: {e}")
                supabase.table("storyboard_scenes").update({
                    "status": "failed",
                    "error_message": str(e),
                }).eq("id", scene_id).execute()

                # 1つでも失敗したら全体を失敗にして終了
                error_msg = f"Scene {scene_number} ({label}) failed: {str(e)}"
                supabase.table("storyboards").update({
                    "status": "failed",
                    "error_message": error_msg,
                }).eq("id", storyboard_id).execute()
                return

        logger.info(f"All {total_scenes} scenes completed")

        # ストーリーボードを videos_ready に更新（自動結合はしない）
        # ユーザーは各シーン動画をプレビューして、必要に応じて再生成できる
        # 確認後に /concatenate エンドポイントを呼んで結合する
        supabase.table("storyboards").update({
            "status": "videos_ready",
            "error_message": None,
        }).eq("id", storyboard_id).execute()

        logger.info(f"Storyboard {storyboard_id} videos ready for review")

    except Exception as e:
        logger.exception(f"Storyboard processing failed: {e}")
        supabase.table("storyboards").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", storyboard_id).execute()


def start_storyboard_processing(
    storyboard_id: str,
    video_provider: str = None,
    scene_video_modes: dict = None,
    scene_end_frame_images: dict = None,
    element_images: list[str] = None,
):
    """ストーリーボード処理を開始（同期ラッパー）"""
    asyncio.run(process_storyboard_generation(
        storyboard_id, video_provider, scene_video_modes, scene_end_frame_images, element_images
    ))


async def process_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,
    video_mode: str = None,
    source_video_url: str = None,
    kling_mode: str = None,
    image_tail_url: str = None,
):
    """
    単一シーンの動画を再生成

    既存のシーン画像とプロンプトを使って、そのシーンだけを再生成する。
    他のシーンには影響しない。

    Args:
        storyboard_id: ストーリーボードID
        scene_number: シーン番号
        video_provider: 動画生成プロバイダー名（"runway", "veo", "domoai", "piapi_kling"、Noneの場合は環境変数で決定）
        custom_prompt: カスタムプロンプト（指定時はこのプロンプトを使用しDBも更新）
        video_mode: 動画生成モード（"i2v": 画像から, "v2v": 直前の動画から継続）
        source_video_url: V2V参照動画URL（指定時はこのURLを使用、未指定時は直前シーンを自動取得）
        kling_mode: Kling AIモード（"std": 標準, "pro": 高品質）。Klingプロバイダー使用時のみ有効
        image_tail_url: 終了フレーム画像URL（Kling専用）。指定時は開始→終了への遷移動画を生成
    """
    supabase = get_supabase()

    # プロバイダーを取得（パラメータ指定があればそれを使用）
    provider = get_video_provider(video_provider)

    act_names = {1: "起", 2: "承", 3: "転", 4: "結"}
    act_name = act_names.get(scene_number, str(scene_number))

    try:
        # ストーリーボードを取得
        sb_response = (
            supabase.table("storyboards")
            .select("*")
            .eq("id", storyboard_id)
            .single()
            .execute()
        )
        if not sb_response.data:
            logger.error(f"Storyboard not found: {storyboard_id}")
            return

        sb_data = sb_response.data
        source_image_url = sb_data["source_image_url"]
        aspect_ratio = sb_data.get("aspect_ratio", "9:16")

        # 対象シーンを取得
        scene_response = (
            supabase.table("storyboard_scenes")
            .select("*")
            .eq("storyboard_id", storyboard_id)
            .eq("scene_number", scene_number)
            .single()
            .execute()
        )
        if not scene_response.data:
            logger.error(f"Scene {scene_number} not found in storyboard {storyboard_id}")
            return

        scene = scene_response.data
        scene_id = scene["id"]
        camera_work = scene.get("camera_work")
        scene_image_url = scene.get("scene_image_url") or source_image_url

        # プロンプトの決定（カスタムプロンプトがあれば使用）
        logger.info(f"[DEBUG] custom_prompt parameter: {custom_prompt[:50] if custom_prompt else 'None'}...")
        if custom_prompt:
            runway_prompt = custom_prompt
            # カスタムプロンプトが指定された場合はDBも更新
            update_result = supabase.table("storyboard_scenes").update({
                "runway_prompt": custom_prompt,
            }).eq("id", scene_id).execute()
            logger.info(f"Scene {scene_number}: Updated runway_prompt in DB. Result: {update_result.data}")
        else:
            runway_prompt = scene["runway_prompt"]
            logger.info(f"[DEBUG] Using existing runway_prompt from DB")

        logger.info(f"Regenerating scene {scene_number} ({act_name}) for storyboard {storyboard_id} using {provider.provider_name}, mode={video_mode or 'i2v'}")

        # シーンを generating に更新
        supabase.table("storyboard_scenes").update({
            "status": "generating",
            "progress": 10,
            "video_url": None,
            "error_message": None,
        }).eq("id", scene_id).execute()

        # V2Vモードの場合、参照動画URLを取得
        previous_video_url = None
        if video_mode == "v2v":
            if source_video_url:
                # source_video_urlが指定されている場合はそれを使用（任意シーン参照）
                previous_video_url = source_video_url
                logger.info(f"V2V: Using specified source video for scene {scene_number}")
            else:
                # 指定がなければ従来通り直前シーンを取得
                all_scenes_response = (
                    supabase.table("storyboard_scenes")
                    .select("*")
                    .eq("storyboard_id", storyboard_id)
                    .execute()
                )
                all_scenes = all_scenes_response.data or []
                previous_video_url = get_previous_video_url(scene, all_scenes)

            if not previous_video_url:
                logger.warning(f"V2V requested but no source video found for scene {scene_number}, falling back to I2V")
                video_mode = "i2v"  # フォールバック
            else:
                logger.info(f"V2V: Using previous video for scene {scene_number}")

        # Act-Two使用判定
        use_act_two = scene.get("use_act_two", False)
        motion_type = scene.get("motion_type")

        # 動画生成プロバイダーでタスク作成
        if use_act_two and motion_type and hasattr(provider, 'generate_video_act_two'):
            # Act-Twoモード: パフォーマンス動画ベースの精密制御
            from app.external.runway_provider import RunwayProvider

            if not isinstance(provider, RunwayProvider):
                raise VideoProviderError("Act-TwoはRunwayプロバイダーでのみ使用可能です")

            # Supabaseからモーション情報を取得
            motion_result = supabase.table("motions").select("motion_url").eq("id", motion_type).single().execute()
            if not motion_result.data:
                raise VideoProviderError(f"モーション '{motion_type}' が見つかりません")
            motion_url = motion_result.data["motion_url"]

            expression_intensity = scene.get("expression_intensity", 5)  # 最大値で表情をしっかり反映
            body_control = scene.get("body_control", True)

            logger.info(f"Scene {scene_number}: Using Act-Two mode with motion '{motion_type}', URL: {motion_url}")
            task_id = await provider.generate_video_act_two(
                image_url=scene_image_url,
                motion_url=motion_url,
                expression_intensity=expression_intensity,
                body_control=body_control,
                aspect_ratio=aspect_ratio,
            )
        elif video_mode == "v2v" and previous_video_url and provider.supports_v2v:
            # V2Vモード: 直前の動画から継続生成
            logger.info(f"Scene {scene_number}: Using V2V mode with previous video")
            task_id = await provider.extend_video(
                video_url=previous_video_url,
                prompt=runway_prompt,
                aspect_ratio=aspect_ratio,
            )
        else:
            # 通常I2Vモード: テキストプロンプトベース
            # Klingプロバイダーの場合はkling_mode, image_tail_urlを渡す
            generate_kwargs = {
                "image_url": scene_image_url,
                "prompt": runway_prompt,
                "duration": 5,
                "aspect_ratio": aspect_ratio,
                "camera_work": camera_work,
            }
            if hasattr(provider, 'provider_name') and provider.provider_name == "piapi_kling":
                if kling_mode:
                    generate_kwargs["mode"] = kling_mode
                    logger.info(f"Scene {scene_number}: Using kling_mode={kling_mode}")
                if image_tail_url:
                    generate_kwargs["image_tail_url"] = image_tail_url
                    logger.info(f"Scene {scene_number}: Using dual image mode (start -> end frame)")
            task_id = await provider.generate_video(**generate_kwargs)

        if not task_id:
            raise VideoProviderError("動画生成プロバイダーからタスクIDが返されませんでした")

        # task_idを保存（後方互換性のためrunway_task_idカラムを使用）
        supabase.table("storyboard_scenes").update({
            "runway_task_id": task_id,
            "progress": 30,
        }).eq("id", scene_id).execute()

        logger.info(f"Scene {scene_number} ({act_name}): Task created: {task_id}")

        # ポーリングで完了を待機
        video_url = await poll_until_complete_with_progress(
            task_id=task_id,
            scene_id=scene_id,
            supabase=supabase,
            provider=provider,
            timeout=300,
            interval=5,
        )

        if not video_url:
            raise Exception("動画生成プロバイダーからビデオURLが返されませんでした")

        # プロバイダーから動画をダウンロード（SDKを使用、認証付き）
        logger.info(f"Scene {scene_number} ({act_name}): Downloading video from provider...")
        video_content = await provider.download_video_bytes(task_id)
        if not video_content:
            raise Exception("動画のダウンロードに失敗しました")

        # R2にアップロード（タイムスタンプ付きファイル名でキャッシュ回避）
        timestamp = int(time.time())
        r2_filename = f"{storyboard_id}/scene_{scene_number}_{timestamp}.mp4"
        r2_url = await upload_video(video_content, r2_filename)
        logger.info(f"Scene {scene_number} ({act_name}): Uploaded to R2: {r2_url}")

        # シーンを完了に更新（R2のURLを保存）
        supabase.table("storyboard_scenes").update({
            "status": "completed",
            "progress": 100,
            "video_url": r2_url,
        }).eq("id", scene_id).execute()

        # ストーリーボードのステータスを videos_ready に更新（自動結合はしない）
        supabase.table("storyboards").update({
            "status": "videos_ready",
        }).eq("id", storyboard_id).execute()

        logger.info(f"Scene {scene_number} ({act_name}) regenerated successfully: {r2_url}")

    except Exception as e:
        logger.exception(f"Scene {scene_number} regeneration failed: {e}")
        supabase.table("storyboard_scenes").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", scene_id).execute()


def start_single_scene_regeneration(storyboard_id: str, scene_number: int, video_provider: str = None, custom_prompt: str = None, video_mode: str = None, source_video_url: str = None, kling_mode: str = None, image_tail_url: str = None):
    """単一シーン再生成を開始（同期ラッパー）"""
    asyncio.run(process_single_scene_regeneration(storyboard_id, scene_number, video_provider, custom_prompt, video_mode, source_video_url, kling_mode, image_tail_url))


async def process_storyboard_concatenation(
    storyboard_id: str,
):
    """
    ストーリーボードの4シーン動画を結合

    全シーンがcompleted状態の時のみ実行可能。
    動画を順番に結合してBGMを追加する。

    Args:
        storyboard_id: ストーリーボードID
    """
    supabase = get_supabase()
    ffmpeg = FFmpegService()

    try:
        # ストーリーボードを取得
        sb_response = (
            supabase.table("storyboards")
            .select("*")
            .eq("id", storyboard_id)
            .single()
            .execute()
        )
        if not sb_response.data:
            logger.error(f"Storyboard not found: {storyboard_id}")
            return

        sb_data = sb_response.data
        user_id = sb_data["user_id"]

        # 全シーンを取得（display_order 順）
        scenes_response = (
            supabase.table("storyboard_scenes")
            .select("*")
            .eq("storyboard_id", storyboard_id)
            .order("display_order")
            .execute()
        )
        scenes = scenes_response.data or []

        # 最低1シーン必要
        if len(scenes) == 0:
            raise Exception("No scenes found")

        logger.info(f"Found {len(scenes)} scenes for concatenation")

        # 全シーンがcompletedでvideo_urlを持っているか確認
        video_urls = []
        for scene in scenes:
            if scene.get("status") != "completed" or not scene.get("video_url"):
                raise Exception(f"Scene {scene['scene_number']} ({scene.get('act', 'sub')}) is not completed or has no video")
            video_urls.append(scene["video_url"])

        # ストーリーボードを結合中に更新
        supabase.table("storyboards").update({
            "status": "concatenating",
        }).eq("id", storyboard_id).execute()

        logger.info(f"Starting concatenation for storyboard {storyboard_id}")

        # 動画をダウンロードして結合
        with tempfile.TemporaryDirectory() as temp_dir:
            video_paths = []

            # 各動画をダウンロード
            for i, url in enumerate(video_urls):
                logger.info(f"Downloading scene {i + 1}: {url}")
                content = await download_file(url)
                path = os.path.join(temp_dir, f"scene_{i + 1}.mp4")
                with open(path, "wb") as f:
                    f.write(content)
                video_paths.append(path)

            # FFmpegで結合（トランジションなし）
            concat_output = os.path.join(temp_dir, "concat.mp4")
            logger.info(f"Concatenating {len(video_paths)} scenes without transition")
            await ffmpeg.concat_videos(
                video_paths=video_paths,
                output_path=concat_output,
                transition="none",
                transition_duration=0,
            )

            current_video = concat_output

            # BGM追加（設定されている場合）
            bgm_url = sb_data.get("custom_bgm_url")
            if not bgm_url and sb_data.get("bgm_track_id"):
                # プリセットBGMを取得
                bgm_response = (
                    supabase.table("bgm_tracks")
                    .select("file_url")
                    .eq("id", sb_data["bgm_track_id"])
                    .single()
                    .execute()
                )
                if bgm_response.data:
                    bgm_url = bgm_response.data["file_url"]

            if bgm_url:
                logger.info(f"Adding BGM: {bgm_url}")
                bgm_content = await download_file(bgm_url)
                bgm_path = os.path.join(temp_dir, "bgm.mp3")
                with open(bgm_path, "wb") as f:
                    f.write(bgm_content)

                bgm_output = os.path.join(temp_dir, "final_with_bgm.mp4")
                await ffmpeg.add_bgm(
                    video_path=current_video,
                    audio_path=bgm_path,
                    output_path=bgm_output,
                    video_volume=0.3,
                    audio_volume=0.7,
                    fade_out_duration=2.0,
                )
                current_video = bgm_output

            # R2にアップロード（タイムスタンプ付きファイル名でキャッシュ回避）
            with open(current_video, "rb") as f:
                video_bytes = f.read()

            timestamp = int(time.time())
            final_filename = f"{user_id}/storyboard_{storyboard_id}_{timestamp}.mp4"
            final_video_url = await upload_video(video_bytes, final_filename)

            logger.info(f"Uploaded final video: {final_video_url}")

            # ストーリーボードを完了に更新
            supabase.table("storyboards").update({
                "status": "completed",
                "final_video_url": final_video_url,
                "total_duration": 20.0,
                "error_message": None,
            }).eq("id", storyboard_id).execute()

            logger.info(f"Storyboard {storyboard_id} concatenation completed successfully")

    except Exception as e:
        logger.exception(f"Storyboard concatenation failed: {e}")
        supabase.table("storyboards").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", storyboard_id).execute()


def start_storyboard_concatenation(
    storyboard_id: str,
):
    """ストーリーボード結合を開始（同期ラッパー）"""
    asyncio.run(process_storyboard_concatenation(storyboard_id))
