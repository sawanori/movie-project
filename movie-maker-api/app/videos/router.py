from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from typing import Optional

from app.core.dependencies import get_current_user, check_usage_limit
from app.videos.schemas import (
    VideoCreate, VideoResponse, VideoListResponse, VideoStatusResponse,
    StorySuggestRequest, StorySuggestResponse, StoryVideoCreate, StoryVideoResponse,
    StoryPreviewRequest, StoryPreviewResponse, StoryConfirmRequest,
)
from app.videos import service
from app.external.r2 import upload_image
from app.external.gemini_client import (
    suggest_stories_from_image,
    analyze_image_for_base_prompt,
    generate_storyboard_prompts,
    generate_story_frame_image,
)
from app.external.r2 import r2_client
from app.tasks import start_video_processing, start_story_processing

router = APIRouter(prefix="/videos", tags=["videos"])


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
    import logging
    logger = logging.getLogger(__name__)

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
    import uuid
    filename = f"{current_user['user_id']}/{uuid.uuid4()}.{file.filename.split('.')[-1] if '.' in file.filename else 'jpg'}"
    image_url = await upload_image(contents, filename)

    return {"image_url": image_url}


@router.post("/upload-images")
async def upload_images_endpoint(
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """複数画像をアップロード（最大4枚）"""
    import uuid

    # 画像数チェック
    if len(files) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 images allowed")

    if len(files) == 0:
        raise HTTPException(status_code=400, detail="At least 1 image is required")

    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    image_urls = []

    for file in files:
        # ファイルサイズチェック（10MB上限）
        contents = await file.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} exceeds 10MB limit"
            )

        # MIMEタイプチェック
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename}: type not allowed. Allowed: {', '.join(allowed_types)}"
            )

        # R2にアップロード
        ext = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'jpg'
        filename = f"{current_user['user_id']}/{uuid.uuid4()}.{ext}"
        url = await upload_image(contents, filename)
        image_urls.append(url)

    return {"image_urls": image_urls}


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


@router.post("/story", response_model=StoryVideoResponse, status_code=status.HTTP_201_CREATED)
async def create_story_video(
    request: StoryVideoCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(check_usage_limit),
):
    """ストーリー動画を生成（AI主導モード）"""
    # オーバーレイ設定を辞書に変換
    overlay_dict = None
    if request.overlay:
        overlay_dict = {
            "text": request.overlay.text,
            "position": request.overlay.position,
            "font": request.overlay.font,
            "color": request.overlay.color,
        }

    result = await service.create_story_video(
        user_id=current_user["user_id"],
        image_url=request.image_url,
        story_text=request.story_text,
        bgm_track_id=request.bgm_track_id,
        overlay=overlay_dict,
    )

    # バックグラウンドでストーリー動画処理を開始
    background_tasks.add_task(start_story_processing, result["id"])

    return result


