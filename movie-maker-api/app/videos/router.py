from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Body, Form, Query
from pathlib import Path
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional
from datetime import datetime
import logging
import uuid
import time
import tempfile
import os
import aiohttp
import shutil
import zipfile

from app.core.dependencies import get_current_user, check_usage_limit
from app.core.supabase import get_supabase
from app.core.config import settings
from app.videos.schemas import (
    VideoCreate, VideoResponse, VideoListResponse, VideoStatusResponse,
    StorySuggestRequest, StorySuggestResponse, StoryVideoCreate, StoryVideoResponse,
    ConcatVideoRequest, ConcatVideoResponse, ConcatVideoStatusResponse, ConcatVideoListResponse,
    ConcatVideoRequestV2, ConcatVideoResponseV2, VideoTrimInfo,
    BGMUploadResponse, AddBGMToVideoRequest, AddBGMToVideoResponse,
    StoryboardCreateRequest, StoryboardResponse, StoryboardListResponse,
    StoryboardSceneUpdate, StoryboardSceneImageUpdate, StoryboardGenerateRequest, StoryboardStatusResponse,
    StoryboardConcatenateRequest, RegenerateVideoRequest, TranslateSceneRequest, TranslateSceneResponse,
    AddSubSceneRequest, SubSceneListResponse, ReorderScenesRequest, AddSceneRequest,
    TranslateStoryPromptRequest, TranslateStoryPromptResponse,
    UpscaleRequest, UpscaleResponse, UpscaleStatusResponse, UpscaleResolution,
    ConcatUpscaleResponse, ConcatUpscaleStatusResponse,
    # 60fps補間用
    InterpolateRequest, InterpolateResponse, InterpolateStatusResponse, InterpolateModel,
    ProResConversionRequest,
    MotionType,
    # BGM AI生成用
    BGMGenerateRequest, BGMGenerateResponse, BGMStatusResponse,
    ApplyBGMRequest, ApplyBGMResponse, BGMGenerationStatus,
    # 広告脚本生成用
    AdScriptGenerateRequest, AdScriptGenerateResponse,
    # シーン画像生成用
    GenerateSceneImageRequest, GenerateSceneImageResponse,
    # FLUX.2 JSONプロンプト変換用
    ConvertToFluxJsonRequest, ConvertToFluxJsonResponse, FluxJsonPreview,
    # テキストから画像生成用（構造化入力）
    GenerateImageFromTextRequest,
    # ユーザー動画アップロード用
    UserVideoResponse, UserVideoListResponse,
    # Topaz Enhancementアップスケール用
    EnhanceModel, TopazUpscaleScale,
    UserVideoUpscaleRequest, UserVideoUpscaleEstimateResponse,
    UserVideoUpscaleResponse, UserVideoUpscaleStatusResponse,
    # ドラフト保存用
    SaveDraftRequest, SaveDraftResponse,
    # Ad Creatorドラフト保存用
    AdCreatorSaveDraftRequest, AdCreatorDraftResponse, AdCreatorDraftMetadata, AdCreatorDraftExistsResponse,
    # 編集用素材エクスポート
    MaterialExportRequest,
    # Ad Creatorプロジェクト管理
    AdCreatorProjectCreate, AdCreatorProjectUpdate, AdCreatorProjectResponse, AdCreatorProjectListResponse,
    # スクリーンショット用
    ScreenshotSource, ScreenshotCreateRequest, ScreenshotResponse, ScreenshotListResponse,
    # 動画アップロード用
    VideoUploadResponse,
)
from app.videos import service
from app.videos.service import (
    upload_user_video as service_upload_user_video,
    get_user_uploaded_videos as service_get_user_uploaded_videos,
    delete_user_uploaded_video as service_delete_user_uploaded_video,
    USER_VIDEO_ALLOWED_TYPES,
    USER_VIDEO_MAX_SIZE_MB,
    get_image_dimensions,
)
from app.external.r2 import upload_image, upload_audio, upload_video, download_file, delete_file, get_r2_client, get_public_url
from app.services.topaz_service import get_topaz_service
from app.external.gemini_client import suggest_stories_from_image, generate_4scene_storyboard, generate_story_frame_image, generate_ad_script, convert_to_flux_json_prompt
from app.tasks import start_video_processing, start_story_processing, start_concat_processing
from app.services.ffmpeg_service import get_ffmpeg_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/videos", tags=["videos"])


# ===== Act-Two モーションライブラリ用エンドポイント (静的パスは動的パスより先に定義) =====