@router.post("/story/preview", response_model=StoryPreviewResponse)
async def create_story_preview(
    request: StoryPreviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリープレビューを生成（画像とプロンプトを事前確認用）

    1. 画像解析 → ベースプロンプト生成
    2. ストーリーボードプロンプト生成
    3. AI画像生成（フレーム2,3）
    4. プレビューデータを返す（ユーザー確認用）
    """
    import uuid
    from app.core.supabase import get_supabase

    supabase = get_supabase()
    user_id = current_user["user_id"]
    preview_id = str(uuid.uuid4())

    try:
        # Step 1: 画像解析 → ベースプロンプト生成
        base_prompt = await analyze_image_for_base_prompt(request.image_url)
        if not base_prompt:
            raise HTTPException(status_code=500, detail="画像解析に失敗しました")

        # Step 2: ストーリーボードプロンプト生成
        frame_prompts = await generate_storyboard_prompts(base_prompt, request.story_text)
        if len(frame_prompts) != 3:
            raise HTTPException(status_code=500, detail="プロンプト生成に失敗しました")

        # Step 3: AI画像生成（フレーム2,3のみ - フレーム1はユーザー画像）
        # 元画像を参照して主役の一貫性を保つ
        generated_image_urls = []
        for i, frame in enumerate(frame_prompts[1:], start=2):  # フレーム2,3
            prompt = frame.get("full_prompt", "")
            if not prompt:
                prompt = f"[Scene] {frame.get('scene', '')} [Element] {frame.get('element', '')} [Action] {frame.get('action', '')} [Style] {frame.get('style', '')}"

            # 元画像を参照して生成
            image_bytes = await generate_story_frame_image(prompt, reference_image_url=request.image_url)
            if not image_bytes:
                raise HTTPException(status_code=500, detail=f"フレーム{i}の画像生成に失敗しました")

            # R2にアップロード
            image_key = f"previews/{user_id}/{preview_id}/frame_{i}.png"
            image_url = await r2_client.upload_file(
                file_data=image_bytes,
                key=image_key,
                content_type="image/png",
            )

            if not image_url:
                raise HTTPException(status_code=500, detail=f"フレーム{i}の画像アップロードに失敗しました")

            generated_image_urls.append(image_url)

        # Step 4: プレビューデータをDBに保存（後で確認時に使用）
        preview_data = {
            "id": preview_id,
            "user_id": user_id,
            "original_image_url": request.image_url,
            "story_text": request.story_text,
            "base_prompt": base_prompt,
            "storyboard_prompts": frame_prompts,
            "ai_generated_image_urls": generated_image_urls,
            "status": "preview",
            "progress": 0,
            "generation_mode": "story",
            "user_prompt": request.story_text,
        }
        supabase.table("video_generations").insert(preview_data).execute()

        return StoryPreviewResponse(
            preview_id=preview_id,
            original_image_url=request.image_url,
            story_text=request.story_text,
            base_prompt=base_prompt,
            frame_prompts=frame_prompts,
            generated_image_urls=generated_image_urls,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"プレビュー生成に失敗しました: {str(e)}")


@router.post("/story/confirm", response_model=StoryVideoResponse, status_code=status.HTTP_201_CREATED)
async def confirm_story_video(
    request: StoryConfirmRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(check_usage_limit),
):
    """
    プレビュー確認後、動画生成を開始
    """
    from app.core.supabase import get_supabase
    from app.tasks import start_story_processing

    supabase = get_supabase()
    user_id = current_user["user_id"]

    # プレビューデータを取得
    response = supabase.table("video_generations").select("*").eq("id", request.preview_id).eq("user_id", user_id).single().execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="プレビューが見つかりません")

    preview_data = response.data

    if preview_data.get("status") != "preview":
        raise HTTPException(status_code=400, detail="このプレビューは既に処理済みです")

    # オーバーレイ設定を更新
    update_data = {
        "status": "pending",
        "film_grain": request.film_grain.value,  # フィルムグレイン設定
        "use_lut": request.use_lut,  # LUT適用設定
    }

    if request.overlay:
        update_data["overlay_text"] = request.overlay.text
        update_data["overlay_position"] = request.overlay.position
        update_data["overlay_font"] = request.overlay.font
        update_data["overlay_color"] = request.overlay.color

    if request.bgm_track_id:
        update_data["bgm_track_id"] = request.bgm_track_id

    # image_urlsを設定（オリジナル + AI生成）
    all_image_urls = [preview_data["original_image_url"]] + preview_data.get("ai_generated_image_urls", [])
    update_data["image_urls"] = all_image_urls

    supabase.table("video_generations").update(update_data).eq("id", request.preview_id).execute()

    # ユーザーの動画生成カウントを更新
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # usage_logsに記録
    supabase.table("usage_logs").insert({
        "user_id": user_id,
        "video_generation_id": request.preview_id,
        "action_type": "video_generated",
    }).execute()

    # バックグラウンドで動画処理を開始（プレビュー済みなので画像生成はスキップ）
    from app.tasks.story_processor import start_story_video_processing
    background_tasks.add_task(start_story_video_processing, request.preview_id)

    # 更新後のデータを取得して返す
    updated = supabase.table("video_generations").select("*").eq("id", request.preview_id).single().execute()
    return service._format_story_video_response(updated.data)