@router.get("/motions", response_model=list[dict])
async def list_available_motions(
    category: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    利用可能なモーション（パフォーマンス動画）の一覧を取得

    Supabaseに登録されたモーションを返す。
    categoryでフィルタリング可能（expression, gesture, action, speaking）。
    """
    supabase = get_supabase()

    try:
        query = supabase.table("motions").select("*").order("created_at", desc=False)
        if category:
            query = query.eq("category", category)

        result = query.execute()

        # フロントエンド用にフォーマット
        return [
            {
                "id": motion["id"],
                "category": motion["category"],
                "name_ja": motion["name_ja"],
                "name_en": motion["name_en"],
                "duration_seconds": motion["duration_seconds"],
                "motion_url": motion["motion_url"],
            }
            for motion in result.data
        ]
    except Exception as e:
        logger.error(f"Failed to fetch motions: {e}")
        return []


@router.get("/motions/{motion_id}")
async def get_motion_details(
    motion_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    特定モーションの詳細とプレビューURLを取得

    モーションのメタデータ（名前、カテゴリ、再生時間）と
    実際の動画URLを返す。
    """
    supabase = get_supabase()

    try:
        result = supabase.table("motions").select("*").eq("id", motion_id).single().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail=f"Motion not found: {motion_id}")

        motion = result.data
        return {
            "id": motion["id"],
            "category": motion["category"],
            "name_ja": motion["name_ja"],
            "name_en": motion["name_en"],
            "duration_seconds": motion["duration_seconds"],
            "motion_url": motion["motion_url"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch motion details: {e}")
        raise HTTPException(status_code=404, detail=f"Motion not found: {motion_id}")


@router.post("/motions/upload")
async def upload_motion_video(
    file: UploadFile = File(...),
    category: str = Form(...),
    motion_id: str = Form(...),
    name_ja: str = Form(...),
    name_en: str = Form(...),
    duration_seconds: int = Form(default=5),
    current_user: dict = Depends(get_current_user),
):
    """
    モーション動画をR2にアップロードし、Supabaseに登録

    Act-Two用のパフォーマンス動画をアップロードする。
    カテゴリ別にR2の motions/{category}/ ディレクトリに保存され、
    メタデータはSupabaseのmotionsテーブルに保存される。
    """
    supabase = get_supabase()

    # カテゴリ検証
    valid_categories = ["expression", "gesture", "action", "speaking"]
    if category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
        )

    # ファイル形式検証
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video files are allowed")

    # ファイルサイズ制限（50MB）
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    # 重複チェック
    existing = supabase.table("motions").select("id").eq("id", motion_id).execute()
    if existing.data:
        raise HTTPException(
            status_code=400,
            detail=f"Motion ID '{motion_id}' already exists. Please use a different ID."
        )

    # カテゴリ別のフォルダ名マッピング
    category_folders = {
        "expression": "expressions",
        "gesture": "gestures",
        "action": "actions",
        "speaking": "speaking",
    }
    folder = category_folders[category]

    # R2にアップロード
    r2_key = f"motions/{folder}/{motion_id}.mp4"

    try:
        # R2クライアントで直接アップロード
        from app.external.r2 import get_r2_client
        r2_client = get_r2_client()
        r2_client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
            Body=content,
            ContentType="video/mp4",
        )

        # 公開URL
        motion_url = f"{settings.R2_PUBLIC_URL.rstrip('/')}/{r2_key}"

        # Supabaseにメタデータを保存
        motion_data = {
            "id": motion_id,
            "category": category,
            "name_ja": name_ja,
            "name_en": name_en,
            "duration_seconds": duration_seconds,
            "r2_key": r2_key,
            "motion_url": motion_url,
            "user_id": current_user["user_id"],
        }

        supabase.table("motions").insert(motion_data).execute()

        logger.info(f"Motion video uploaded and saved: {motion_id} -> {motion_url}")

        return {
            "success": True,
            "motion_id": motion_id,
            "category": category,
            "name_ja": name_ja,
            "name_en": name_en,
            "duration_seconds": duration_seconds,
            "motion_url": motion_url,
            "r2_key": r2_key,
            "message": f"モーション動画 '{name_ja}' をアップロードしました",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload motion video: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.delete("/motions/{motion_id}")
async def delete_motion(
    motion_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    モーション動画を削除

    Supabaseからメタデータを削除し、R2から動画ファイルを削除する。
    自分がアップロードしたモーションのみ削除可能。
    """
    supabase = get_supabase()

    try:
        # モーションを取得
        result = supabase.table("motions").select("*").eq("id", motion_id).single().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail=f"Motion not found: {motion_id}")

        motion = result.data

        # 所有者チェック
        if motion.get("user_id") and motion["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="You can only delete your own motions")

        # R2から削除
        try:
            from app.external.r2 import get_r2_client
            r2_client = get_r2_client()
            r2_client.delete_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=motion["r2_key"],
            )
        except Exception as e:
            logger.warning(f"Failed to delete from R2: {e}")

        # Supabaseから削除
        supabase.table("motions").delete().eq("id", motion_id).execute()

        logger.info(f"Motion deleted: {motion_id}")

        return {"success": True, "message": f"モーション '{motion['name_ja']}' を削除しました"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete motion: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


# ===== 動画結合用エンドポイント (静的パスは動的パスより先に定義) =====

@router.get("/concat", response_model=ConcatVideoListResponse)
async def list_concat_videos(
    page: int = 1,
    per_page: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """結合動画の履歴一覧を取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 総件数を取得
    count_response = (
        supabase.table("video_concatenations")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    total = count_response.count or 0

    # ページネーション付きで取得
    offset = (page - 1) * per_page
    response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    concatenations = [
        service._format_concat_response(item) for item in (response.data or [])
    ]

    return {
        "concatenations": concatenations,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/concat", response_model=ConcatVideoResponse, status_code=status.HTTP_201_CREATED)
async def concat_videos(
    request: ConcatVideoRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    複数の動画を結合して1本の動画を生成

    - 2〜10本の動画を順番通りに結合
    - トランジション効果を選択可能（none, fade, dissolve等）
    - video_urls が指定された場合はURLから直接結合（ストーリーボード対応）
    - video_ids が指定された場合は従来通りDBから取得
    - バックグラウンドで処理
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]
    concat_id = str(uuid.uuid4())

    # video_urls が指定された場合（ストーリーボード等）
    if request.video_urls:
        # URLリストを直接使用
        video_urls = request.video_urls
        source_ids = []  # URLモードではIDは空
        logger.info(f"Concat with direct URLs: {len(video_urls)} videos")
    else:
        # 従来のvideo_idsモード
        video_urls = []
        source_ids = request.video_ids or []

        # 全ての動画が存在し、ユーザーが所有しているか確認
        for video_id in source_ids:
            video_response = (
                supabase.table("video_generations")
                .select("id, user_id, status, final_video_url")
                .eq("id", video_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            if not video_response.data:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video not found or not owned by user: {video_id}"
                )
            if video_response.data.get("status") != "completed":
                raise HTTPException(
                    status_code=400,
                    detail=f"Video is not completed: {video_id}"
                )
            if not video_response.data.get("final_video_url"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Video does not have a final video URL: {video_id}"
                )
            video_urls.append(video_response.data["final_video_url"])

    # 結合ジョブをDBに登録
    concat_data = {
        "id": concat_id,
        "user_id": user_id,
        "source_video_ids": source_ids if source_ids else [],
        "status": "pending",
        "progress": 0,
        "transition": request.transition.value,
        "transition_duration": request.transition_duration,
    }

    insert_response = supabase.table("video_concatenations").insert(concat_data).execute()
    concat_record = insert_response.data[0] if insert_response.data else concat_data

    logger.info(f"Created concat job: {concat_id}, videos: {len(video_urls)}, transition: {request.transition}")

    # バックグラウンドで結合処理を開始（URLリストを渡す）
    background_tasks.add_task(start_concat_processing, concat_id, video_urls if request.video_urls else None)

    return service._format_concat_response(concat_record)


@router.post("/concat/v2", response_model=ConcatVideoResponseV2, status_code=status.HTTP_201_CREATED)
async def concat_videos_v2(
    request: ConcatVideoRequestV2,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    複数の動画を結合して1本の動画を生成（トリミング対応版）

    - 2〜10本の動画を順番通りに結合
    - 各動画の開始・終了位置を指定可能（トリミング）
    - トランジション効果を選択可能（none, fade, dissolve等）
    - バックグラウンドで処理
    """
    from datetime import datetime
    
    supabase = get_supabase()
    user_id = current_user["user_id"]
    concat_id = str(uuid.uuid4())

    video_urls = []
    source_ids = []
    trim_info_list = []

    # 各動画のURLとトリム情報を取得
    for video_info in request.videos:
        if video_info.video_url:
            # URLが直接指定されている場合
            video_urls.append(video_info.video_url)
        elif video_info.video_id:
            # video_idからURLを取得
            video_response = (
                supabase.table("video_generations")
                .select("id, user_id, status, final_video_url")
                .eq("id", video_info.video_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            if not video_response.data:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video not found or not owned by user: {video_info.video_id}"
                )
            if video_response.data.get("status") != "completed":
                raise HTTPException(
                    status_code=400,
                    detail=f"Video is not completed: {video_info.video_id}"
                )
            if not video_response.data.get("final_video_url"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Video does not have a final video URL: {video_info.video_id}"
                )
            video_urls.append(video_response.data["final_video_url"])
            source_ids.append(video_info.video_id)

        # トリム情報を保存
        trim_info_list.append({
            "video_id": video_info.video_id,
            "video_url": video_info.video_url,
            "start_time": video_info.start_time,
            "end_time": video_info.end_time,
        })

    # 結合ジョブをDBに登録
    concat_data = {
        "id": concat_id,
        "user_id": user_id,
        "source_video_ids": source_ids if source_ids else [],
        "status": "pending",
        "progress": 0,
        "transition": request.transition.value,
        "transition_duration": request.transition_duration,
    }

    insert_response = supabase.table("video_concatenations").insert(concat_data).execute()
    concat_record = insert_response.data[0] if insert_response.data else concat_data

    logger.info(f"Created concat job (v2): {concat_id}, videos: {len(video_urls)}, transition: {request.transition}")

    # バックグラウンドで結合処理を開始（トリム情報付き）
    background_tasks.add_task(
        start_concat_processing,
        concat_id,
        video_urls,
        trim_info_list,  # トリム情報を追加
    )

    return ConcatVideoResponseV2(
        id=concat_id,
        status="pending",
        message="動画結合処理を開始しました（トリミング対応）",
        source_videos=request.videos,
        transition=request.transition.value,
        transition_duration=request.transition_duration,
        created_at=datetime.utcnow(),
    )


@router.get("/concat/{concat_id}", response_model=ConcatVideoResponse)
async def get_concat_video(
    concat_id: str,
    current_user: dict = Depends(get_current_user),
):
    """動画結合ジョブの詳細を取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Concat job not found")

    return service._format_concat_response(response.data)


@router.get("/concat/{concat_id}/status", response_model=ConcatVideoStatusResponse)
async def get_concat_status(
    concat_id: str,
    current_user: dict = Depends(get_current_user),
):
    """動画結合ジョブの進捗を取得（ポーリング用）"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    response = (
        supabase.table("video_concatenations")
        .select("id, status, progress, final_video_url, final_video_with_bgm_url, total_duration, error_message")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Concat job not found")

    data = response.data
    status_messages = {
        "pending": "処理待ち",
        "processing": f"結合中... {data.get('progress', 0)}%",
        "completed": "結合完了",
        "failed": f"失敗: {data.get('error_message', 'Unknown error')}",
    }

    return {
        "id": data["id"],
        "status": data["status"],
        "progress": data.get("progress", 0),
        "message": status_messages.get(data["status"], "Unknown status"),
        "video_url": data.get("final_video_url"),
        "video_with_bgm_url": data.get("final_video_with_bgm_url"),
        "total_duration": data.get("total_duration"),
    }


# ===== 結合動画アップスケールエンドポイント =====

@router.post("/concat/{concat_id}/upscale", response_model=ConcatUpscaleResponse)
async def upscale_concat_video(
    concat_id: str,
    request: UpscaleRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    結合動画をアップスケール

    - resolution: hd (1080p) または 4k (2160p)
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 結合ジョブを取得
    response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Concat job not found")

    concat_data = response.data

    if concat_data["status"] != "completed":
        raise HTTPException(status_code=400, detail="Video is not ready for upscaling")

    # source_urlが指定されていればそれを使用（60fps補間後のURL等）
    video_url = request.source_url or concat_data.get("final_video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="No video URL available")

    resolution = request.resolution.value

    # オリジナル解像度の場合は即座にレスポンス
    if resolution == "original":
        return ConcatUpscaleResponse(
            id=concat_id,
            concat_id=concat_id,
            status="completed",
            resolution=request.resolution,
            original_video_url=video_url,
            upscaled_video_url=video_url,
            progress=100,
        )

    # アップスケールジョブを作成
    upscale_id = str(uuid.uuid4())
    upscale_data = {
        "id": upscale_id,
        "user_id": user_id,
        "concat_id": concat_id,
        "original_video_url": video_url,
        "resolution": resolution,
        "status": "pending",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    supabase.table("video_upscales").insert(upscale_data).execute()

    # バックグラウンドでアップスケール処理開始
    from app.tasks import start_upscale_processing
    background_tasks.add_task(start_upscale_processing, upscale_id)

    return ConcatUpscaleResponse(
        id=upscale_id,
        concat_id=concat_id,
        status="pending",
        resolution=request.resolution,
        original_video_url=video_url,
        progress=0,
    )


@router.get("/concat/{concat_id}/upscale/status", response_model=ConcatUpscaleStatusResponse)
async def get_concat_upscale_status(
    concat_id: str,
    current_user: dict = Depends(get_current_user),
):
    """結合動画アップスケールのステータスを取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新のアップスケールジョブを取得
    response = (
        supabase.table("video_upscales")
        .select("*")
        .eq("concat_id", concat_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="No upscale job found for this concat video")

    upscale = response.data[0]
    status = upscale.get("status", "pending")

    status_messages = {
        "pending": "処理待ち",
        "processing": f"アップスケール中... {upscale.get('progress', 0)}%",
        "completed": "アップスケール完了",
        "failed": f"エラー: {upscale.get('error_message', '不明なエラー')}",
    }

    return ConcatUpscaleStatusResponse(
        id=upscale["id"],
        status=status,
        progress=upscale.get("progress", 0),
        message=status_messages.get(status, "Unknown status"),
        upscaled_video_url=upscale.get("upscaled_video_url"),
        resolution=upscale.get("resolution"),
    )


# ===== ProRes変換ダウンロード（デバンド + 10bit）=====

@router.post("/download/prores")
async def download_as_prores(
    video_url: str = Body(..., embed=True, description="変換元の動画URL"),
    request: ProResConversionRequest = Body(default=ProResConversionRequest()),
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user),
):
    """
    動画をProRes形式でダウンロード（オンザフライ変換）

    AI生成動画のバンディングを除去し、編集耐性の高いProRes 422 HQ (10bit)に変換。
    R2には保存せず、一時ファイルとして処理後に削除。

    - video_url: 変換元の動画URL（R2上のMP4）
    - deband_strength: デバンド強度（0.5-2.0、デフォルト1.1）
    - deband_radius: デバンド半径（8-64、デフォルト20）
    - apply_flat_look: フラットルック適用（デフォルトTrue）
    """
    from app.services.ffmpeg_service import get_ffmpeg_service

    # 一時ファイルパス
    task_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    input_path = os.path.join(temp_dir, f"{task_id}_input.mp4")
    output_path = os.path.join(temp_dir, f"{task_id}_prores.mov")

    def cleanup_files():
        """一時ファイルをクリーンアップ"""
        for path in [input_path, output_path]:
            try:
                if os.path.exists(path):
                    os.remove(path)
                    logger.info(f"Cleaned up: {path}")
            except Exception as e:
                logger.warning(f"Cleanup failed: {path}, {e}")

    try:
        # 1. 動画をダウンロード
        logger.info(f"Downloading video: {video_url}")
        async with aiohttp.ClientSession() as session:
            async with session.get(video_url) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail="動画のダウンロードに失敗しました")
                with open(input_path, "wb") as f:
                    f.write(await resp.read())

        # 2. ProRes変換
        logger.info(f"Converting to ProRes: {input_path}")
        ffmpeg = get_ffmpeg_service()
        await ffmpeg.convert_to_prores(
            video_path=input_path,
            output_path=output_path,
            deband_strength=request.deband_strength,
            deband_radius=request.deband_radius,
            apply_flat_look=request.apply_flat_look,
            contrast=request.contrast,
            saturation=request.saturation,
            brightness=request.brightness,
        )

        # 3. ファイルサイズを確認
        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="ProRes変換に失敗しました")

        file_size = os.path.getsize(output_path)
        logger.info(f"ProRes conversion completed: {file_size} bytes")

        # 4. クリーンアップをバックグラウンドタスクに登録
        if background_tasks:
            background_tasks.add_task(cleanup_files)

        # 5. ファイルをレスポンスとして返す
        timestamp = int(time.time())
        filename = f"prores_{timestamp}.mov"

        return FileResponse(
            path=output_path,
            filename=filename,
            media_type="video/quicktime",
            background=background_tasks,
        )

    except HTTPException:
        cleanup_files()
        raise
    except Exception as e:
        cleanup_files()
        logger.exception(f"ProRes conversion failed: {e}")
        raise HTTPException(status_code=500, detail=f"変換処理に失敗しました: {str(e)}")


# ===== ストーリーボード（起承転結4シーン）エンドポイント =====

@router.post("/storyboard", response_model=StoryboardResponse, status_code=status.HTTP_201_CREATED)
async def create_storyboard(
    request: StoryboardCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    画像からストーリーボードを生成（起承転結4シーン）

    AIが画像を解析し、20秒ショートフィルム用の4シーン構成を自動生成。
    シーン1（起）は元画像を使用、シーン2-4（承転結）はNano Bananaで画像生成。
    生成後、ユーザーは各シーンを編集してから動画生成を開始できる。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]
    storyboard_id = str(uuid.uuid4())

    try:
        # video_providerを決定（指定なければ環境変数のデフォルト値を使用）
        provider = request.video_provider.value if request.video_provider else settings.VIDEO_PROVIDER.lower()
        logger.info(f"Using video provider: {provider}")

        # アスペクト比を取得
        aspect_ratio = request.aspect_ratio.value if request.aspect_ratio else "9:16"
        logger.info(f"Using aspect ratio: {aspect_ratio}")

        # element_imagesを取得（Kling Elements用）
        element_urls = [e.image_url for e in request.element_images] if request.element_images else []
        if element_urls:
            logger.info(f"Using {len(element_urls)} element images for consistency")

        # AIで4シーン構成を生成（プロバイダー別テンプレート適用）
        logger.info(f"Generating storyboard for image: {request.image_url}, mood: {request.mood}, provider: {provider}")
        storyboard_data = await generate_4scene_storyboard(
            request.image_url,
            mood=request.mood,
            video_provider=provider
        )

        # ストーリーボードをDBに保存（video_provider, aspect_ratio, element_imagesも保存）
        sb_record = {
            "id": storyboard_id,
            "user_id": user_id,
            "source_image_url": request.image_url,
            "title": storyboard_data.get("title"),
            "status": "draft",
            "video_provider": provider,
            "aspect_ratio": aspect_ratio,
            "element_images": element_urls,
        }
        supabase.table("storyboards").insert(sb_record).execute()

        # 4シーンをDBに保存（この段階では画像生成せず、ストーリーとプロンプトのみ）
        # 画像生成は /generate-images エンドポイントで別途実行
        scenes_to_insert = []

        for scene in storyboard_data.get("scenes", []):
            scene_number = scene["scene_number"]

            # シーン1のみ元画像を設定、シーン2-4は画像なし（後で生成）
            scene_image_url = request.image_url if scene_number == 1 else None

            scene_record = {
                "id": str(uuid.uuid4()),
                "storyboard_id": storyboard_id,
                "scene_number": scene_number,
                "display_order": scene_number,  # display_order = scene_number for initial creation
                "act": scene["act"],
                "description_ja": scene.get("description_ja", ""),
                "runway_prompt": scene.get("runway_prompt", ""),
                "camera_work": scene.get("camera_work"),
                "mood": scene.get("mood"),
                "scene_image_url": scene_image_url,
                "status": "pending",
                "progress": 0,
            }
            scenes_to_insert.append(scene_record)

        if scenes_to_insert:
            supabase.table("storyboard_scenes").insert(scenes_to_insert).execute()

        logger.info(f"Created storyboard {storyboard_id} with {len(scenes_to_insert)} scenes")

        # レスポンスを構築
        return await _get_storyboard_with_scenes(storyboard_id, user_id)

    except Exception as e:
        logger.exception(f"Failed to create storyboard: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"ストーリーボードの生成に失敗しました: {str(e)}"
        )


async def _generate_scene_image(
    user_id: str,
    storyboard_id: str,
    scene_number: int,
    description: str,
    runway_prompt: str,
    reference_image_url: str,
    previous_scene_image_url: str | None = None,
    aspect_ratio: str = "9:16",
) -> str | None:
    """
    Nano Bananaでシーン画像を生成してR2にアップロード

    Args:
        user_id: ユーザーID
        storyboard_id: ストーリーボードID
        scene_number: シーン番号
        description: 日本語説明
        runway_prompt: 英語プロンプト
        reference_image_url: 元画像URL（Identity Preservation用）
        previous_scene_image_url: 直前のシーン画像URL（シーン間の連続性を保つため）
        aspect_ratio: アスペクト比（9:16 or 16:9）

    Returns:
        str: 生成された画像のURL、失敗時はNone
    """
    try:
        # 画像生成用のプロンプトを構築
        image_prompt = f"""
Scene {scene_number} of a 4-scene story sequence.
{runway_prompt}

Visual requirements:
- Maintain exact identity of all subjects from the reference image
- Same person/character, same clothing, same setting
- Only change pose, expression, or slight camera angle as described
- High quality, cinematic, photorealistic
"""

        logger.info(f"Generating image for scene {scene_number}: {description[:50]}... (aspect_ratio: {aspect_ratio})")
        if previous_scene_image_url:
            logger.info(f"Using previous scene image for continuity: {previous_scene_image_url[:50]}...")

        # Nano Bananaで画像生成（元画像 + 直前のシーン画像を参照）
        image_bytes = await generate_story_frame_image(
            prompt=image_prompt,
            reference_image_url=reference_image_url,
            previous_scene_image_url=previous_scene_image_url,
            aspect_ratio=aspect_ratio,
        )

        if not image_bytes:
            logger.warning(f"Scene {scene_number} image generation returned None")
            return None

        # R2にアップロード（タイムスタンプ付きでキャッシュ回避）
        timestamp = int(time.time() * 1000)
        filename = f"{user_id}/storyboard_{storyboard_id}_scene_{scene_number}_{timestamp}.jpg"
        image_url = await upload_image(image_bytes, filename)

        logger.info(f"Scene {scene_number} image uploaded: {image_url}")
        return image_url

    except Exception as e:
        logger.exception(f"Failed to generate scene {scene_number} image: {e}")
        return None


@router.get("/storyboard", response_model=StoryboardListResponse)
async def list_storyboards(
    page: int = 1,
    per_page: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """ストーリーボード一覧を取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 総件数を取得
    count_response = (
        supabase.table("storyboards")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    total = count_response.count or 0

    # ページネーション付きで取得
    offset = (page - 1) * per_page
    response = (
        supabase.table("storyboards")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    storyboards = []
    for sb in response.data or []:
        # 各ストーリーボードのシーンも取得
        scenes_response = (
            supabase.table("storyboard_scenes")
            .select("*")
            .eq("storyboard_id", sb["id"])
            .order("display_order")
            .execute()
        )
        sb["scenes"] = scenes_response.data or []
        storyboards.append(sb)

    return {
        "storyboards": storyboards,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/storyboard/{storyboard_id}", response_model=StoryboardResponse)
async def get_storyboard(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ストーリーボードの詳細を取得"""
    return await _get_storyboard_with_scenes(storyboard_id, current_user["user_id"])


# ===== ドラフト（一時保存）エンドポイント =====

@router.put("/storyboard/{storyboard_id}/draft", response_model=SaveDraftResponse)
async def save_storyboard_draft(
    storyboard_id: str,
    request: SaveDraftRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボードのUI状態をドラフトとして一時保存

    編集中のカメラワーク選択、トリム設定、各種フォーム状態を保存します。
    自動保存（10秒間隔）またはページ離脱時に呼び出されます。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # ドラフトメタデータを更新
    now = datetime.utcnow().isoformat() + "Z"
    draft_data = request.draft_metadata.model_dump()
    draft_data["last_saved_at"] = now

    supabase.table("storyboards").update({
        "draft_metadata": draft_data
    }).eq("id", storyboard_id).execute()

    logger.info(f"Draft saved for storyboard {storyboard_id} by user {user_id}")

    return SaveDraftResponse(
        success=True,
        last_saved_at=now
    )


@router.delete("/storyboard/{storyboard_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
async def clear_storyboard_draft(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボードのドラフト（一時保存）をクリア

    ユーザーが「ドラフトを破棄」を選択した場合、
    またはストーリーボードが正常に完了した場合に呼び出されます。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # draft_metadata を null にクリア
    supabase.table("storyboards").update({
        "draft_metadata": None
    }).eq("id", storyboard_id).execute()

    logger.info(f"Draft cleared for storyboard {storyboard_id} by user {user_id}")


@router.put("/storyboard/{storyboard_id}/scenes/{scene_number}")
async def update_storyboard_scene(
    storyboard_id: str,
    scene_number: int,
    request: StoryboardSceneUpdate,
    current_user: dict = Depends(get_current_user),
):
    """ストーリーボードの特定シーンを更新"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # 更新データを構築
    update_data = {}
    if request.description_ja is not None:
        update_data["description_ja"] = request.description_ja
    if request.runway_prompt is not None:
        update_data["runway_prompt"] = request.runway_prompt
    if request.camera_work is not None:
        update_data["camera_work"] = request.camera_work
    if request.mood is not None:
        update_data["mood"] = request.mood

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    # シーンを更新
    supabase.table("storyboard_scenes").update(update_data).eq(
        "storyboard_id", storyboard_id
    ).eq("scene_number", scene_number).execute()

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.post("/storyboard/translate-scene", response_model=TranslateSceneResponse)
async def translate_scene_description(
    request: TranslateSceneRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    日本語のシーン説明をAPI用の英語プロンプトに翻訳（テンプレート構造維持）

    リアルタイムで日本語→英語変換を行い、プロバイダー別テンプレートに沿った
    最適化されたプロンプトを返す。サブシーン（scene_number > 4）も対応。
    """
    from app.external.gemini_client import translate_scene_to_runway_prompt

    supabase = get_supabase()

    # storyboard_idが指定されている場合、video_providerとシーンのactを取得
    video_provider = "runway"  # デフォルト
    scene_act = None  # サブシーンの場合、actをDBから取得

    if request.storyboard_id:
        try:
            sb_response = (
                supabase.table("storyboards")
                .select("video_provider")
                .eq("id", request.storyboard_id)
                .single()
                .execute()
            )
            if sb_response.data and sb_response.data.get("video_provider"):
                video_provider = sb_response.data["video_provider"]
                logger.info(f"Using video_provider from storyboard: {video_provider}")

            # シーンのactを取得（サブシーンの場合に重要）
            scene_response = (
                supabase.table("storyboard_scenes")
                .select("act")
                .eq("storyboard_id", request.storyboard_id)
                .eq("scene_number", request.scene_number)
                .single()
                .execute()
            )
            if scene_response.data:
                scene_act = scene_response.data.get("act")
                logger.info(f"Scene {request.scene_number} act: {scene_act}")
        except Exception as e:
            logger.warning(f"Could not fetch storyboard info: {e}, using default")

    try:
        runway_prompt = await translate_scene_to_runway_prompt(
            description_ja=request.description_ja,
            scene_number=request.scene_number,
            video_provider=video_provider,
            scene_act=scene_act,
        )
        return TranslateSceneResponse(runway_prompt=runway_prompt)
    except Exception as e:
        logger.exception(f"Translation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"翻訳に失敗しました: {str(e)}"
        )


@router.post("/storyboard/{storyboard_id}/scenes/{scene_number}/regenerate-image")
async def regenerate_scene_image(
    storyboard_id: str,
    scene_number: int,
    current_user: dict = Depends(get_current_user),
):
    """
    特定シーンの画像を再生成

    Nano Bananaを使って新しい画像を生成し、既存の画像を置き換える。
    全シーン（1-4）で再生成可能。元画像をベースに新しいバリエーションを生成。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認と情報取得（aspect_ratioも含む）
    sb_response = (
        supabase.table("storyboards")
        .select("id, source_image_url, aspect_ratio")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # 対象シーンの情報を取得
    scene_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", scene_number)
        .single()
        .execute()
    )
    if not scene_response.data:
        raise HTTPException(status_code=404, detail="Scene not found")

    scene = scene_response.data
    source_image_url = sb_response.data["source_image_url"]
    aspect_ratio = sb_response.data.get("aspect_ratio", "9:16")

    # 直前のシーン画像URLを取得（シーン2以降の場合）
    previous_scene_image_url = None
    if scene_number > 1:
        prev_scene_response = (
            supabase.table("storyboard_scenes")
            .select("scene_image_url")
            .eq("storyboard_id", storyboard_id)
            .eq("scene_number", scene_number - 1)
            .single()
            .execute()
        )
        if prev_scene_response.data:
            previous_scene_image_url = prev_scene_response.data.get("scene_image_url")

    # 新しい画像を生成
    logger.info(f"Regenerating image for storyboard {storyboard_id} scene {scene_number} (aspect_ratio: {aspect_ratio})")

    new_image_url = await _generate_scene_image(
        user_id=user_id,
        storyboard_id=storyboard_id,
        scene_number=scene_number,
        description=scene.get("description_ja", ""),
        runway_prompt=scene.get("runway_prompt", ""),
        reference_image_url=source_image_url,
        previous_scene_image_url=previous_scene_image_url,
        aspect_ratio=aspect_ratio,
    )

    if not new_image_url:
        raise HTTPException(
            status_code=500,
            detail="画像の再生成に失敗しました"
        )

    # DBを更新
    supabase.table("storyboard_scenes").update({
        "scene_image_url": new_image_url
    }).eq("storyboard_id", storyboard_id).eq("scene_number", scene_number).execute()

    logger.info(f"Scene {scene_number} image regenerated: {new_image_url}")

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.post("/storyboard/{storyboard_id}/generate-images", response_model=StoryboardResponse)
async def generate_storyboard_images(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボードの全シーン画像を一括生成（サブシーン対応）

    ストーリーとプロンプトを確認した後、このエンドポイントで
    全シーン（親シーン + サブシーン）の画像を順次生成する。

    処理順序:
    1. 親シーン1（起）: 元画像を使用
    2. 親シーン1のサブシーン: 親の画像を参照して生成
    3. 親シーン2（承）: 前のシーンの画像を参照して生成
    4. 親シーン2のサブシーン: 親の画像を参照して生成
    ... 以下同様
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認と情報取得（aspect_ratioも含む）
    sb_response = (
        supabase.table("storyboards")
        .select("id, source_image_url, status, aspect_ratio")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    source_image_url = sb_response.data["source_image_url"]
    aspect_ratio = sb_response.data.get("aspect_ratio", "9:16")

    # 全シーンを取得
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )
    scenes = scenes_response.data or []

    # シーンを display_order 順で処理（フラット構造）
    parent_scenes = [s for s in scenes if s.get("parent_scene_id") is None]

    if len(parent_scenes) < 4:
        raise HTTPException(status_code=400, detail="ストーリーボードに最低4つの親シーンが必要です")

    total_scenes = len(scenes)
    logger.info(f"Generating images for storyboard {storyboard_id}: {len(parent_scenes)} parent scenes, {total_scenes - len(parent_scenes)} sub-scenes (aspect_ratio: {aspect_ratio})")

    # 親シーンをact順でソート（起→承→転→結）
    act_order = {"起": 1, "承": 2, "転": 3, "結": 4}
    parent_scenes.sort(key=lambda s: act_order.get(s.get("act", ""), 99))

    # 画像を順次生成
    previous_scene_image_url = source_image_url
    parent_image_cache = {}  # 親シーンIDごとの画像URLキャッシュ

    for parent in parent_scenes:
        parent_id = parent["id"]
        parent_scene_number = parent["scene_number"]
        is_first_parent = parent.get("act") == "起"

        # === 親シーンの画像処理 ===
        if is_first_parent:
            # 起シーン（最初の親）は元画像を使用
            if not parent.get("scene_image_url"):
                supabase.table("storyboard_scenes").update({
                    "scene_image_url": source_image_url
                }).eq("id", parent_id).execute()
            parent_image_url = source_image_url
            logger.info(f"Scene {parent_scene_number} (起): using source image")
        else:
            # 他の親シーンは画像を生成
            logger.info(f"Generating image for parent scene {parent_scene_number} ({parent.get('act')})...")

            new_image_url = await _generate_scene_image(
                user_id=user_id,
                storyboard_id=storyboard_id,
                scene_number=parent_scene_number,
                description=parent.get("description_ja", ""),
                runway_prompt=parent.get("runway_prompt", ""),
                reference_image_url=source_image_url,
                previous_scene_image_url=previous_scene_image_url,
                aspect_ratio=aspect_ratio,
            )

            if new_image_url:
                supabase.table("storyboard_scenes").update({
                    "scene_image_url": new_image_url
                }).eq("id", parent_id).execute()
                parent_image_url = new_image_url
                logger.info(f"Parent scene {parent_scene_number} image generated: {new_image_url}")
            else:
                logger.warning(f"Failed to generate image for parent scene {parent_scene_number}")
                parent_image_url = previous_scene_image_url  # フォールバック

        # 親シーンの画像をキャッシュ
        parent_image_cache[parent_id] = parent_image_url
        previous_scene_image_url = parent_image_url

        # === この親のサブシーンを処理 ===
        sub_scenes = [s for s in scenes if s.get("parent_scene_id") == parent_id]
        sub_scenes.sort(key=lambda s: s.get("sub_scene_order", 0))

        for sub in sub_scenes:
            sub_scene_number = sub["scene_number"]
            sub_id = sub["id"]

            # サブシーンのプロンプトが空の場合はスキップ（ユーザーが未入力）
            if not sub.get("runway_prompt") and not sub.get("description_ja"):
                logger.warning(f"Sub-scene {sub_scene_number} has no prompt, skipping image generation")
                continue

            logger.info(f"Generating image for sub-scene {sub_scene_number} (parent: {parent_scene_number})...")

            new_image_url = await _generate_scene_image(
                user_id=user_id,
                storyboard_id=storyboard_id,
                scene_number=sub_scene_number,
                description=sub.get("description_ja", ""),
                runway_prompt=sub.get("runway_prompt", ""),
                reference_image_url=parent_image_url,  # 親の画像を参照
                previous_scene_image_url=previous_scene_image_url,
                aspect_ratio=aspect_ratio,
            )

            if new_image_url:
                supabase.table("storyboard_scenes").update({
                    "scene_image_url": new_image_url
                }).eq("id", sub_id).execute()
                previous_scene_image_url = new_image_url
                logger.info(f"Sub-scene {sub_scene_number} image generated: {new_image_url}")
            else:
                logger.warning(f"Failed to generate image for sub-scene {sub_scene_number}")

    logger.info(f"All scene images generated for storyboard {storyboard_id}")

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.put("/storyboard/{storyboard_id}/scenes/{scene_number}/image", response_model=StoryboardResponse)
async def update_scene_image(
    storyboard_id: str,
    scene_number: int,
    request: StoryboardSceneImageUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    特定シーンの画像をカスタム画像で差し替え

    ユーザーがアップロードした画像でシーンの画像を置き換える。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # 対象シーンの存在確認
    scene_response = (
        supabase.table("storyboard_scenes")
        .select("id")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", scene_number)
        .single()
        .execute()
    )
    if not scene_response.data:
        raise HTTPException(status_code=404, detail="Scene not found")

    # 画像URLを更新
    supabase.table("storyboard_scenes").update({
        "scene_image_url": request.image_url
    }).eq("storyboard_id", storyboard_id).eq("scene_number", scene_number).execute()

    logger.info(f"Scene {scene_number} image updated to custom: {request.image_url}")

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


# ===== サブシーン（追加カット）エンドポイント =====


@router.post("/storyboard/{storyboard_id}/scenes/{parent_scene_number}/add-sub-scene", response_model=StoryboardResponse)
async def add_sub_scene(
    storyboard_id: str,
    parent_scene_number: int,
    request: AddSubSceneRequest = None,
    current_user: dict = Depends(get_current_user),
):
    """
    親シーンに追加カット（サブシーン）を追加

    - 画像生成前: 空のプロンプトでサブシーンを作成（ユーザーが入力）
    - 画像生成後: 親シーンの動画最終フレームを抽出して入力画像に使用
    - カメラワークは連続性テーブルから自動選択
    - 各親シーンに最大3つまでサブシーンを追加可能
    """
    from app.services.camera_continuity import get_continuation_camera_work
    from app.services.ffmpeg_service import get_ffmpeg_service
    from app.external.r2 import upload_image
    import tempfile
    import httpx
    import os

    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("*, video_provider")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    video_provider = sb_response.data.get("video_provider", "runway")

    # 親シーンを取得
    parent_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", parent_scene_number)
        .is_("parent_scene_id", "null")  # 親シーンのみ
        .single()
        .execute()
    )
    if not parent_response.data:
        raise HTTPException(status_code=404, detail="Parent scene not found")

    parent_scene = parent_response.data

    # 既存のサブシーン数を確認（最大3つまで）
    sub_scenes_response = (
        supabase.table("storyboard_scenes")
        .select("id, sub_scene_order")
        .eq("parent_scene_id", parent_scene["id"])
        .order("sub_scene_order")
        .execute()
    )
    existing_sub_scenes = sub_scenes_response.data or []

    if len(existing_sub_scenes) >= 3:
        raise HTTPException(
            status_code=400,
            detail="Maximum 3 sub-scenes per parent scene allowed"
        )

    # 新しいサブシーンの順序を決定
    new_sub_scene_order = len(existing_sub_scenes) + 1

    # カメラワークを決定
    camera_work = request.camera_work if request and request.camera_work else get_continuation_camera_work(
        parent_scene.get("camera_work"),
        new_sub_scene_order
    )

    # プロンプトはユーザーが入力（空で作成）
    # リクエストで指定されている場合はそれを使用
    description_ja = request.description_ja if request and request.description_ja else ""
    runway_prompt = request.runway_prompt if request and request.runway_prompt else ""

    # 入力画像を決定
    # - 親シーンに動画がある場合: 最終フレームを抽出（動画生成後の追加）
    # - 親シーンに動画がない場合: Null（画像生成前の追加、generate_imagesで一括生成）
    # ※ 動画がない = まだ動画生成前なので、画像は継承せず空で作成
    scene_image_url = None

    if parent_scene.get("video_url"):
        # 動画生成後にサブシーン追加 → 最終フレームを抽出
        try:
            ffmpeg = get_ffmpeg_service()

            # 親動画をダウンロード
            async with httpx.AsyncClient() as client:
                video_response = await client.get(parent_scene["video_url"])
                video_response.raise_for_status()

            with tempfile.TemporaryDirectory() as temp_dir:
                video_path = os.path.join(temp_dir, "parent_video.mp4")
                frame_path = os.path.join(temp_dir, "last_frame.jpg")

                with open(video_path, "wb") as f:
                    f.write(video_response.content)

                # 最終フレームを抽出
                await ffmpeg.extract_last_frame(video_path, frame_path)

                # R2にアップロード
                with open(frame_path, "rb") as f:
                    frame_content = f.read()

                frame_filename = f"{storyboard_id}/sub_scene_{parent_scene_number}_{new_sub_scene_order}_frame.jpg"
                scene_image_url = await upload_image(frame_content, frame_filename)
                logger.info(f"Extracted last frame uploaded: {scene_image_url}")

        except Exception as e:
            logger.warning(f"Failed to extract last frame, using parent image: {e}")
            # フォールバック: 親シーンの画像を使用
            scene_image_url = parent_scene.get("scene_image_url")
    # else: 動画がない = 画像生成前の追加
    # scene_image_url = None のまま（generate_storyboard_imagesで一括生成）

    # 新しいサブシーンの挿入位置を計算
    # 親シーンのscene_number + 既存サブシーン数 + 1
    new_scene_number = parent_scene["scene_number"] + new_sub_scene_order

    # この位置以降のシーンを後ろにずらす（大きい順で更新して衝突回避）
    scenes_to_shift = (
        supabase.table("storyboard_scenes")
        .select("id, scene_number")
        .eq("storyboard_id", storyboard_id)
        .gte("scene_number", new_scene_number)
        .order("scene_number", desc=True)
        .execute()
    )

    for scene in scenes_to_shift.data or []:
        supabase.table("storyboard_scenes").update({
            "scene_number": scene["scene_number"] + 1
        }).eq("id", scene["id"]).execute()

    # サブシーンをDBに挿入
    new_scene_data = {
        "storyboard_id": storyboard_id,
        "scene_number": new_scene_number,
        "act": parent_scene["act"],
        "description_ja": description_ja,
        "runway_prompt": runway_prompt,  # ユーザーが入力（空の場合もあり）
        "camera_work": camera_work,
        "mood": parent_scene.get("mood"),
        "duration_seconds": parent_scene.get("duration_seconds", 5),
        "scene_image_url": scene_image_url,
        "parent_scene_id": parent_scene["id"],
        "sub_scene_order": new_sub_scene_order,
        "status": "pending",
        "progress": 0,
    }

    supabase.table("storyboard_scenes").insert(new_scene_data).execute()

    logger.info(f"Sub-scene added: parent={parent_scene_number}, order={new_sub_scene_order}, scene_number={new_scene_number}")

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.delete("/storyboard/{storyboard_id}/scenes/{scene_number}/sub-scene", response_model=StoryboardResponse)
async def delete_sub_scene(
    storyboard_id: str,
    scene_number: int,
    current_user: dict = Depends(get_current_user),
):
    """
    サブシーンを削除

    - 親シーン（scene_number 1-4）は削除不可
    - 削除後、後続のscene_numberは自動的に再計算される
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

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
        raise HTTPException(status_code=404, detail="Scene not found")

    scene = scene_response.data

    # 親シーンは削除不可
    if scene.get("parent_scene_id") is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete parent scene. Only sub-scenes can be deleted."
        )

    # サブシーンを削除
    supabase.table("storyboard_scenes").delete().eq("id", scene["id"]).execute()

    logger.info(f"Sub-scene deleted: scene_number={scene_number}")

    # scene_numberを再計算
    await _recalculate_scene_numbers(storyboard_id)

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.delete("/storyboard/{storyboard_id}/scenes/{scene_id}")
async def delete_scene(
    storyboard_id: str,
    scene_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    シーンを削除

    - 最後の1シーンは削除不可
    - 削除後、残りシーンのdisplay_orderを振り直し
    - R2の動画ファイルは削除しない（ストレージコスト vs 復元可能性のトレードオフ）
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 1. ストーリーボード所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id, user_id")
        .eq("id", storyboard_id)
        .single()
        .execute()
    )

    if not sb_response.data:
        raise HTTPException(status_code=404, detail="ストーリーボードが見つかりません")

    if sb_response.data["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="このストーリーボードへのアクセス権がありません")

    # 2. シーン数チェック
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("id, display_order")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )

    scenes = scenes_response.data
    if len(scenes) <= 1:
        raise HTTPException(status_code=400, detail="最後のシーンは削除できません")

    # 3. 対象シーンの存在確認
    target_scene = next((s for s in scenes if s["id"] == scene_id), None)
    if not target_scene:
        raise HTTPException(status_code=404, detail="シーンが見つかりません")

    # 4. 削除実行
    supabase.table("storyboard_scenes").delete().eq("id", scene_id).execute()

    logger.info(f"Scene deleted: scene_id={scene_id}, storyboard_id={storyboard_id}")

    # 5. display_order振り直し
    remaining_scenes = [s for s in scenes if s["id"] != scene_id]
    for i, scene in enumerate(remaining_scenes):
        supabase.table("storyboard_scenes").update({
            "display_order": i + 1
        }).eq("id", scene["id"]).execute()

    # 6. 更新後のシーン一覧を返す
    updated_scenes = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )

    return {
        "success": True,
        "deleted_scene_id": scene_id,
        "remaining_count": len(remaining_scenes),
        "scenes": updated_scenes.data
    }


@router.patch("/storyboard/{storyboard_id}/scenes/reorder")
async def reorder_scenes(
    storyboard_id: str,
    request: ReorderScenesRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    シーンの順序を変更

    トランザクション的に更新（失敗時は元の状態を維持）
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 1. ストーリーボード所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id, user_id")
        .eq("id", storyboard_id)
        .single()
        .execute()
    )

    if not sb_response.data:
        raise HTTPException(status_code=404, detail="ストーリーボードが見つかりません")

    if sb_response.data["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="このストーリーボードへのアクセス権がありません")

    # 2. 現在のシーン取得
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("id")
        .eq("storyboard_id", storyboard_id)
        .execute()
    )

    current_scene_ids = {s["id"] for s in scenes_response.data}
    request_scene_ids = set(request.scene_ids)

    # 3. バリデーション
    if current_scene_ids != request_scene_ids:
        raise HTTPException(status_code=400, detail="シーンIDが一致しません。ページを再読み込みしてください。")

    # 4. display_order更新
    for index, scene_id in enumerate(request.scene_ids):
        supabase.table("storyboard_scenes").update({
            "display_order": index + 1
        }).eq("id", scene_id).execute()

    logger.info(f"Scenes reordered: storyboard_id={storyboard_id}, new_order={request.scene_ids}")

    # 5. 更新後のシーン一覧を返す
    updated_scenes = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )

    return {"success": True, "scenes": updated_scenes.data}


@router.post("/storyboard/{storyboard_id}/scenes", status_code=201)
async def add_scene(
    storyboard_id: str,
    request: AddSceneRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    新しいシーンを追加

    - 末尾に追加（display_orderは最大値+1）
    - runway_promptはGeminiで自動生成
    - 画像未指定時はバックグラウンドで生成
    - V2Vモード: 既存動画を参照して動画生成
    - auto_generate_video: 追加と同時に動画生成開始
    """
    from app.external.gemini_client import translate_scene_to_runway_prompt
    from app.tasks import start_single_scene_regeneration

    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 1. ストーリーボード所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("*")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not sb_response.data:
        raise HTTPException(status_code=404, detail="ストーリーボードが見つかりません")

    storyboard = sb_response.data

    # 2. 動画生成モードの検証
    video_mode = request.video_mode or "i2v"
    source_video_url = request.source_video_url

    if video_mode == "v2v":
        if not source_video_url:
            raise HTTPException(status_code=400, detail="V2Vモードには参照動画URLが必要です")

    # 3. 現在の最大display_orderを取得
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("display_order")
        .eq("storyboard_id", storyboard_id)
        .order("display_order", desc=True)
        .limit(1)
        .execute()
    )

    max_order = scenes_response.data[0]["display_order"] if scenes_response.data else 0
    new_order = max_order + 1

    # 4. runway_promptを生成（指定がない場合のみ自動翻訳）
    if request.runway_prompt and request.runway_prompt.strip():
        runway_prompt = request.runway_prompt.strip()
    else:
        try:
            runway_prompt = await translate_scene_to_runway_prompt(
                description_ja=request.description_ja,
                scene_number=new_order,
                video_provider=storyboard.get("video_provider", "runway"),
            )
        except Exception as e:
            logger.warning(f"Failed to generate runway prompt: {e}")
            runway_prompt = request.description_ja  # フォールバック

    # 5. 初期ステータス決定
    if request.auto_generate_video:
        initial_status = "generating"
        initial_progress = 10
    elif video_mode == "v2v" and source_video_url:
        initial_status = "v2v_ready"
        initial_progress = 0
    elif request.custom_image_url:
        initial_status = "image_ready"
        initial_progress = 0
    else:
        initial_status = "pending"
        initial_progress = 0

    # 6. 新規シーン作成
    new_scene_data = {
        "storyboard_id": storyboard_id,
        "display_order": new_order,
        "scene_number": new_order,  # 後方互換
        "act": "custom",
        "description_ja": request.description_ja,
        "runway_prompt": runway_prompt,
        "scene_image_url": request.custom_image_url if video_mode == "i2v" else None,
        "status": initial_status,
        "progress": initial_progress,
        "duration_seconds": 5,
        "sub_scene_order": 0,
    }

    result = supabase.table("storyboard_scenes").insert(new_scene_data).execute()
    new_scene = result.data[0]

    logger.info(f"Scene added: scene_id={new_scene['id']}, storyboard_id={storyboard_id}, display_order={new_order}, video_mode={video_mode}")

    # 7. 自動動画生成
    if request.auto_generate_video:
        video_provider = storyboard.get("video_provider", "runway")
        background_tasks.add_task(
            start_single_scene_regeneration,
            storyboard_id,
            new_scene["scene_number"],
            video_provider,
            None,  # custom_prompt: runway_promptはDB保存済み
            video_mode,
            source_video_url,
        )
        # usage count を1増加
        try:
            supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()
        except Exception as e:
            logger.warning(f"Failed to increment video count: {e}")

        logger.info(f"Auto video generation started for scene {new_scene['scene_number']}")

    # 8. 更新後の全データを返す
    updated_scenes = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )

    return {
        "scene": new_scene,
        "scenes": updated_scenes.data
    }


@router.get("/storyboard/{storyboard_id}/scenes/{parent_scene_number}/sub-scenes", response_model=SubSceneListResponse)
async def list_sub_scenes(
    storyboard_id: str,
    parent_scene_number: int,
    current_user: dict = Depends(get_current_user),
):
    """
    親シーンに紐づくサブシーン一覧を取得
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # 親シーンを取得
    parent_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", parent_scene_number)
        .is_("parent_scene_id", "null")
        .single()
        .execute()
    )
    if not parent_response.data:
        raise HTTPException(status_code=404, detail="Parent scene not found")

    parent_scene = parent_response.data

    # サブシーンを取得
    sub_scenes_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("parent_scene_id", parent_scene["id"])
        .order("sub_scene_order")
        .execute()
    )
    sub_scenes = sub_scenes_response.data or []

    return {
        "parent_scene": parent_scene,
        "sub_scenes": sub_scenes,
        "can_add_more": len(sub_scenes) < 3,
    }


async def _recalculate_scene_numbers(storyboard_id: str):
    """
    シーン追加/削除後にscene_numberを再計算

    順序: 起(親→サブ1→サブ2→サブ3) → 承(親→サブ...) → 転 → 結

    ユニーク制約(storyboard_id, scene_number)を回避するため、
    増加方向と減少方向を分けて更新する。
    """
    supabase = get_supabase()

    # 全シーンを取得
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .execute()
    )
    scenes = scenes_response.data or []

    if not scenes:
        return

    # act順序
    act_order = {"起": 1, "承": 2, "転": 3, "結": 4}

    # 親シーンとサブシーンを分離
    parent_scenes = [s for s in scenes if s.get("parent_scene_id") is None]
    sub_scenes = [s for s in scenes if s.get("parent_scene_id") is not None]

    # 親シーンをact順でソート
    parent_scenes.sort(key=lambda s: act_order.get(s["act"], 99))

    # 新しいscene_numberを計算（id -> 新しいscene_number のマッピング）
    new_number = 1
    id_to_new_number = {}
    id_to_old_number = {s["id"]: s["scene_number"] for s in scenes}

    for parent in parent_scenes:
        id_to_new_number[parent["id"]] = new_number
        new_number += 1

        # この親のサブシーン
        parent_sub_scenes = [s for s in sub_scenes if s["parent_scene_id"] == parent["id"]]
        parent_sub_scenes.sort(key=lambda s: s.get("sub_scene_order", 0))

        for sub in parent_sub_scenes:
            id_to_new_number[sub["id"]] = new_number
            new_number += 1

    # 更新が必要なシーンを分類
    # 増加するシーン（新番号 > 旧番号）は大きい順に更新
    # 減少するシーン（新番号 < 旧番号）は小さい順に更新
    increasing = []
    decreasing = []

    for scene_id, new_num in id_to_new_number.items():
        old_num = id_to_old_number[scene_id]
        if new_num > old_num:
            increasing.append((scene_id, new_num, old_num))
        elif new_num < old_num:
            decreasing.append((scene_id, new_num, old_num))

    # 増加するシーンを新番号の大きい順で更新（衝突回避）
    increasing.sort(key=lambda x: x[1], reverse=True)
    for scene_id, new_num, _ in increasing:
        supabase.table("storyboard_scenes").update({
            "scene_number": new_num
        }).eq("id", scene_id).execute()

    # 減少するシーンを新番号の小さい順で更新（衝突回避）
    decreasing.sort(key=lambda x: x[1])
    for scene_id, new_num, _ in decreasing:
        supabase.table("storyboard_scenes").update({
            "scene_number": new_num
        }).eq("id", scene_id).execute()

    total_updated = len(increasing) + len(decreasing)
    if total_updated:
        logger.info(f"Recalculated scene numbers: {total_updated} scenes updated")


@router.post("/storyboard/{storyboard_id}/scenes/{scene_number}/regenerate-video")
async def regenerate_scene_video(
    storyboard_id: str,
    scene_number: int,
    background_tasks: BackgroundTasks,
    request: RegenerateVideoRequest = Body(default=None),
    current_user: dict = Depends(check_usage_limit),
):
    """
    特定シーンの動画を再生成

    既存のシーン画像とプロンプトを使って、そのシーンの動画だけを再生成する。
    他のシーンには影響しない。生成完了後は手動でconcatenateを呼ぶ必要がある。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認（video_providerも取得）
    sb_response = (
        supabase.table("storyboards")
        .select("id, status, video_provider")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    sb_status = sb_response.data.get("status")
    sb_video_provider = sb_response.data.get("video_provider")  # DBに保存されたプロバイダー
    if sb_status == "generating" or sb_status == "concatenating":
        raise HTTPException(
            status_code=400,
            detail=f"Storyboard is currently {sb_status}. Cannot regenerate."
        )

    # 対象シーンの存在確認
    scene_response = (
        supabase.table("storyboard_scenes")
        .select("id, status")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", scene_number)
        .single()
        .execute()
    )
    if not scene_response.data:
        raise HTTPException(status_code=404, detail="Scene not found")

    if scene_response.data.get("status") == "generating":
        raise HTTPException(status_code=400, detail="Scene is already generating")

    logger.info(f"Starting video regeneration for storyboard {storyboard_id} scene {scene_number}")
    logger.info(f"[DEBUG] Request object type: {type(request)}, value: {request}")
    if request:
        logger.info(f"[DEBUG] Request.prompt: {request.prompt}")
        logger.info(f"[DEBUG] Request.video_provider: {request.video_provider}")
        logger.info(f"[DEBUG] Request.video_mode: {request.video_mode}")

    # video_providerの決定（リクエスト指定 > ストーリーボードDB値 > 環境変数）
    video_provider = None
    if request and request.video_provider:
        video_provider = request.video_provider.value
        logger.info(f"[DEBUG] Using video_provider from request: {video_provider}")
    elif sb_video_provider:
        video_provider = sb_video_provider
        logger.info(f"[DEBUG] Using video_provider from storyboard DB: {video_provider}")
    else:
        logger.info("[DEBUG] No video_provider in request or storyboard DB, will use environment variable default")

    # promptの取得（指定があればカスタムプロンプトを使用）
    custom_prompt = None
    if request and request.prompt:
        custom_prompt = request.prompt
        prompt_preview = custom_prompt[:100] + "..." if len(custom_prompt) > 100 else custom_prompt
        logger.info(f"[DEBUG] Custom prompt received (length={len(custom_prompt)}): {prompt_preview}")
    else:
        logger.info(f"[DEBUG] No custom prompt provided. request={request}, request.prompt={request.prompt if request else 'N/A'}")

    # video_modeの取得（i2v: 画像から, v2v: 直前の動画から）
    video_mode = None
    if request and request.video_mode:
        video_mode = request.video_mode.value
        logger.info(f"[DEBUG] Using video_mode from request: {video_mode}")
    else:
        logger.info("[DEBUG] No video_mode specified, will use i2v (default)")

    # kling_modeの取得（Klingプロバイダー使用時のみ有効）
    kling_mode = None
    if request and request.kling_mode:
        kling_mode = request.kling_mode.value
        logger.info(f"[DEBUG] Using kling_mode from request: {kling_mode}")

    # image_tail_urlの取得（Klingプロバイダー専用、開始→終了フレーム遷移動画生成用）
    image_tail_url = None
    if request and request.image_tail_url:
        image_tail_url = request.image_tail_url
        logger.info(f"[DEBUG] Using image_tail_url from request: {image_tail_url[:50]}...")

    # バックグラウンドで単一シーン再生成を開始
    from app.tasks import start_single_scene_regeneration
    logger.info(f"[DEBUG] Calling start_single_scene_regeneration with custom_prompt={'Yes' if custom_prompt else 'No'}, video_mode={video_mode}, kling_mode={kling_mode}, image_tail_url={'Yes' if image_tail_url else 'No'}")
    background_tasks.add_task(start_single_scene_regeneration, storyboard_id, scene_number, video_provider, custom_prompt, video_mode, None, kling_mode, image_tail_url)

    # usage count を1増加
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.post("/storyboard/{storyboard_id}/concatenate")
async def concatenate_storyboard_videos(
    storyboard_id: str,
    background_tasks: BackgroundTasks,
    request: StoryboardConcatenateRequest = None,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボードの全シーン動画を結合

    全シーンがcompleted状態で、video_urlを持っている場合のみ実行可能。
    結合後、最終動画のURLが生成される。
    サブシーンがある場合は4シーン以上になる。

    オプションでフィルムグレインとLUT（カラーグレーディング）を指定可能。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id, status")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    sb_status = sb_response.data.get("status")
    if sb_status == "generating" or sb_status == "concatenating":
        raise HTTPException(
            status_code=400,
            detail=f"Storyboard is currently {sb_status}. Cannot concatenate."
        )

    # 全シーンがcompletedでvideo_urlを持っているか確認
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("scene_number, display_order, status, video_url")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )
    scenes = scenes_response.data or []

    # 最低1シーン必要
    if len(scenes) < 4:
        raise HTTPException(
            status_code=400,
            detail=f"At least 4 scenes required, got {len(scenes)}"
        )

    for scene in scenes:
        if scene.get("status") != "completed" or not scene.get("video_url"):
            raise HTTPException(
                status_code=400,
                detail=f"Scene {scene['scene_number']} is not completed or has no video"
            )

    logger.info(f"Starting concatenation for storyboard {storyboard_id}")

    # バックグラウンドで結合を開始
    from app.tasks import start_storyboard_concatenation
    background_tasks.add_task(
        start_storyboard_concatenation,
        storyboard_id,
    )

    # ストーリーボードを結合中に更新
    supabase.table("storyboards").update({
        "status": "concatenating",
    }).eq("id", storyboard_id).execute()

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.post("/storyboard/{storyboard_id}/generate", response_model=StoryboardResponse)
async def generate_storyboard_videos(
    storyboard_id: str,
    request: StoryboardGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(check_usage_limit),
):
    """
    ストーリーボードから4シーンの動画を並列生成

    全シーン完了後、自動的に結合して20秒動画を作成。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権と状態確認
    sb_response = (
        supabase.table("storyboards")
        .select("*")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    sb_data = sb_response.data
    if sb_data.get("status") == "generating":
        raise HTTPException(status_code=400, detail="Already generating")

    # ストーリーボードを生成中に更新（エラーメッセージもクリア）
    supabase.table("storyboards").update({
        "status": "generating",
        "bgm_track_id": request.bgm_track_id,
        "custom_bgm_url": request.custom_bgm_url,
        "error_message": None,
    }).eq("id", storyboard_id).execute()

    # 完了していないシーンのみリセット（リジューム対応）
    # completedかつvideo_urlがあるシーンはそのまま維持
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("id, status, video_url")
        .eq("storyboard_id", storyboard_id)
        .execute()
    )
    scenes_to_reset = []
    completed_count = 0
    for scene in scenes_response.data or []:
        if scene.get("status") == "completed" and scene.get("video_url"):
            completed_count += 1
            logger.info(f"Scene {scene['id']} already completed, skipping reset")
        else:
            scenes_to_reset.append(scene["id"])

    # 未完了シーンのみリセット
    for scene_id in scenes_to_reset:
        supabase.table("storyboard_scenes").update({
            "status": "pending",
            "progress": 0,
            "video_url": None,
            "runway_task_id": None,
            "error_message": None,
        }).eq("id", scene_id).execute()

    scenes_to_generate = len(scenes_to_reset)
    logger.info(f"Starting storyboard generation: {storyboard_id} ({scenes_to_generate} scenes to generate, {completed_count} already completed)")

    # video_providerの決定（リクエスト指定 > 環境変数）
    video_provider = request.video_provider.value if request.video_provider else None

    # scene_video_modesの取得（シーンごとのI2V/V2V設定）
    scene_video_modes = request.scene_video_modes or {}

    # scene_end_frame_imagesの取得（シーンごとの終了フレーム画像URL、Kling専用）
    scene_end_frame_images = request.scene_end_frame_images or {}

    # element_imagesの取得（リクエスト指定 > DB保存値、Kling専用）
    if request.element_images:
        element_urls = [e.image_url for e in request.element_images]
    else:
        element_urls = sb_data.get("element_images", []) or []

    # Kling以外のプロバイダーでelement_imagesがある場合はエラー
    if element_urls and video_provider and video_provider not in ["piapi_kling", None]:
        raise HTTPException(status_code=400, detail="Elements機能はKlingプロバイダーのみ対応しています")

    if element_urls:
        logger.info(f"Using {len(element_urls)} element images for consistency")

    # バックグラウンドで4シーン並列生成を開始
    from app.tasks import start_storyboard_processing
    background_tasks.add_task(
        start_storyboard_processing,
        storyboard_id,
        video_provider,
        scene_video_modes,
        scene_end_frame_images,
        element_urls,
    )

    # usage count を未完了シーン分のみ増加（リジューム時は完了済みシーンをカウントしない）
    for _ in range(scenes_to_generate):
        supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    return await _get_storyboard_with_scenes(storyboard_id, user_id)


@router.get("/storyboard/{storyboard_id}/status", response_model=StoryboardStatusResponse)
async def get_storyboard_status(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ストーリーボード生成の進捗を取得（ポーリング用）"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボード取得
    sb_response = (
        supabase.table("storyboards")
        .select("id, status, final_video_url, total_duration, error_message")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    sb_data = sb_response.data

    # シーン進捗を取得
    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("scene_number, display_order, act, status, progress, video_url, error_message")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )

    scenes = [
        {
            "scene_number": s["scene_number"],
            "act": s["act"],
            "status": s["status"],
            "progress": s.get("progress", 0),
            "video_url": s.get("video_url"),
            "error_message": s.get("error_message"),
        }
        for s in (scenes_response.data or [])
    ]

    status_messages = {
        "draft": "編集中",
        "generating": "生成中...",
        "completed": "完了",
        "failed": f"失敗: {sb_data.get('error_message', 'Unknown error')}",
    }

    return {
        "id": storyboard_id,
        "status": sb_data["status"],
        "scenes": scenes,
        "message": status_messages.get(sb_data["status"], "Unknown"),
        "video_url": sb_data.get("final_video_url"),
        "total_duration": sb_data.get("total_duration"),
    }


@router.delete("/storyboard/{storyboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_storyboard(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ストーリーボードを削除"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # CASCADE削除（シーンも自動削除）
    supabase.table("storyboards").delete().eq("id", storyboard_id).execute()
    logger.info(f"Deleted storyboard: {storyboard_id}")


async def _get_storyboard_with_scenes(storyboard_id: str, user_id: str) -> dict:
    """ストーリーボードとシーンを取得するヘルパー"""
    supabase = get_supabase()

    sb_response = (
        supabase.table("storyboards")
        .select("*")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    scenes_response = (
        supabase.table("storyboard_scenes")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .order("display_order")
        .execute()
    )

    sb_data = sb_response.data
    sb_data["scenes"] = scenes_response.data or []

    return sb_data


# ===== 動画生成エンドポイント =====

@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def create_video(
    request: VideoCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(check_usage_limit),
):
    """動画を生成"""
    result = await service.create_video(current_user["user_id"], request)

    # バックグラウンドで動画処理を開始
    background_tasks.add_task(start_video_processing, result["id"])

    return result


@router.get("", response_model=VideoListResponse)
async def list_videos(
    page: int = 1,
    per_page: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """生成履歴を取得"""
    return await service.get_user_videos(current_user["user_id"], page, per_page)


# ===== ユーザーアップロード動画エンドポイント（動的パスより先に定義） =====

@router.post("/upload-video", response_model=UserVideoResponse)
async def upload_user_video_endpoint(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """
    ユーザー動画をアップロード

    制限:
    - ファイル形式: MP4, MOV
    - 最大サイズ: 50MB
    - 最大解像度: 4K (3840x2160)
    - 最大尺: 10秒
    """
    # Content-Type チェック
    if file.content_type not in USER_VIDEO_ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="対応していないファイル形式です。MP4またはMOVをアップロードしてください。"
        )

    # ファイルサイズチェック（ストリーミング読み込み）
    content = await file.read()
    file_size = len(content)

    if file_size > USER_VIDEO_MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"ファイルサイズが大きすぎます。最大{USER_VIDEO_MAX_SIZE_MB}MBまでアップロード可能です。"
        )

    # タイトル自動生成
    video_title = title or (Path(file.filename).stem if file.filename else "マイ動画")

    try:
        result = await service_upload_user_video(
            user_id=current_user["user_id"],
            content=content,
            filename=file.filename or "video.mp4",
            mime_type=file.content_type,
            title=video_title,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user-videos", response_model=UserVideoListResponse)
async def list_user_videos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """ユーザーアップロード動画一覧を取得"""
    return await service_get_user_uploaded_videos(
        user_id=current_user["user_id"],
        page=page,
        per_page=per_page,
    )


@router.delete("/user-videos/{video_id}")
async def delete_user_video_endpoint(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ユーザーアップロード動画を削除"""
    success = await service_delete_user_uploaded_video(
        user_id=current_user["user_id"],
        video_id=video_id,
    )

    if not success:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    return {"success": True}


# ===== ユーザー動画Topazアップスケールエンドポイント =====

@router.post("/user-videos/{user_video_id}/upscale/estimate", response_model=UserVideoUpscaleEstimateResponse)
async def estimate_user_video_upscale(
    user_video_id: str,
    request: UserVideoUpscaleRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    アップスケールのコスト見積もり

    Topaz APIのStep 1のみ実行してestimatesを取得。クレジットは消費しない。
    """
    supabase = get_supabase()

    # 動画取得 + 所有者チェック
    video_response = (
        supabase.table("user_videos")
        .select("*")
        .eq("id", user_video_id)
        .eq("user_id", current_user["user_id"])
        .single()
        .execute()
    )

    if not video_response.data:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    video = video_response.data

    # scale_factorを取得
    scale_factor = 4 if request.scale.value == "4x" else 2

    # 既に目標解像度以上かチェック
    topaz = get_topaz_service()
    target_res = topaz.calculate_target_resolution(
        video["width"], video["height"], scale_factor
    )

    if video["width"] >= target_res["width"] and video["height"] >= target_res["height"]:
        raise HTTPException(
            status_code=400,
            detail="この動画は既に目標解像度以上です"
        )

    # Topaz API で見積もり取得
    try:
        estimate = await topaz.estimate_enhancement_cost(
            video_url=video["video_url"],
            model=request.model.value,
            scale_factor=scale_factor,
        )

        return UserVideoUpscaleEstimateResponse(
            estimated_credits_min=estimate["estimated_credits_min"],
            estimated_credits_max=estimate["estimated_credits_max"],
            estimated_time_min=estimate["estimated_time_min"],
            estimated_time_max=estimate["estimated_time_max"],
            target_width=estimate["target_width"],
            target_height=estimate["target_height"],
        )
    except Exception as e:
        logger.error(f"Upscale estimate failed: {e}")
        raise HTTPException(status_code=500, detail=f"見積もりの取得に失敗しました: {str(e)}")


@router.post("/user-videos/{user_video_id}/upscale", response_model=UserVideoUpscaleResponse)
async def upscale_user_video(
    user_video_id: str,
    request: UserVideoUpscaleRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    ユーザー動画のアップスケールを開始
    """
    supabase = get_supabase()

    # 動画取得 + 所有者チェック
    video_response = (
        supabase.table("user_videos")
        .select("*")
        .eq("id", user_video_id)
        .eq("user_id", current_user["user_id"])
        .single()
        .execute()
    )

    if not video_response.data:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    video = video_response.data

    # 重複チェック: 同一動画の pending/processing アップスケールがあれば409
    existing = (
        supabase.table("user_video_upscales")
        .select("id, status")
        .eq("user_video_id", user_video_id)
        .in_("status", ["pending", "processing"])
        .execute()
    )

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail="この動画は既にアップスケール処理中です"
        )

    # scale_factorを取得
    scale_factor = 4 if request.scale.value == "4x" else 2

    # 目標解像度を計算
    topaz = get_topaz_service()
    target_res = topaz.calculate_target_resolution(
        video["width"], video["height"], scale_factor
    )

    # 既に目標解像度以上かチェック
    if video["width"] >= target_res["width"] and video["height"] >= target_res["height"]:
        raise HTTPException(
            status_code=400,
            detail="この動画は既に目標解像度以上です"
        )

    # DBにアップスケールレコードを作成
    upscale_data = {
        "user_id": current_user["user_id"],
        "user_video_id": user_video_id,
        "original_video_url": video["video_url"],
        "model": request.model.value,
        "target_width": target_res["width"],
        "target_height": target_res["height"],
        "status": "pending",
        "progress": 0,
    }

    insert_response = (
        supabase.table("user_video_upscales")
        .insert(upscale_data)
        .execute()
    )

    if not insert_response.data:
        raise HTTPException(status_code=500, detail="アップスケールタスクの作成に失敗しました")

    upscale_record = insert_response.data[0]

    # バックグラウンドタスクで処理開始
    from app.tasks.topaz_upscale_processor import start_topaz_upscale_processing
    background_tasks.add_task(start_topaz_upscale_processing, upscale_record["id"])

    return UserVideoUpscaleResponse(
        id=str(upscale_record["id"]),
        user_video_id=user_video_id,
        status=upscale_record["status"],
        model=upscale_record["model"],
        target_width=upscale_record["target_width"],
        target_height=upscale_record["target_height"],
        original_video_url=upscale_record["original_video_url"],
        created_at=upscale_record["created_at"],
    )


@router.get("/user-videos/{user_video_id}/upscale/status", response_model=UserVideoUpscaleStatusResponse)
async def get_user_video_upscale_status(
    user_video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """最新のアップスケールステータスを返す"""
    supabase = get_supabase()

    # 最新のアップスケールタスクを取得
    response = (
        supabase.table("user_video_upscales")
        .select("*")
        .eq("user_video_id", user_video_id)
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="アップスケールタスクが見つかりません")

    upscale = response.data[0]

    return UserVideoUpscaleStatusResponse(
        id=str(upscale["id"]),
        status=upscale["status"],
        progress=upscale.get("progress", 0),
        upscaled_video_url=upscale.get("upscaled_video_url"),
        thumbnail_url=upscale.get("thumbnail_url"),
        error_message=upscale.get("error_message"),
    )


# ===== スクリーンショット用ヘルパー関数 =====

async def _resolve_video_url(
    request: ScreenshotCreateRequest,
    user_id: str,
    db
) -> str:
    """ソースタイプに応じて動画URLを解決"""
    if request.source_type == ScreenshotSource.URL:
        return request.source_url

    if request.source_type == ScreenshotSource.VIDEO_GENERATION:
        result = db.table("video_generations").select("final_video_url").eq(
            "id", request.source_id
        ).eq("user_id", user_id).single().execute()
        if not result.data or not result.data.get("final_video_url"):
            raise HTTPException(status_code=404, detail="Video not found or not ready")
        return result.data["final_video_url"]

    if request.source_type == ScreenshotSource.STORYBOARD_SCENE:
        result = db.table("storyboard_scenes").select(
            "video_url, storyboard_id"
        ).eq("id", request.source_id).single().execute()
        if not result.data or not result.data.get("video_url"):
            raise HTTPException(status_code=404, detail="Scene video not found or not ready")
        # 権限チェック: ストーリーボードの所有者か確認
        sb_result = db.table("storyboards").select("user_id").eq(
            "id", result.data["storyboard_id"]
        ).single().execute()
        if not sb_result.data or sb_result.data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this scene")
        return result.data["video_url"]

    if request.source_type == ScreenshotSource.USER_VIDEO:
        result = db.table("user_videos").select("video_url").eq(
            "id", request.source_id
        ).eq("user_id", user_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User video not found")
        return result.data["video_url"]

    raise HTTPException(status_code=400, detail="Invalid source type")


def _get_source_columns(request: ScreenshotCreateRequest) -> dict:
    """リクエストからDBカラム用のソース情報を生成"""
    if request.source_type == ScreenshotSource.VIDEO_GENERATION:
        return {"source_video_generation_id": request.source_id}
    if request.source_type == ScreenshotSource.STORYBOARD_SCENE:
        return {"source_storyboard_scene_id": request.source_id}
    if request.source_type == ScreenshotSource.USER_VIDEO:
        return {"source_user_video_id": request.source_id}
    if request.source_type == ScreenshotSource.URL:
        return {"source_video_url": request.source_url}
    return {}


def _db_row_to_response(row: dict) -> ScreenshotResponse:
    """DBの行データをレスポンスモデルに変換（source_typeを計算）"""
    source_type = "url"
    source_id = None

    if row.get("source_video_generation_id"):
        source_type = "video_generation"
        source_id = row["source_video_generation_id"]
    elif row.get("source_storyboard_scene_id"):
        source_type = "storyboard_scene"
        source_id = row["source_storyboard_scene_id"]
    elif row.get("source_user_video_id"):
        source_type = "user_video"
        source_id = row["source_user_video_id"]

    return ScreenshotResponse(
        id=row["id"],
        user_id=row["user_id"],
        source_type=source_type,
        source_id=source_id,
        source_video_url=row.get("source_video_url"),
        timestamp_seconds=row["timestamp_seconds"],
        image_url=row["image_url"],
        width=row.get("width"),
        height=row.get("height"),
        title=row.get("title"),
        created_at=row["created_at"],
    )


# ===== スクリーンショットエンドポイント =====

@router.post("/screenshots", response_model=ScreenshotResponse)
async def create_screenshot(
    request: ScreenshotCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    動画からスクリーンショットを抽出

    指定したタイムスタンプのフレームを画像として保存し、
    動画生成のソース画像として再利用可能にする。
    """
    user_id = current_user["user_id"]
    db = get_supabase()
    ffmpeg = get_ffmpeg_service()

    # 1. ソース動画URLを解決
    video_url = await _resolve_video_url(request, user_id, db)

    # 2. 動画をダウンロード
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "source.mp4")
        video_content = await download_file(video_url)
        with open(video_path, "wb") as f:
            f.write(video_content)

        # 3. タイムスタンプのバリデーション
        duration = await ffmpeg._get_video_duration(video_path)
        if duration is None:
            raise HTTPException(status_code=400, detail="Failed to get video duration")
        if request.timestamp_seconds > duration:
            raise HTTPException(
                status_code=400,
                detail=f"Timestamp ({request.timestamp_seconds}s) exceeds video duration ({duration:.1f}s)"
            )

        # 4. フレーム抽出（既存メソッドを使用）
        image_path = os.path.join(tmp_dir, "screenshot.jpg")
        await ffmpeg.extract_first_frame(
            video_path,
            image_path,
            offset_seconds=request.timestamp_seconds
        )

        # 5. 画像サイズ取得
        width, height = await get_image_dimensions(image_path)

        # 6. R2にアップロード
        r2_key = f"screenshots/{user_id}/{uuid.uuid4()}.jpg"
        with open(image_path, "rb") as f:
            image_content = f.read()

        client = get_r2_client()
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
            Body=image_content,
            ContentType="image/jpeg",
        )
        image_url = get_public_url(r2_key)

        # 7. DBに保存
        data = {
            "user_id": user_id,
            "timestamp_seconds": request.timestamp_seconds,
            "image_url": image_url,
            "r2_key": r2_key,
            "width": width,
            "height": height,
            "title": request.title,
            **_get_source_columns(request)
        }

        result = db.table("video_screenshots").insert(data).execute()
        logger.info(f"Screenshot created: {result.data[0]['id']} for user {user_id}")
        return _db_row_to_response(result.data[0])


@router.get("/screenshots", response_model=ScreenshotListResponse)
async def list_screenshots(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    スクリーンショット一覧を取得

    ページネーション付きでユーザーのスクリーンショットを取得する。
    作成日時の降順でソートされる。
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    # 総数取得
    count_result = db.table("video_screenshots").select(
        "*", count="exact"
    ).eq("user_id", user_id).execute()
    total = count_result.count or 0

    # ページネーション
    offset = (page - 1) * per_page
    result = db.table("video_screenshots").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    return ScreenshotListResponse(
        screenshots=[_db_row_to_response(row) for row in result.data],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/screenshots/{screenshot_id}", response_model=ScreenshotResponse)
async def get_screenshot(
    screenshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """スクリーンショット詳細を取得"""
    user_id = current_user["user_id"]
    db = get_supabase()

    result = db.table("video_screenshots").select("*").eq(
        "id", screenshot_id
    ).eq("user_id", user_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    return _db_row_to_response(result.data)


@router.delete("/screenshots/{screenshot_id}")
async def delete_screenshot(
    screenshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    スクリーンショットを削除

    DBレコードとR2上の画像ファイルの両方を削除する。
    """
    user_id = current_user["user_id"]
    db = get_supabase()

    # 存在確認とr2_key取得
    result = db.table("video_screenshots").select("r2_key").eq(
        "id", screenshot_id
    ).eq("user_id", user_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    r2_key = result.data["r2_key"]

    # R2から削除
    try:
        await delete_file(r2_key)
    except Exception as e:
        logger.warning(f"Failed to delete R2 file {r2_key}: {e}")

    # DBから削除
    db.table("video_screenshots").delete().eq("id", screenshot_id).execute()

    logger.info(f"Screenshot deleted: {screenshot_id} for user {user_id}")
    return {"message": "Screenshot deleted successfully"}


# ===== 動画詳細エンドポイント =====

@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """動画の詳細を取得"""
    result = await service.get_video(current_user["user_id"], video_id)
    if not result:
        raise HTTPException(status_code=404, detail="Video not found")
    return result


@router.get("/{video_id}/status", response_model=VideoStatusResponse)
async def get_video_status(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """動画生成の進捗を取得（ポーリング用）"""
    result = await service.get_video_status(current_user["user_id"], video_id)
    if not result:
        raise HTTPException(status_code=404, detail="Video not found")
    return result


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """動画を削除"""
    try:
        logger.info(f"Delete request for video: {video_id}")
        success = await service.delete_video(current_user["user_id"], video_id)
        if not success:
            raise HTTPException(status_code=404, detail="Video not found")
        logger.info(f"Delete successful for video: {video_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete failed for video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-image")
async def upload_image_endpoint(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """画像をアップロード（単一）"""
    # ファイルサイズチェック（10MB上限）
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    # MIMEタイプチェック
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(allowed_types)}")

    # R2にアップロード
    filename = f"{current_user['user_id']}/{uuid.uuid4()}.{file.filename.split('.')[-1] if '.' in file.filename else 'jpg'}"
    image_url = await upload_image(contents, filename)

    return {"image_url": image_url}


@router.post("/upload-video-raw", response_model=VideoUploadResponse)
async def upload_video_raw_endpoint(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    動画ファイルをR2にアップロード

    - MIMEタイプ: video/mp4, video/webm, video/quicktime
    - サイズ: 50MB以下
    - 動画長: 10秒以下
    - サムネイル自動生成（最初のフレーム）
    """
    # MIMEタイプチェック
    allowed_types = ["video/mp4", "video/webm", "video/quicktime"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"対応していないファイル形式です。対応形式: {', '.join(allowed_types)}"
        )

    # ファイルサイズチェック（50MB上限）
    contents = await file.read()
    max_size_mb = 50
    if len(contents) > max_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"ファイルサイズが{max_size_mb}MBを超えています"
        )

    # 拡張子を決定
    ext = "mp4"
    if file.filename and "." in file.filename:
        ext = file.filename.split(".")[-1].lower()
    if ext not in ["mp4", "webm", "mov"]:
        ext = "mp4"

    # 一時ファイルに保存してFFmpegで検証
    temp_video_path = None
    temp_thumbnail_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as f:
            f.write(contents)
            temp_video_path = f.name

        # FFmpegで動画長を取得
        ffmpeg = get_ffmpeg_service()
        duration = await ffmpeg._get_video_duration(temp_video_path)

        if duration is None:
            raise HTTPException(
                status_code=400,
                detail="動画の長さを取得できませんでした。破損したファイルの可能性があります"
            )

        # 動画長制限チェック（10秒以下）
        max_duration = 10.0
        if duration > max_duration:
            raise HTTPException(
                status_code=400,
                detail=f"動画の長さが{max_duration}秒を超えています（現在: {duration:.1f}秒）"
            )

        # サムネイル生成（最初のフレーム）
        thumbnail_url = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
                temp_thumbnail_path = f.name

            await ffmpeg.extract_first_frame(
                temp_video_path,
                temp_thumbnail_path,
                offset_seconds=0.0
            )

            # サムネイルをR2にアップロード
            with open(temp_thumbnail_path, "rb") as f:
                thumbnail_content = f.read()

            thumbnail_filename = f"{current_user['user_id']}/{uuid.uuid4()}_thumb.jpg"
            thumbnail_url = await upload_image(thumbnail_content, thumbnail_filename)
            logger.info(f"Thumbnail generated and uploaded: {thumbnail_filename}")
        except Exception as e:
            logger.warning(f"Failed to generate thumbnail: {e}")
            # サムネイル生成失敗は致命的ではないので続行

        # R2に動画をアップロード
        video_filename = f"{current_user['user_id']}/{uuid.uuid4()}.{ext}"
        video_url = await upload_video(contents, video_filename)

        logger.info(f"Video uploaded: {video_filename} for user {current_user['user_id']}, duration: {duration:.1f}s")

        return VideoUploadResponse(
            video_url=video_url,
            thumbnail_url=thumbnail_url,
            duration=round(duration, 2),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video upload failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"動画のアップロードに失敗しました: {str(e)}"
        )
    finally:
        # 一時ファイルをクリーンアップ
        if temp_video_path and os.path.exists(temp_video_path):
            try:
                os.unlink(temp_video_path)
            except Exception:
                pass
        if temp_thumbnail_path and os.path.exists(temp_thumbnail_path):
            try:
                os.unlink(temp_thumbnail_path)
            except Exception:
                pass


@router.post("/upload-bgm", response_model=BGMUploadResponse)
async def upload_bgm_endpoint(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """BGM音源をアップロード"""
    try:
        # ファイルサイズチェック（20MB上限）
        contents = await file.read()
        if len(contents) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="ファイルサイズが20MBを超えています")

        # 拡張子を取得してチェック
        ext = "mp3"
        if file.filename and "." in file.filename:
            ext = file.filename.split(".")[-1].lower()

        allowed_extensions = ["mp3", "wav", "ogg", "m4a", "aac"]
        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"対応していないファイル形式です。対応形式: {', '.join(allowed_extensions)}"
            )

        # R2にアップロード
        filename = f"{current_user['user_id']}/{uuid.uuid4()}.{ext}"
        bgm_url = await upload_audio(contents, filename)

        logger.info(f"BGM uploaded: {filename} for user {current_user['user_id']}")

        # TODO: 音声の長さを取得（ffprobeで実装予定）
        duration_seconds = None

        return {"bgm_url": bgm_url, "duration_seconds": duration_seconds}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"BGM upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"BGMのアップロードに失敗しました: {str(e)}")


@router.post("/{video_id}/add-bgm", response_model=AddBGMToVideoResponse)
async def add_bgm_to_video(
    video_id: str,
    request: AddBGMToVideoRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    既存の動画にBGMを追加（後からBGMを付ける）

    完了済みの動画に対してBGMを追加し、再処理を行います。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 動画が存在し、ユーザーが所有しているか確認
    video_response = (
        supabase.table("video_generations")
        .select("id, user_id, status, final_video_url, raw_video_url")
        .eq("id", video_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not video_response.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video_data = video_response.data

    # 動画が完了状態であることを確認
    if video_data.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Video must be completed before adding BGM"
        )

    # raw_video_urlが必要
    if not video_data.get("raw_video_url") and not video_data.get("final_video_url"):
        raise HTTPException(
            status_code=400,
            detail="Video does not have source video URL"
        )

    # custom_bgm_urlを更新し、再処理フラグを設定
    update_response = (
        supabase.table("video_generations")
        .update({
            "custom_bgm_url": request.bgm_url,
            "status": "processing",
            "progress": 0,
        })
        .eq("id", video_id)
        .execute()
    )

    logger.info(f"Adding BGM to video {video_id}: {request.bgm_url}")

    # バックグラウンドで再処理を開始（BGM追加のみ）
    from app.tasks import start_bgm_reprocessing
    background_tasks.add_task(start_bgm_reprocessing, video_id)

    return {
        "id": video_id,
        "status": "processing",
        "message": "BGM追加処理を開始しました",
        "custom_bgm_url": request.bgm_url,
    }


# ===== AI主導ストーリーテリング用エンドポイント =====

@router.post("/suggest-stories", response_model=StorySuggestResponse)
async def suggest_stories(
    request: StorySuggestRequest,
    current_user: dict = Depends(get_current_user),
):
    """画像からストーリー候補を提案（AI主導モード）"""
    try:
        suggestions = await suggest_stories_from_image(request.image_url)
        return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate story suggestions: {str(e)}"
        )


@router.post("/story/translate", response_model=TranslateStoryPromptResponse)
async def translate_story_prompt(
    request: TranslateStoryPromptRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    シーン動画用：日本語プロンプトを英語に翻訳（テンプレート適用）

    - Runway/Veoプロバイダー別のテンプレートを適用
    - 被写体タイプ（person/object/animation）別のテンプレートを適用
    - アニメーション選択時はアニメーションスタイルテンプレートを適用
    - ユーザー選択のカメラワークをCamera欄に反映
    - 既存のtranslate_scene_to_runway_prompt関数を再利用
    """
    from app.external.gemini_client import translate_scene_to_runway_prompt

    try:
        english_prompt = await translate_scene_to_runway_prompt(
            description_ja=request.description_ja,
            scene_number=1,  # シーン生成は1シーンのみ
            video_provider=request.video_provider.value,
            scene_act=None,  # シーン生成ではact不要
            template_mode="scene",  # シーン生成用テンプレート（インパクト重視）
            subject_type=request.subject_type.value,  # 被写体タイプ（person/object/animation）
            camera_work=request.camera_work,  # ユーザー選択のカメラワーク
            # アニメーションパラメータ（animation選択時のみ）
            animation_category=request.animation_category.value if request.animation_category else None,
            animation_template=request.animation_template.value if request.animation_template else None,
        )
        return TranslateStoryPromptResponse(english_prompt=english_prompt)
    except Exception as e:
        logger.exception(f"Story prompt translation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"翻訳に失敗しました: {str(e)}"
        )


@router.post("/story", response_model=StoryVideoResponse, status_code=status.HTTP_201_CREATED)
async def create_story_video(
    request: StoryVideoCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(check_usage_limit),
):
    """
    ストーリー動画を生成

    シンプル化されたフロー:
    1. 単一画像 + ストーリーテキスト + カメラワーク
    2. Runway APIで動画生成
    3. FFmpeg処理 → 完了
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]
    video_id = str(uuid.uuid4())

    # オーバーレイ設定を辞書に変換
    overlay_text = None
    overlay_position = None
    overlay_font = None
    overlay_color = None
    if request.overlay:
        overlay_text = request.overlay.text
        overlay_position = request.overlay.position
        overlay_font = request.overlay.font
        overlay_color = request.overlay.color

    # video_providerの決定（リクエスト指定 > 環境変数）
    video_provider = request.video_provider.value if request.video_provider else settings.VIDEO_PROVIDER.lower()

    # 動画生成レコードを作成
    video_data = {
        "id": video_id,
        "user_id": user_id,
        "original_image_url": request.image_url,
        "image_urls": [request.image_url],
        "story_text": request.story_text,
        "user_prompt": request.story_text,
        "status": "pending",
        "progress": 0,
        "generation_mode": "story",
        "aspect_ratio": request.aspect_ratio.value,  # アスペクト比
        "video_provider": video_provider,  # 動画生成プロバイダー
        "bgm_track_id": request.bgm_track_id,
        "custom_bgm_url": request.custom_bgm_url,  # カスタムBGM（プリセットより優先）
        "overlay_text": overlay_text,
        "overlay_position": overlay_position,
        "overlay_font": overlay_font,
        "overlay_color": overlay_color,
        "camera_work": request.camera_work,
        # Act-Two用フィールド
        "use_act_two": request.use_act_two,
        "motion_type": request.motion_type,
        "expression_intensity": request.expression_intensity,
        "body_control": request.body_control,
        # Kling AI用フィールド
        "kling_mode": request.kling_mode.value if request.kling_mode else None,
        "end_frame_image_url": request.end_frame_image_url,
        # ★追加: Kling カメラコントロール（6軸スライダー）
        "kling_camera_control": request.kling_camera_control.model_dump() if request.kling_camera_control else None,
    }

    # Kling Elements用の画像URLリストを取得
    element_urls = [e.image_url for e in request.element_images] if request.element_images else None

    # Kling以外のプロバイダーでelement_imagesがある場合はエラー
    if element_urls and video_provider and video_provider != "piapi_kling":
        raise HTTPException(400, "Elements機能はKlingプロバイダーのみ対応しています")

    logger.info(f"Creating story video: {video_id}, camera_work: {request.camera_work}, video_provider: {video_provider}, element_images: {len(element_urls) if element_urls else 0}")

    # DBに保存（レスポンスを取得してcreated_at等を含める）
    insert_response = supabase.table("video_generations").insert(video_data).execute()
    video_record = insert_response.data[0] if insert_response.data else video_data

    # ユーザーの動画生成カウントを更新
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # usage_logsに記録
    supabase.table("usage_logs").insert({
        "user_id": user_id,
        "video_generation_id": video_id,
        "action_type": "video_generated",
    }).execute()

    # バックグラウンドでストーリー動画処理を開始（element_imagesも渡す）
    background_tasks.add_task(start_story_processing, video_id, video_provider, element_urls)

    return service._format_story_video_response(video_record)


# ===== 動画アップスケール用エンドポイント =====

@router.post("/storyboard/{storyboard_id}/upscale", response_model=UpscaleResponse)
async def upscale_storyboard_video(
    storyboard_id: str,
    request: UpscaleRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボードの結合動画をアップスケール

    Runway Upscale v1 APIを使用して動画を高解像度化。
    - original: オリジナル解像度（アップスケールなし、直接ダウンロード）
    - hd: フルHD (1080p)
    - 4k: 4K (2160p) - 4倍アップスケール

    Note:
        - 40秒以内の動画のみ対応
        - 処理時間: 約1〜2分
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認と動画URL取得
    sb_response = (
        supabase.table("storyboards")
        .select("id, final_video_url, status")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # source_urlが指定されていればそれを使用（60fps補間後のURL等）
    final_video_url = request.source_url or sb_response.data.get("final_video_url")
    if not final_video_url:
        raise HTTPException(
            status_code=400,
            detail="結合動画がありません。先に動画を結合してください。"
        )

    # オリジナル解像度の場合はそのままURLを返す
    if request.resolution == UpscaleResolution.ORIGINAL:
        return UpscaleResponse(
            id=str(uuid.uuid4()),
            storyboard_id=storyboard_id,
            status="completed",
            resolution=request.resolution,
            original_video_url=final_video_url,
            upscaled_video_url=final_video_url,
            progress=100,
        )

    # アップスケールタスクを作成
    upscale_id = str(uuid.uuid4())
    upscale_data = {
        "id": upscale_id,
        "user_id": user_id,
        "storyboard_id": storyboard_id,
        "original_video_url": final_video_url,
        "resolution": request.resolution.value,
        "status": "pending",
        "progress": 0,
    }

    # DBに保存
    supabase.table("video_upscales").insert(upscale_data).execute()

    # バックグラウンドでアップスケール処理を開始
    from app.tasks import start_upscale_processing
    background_tasks.add_task(start_upscale_processing, upscale_id)

    return UpscaleResponse(
        id=upscale_id,
        storyboard_id=storyboard_id,
        status="pending",
        resolution=request.resolution,
        original_video_url=final_video_url,
        progress=0,
    )


@router.get("/storyboard/{storyboard_id}/upscale/status", response_model=UpscaleStatusResponse)
async def get_upscale_status(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    アップスケール処理のステータスを取得
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新のアップスケールタスクを取得
    response = (
        supabase.table("video_upscales")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Upscale task not found")

    upscale = response.data[0]
    status = upscale.get("status", "pending")

    # ステータスメッセージを生成
    messages = {
        "pending": "アップスケール待機中...",
        "processing": "アップスケール処理中...",
        "completed": "アップスケール完了",
        "failed": f"エラー: {upscale.get('error_message', '不明なエラー')}",
    }

    return UpscaleStatusResponse(
        id=upscale["id"],
        status=status,
        progress=upscale.get("progress", 0),
        message=messages.get(status, "処理中..."),
        upscaled_video_url=upscale.get("upscaled_video_url"),
        resolution=upscale.get("resolution"),
    )


# ===== シーン単位の動画アップスケール用エンドポイント =====

@router.post("/storyboard/{storyboard_id}/scene/{scene_number}/upscale", response_model=UpscaleResponse)
async def upscale_scene_video(
    storyboard_id: str,
    scene_number: int,
    request: UpscaleRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    シーン単体の動画をアップスケール

    Runway Upscale v1 APIを使用して動画を高解像度化。
    - original: オリジナル解像度（アップスケールなし、直接ダウンロード）
    - hd: フルHD (1080p)
    - 4k: 4K (2160p) - 4倍アップスケール

    Note:
        - 40秒以内の動画のみ対応
        - 処理時間: 約1〜2分
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードの所有権確認
    sb_response = (
        supabase.table("storyboards")
        .select("id")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not sb_response.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # シーンの動画URL取得
    scene_response = (
        supabase.table("storyboard_scenes")
        .select("id, video_url, status")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", scene_number)
        .single()
        .execute()
    )
    if not scene_response.data:
        raise HTTPException(status_code=404, detail="Scene not found")

    video_url = scene_response.data.get("video_url")
    if not video_url:
        raise HTTPException(
            status_code=400,
            detail="シーンの動画がありません。先に動画を生成してください。"
        )

    # オリジナル解像度の場合はそのままURLを返す
    if request.resolution == UpscaleResolution.ORIGINAL:
        return UpscaleResponse(
            id=str(uuid.uuid4()),
            storyboard_id=storyboard_id,
            scene_number=scene_number,
            status="completed",
            resolution=request.resolution,
            original_video_url=video_url,
            upscaled_video_url=video_url,
            progress=100,
        )

    # アップスケールタスクを作成
    upscale_id = str(uuid.uuid4())
    upscale_data = {
        "id": upscale_id,
        "user_id": user_id,
        "storyboard_id": storyboard_id,
        "scene_number": scene_number,
        "original_video_url": video_url,
        "resolution": request.resolution.value,
        "status": "pending",
        "progress": 0,
    }

    # DBに保存
    supabase.table("video_upscales").insert(upscale_data).execute()

    # バックグラウンドでアップスケール処理を開始
    from app.tasks import start_upscale_processing
    background_tasks.add_task(start_upscale_processing, upscale_id)

    return UpscaleResponse(
        id=upscale_id,
        storyboard_id=storyboard_id,
        scene_number=scene_number,
        status="pending",
        resolution=request.resolution,
        original_video_url=video_url,
        progress=0,
    )


@router.get("/storyboard/{storyboard_id}/scene/{scene_number}/upscale/status", response_model=UpscaleStatusResponse)
async def get_scene_upscale_status(
    storyboard_id: str,
    scene_number: int,
    current_user: dict = Depends(get_current_user),
):
    """
    シーン単体のアップスケール処理のステータスを取得
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新のアップスケールタスクを取得（シーン番号でフィルタ）
    response = (
        supabase.table("video_upscales")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .eq("scene_number", scene_number)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Upscale task not found")

    upscale = response.data[0]
    status = upscale.get("status", "pending")

    # ステータスメッセージを生成
    messages = {
        "pending": "アップスケール待機中...",
        "processing": "アップスケール処理中...",
        "completed": "アップスケール完了",
        "failed": f"エラー: {upscale.get('error_message', '不明なエラー')}",
    }

    return UpscaleStatusResponse(
        id=upscale["id"],
        status=status,
        progress=upscale.get("progress", 0),
        message=messages.get(status, "処理中..."),
        upscaled_video_url=upscale.get("upscaled_video_url"),
        resolution=upscale.get("resolution"),
    )


# ===== 単体動画アップスケール用エンドポイント =====

@router.post("/{video_id}/upscale", response_model=UpscaleResponse)
async def upscale_video(
    video_id: str,
    request: UpscaleRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    単体動画をアップスケール（HD/4K）
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 動画を取得
    response = (
        supabase.table("video_generations")
        .select("*")
        .eq("id", video_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video = response.data
    # source_urlが指定されていればそれを使用（60fps補間後のURL等）
    video_url = request.source_url or video.get("final_video_url")

    if not video_url:
        raise HTTPException(status_code=400, detail="Video URL not available")

    # originalの場合はそのまま返す
    if request.resolution == UpscaleResolution.ORIGINAL:
        return UpscaleResponse(
            id=str(uuid.uuid4()),
            storyboard_id=video_id,  # video_idをstoryboard_id代わりに使用
            status="completed",
            resolution=request.resolution,
            original_video_url=video_url,
            upscaled_video_url=video_url,
            progress=100,
        )

    # アップスケールタスクを作成
    upscale_id = str(uuid.uuid4())
    upscale_data = {
        "id": upscale_id,
        "user_id": user_id,
        "video_id": video_id,  # 単体動画用のフィールド
        "original_video_url": video_url,
        "resolution": request.resolution.value,
        "status": "pending",
        "progress": 0,
    }

    # DBに保存
    supabase.table("video_upscales").insert(upscale_data).execute()

    # バックグラウンドでアップスケール処理を開始
    from app.tasks import start_upscale_processing
    background_tasks.add_task(start_upscale_processing, upscale_id)

    return UpscaleResponse(
        id=upscale_id,
        storyboard_id=video_id,  # video_idをstoryboard_id代わりに使用
        status="pending",
        resolution=request.resolution,
        original_video_url=video_url,
        progress=0,
    )


@router.get("/{video_id}/upscale/status", response_model=UpscaleStatusResponse)
async def get_video_upscale_status(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    単体動画のアップスケール処理のステータスを取得
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新のアップスケールタスクを取得
    response = (
        supabase.table("video_upscales")
        .select("*")
        .eq("video_id", video_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Upscale task not found")

    upscale = response.data[0]
    status = upscale.get("status", "pending")

    # ステータスメッセージを生成
    messages = {
        "pending": "アップスケール待機中...",
        "processing": "アップスケール処理中...",
        "completed": "アップスケール完了",
        "failed": f"エラー: {upscale.get('error_message', '不明なエラー')}",
    }

    return UpscaleStatusResponse(
        id=upscale["id"],
        status=status,
        progress=upscale.get("progress", 0),
        message=messages.get(status, "処理中..."),
        upscaled_video_url=upscale.get("upscaled_video_url"),
        resolution=upscale.get("resolution"),
    )


# ===== 60fps補間エンドポイント（Topaz Video API）=====


@router.post("/{video_id}/interpolate-60fps", response_model=InterpolateResponse)
async def interpolate_video_to_60fps(
    video_id: str,
    request: InterpolateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    単体動画を60fpsに補間

    Topaz Video APIを使用してフレーム補間を行う。
    補間後の動画はoriginal_video_urlとは別に保存される。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 動画を取得
    response = (
        supabase.table("video_generations")
        .select("*")
        .eq("id", video_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    video_data = response.data
    if video_data["status"] != "completed":
        raise HTTPException(status_code=400, detail="動画の生成が完了していません")

    video_url = video_data.get("final_video_url") or video_data.get("raw_video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="動画URLが見つかりません")

    # 補間ジョブを作成
    interpolate_id = str(uuid.uuid4())
    interpolate_data = {
        "id": interpolate_id,
        "user_id": user_id,
        "video_id": video_id,
        "original_video_url": video_url,
        "model": request.model.value,
        "status": "pending",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    supabase.table("video_interpolations").insert(interpolate_data).execute()

    # バックグラウンドで補間処理開始
    from app.tasks import start_interpolation_processing
    background_tasks.add_task(start_interpolation_processing, interpolate_id)

    return InterpolateResponse(
        id=interpolate_id,
        video_id=video_id,
        status="pending",
        model=request.model,
        original_video_url=video_url,
        progress=0,
    )


@router.get("/{video_id}/interpolate-60fps/status", response_model=InterpolateStatusResponse)
async def get_video_interpolation_status(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """単体動画の60fps補間ステータスを取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新の補間ジョブを取得
    response = (
        supabase.table("video_interpolations")
        .select("*")
        .eq("video_id", video_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="補間ジョブが見つかりません")

    interpolation = response.data[0]
    status = interpolation.get("status", "pending")

    messages = {
        "pending": "処理待ち",
        "processing": f"60fps補間中... {interpolation.get('progress', 0)}%",
        "completed": "60fps補間完了",
        "failed": f"エラー: {interpolation.get('error_message', '不明なエラー')}",
    }

    return InterpolateStatusResponse(
        id=interpolation["id"],
        status=status,
        progress=interpolation.get("progress", 0),
        message=messages.get(status, "処理中..."),
        interpolated_video_url=interpolation.get("interpolated_video_url"),
        model=interpolation.get("model"),
    )


@router.post("/storyboard/{storyboard_id}/interpolate-60fps", response_model=InterpolateResponse)
async def interpolate_storyboard_to_60fps(
    storyboard_id: str,
    request: InterpolateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボード動画を60fpsに補間

    Topaz Video APIを使用してフレーム補間を行う。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # ストーリーボードを取得
    response = (
        supabase.table("storyboards")
        .select("*")
        .eq("id", storyboard_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="ストーリーボードが見つかりません")

    storyboard_data = response.data
    video_url = storyboard_data.get("final_video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="動画がまだ生成されていません")

    # 補間ジョブを作成
    interpolate_id = str(uuid.uuid4())
    interpolate_data = {
        "id": interpolate_id,
        "user_id": user_id,
        "storyboard_id": storyboard_id,
        "original_video_url": video_url,
        "model": request.model.value,
        "status": "pending",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    supabase.table("video_interpolations").insert(interpolate_data).execute()

    # バックグラウンドで補間処理開始
    from app.tasks import start_interpolation_processing
    background_tasks.add_task(start_interpolation_processing, interpolate_id)

    return InterpolateResponse(
        id=interpolate_id,
        storyboard_id=storyboard_id,
        status="pending",
        model=request.model,
        original_video_url=video_url,
        progress=0,
    )


@router.get("/storyboard/{storyboard_id}/interpolate-60fps/status", response_model=InterpolateStatusResponse)
async def get_storyboard_interpolation_status(
    storyboard_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ストーリーボード動画の60fps補間ステータスを取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    response = (
        supabase.table("video_interpolations")
        .select("*")
        .eq("storyboard_id", storyboard_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="補間ジョブが見つかりません")

    interpolation = response.data[0]
    status = interpolation.get("status", "pending")

    messages = {
        "pending": "処理待ち",
        "processing": f"60fps補間中... {interpolation.get('progress', 0)}%",
        "completed": "60fps補間完了",
        "failed": f"エラー: {interpolation.get('error_message', '不明なエラー')}",
    }

    return InterpolateStatusResponse(
        id=interpolation["id"],
        status=status,
        progress=interpolation.get("progress", 0),
        message=messages.get(status, "処理中..."),
        interpolated_video_url=interpolation.get("interpolated_video_url"),
        model=interpolation.get("model"),
    )


@router.post("/concat/{concat_id}/interpolate-60fps", response_model=InterpolateResponse)
async def interpolate_concat_to_60fps(
    concat_id: str,
    request: InterpolateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    結合動画を60fpsに補間

    Topaz Video APIを使用してフレーム補間を行う。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 結合動画を取得
    response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="結合動画が見つかりません")

    concat_data = response.data
    if concat_data["status"] != "completed":
        raise HTTPException(status_code=400, detail="動画の結合が完了していません")

    video_url = concat_data.get("final_video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="動画URLが見つかりません")

    # 補間ジョブを作成
    interpolate_id = str(uuid.uuid4())
    interpolate_data = {
        "id": interpolate_id,
        "user_id": user_id,
        "concat_id": concat_id,
        "original_video_url": video_url,
        "model": request.model.value,
        "status": "pending",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    supabase.table("video_interpolations").insert(interpolate_data).execute()

    # バックグラウンドで補間処理開始
    from app.tasks import start_interpolation_processing
    background_tasks.add_task(start_interpolation_processing, interpolate_id)

    return InterpolateResponse(
        id=interpolate_id,
        concat_id=concat_id,
        status="pending",
        model=request.model,
        original_video_url=video_url,
        progress=0,
    )


@router.get("/concat/{concat_id}/interpolate-60fps/status", response_model=InterpolateStatusResponse)
async def get_concat_interpolation_status(
    concat_id: str,
    current_user: dict = Depends(get_current_user),
):
    """結合動画の60fps補間ステータスを取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    response = (
        supabase.table("video_interpolations")
        .select("*")
        .eq("concat_id", concat_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="補間ジョブが見つかりません")

    interpolation = response.data[0]
    status = interpolation.get("status", "pending")

    messages = {
        "pending": "処理待ち",
        "processing": f"60fps補間中... {interpolation.get('progress', 0)}%",
        "completed": "60fps補間完了",
        "failed": f"エラー: {interpolation.get('error_message', '不明なエラー')}",
    }

    return InterpolateStatusResponse(
        id=interpolation["id"],
        status=status,
        progress=interpolation.get("progress", 0),
        message=messages.get(status, "処理中..."),
        interpolated_video_url=interpolation.get("interpolated_video_url"),
        model=interpolation.get("model"),
    )


# ===== AI BGM生成エンドポイント =====


@router.post("/concat/{concat_id}/generate-bgm", response_model=BGMGenerateResponse)
async def generate_bgm_for_concat(
    concat_id: str,
    request: BGMGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    結合動画用のBGMをAI生成

    1. 動画を分析してプロンプト生成（auto_analyze=Trueの場合）
    2. Suno APIでBGM生成
    3. ビート検出・同期計算（sync_to_beats=Trueの場合）
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 結合動画を取得
    response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="結合動画が見つかりません")

    concat_data = response.data
    if concat_data["status"] != "completed":
        raise HTTPException(status_code=400, detail="動画の結合が完了していません")

    # BGM生成レコード作成
    bgm_generation_id = str(uuid.uuid4())
    bgm_record = {
        "id": bgm_generation_id,
        "user_id": user_id,
        "concat_id": concat_id,
        "status": "pending",
        "custom_prompt": request.custom_prompt,
        "auto_analyze": request.auto_analyze,
        "sync_to_beats": request.sync_to_beats,
        "progress": 0,
    }

    supabase.table("bgm_generations").insert(bgm_record).execute()

    # バックグラウンドで生成開始
    from app.tasks.bgm_ai_generator import start_bgm_ai_generation
    background_tasks.add_task(
        start_bgm_ai_generation,
        bgm_generation_id,
        concat_id,
        user_id,
        request.model_dump(),
    )

    return BGMGenerateResponse(
        bgm_generation_id=bgm_generation_id,
        concat_id=concat_id,
        status=BGMGenerationStatus.PENDING,
        message="BGM生成を開始しました",
    )


@router.get("/concat/{concat_id}/bgm-status", response_model=BGMStatusResponse)
async def get_bgm_generation_status(
    concat_id: str,
    current_user: dict = Depends(get_current_user),
):
    """BGM生成のステータスを取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新のBGM生成を取得
    response = (
        supabase.table("bgm_generations")
        .select("*")
        .eq("concat_id", concat_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="BGM生成が見つかりません")

    bgm = response.data[0]

    return BGMStatusResponse(
        id=bgm["id"],
        status=BGMGenerationStatus(bgm["status"]),
        progress=bgm.get("progress", 0),
        bgm_url=bgm.get("bgm_url"),
        sync_quality_score=bgm.get("sync_quality_score"),
        detected_mood=bgm.get("detected_mood"),
        detected_genre=bgm.get("detected_genre"),
        detected_tempo_bpm=bgm.get("detected_tempo_bpm"),
        auto_generated_prompt=bgm.get("auto_generated_prompt"),
        error_message=bgm.get("error_message"),
        created_at=bgm.get("created_at"),
    )


@router.post("/concat/{concat_id}/apply-bgm", response_model=ApplyBGMResponse)
async def apply_bgm_to_concat(
    concat_id: str,
    request: ApplyBGMRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """生成されたBGMを動画に適用"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # BGM生成を取得
    bgm_response = (
        supabase.table("bgm_generations")
        .select("*")
        .eq("id", request.bgm_generation_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not bgm_response.data:
        raise HTTPException(status_code=404, detail="BGM生成が見つかりません")

    bgm = bgm_response.data
    if bgm["status"] != "completed" or not bgm.get("bgm_url"):
        raise HTTPException(status_code=400, detail="BGMが準備できていません")

    # 結合動画を取得
    concat_response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not concat_response.data:
        raise HTTPException(status_code=404, detail="結合動画が見つかりません")

    # バックグラウンドでBGM適用開始
    from app.tasks.bgm_ai_generator import start_bgm_apply
    background_tasks.add_task(
        start_bgm_apply,
        concat_id,
        bgm["bgm_url"],
        request.volume,
        request.original_audio_volume,
        request.fade_in_seconds,
        request.fade_out_seconds,
    )

    return ApplyBGMResponse(
        concat_id=concat_id,
        status="processing",
        message="BGMの適用を開始しました",
        final_video_url=None,
    )


# ===== 広告脚本（コンテ）生成用エンドポイント =====

@router.post("/ad-script/generate", response_model=AdScriptGenerateResponse)
async def generate_ad_script_endpoint(
    request: AdScriptGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    広告の説明からCM構成（カット割り）を生成

    広告理論（AIDA/PASONA/起承転結/ストーリーテリング）に基づいて
    最適なカット構成を自動生成する。

    Args:
        request: 広告脚本生成リクエスト
            - description: 広告の内容（どんな広告を作りたいか）
            - target_duration: 希望の尺（15/30/60秒、またはnull=おまかせ）
            - aspect_ratio: アスペクト比（9:16 or 16:9）

    Returns:
        AdScriptGenerateResponse: 生成された脚本データ
            - id: 脚本ID
            - theory: 使用した広告理論
            - theory_label: 広告理論の日本語ラベル
            - total_duration: 合計秒数
            - cuts: カットリスト（各カットの説明・秒数）
    """
    logger.info(f"Generating ad script for user {current_user['user_id']}")
    logger.info(f"Description: {request.description[:100]}...")
    logger.info(f"Target duration: {request.target_duration}, Aspect ratio: {request.aspect_ratio}")

    try:
        # AIで脚本を生成
        script_data = await generate_ad_script(
            description=request.description,
            target_duration=request.target_duration,
            aspect_ratio=request.aspect_ratio.value,
        )

        logger.info(f"Generated ad script: {script_data['id']} with {len(script_data['cuts'])} cuts")

        return AdScriptGenerateResponse(
            id=script_data["id"],
            theory=script_data["theory"],
            theory_label=script_data["theory_label"],
            total_duration=script_data["total_duration"],
            cuts=script_data["cuts"],
        )

    except Exception as e:
        logger.exception(f"Ad script generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"広告脚本の生成に失敗しました: {str(e)}"
        )


# ===== FLUX.2 JSONプロンプト変換エンドポイント =====

@router.post("/convert-to-flux-json", response_model=ConvertToFluxJsonResponse)
async def convert_to_flux_json_endpoint(
    request: ConvertToFluxJsonRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    日本語の説明文をFLUX.2用のJSON構造化プロンプト（英語）に変換

    BFL FLUX.2で使用するための構造化プロンプトを生成します。
    - メインプロンプト: JSON形式の英語プロンプト
    - ネガティブプロンプト: プレーンテキストの英語

    Args:
        request: 変換リクエスト
            - description_ja: 日本語の画像説明
            - negative_prompt_ja: 日本語のネガティブプロンプト（オプション）
            - aspect_ratio: アスペクト比（構図のヒントに使用）

    Returns:
        ConvertToFluxJsonResponse:
            - json_prompt: JSON形式の英語プロンプト
            - negative_prompt_en: 英語のネガティブプロンプト
            - preview: パース済みのJSONプレビュー
    """
    logger.info(f"Converting to FLUX JSON for user {current_user['user_id']}")
    logger.info(f"description_ja: {request.description_ja[:50]}...")

    try:
        result = await convert_to_flux_json_prompt(
            description_ja=request.description_ja,
            negative_prompt_ja=request.negative_prompt_ja,
            aspect_ratio=request.aspect_ratio.value,
        )

        return ConvertToFluxJsonResponse(
            json_prompt=result["json_prompt"],
            negative_prompt_en=result["negative_prompt_en"],
            preview=FluxJsonPreview(**result["preview"]),
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Error converting to FLUX JSON: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"プロンプト変換に失敗しました: {str(e)}"
        )


# ===== シーン画像生成エンドポイント =====

@router.post("/generate-scene-image", response_model=GenerateSceneImageResponse)
async def generate_scene_image_endpoint(
    request: GenerateSceneImageRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    脚本（とオプションでセリフ）からシーン画像を生成

    アドクリエイターのカット割機能で使用。
    脚本（description_ja）をメインの情報源として、
    Gemini 3 Proで画像を生成する。

    Args:
        request: シーン画像生成リクエスト
            - description_ja: カットの脚本（日本語）- メイン
            - dialogue: カットのセリフ（オプション）- 補助
            - aspect_ratio: アスペクト比（9:16 or 16:9）

    Returns:
        GenerateSceneImageResponse:
            - image_url: 生成された画像のURL
            - generated_prompt_ja: 生成に使用した日本語プロンプト
            - generated_prompt_en: 生成に使用した英語プロンプト
    """
    logger.info(f"Generating scene image for user {current_user['user_id']}")
    logger.info(f"description_ja: {request.description_ja}, dialogue: {request.dialogue}, image_provider: {request.image_provider}")
    if request.reference_images:
        logger.info(f"reference_images: {len(request.reference_images)} image(s)")

    try:
        # reference_imagesをdict形式に変換
        reference_images_data = None
        if request.reference_images:
            reference_images_data = [img.model_dump() for img in request.reference_images]

        result = await service.generate_scene_image(
            description_ja=request.description_ja,
            dialogue=request.dialogue,
            aspect_ratio=request.aspect_ratio.value,
            image_provider=request.image_provider.value,
            reference_images=reference_images_data,
            negative_prompt=request.negative_prompt,
        )
        return GenerateSceneImageResponse(**result)

    except ValueError as e:
        # 画像生成失敗（Gemini API エラー等）
        logger.warning(f"Scene image generation failed (ValueError): {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        # 予期しないエラー
        logger.exception(f"Scene image generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="画像生成に失敗しました。もう一度お試しください。"
        )


@router.post("/generate-image-from-text", response_model=GenerateSceneImageResponse)
async def generate_image_from_text_endpoint(
    request: GenerateImageFromTextRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    構造化テキスト入力またはフリーテキストからシーン画像を生成（Text-to-Image）

    nanobanana 5段階テンプレートに基づいた構造化入力、またはフリーテキストから画像を生成。
    入力パターン:
    - A: 構造化入力（フォーム入力）- structured_input を使用
    - B: フリーテキスト（テキストエリア入力）- free_text_description を使用
    - C: 上記いずれか + 参照画像

    Args:
        request: GenerateImageFromTextRequest
            - structured_input: 構造化入力（オプション、free_text_descriptionと排他）
            - free_text_description: フリーテキストでの画像説明（オプション）
            - reference_image_url: 参照画像のURL（オプション）
            - aspect_ratio: アスペクト比（9:16 or 16:9）

    Returns:
        GenerateSceneImageResponse:
            - image_url: 生成された画像のURL
            - generated_prompt_ja: 生成に使用した日本語プロンプト
            - generated_prompt_en: 生成に使用した英語プロンプト
    """
    logger.info(f"Generating image from text for user {current_user['user_id']}")
    logger.info(f"structured_input: {request.structured_input}")
    logger.info(f"free_text_description: {request.free_text_description}")
    logger.info(f"reference_image_url: {request.reference_image_url}")
    logger.info(f"aspect_ratio: {request.aspect_ratio}")
    logger.info(f"image_provider: {request.image_provider}")
    if request.reference_images:
        logger.info(f"reference_images: {len(request.reference_images)} image(s)")

    try:
        # reference_imagesをdict形式に変換
        reference_images_data = None
        if request.reference_images:
            reference_images_data = [img.model_dump() for img in request.reference_images]

        result = await service.generate_image_from_text(
            # structured_inputがNoneでない場合のみmodel_dump()
            structured_input=request.structured_input.model_dump() if request.structured_input else None,
            free_text_description=request.free_text_description,
            reference_image_url=request.reference_image_url,
            aspect_ratio=request.aspect_ratio.value,
            image_provider=request.image_provider.value,
            reference_images=reference_images_data,
            negative_prompt=request.negative_prompt,
        )
        return GenerateSceneImageResponse(**result)

    except ValueError as e:
        # 画像生成失敗（Gemini API エラー等）
        logger.warning(f"Image from text generation failed (ValueError): {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        # 予期しないエラー
        logger.exception(f"Image from text generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="画像生成に失敗しました。もう一度お試しください。"
        )


# ===== Ad Creator ドラフト（一時保存）エンドポイント =====

@router.get("/ad-creator/draft/exists", response_model=AdCreatorDraftExistsResponse)
async def check_ad_creator_draft_exists(
    current_user: dict = Depends(get_current_user),
):
    """
    ドラフトの存在確認（軽量API）

    フルデータを取得せず、存在有無と保存日時のみ返す。
    ページ初期読み込み時のモーダル表示判定用。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        result = (
            supabase.table("ad_creator_drafts")
            .select("last_saved_at")
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        if result.data:
            return AdCreatorDraftExistsResponse(
                exists=True,
                last_saved_at=result.data.get("last_saved_at"),
            )
        return AdCreatorDraftExistsResponse(exists=False)

    except Exception:
        return AdCreatorDraftExistsResponse(exists=False)


@router.get("/ad-creator/draft", response_model=AdCreatorDraftResponse | None)
async def get_ad_creator_draft(
    current_user: dict = Depends(get_current_user),
):
    """
    現在のユーザーのAd Creatorドラフトを取得

    ユーザーごとに1つのドラフトのみ保持。
    ドラフトが存在しない場合は null を返す。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        result = (
            supabase.table("ad_creator_drafts")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        if not result.data:
            return None

        draft = result.data

        # draft_metadataを再構築
        draft_metadata = AdCreatorDraftMetadata(
            schema_version=1,
            aspect_ratio=draft.get("aspect_ratio"),
            ad_mode=draft.get("ad_mode"),
            ad_script=draft.get("ad_script"),
            script_confirmed=draft.get("script_confirmed", False),
            storyboard_cuts=draft.get("storyboard_cuts") or [],
            selected_items=draft.get("selected_items") or [],
            trim_settings=draft.get("trim_settings") or {},
            transition=draft.get("transition", "none"),
            transition_duration=draft.get("transition_duration", 0.5),
            last_saved_at=draft.get("last_saved_at"),
            auto_saved=True,
        )

        return AdCreatorDraftResponse(
            id=draft["id"],
            user_id=draft["user_id"],
            draft_metadata=draft_metadata,
            created_at=draft["created_at"],
            updated_at=draft["updated_at"],
            last_saved_at=draft["last_saved_at"],
        )

    except Exception as e:
        # single()でデータがない場合は例外になる
        logger.debug(f"No draft found for user {user_id}: {e}")
        return None


@router.put("/ad-creator/draft", response_model=SaveDraftResponse)
async def save_ad_creator_draft(
    request: AdCreatorSaveDraftRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Ad CreatorのUI状態をドラフトとして一時保存

    ユーザーごとに1つのドラフトのみ保持（UPSERT）。
    自動保存（10秒間隔）またはページ離脱時に呼び出されます。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    now = datetime.utcnow().isoformat() + "Z"
    draft_data = request.draft_metadata.model_dump()
    draft_data["last_saved_at"] = now

    # UPSERTデータを準備
    upsert_data = {
        "user_id": user_id,
        "aspect_ratio": draft_data.get("aspect_ratio"),
        "ad_mode": draft_data.get("ad_mode"),
        "ad_script": draft_data.get("ad_script"),
        "script_confirmed": draft_data.get("script_confirmed", False),
        "storyboard_cuts": draft_data.get("storyboard_cuts") or [],
        "selected_items": draft_data.get("selected_items") or [],
        "trim_settings": draft_data.get("trim_settings") or {},
        "transition": draft_data.get("transition", "none"),
        "transition_duration": draft_data.get("transition_duration", 0.5),
        "updated_at": now,
        "last_saved_at": now,
    }

    try:
        # 既存のドラフトを確認
        existing = (
            supabase.table("ad_creator_drafts")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )

        if existing.data:
            # 更新
            supabase.table("ad_creator_drafts").update(upsert_data).eq("user_id", user_id).execute()
        else:
            # 新規作成
            upsert_data["created_at"] = now
            supabase.table("ad_creator_drafts").insert(upsert_data).execute()

        logger.info(f"Ad Creator draft saved for user {user_id}")

        return SaveDraftResponse(
            success=True,
            last_saved_at=now
        )

    except Exception as e:
        logger.exception(f"Failed to save Ad Creator draft: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ドラフトの保存に失敗しました: {str(e)}"
        )


@router.delete("/ad-creator/draft", status_code=status.HTTP_204_NO_CONTENT)
async def clear_ad_creator_draft(
    current_user: dict = Depends(get_current_user),
):
    """
    Ad Creatorのドラフト（一時保存）をクリア

    ユーザーが「ドラフトを破棄」を選択した場合、
    または動画結合が正常に完了した場合に呼び出されます。
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        supabase.table("ad_creator_drafts").delete().eq("user_id", user_id).execute()
        logger.info(f"Ad Creator draft cleared for user {user_id}")
    except Exception as e:
        logger.exception(f"Failed to clear Ad Creator draft: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ドラフトの削除に失敗しました: {str(e)}"
        )



@router.post("/ad-creator/export-materials")
async def export_ad_creator_materials(
    request: MaterialExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    編集用素材をProRes形式でZIPダウンロード

    各カットをFull HD ProRes 422 HQに変換し、ZIPファイルとして返却。
    R2は使用せず、サーバー一時ディレクトリで処理。

    - 解像度: 1920x1080
    - コーデック: ProRes 422 HQ
    - 10bit深度
    - 音声: PCM 16bit非圧縮

    Returns:
        StreamingResponse: ZIPファイル
    """
    if not request.cuts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="カットが指定されていません"
        )

    task_id = str(uuid.uuid4())
    temp_dir = os.path.join(tempfile.gettempdir(), f"materials_{task_id}")

    try:
        os.makedirs(temp_dir, exist_ok=True)
        logger.info(f"Materials export started: task_id={task_id}, cuts={len(request.cuts)}")

        ffmpeg = get_ffmpeg_service()
        converted_files: list[tuple[str, str]] = []

        for cut in request.cuts:
            try:
                # 1. 動画ダウンロード
                input_filename = f"input_{cut.cut_number:02d}.mp4"
                input_path = os.path.join(temp_dir, input_filename)

                async with aiohttp.ClientSession() as session:
                    async with session.get(cut.video_url) as resp:
                        if resp.status != 200:
                            raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail=f"動画ダウンロードに失敗しました: cut_{cut.cut_number:02d}"
                            )
                        with open(input_path, "wb") as f:
                            f.write(await resp.read())

                # 2. ProRes変換
                # ラベルからファイル名に使えない文字を除去し、最大50文字に制限
                safe_label = "".join(c for c in cut.label if c.isalnum() or c in "ぁ-んァ-ン一-龯_- ")
                safe_label = safe_label[:50].rstrip()  # 50文字に制限
                output_filename = f"{cut.cut_number:02d}_{safe_label}.mov"
                output_path = os.path.join(temp_dir, output_filename)

                await ffmpeg.convert_to_prores_hd(
                    input_path=input_path,
                    output_path=output_path,
                    trim_start=cut.trim_start,
                    trim_end=cut.trim_end,
                    aspect_ratio=request.aspect_ratio,
                )

                converted_files.append((output_filename, output_path))
                logger.info(f"Converted: {output_filename}")

                # 入力ファイル削除（ディスク節約）
                os.remove(input_path)

            except HTTPException:
                raise
            except Exception as e:
                logger.exception(f"Failed to process cut {cut.cut_number}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"カット{cut.cut_number}の変換に失敗しました: {str(e)}"
                )

        # 3. ZIP作成
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"materials_{timestamp}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED) as zf:
            for filename, filepath in converted_files:
                zf.write(filepath, filename)
                # 変換済みファイル削除（ディスク節約）
                os.remove(filepath)

        logger.info(f"ZIP created: {zip_filename}")

        # 4. StreamingResponse で返却
        async def stream_and_cleanup():
            try:
                with open(zip_path, 'rb') as f:
                    while chunk := f.read(8192):
                        yield chunk
            finally:
                # クリーンアップ
                shutil.rmtree(temp_dir, ignore_errors=True)
                logger.info(f"Cleanup completed: {temp_dir}")

        return StreamingResponse(
            stream_and_cleanup(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_filename}"',
            },
        )

    except HTTPException:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.exception(f"Materials export failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"素材エクスポートに失敗しました: {str(e)}"
        )


# ========================================
# Ad Creator プロジェクト管理 API
# ========================================


@router.get("/ad-creator/projects", response_model=AdCreatorProjectListResponse)
async def list_ad_creator_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """
    ユーザーのAd Creatorプロジェクト一覧を取得
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]
    offset = (page - 1) * per_page

    try:
        # プロジェクト一覧取得
        projects_result = supabase.table("ad_creator_projects").select("*").eq(
            "user_id", user_id
        ).order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

        # 総件数取得
        count_result = supabase.table("ad_creator_projects").select(
            "id", count="exact"
        ).eq("user_id", user_id).execute()

        total = count_result.count if count_result.count else 0

        projects = [
            AdCreatorProjectResponse(
                id=str(p["id"]),
                user_id=str(p["user_id"]),
                title=p["title"],
                description=p.get("description"),
                aspect_ratio=p["aspect_ratio"],
                target_duration=p["target_duration"],
                theory=p.get("theory"),
                status=p["status"],
                thumbnail_url=p.get("thumbnail_url"),
                final_video_url=p.get("final_video_url"),
                project_data=p.get("project_data"),
                created_at=p["created_at"],
                updated_at=p["updated_at"],
            )
            for p in projects_result.data
        ]

        return AdCreatorProjectListResponse(
            projects=projects,
            total=total,
            page=page,
            per_page=per_page,
        )

    except Exception as e:
        logger.exception(f"Failed to list ad creator projects: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"プロジェクト一覧の取得に失敗しました: {str(e)}"
        )


@router.get("/ad-creator/projects/{project_id}", response_model=AdCreatorProjectResponse)
async def get_ad_creator_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Ad Creatorプロジェクトの詳細を取得
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        result = supabase.table("ad_creator_projects").select("*").eq(
            "id", project_id
        ).eq("user_id", user_id).single().execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="プロジェクトが見つかりません"
            )

        p = result.data
        return AdCreatorProjectResponse(
            id=str(p["id"]),
            user_id=str(p["user_id"]),
            title=p["title"],
            description=p.get("description"),
            aspect_ratio=p["aspect_ratio"],
            target_duration=p["target_duration"],
            theory=p.get("theory"),
            status=p["status"],
            thumbnail_url=p.get("thumbnail_url"),
            final_video_url=p.get("final_video_url"),
            project_data=p.get("project_data"),
            created_at=p["created_at"],
            updated_at=p["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get ad creator project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"プロジェクトの取得に失敗しました: {str(e)}"
        )


@router.post("/ad-creator/projects", response_model=AdCreatorProjectResponse)
async def create_ad_creator_project(
    request: AdCreatorProjectCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Ad Creatorプロジェクトを作成
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        project_data = {
            "user_id": user_id,
            "title": request.title,
            "description": request.description,
            "aspect_ratio": request.aspect_ratio,
            "target_duration": request.target_duration,
            "theory": request.theory.value if request.theory else None,
            "status": "draft",
            "project_data": request.project_data,
        }

        result = supabase.table("ad_creator_projects").insert(project_data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="プロジェクトの作成に失敗しました"
            )

        p = result.data[0]
        logger.info(f"Ad Creator project created: {p['id']} by user {user_id}")

        return AdCreatorProjectResponse(
            id=str(p["id"]),
            user_id=str(p["user_id"]),
            title=p["title"],
            description=p.get("description"),
            aspect_ratio=p["aspect_ratio"],
            target_duration=p["target_duration"],
            theory=p.get("theory"),
            status=p["status"],
            thumbnail_url=p.get("thumbnail_url"),
            final_video_url=p.get("final_video_url"),
            project_data=p.get("project_data"),
            created_at=p["created_at"],
            updated_at=p["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to create ad creator project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"プロジェクトの作成に失敗しました: {str(e)}"
        )


@router.put("/ad-creator/projects/{project_id}", response_model=AdCreatorProjectResponse)
async def update_ad_creator_project(
    project_id: str,
    request: AdCreatorProjectUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Ad Creatorプロジェクトを更新
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        # プロジェクト存在確認
        existing = supabase.table("ad_creator_projects").select("id").eq(
            "id", project_id
        ).eq("user_id", user_id).single().execute()

        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="プロジェクトが見つかりません"
            )

        # 更新データを構築
        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.description is not None:
            update_data["description"] = request.description
        if request.status is not None:
            update_data["status"] = request.status.value
        if request.thumbnail_url is not None:
            update_data["thumbnail_url"] = request.thumbnail_url
        if request.final_video_url is not None:
            update_data["final_video_url"] = request.final_video_url
        if request.project_data is not None:
            update_data["project_data"] = request.project_data

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="更新するフィールドがありません"
            )

        result = supabase.table("ad_creator_projects").update(update_data).eq(
            "id", project_id
        ).eq("user_id", user_id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="プロジェクトの更新に失敗しました"
            )

        p = result.data[0]
        logger.info(f"Ad Creator project updated: {project_id}")

        return AdCreatorProjectResponse(
            id=str(p["id"]),
            user_id=str(p["user_id"]),
            title=p["title"],
            description=p.get("description"),
            aspect_ratio=p["aspect_ratio"],
            target_duration=p["target_duration"],
            theory=p.get("theory"),
            status=p["status"],
            thumbnail_url=p.get("thumbnail_url"),
            final_video_url=p.get("final_video_url"),
            project_data=p.get("project_data"),
            created_at=p["created_at"],
            updated_at=p["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to update ad creator project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"プロジェクトの更新に失敗しました: {str(e)}"
        )


@router.delete("/ad-creator/projects/{project_id}")
async def delete_ad_creator_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Ad Creatorプロジェクトを削除
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    try:
        # プロジェクト存在確認
        existing = supabase.table("ad_creator_projects").select("id").eq(
            "id", project_id
        ).eq("user_id", user_id).single().execute()

        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="プロジェクトが見つかりません"
            )

        # 削除実行
        supabase.table("ad_creator_projects").delete().eq(
            "id", project_id
        ).eq("user_id", user_id).execute()

        logger.info(f"Ad Creator project deleted: {project_id}")

        return {"success": True, "message": "プロジェクトを削除しました"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to delete ad creator project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"プロジェクトの削除に失敗しました: {str(e)}"
        )
