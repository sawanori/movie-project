from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.core.supabase import get_supabase
from app.videos.schemas import VideoCreate, VideoStatus, VideoResponse
from app.external.gemini_client import optimize_prompt


async def create_video(user_id: str, request: VideoCreate) -> dict:
    """動画生成のメインロジック"""
    supabase = get_supabase()

    # テンプレートのプロンプトを取得
    template_prompt = ""
    if request.template_id:
        template_response = supabase.table("templates").select("prompt_template, style_keywords").eq("id", request.template_id).single().execute()
        if template_response.data:
            template_prompt = template_response.data.get("prompt_template", "")
            style_keywords = template_response.data.get("style_keywords", [])
            if style_keywords:
                template_prompt += f" Style: {', '.join(style_keywords)}"

    # プロンプト最適化
    combined_prompt = f"{request.prompt}. {template_prompt}" if template_prompt else request.prompt
    optimized_prompt = await optimize_prompt(combined_prompt, request.template_id)

    # 有効期限（7日後）
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # video_generations テーブルに保存
    video_data = {
        "user_id": user_id,
        "template_id": request.template_id,
        "image_urls": request.image_urls,  # 新規: 複数画像対応
        "original_image_url": request.image_urls[0],  # 後方互換: 最初の画像
        "user_prompt": request.prompt,
        "optimized_prompt": optimized_prompt,
        "status": VideoStatus.PENDING.value,
        "progress": 0,
        "expires_at": expires_at.isoformat(),
    }

    # オーバーレイ設定
    if request.overlay:
        video_data["overlay_text"] = request.overlay.text
        video_data["overlay_position"] = request.overlay.position
        video_data["overlay_font"] = request.overlay.font
        video_data["overlay_color"] = request.overlay.color

    # BGM設定
    if request.bgm_track_id:
        video_data["bgm_track_id"] = request.bgm_track_id

    # DBに挿入
    response = supabase.table("video_generations").insert(video_data).execute()
    video_record = response.data[0]

    # ユーザーの動画生成カウントを更新
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # usage_logsに記録
    supabase.table("usage_logs").insert({
        "user_id": user_id,
        "video_generation_id": video_record["id"],
        "action_type": "video_generated",
    }).execute()

    return _format_video_response(video_record)


async def get_video(user_id: str, video_id: str) -> dict | None:
    """動画の詳細を取得"""
    supabase = get_supabase()

    response = supabase.table("video_generations").select("*").eq("id", video_id).eq("user_id", user_id).single().execute()

    if not response.data:
        return None

    return _format_video_response(response.data)


async def get_video_status(user_id: str, video_id: str) -> dict | None:
    """動画生成のステータスを取得"""
    supabase = get_supabase()

    # maybe_single() を使用して、0行の場合はNoneを返す（例外を投げない）
    response = supabase.table("video_generations").select("id, status, progress, final_video_url, error_message, expires_at").eq("id", video_id).eq("user_id", user_id).maybe_single().execute()

    if not response.data:
        return None

    data = response.data
    status = data["status"]

    # ステータスに応じたメッセージ
    messages = {
        "pending": "動画生成を準備中...",
        "processing": f"動画を生成中... ({data['progress']}%)",
        "completed": "動画生成が完了しました",
        "failed": data.get("error_message") or "動画生成に失敗しました",
    }

    return {
        "id": data["id"],
        "status": status,
        "progress": data["progress"],
        "message": messages.get(status, ""),
        "video_url": data.get("final_video_url"),
        "expires_at": data.get("expires_at"),
    }


async def get_user_videos(user_id: str, page: int = 1, per_page: int = 10) -> dict:
    """ユーザーの動画一覧を取得"""
    supabase = get_supabase()

    # 総数を取得
    count_response = supabase.table("video_generations").select("id", count="exact").eq("user_id", user_id).execute()
    total = count_response.count or 0

    # ページネーション
    offset = (page - 1) * per_page
    response = supabase.table("video_generations").select("*").eq("user_id", user_id).order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    videos = [_format_video_response(v) for v in response.data]

    return {
        "videos": videos,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


async def delete_video(user_id: str, video_id: str) -> bool:
    """動画を削除"""
    import logging
    logger = logging.getLogger(__name__)

    supabase = get_supabase()

    try:
        # 所有者確認
        logger.info(f"Checking ownership for video {video_id}")
        check_response = supabase.table("video_generations").select("id").eq("id", video_id).eq("user_id", user_id).single().execute()

        if not check_response.data:
            logger.warning(f"Video not found or not owned: {video_id}")
            return False

        # 既存のusage_logsのvideo_generation_idをNULLに更新（FK制約対策）
        logger.info(f"Updating usage_logs for video {video_id}")
        supabase.table("usage_logs").update({
            "video_generation_id": None
        }).eq("video_generation_id", video_id).execute()

        # 削除ログを記録
        logger.info(f"Inserting delete log for video {video_id}")
        supabase.table("usage_logs").insert({
            "user_id": user_id,
            "video_generation_id": None,
            "action_type": "video_deleted",
        }).execute()

        # video_upscalesの関連レコードを削除（FK制約対策）
        logger.info(f"Deleting video_upscales for video {video_id}")
        supabase.table("video_upscales").delete().eq("video_id", video_id).execute()

        # 削除
        logger.info(f"Deleting video {video_id}")
        supabase.table("video_generations").delete().eq("id", video_id).execute()

        logger.info(f"Video deleted successfully: {video_id}")
        return True

    except Exception as e:
        logger.error(f"Error deleting video {video_id}: {e}")
        raise


async def update_video_status(video_id: str, status: str, progress: int = None, error_message: str = None, raw_video_url: str = None, final_video_url: str = None) -> None:
    """動画のステータスを更新（内部用）"""
    supabase = get_supabase()

    update_data = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if error_message is not None:
        update_data["error_message"] = error_message
    if raw_video_url is not None:
        update_data["raw_video_url"] = raw_video_url
    if final_video_url is not None:
        update_data["final_video_url"] = final_video_url

    supabase.table("video_generations").update(update_data).eq("id", video_id).execute()


def _format_video_response(data: dict) -> dict:
    """DBレコードをレスポンス形式に変換"""
    # image_urlsの取得（後方互換: なければoriginal_image_urlから生成）
    image_urls = data.get("image_urls") or [data["original_image_url"]]

    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "image_urls": image_urls,
        "original_image_url": data["original_image_url"],
        "user_prompt": data["user_prompt"],
        "optimized_prompt": data.get("optimized_prompt"),
        "overlay_text": data.get("overlay_text"),
        "overlay_position": data.get("overlay_position"),
        "raw_video_url": data.get("raw_video_url"),
        "final_video_url": data.get("final_video_url"),
        "error_message": data.get("error_message"),
        "expires_at": data.get("expires_at"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "film_grain": data.get("film_grain"),
        "use_lut": data.get("use_lut"),
        "camera_work": data.get("camera_work"),
    }


async def create_story_video(user_id: str, image_url: str, story_text: str, bgm_track_id: str | None = None, overlay: dict | None = None) -> dict:
    """ストーリー動画生成のメインロジック（AI主導モード）"""
    from app.videos.schemas import VideoStatus
    from datetime import datetime, timedelta, timezone

    supabase = get_supabase()

    # 有効期限（7日後）
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # video_generations テーブルに保存
    video_data = {
        "user_id": user_id,
        "generation_mode": "story",
        "original_image_url": image_url,
        "story_text": story_text,
        "user_prompt": story_text,  # 互換性のためstory_textをuser_promptにも設定
        "status": VideoStatus.PENDING.value,
        "progress": 0,
        "expires_at": expires_at.isoformat(),
    }

    # オーバーレイ設定
    if overlay:
        video_data["overlay_text"] = overlay.get("text")
        video_data["overlay_position"] = overlay.get("position", "bottom")
        video_data["overlay_font"] = overlay.get("font", "default")
        video_data["overlay_color"] = overlay.get("color", "#FFFFFF")

    # BGM設定
    if bgm_track_id:
        video_data["bgm_track_id"] = bgm_track_id

    # DBに挿入
    response = supabase.table("video_generations").insert(video_data).execute()
    video_record = response.data[0]

    # ユーザーの動画生成カウントを更新
    supabase.rpc("increment_video_count", {"user_id_param": user_id}).execute()

    # usage_logsに記録
    supabase.table("usage_logs").insert({
        "user_id": user_id,
        "video_generation_id": video_record["id"],
        "action_type": "video_generated",  # 既存のaction_typeを使用
    }).execute()

    return _format_story_video_response(video_record)


def _format_story_video_response(data: dict) -> dict:
    """ストーリー動画のDBレコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "generation_mode": data.get("generation_mode", "story"),
        "original_image_url": data["original_image_url"],
        "story_text": data.get("story_text", ""),
        "camera_work": data.get("camera_work"),
        "film_grain": data.get("film_grain"),
        "use_lut": data.get("use_lut"),
        "final_video_url": data.get("final_video_url"),
        "error_message": data.get("error_message"),
        "expires_at": data.get("expires_at"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def _format_concat_response(data: dict) -> dict:
    """動画結合のDBレコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "status": data["status"],
        "progress": data.get("progress", 0),
        "source_video_ids": data.get("source_video_ids", []),
        "transition": data.get("transition", "none"),
        "transition_duration": data.get("transition_duration", 0.5),
        "final_video_url": data.get("final_video_url"),
        "total_duration": data.get("total_duration"),
        "error_message": data.get("error_message"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


# ===== ユーザーアップロード動画サービス =====

# アップロード制限
USER_VIDEO_MAX_SIZE_MB = 50
USER_VIDEO_MAX_DURATION_SEC = 10
USER_VIDEO_MAX_WIDTH = 3840
USER_VIDEO_MAX_HEIGHT = 2160
USER_VIDEO_ALLOWED_TYPES = {"video/mp4", "video/quicktime"}


async def upload_user_video(
    user_id: str,
    content: bytes,
    filename: str,
    mime_type: str,
    title: str | None = None,
) -> dict:
    """
    ユーザー動画をアップロード

    1. 一時ファイルに保存
    2. FFprobeでメタデータ取得・バリデーション
    3. サムネイル生成
    4. R2にアップロード
    5. DBに保存
    """
    import tempfile
    import os
    from uuid import uuid4
    from app.services.ffmpeg_service import get_ffmpeg_service
    from app.external.r2 import upload_user_video as r2_upload_user_video, delete_file

    supabase = get_supabase()
    ffmpeg_service = get_ffmpeg_service()

    # 拡張子を取得
    ext = filename.split(".")[-1].lower() if "." in filename else "mp4"

    with tempfile.TemporaryDirectory() as tmp_dir:
        # 一時ファイルに保存
        video_path = os.path.join(tmp_dir, f"input.{ext}")
        with open(video_path, "wb") as f:
            f.write(content)

        # メタデータ取得
        metadata = await ffmpeg_service.get_video_info(video_path)

        # ffprobeのJSON出力から正しく値を取得
        # format.duration は文字列で返される
        format_info = metadata.get("format", {})
        duration = float(format_info.get("duration", 0))

        # width/heightは動画ストリームから取得
        width = 0
        height = 0
        for stream in metadata.get("streams", []):
            if stream.get("codec_type") == "video":
                width = stream.get("width", 0)
                height = stream.get("height", 0)
                break

        if duration > USER_VIDEO_MAX_DURATION_SEC:
            raise ValueError(
                f"動画が長すぎます。最大{USER_VIDEO_MAX_DURATION_SEC}秒までアップロード可能です。"
                f"（現在: {duration:.1f}秒）"
            )

        if width > USER_VIDEO_MAX_WIDTH or height > USER_VIDEO_MAX_HEIGHT:
            raise ValueError(
                f"解像度が大きすぎます。最大4K (3840x2160) までアップロード可能です。"
                f"（現在: {width}x{height}）"
            )

        # サムネイル生成
        thumb_path = os.path.join(tmp_dir, "thumbnail.jpg")
        await ffmpeg_service.extract_first_frame(video_path, thumb_path)

        # R2にアップロード
        video_uuid = str(uuid4())
        video_key = f"user_videos/{user_id}/{video_uuid}.{ext}"
        thumb_key = f"user_videos/{user_id}/{video_uuid}_thumb.jpg"

        video_url = await r2_upload_user_video(content, video_key, mime_type)

        with open(thumb_path, "rb") as f:
            thumb_content = f.read()
        thumb_url = await r2_upload_user_video(thumb_content, thumb_key, "image/jpeg")

        # DBに保存
        result = supabase.table("user_videos").insert({
            "user_id": user_id,
            "title": title or filename.rsplit(".", 1)[0],
            "r2_key": video_key,
            "video_url": video_url,
            "thumbnail_url": thumb_url,
            "duration_seconds": duration,
            "width": width,
            "height": height,
            "file_size_bytes": len(content),
            "mime_type": mime_type,
        }).execute()

        return _format_user_video_response(result.data[0])


async def get_user_uploaded_videos(
    user_id: str,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """ユーザーアップロード動画一覧を取得"""
    supabase = get_supabase()
    offset = (page - 1) * per_page

    # 総数を取得
    count_result = supabase.table("user_videos").select("*", count="exact").eq("user_id", user_id).execute()
    total = count_result.count or 0

    # ページネーション付きで取得
    result = supabase.table("user_videos") \
        .select("*") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .range(offset, offset + per_page - 1) \
        .execute()

    return {
        "videos": [_format_user_video_response(v) for v in result.data],
        "total": total,
        "page": page,
        "per_page": per_page,
        "has_next": offset + per_page < total,
    }


async def delete_user_uploaded_video(
    user_id: str,
    video_id: str,
) -> bool:
    """ユーザーアップロード動画を削除（R2 + DB）"""
    from app.external.r2 import delete_file

    supabase = get_supabase()

    # 動画情報を取得
    result = supabase.table("user_videos") \
        .select("r2_key") \
        .eq("id", video_id) \
        .eq("user_id", user_id) \
        .execute()

    if not result.data:
        return False

    r2_key = result.data[0]["r2_key"]

    # R2から削除
    await delete_file(r2_key)
    # サムネイルも削除
    thumb_key = r2_key.rsplit(".", 1)[0] + "_thumb.jpg"
    await delete_file(thumb_key)

    # DBから削除
    supabase.table("user_videos").delete().eq("id", video_id).eq("user_id", user_id).execute()

    return True


def _format_user_video_response(data: dict) -> dict:
    """ユーザー動画のDBレコードをレスポンス形式に変換"""
    return {
        "id": str(data["id"]),
        "user_id": str(data["user_id"]),
        "title": data["title"],
        "description": data.get("description"),
        "video_url": data["video_url"],
        "thumbnail_url": data.get("thumbnail_url"),
        "duration_seconds": data["duration_seconds"],
        "width": data["width"],
        "height": data["height"],
        "file_size_bytes": data["file_size_bytes"],
        "mime_type": data["mime_type"],
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "upscaled_video_url": data.get("upscaled_video_url"),
        "hls_master_url": data.get("hls_master_url"),
        "thumbnail_webp_url": data.get("thumbnail_webp_url"),
    }


# ===== スクリーンショット用ヘルパー関数 =====

async def get_image_dimensions(image_path: str) -> tuple[int | None, int | None]:
    """
    ffprobeで画像のサイズを取得

    Args:
        image_path: 画像ファイルのパス

    Returns:
        tuple[int | None, int | None]: (width, height) 取得できない場合は (None, None)
    """
    import asyncio
    import logging

    logger = logging.getLogger(__name__)

    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        image_path
    ]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode == 0 and stdout:
            parts = stdout.decode().strip().split(",")
            if len(parts) >= 2:
                return int(parts[0]), int(parts[1])
    except Exception as e:
        logger.warning(f"Failed to get image dimensions: {e}")

    return None, None


# ===== 参照画像用プロンプト強化 =====

def _enhance_prompt_for_reference(prompt: str, reference_images: list[dict]) -> str:
    """
    参照画像の用途に応じてプロンプトを強化
    BFL FLUX.2では「image 1」「image 2」と明示的に参照する必要がある

    Args:
        prompt: 元のプロンプト（英語）
        reference_images: 参照画像リスト [{"url": "...", "purpose": "character"}, ...]

    Returns:
        str: 強化されたプロンプト
    """
    if not reference_images:
        return prompt

    # 各画像の用途を番号付きで説明（BFL APIは image 1, image 2 で参照）
    image_instructions = []
    for i, img in enumerate(reference_images):
        purpose = img.get("purpose", "general")
        image_num = i + 1

        if purpose == "character":
            image_instructions.append(
                f"Use the person from image {image_num} - maintain their exact face, features, hair, and appearance."
            )
        elif purpose == "style":
            image_instructions.append(
                f"Apply the artistic style, color palette, and visual treatment from image {image_num}."
            )
        elif purpose == "product":
            image_instructions.append(
                f"Include the exact product from image {image_num}, maintaining its appearance, colors, and details."
            )
        elif purpose == "clothing":
            image_instructions.append(
                f"Dress the character in the exact clothing/outfit from image {image_num}, maintaining the style, color, pattern, and design details."
            )
        else:  # general
            image_instructions.append(
                f"Reference image {image_num} for the background or environment."
            )

    if image_instructions:
        instructions_text = " ".join(image_instructions)
        return f"{instructions_text} {prompt}"

    return prompt


# ===== シーン画像生成サービス =====

async def generate_scene_image(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16",
    image_provider: str = "nanobanana",
    reference_images: list[dict] | None = None,
    negative_prompt: str | None = None
) -> dict:
    """
    脚本（とオプションでセリフ）からシーン画像を生成

    Args:
        description_ja: カットの脚本（日本語）- メイン
        dialogue: カットのセリフ（オプション）- 補助
        aspect_ratio: アスペクト比
        image_provider: 画像生成プロバイダー ("nanobanana", "bfl_flux2_pro")
        reference_images: 参照画像リスト
            - Nano Banana: 最大3枚（掛け合わせ生成）
            - BFL FLUX.2: 最大8枚
            [{"url": "...", "purpose": "character"}, ...]
        negative_prompt: ネガティブプロンプト（BFL FLUX.2のみ対応）

    Returns:
        dict: {
            "image_url": str,
            "generated_prompt_ja": str,
            "generated_prompt_en": str
        }

    Raises:
        ValueError: 画像生成に失敗した場合
    """
    import io
    import logging
    from uuid import uuid4

    from app.external.gemini_client import (
        generate_image_prompt_from_scene,
        generate_image,
        _translate_text_to_english
    )
    from app.external.r2 import upload_image
    from app.videos.schemas import ASPECT_RATIO_TO_DIMENSIONS

    logger = logging.getLogger(__name__)

    # BFL FLUX.2 Pro プロバイダーの場合
    if image_provider == "bfl_flux2_pro":
        from app.external.bfl_flux2_provider import BFLFlux2Provider

        # 1. プロンプトを生成
        prompt_ja = f"{description_ja or ''} {dialogue or ''}".strip()
        if not prompt_ja:
            raise ValueError("プロンプトが指定されていません")

        # 2. 日本語→英語翻訳
        prompt_en = await _translate_text_to_english(prompt_ja)

        # 3. 参照画像がある場合、プロンプトを強化
        if reference_images:
            prompt_en = _enhance_prompt_for_reference(prompt_en, reference_images)

        logger.info(f"BFL FLUX.2 prompt (translated, {len(prompt_en)} chars): {prompt_en[:100]}...")

        # 4. アスペクト比→ピクセル変換
        width, height = ASPECT_RATIO_TO_DIMENSIONS.get(aspect_ratio, (768, 1344))

        # 5. 参照画像URLリストを抽出
        input_images = None
        if reference_images:
            input_images = [img["url"] for img in reference_images]
            logger.info(f"Using {len(input_images)} reference image(s)")

        # 6. BFL FLUX.2 Pro 画像生成
        provider = BFLFlux2Provider(model="flux-2-pro")
        bfl_image_url = await provider.generate_image(
            prompt=prompt_en,
            width=width,
            height=height,
            input_images=input_images,
            negative_prompt=negative_prompt,
        )

        # 7. R2にコピー（永続化）
        image_url = await _copy_image_to_r2(bfl_image_url)

        # 8. 画像サイズを取得（BFL APIから取得）
        from PIL import Image
        import httpx
        async with httpx.AsyncClient() as client:
            img_response = await client.get(bfl_image_url)
            img_response.raise_for_status()
            pil_img = Image.open(io.BytesIO(img_response.content))
            img_width, img_height = pil_img.size

        # R2キーを抽出（upload_imageの戻り値はURLなので、パースする必要がある）
        # image_url の形式: https://r2_domain/images/generated/flux_xxxxx.png
        r2_key = image_url.split("/", 3)[-1] if "/" in image_url else f"generated/flux_{uuid4().hex}.png"

        logger.info(f"BFL FLUX.2 scene image generated: {image_url}")
        return {
            "image_url": image_url,
            "generated_prompt_ja": prompt_ja,
            "generated_prompt_en": prompt_en,
            "r2_key": r2_key,
            "width": img_width,
            "height": img_height,
            "aspect_ratio": aspect_ratio,
            "image_provider": image_provider,
        }

    # Nano Banana (Gemini) プロバイダーの場合（既存ロジック）
    # 1. プロンプト生成
    logger.info(f"Generating image prompt from: description_ja={description_ja}, dialogue={dialogue}")
    prompt_ja, prompt_en = await generate_image_prompt_from_scene(
        description_ja=description_ja,
        dialogue=dialogue,
        aspect_ratio=aspect_ratio
    )
    logger.info(f"Generated prompt: {prompt_en[:100]}...")

    # 2. 画像生成（Gemini 3 Pro）
    # 参照画像がある場合は最大3枚まで渡す
    reference_image_urls = None
    if reference_images:
        reference_image_urls = [img["url"] for img in reference_images[:3] if img.get("url")]
        logger.info(f"Using {len(reference_image_urls)} reference image(s) for Nano Banana")

    logger.info("Starting image generation with Gemini 3 Pro...")
    image = await generate_image(prompt_en, reference_image_urls=reference_image_urls)
    if image is None:
        logger.error("Image generation returned None")
        raise ValueError("画像生成に失敗しました。プロンプトを変更して再試行してください。")

    # 3. R2にアップロード
    # 注意: upload_image は (file_content: bytes, filename: str) の2引数
    # Content-Type はファイル名の拡張子から自動推測される
    buffer = io.BytesIO()

    # Gemini SDK の Image オブジェクトから画像バイトを取得
    # google.genai の Image クラスは _pil_image 属性に PIL Image を持つ
    logger.info(f"Image object type: {type(image)}")

    try:
        # 方法1: _pil_image 属性から PIL Image を取得
        pil_image = getattr(image, "_pil_image", None)
        if pil_image is not None:
            logger.info("Using _pil_image attribute")
            pil_image.save(buffer, "PNG")
        # 方法2: PIL Image の場合は直接保存（format を位置引数で渡す）
        elif hasattr(image, "mode") and hasattr(image, "size"):
            logger.info("Image appears to be PIL Image")
            image.save(buffer, "PNG")
        # 方法3: data 属性がある場合はそれを使用
        elif hasattr(image, "data"):
            logger.info("Using data attribute")
            buffer.write(image.data)
        # 方法4: _image_bytes 属性がある場合
        elif hasattr(image, "_image_bytes"):
            logger.info("Using _image_bytes attribute")
            buffer.write(image._image_bytes)
        else:
            # 最後の手段: 一時ファイルに保存してから読み込み
            import tempfile
            import os
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                image.save(tmp_path)  # Google SDK の save は path のみ受け付ける
                with open(tmp_path, "rb") as f:
                    buffer.write(f.read())
            finally:
                os.unlink(tmp_path)
            logger.info("Used temporary file method")
    except Exception as e:
        logger.exception(f"Failed to extract image data: {e}")
        raise ValueError(f"画像データの取得に失敗しました: {type(image)}, error: {e}")

    buffer.seek(0)

    filename = f"generated/scene_{uuid4().hex}.png"  # .png で終わること
    logger.info(f"Uploading generated image to R2: {filename}")

    # バッファから画像サイズを取得（アップロード前にバイトから読み込む）
    from PIL import Image
    buffer_copy = io.BytesIO(buffer.read())
    buffer.seek(0)  # 元のバッファを巻き戻し
    pil_img = Image.open(buffer_copy)
    img_width, img_height = pil_img.size

    image_url = await upload_image(buffer.read(), filename)
    r2_key = f"images/{filename}"  # upload_image内部でimages/プレフィックスが付く想定

    logger.info(f"Scene image generated successfully: {image_url}")
    return {
        "image_url": image_url,
        "generated_prompt_ja": prompt_ja,
        "generated_prompt_en": prompt_en,
        "r2_key": r2_key,
        "width": img_width,
        "height": img_height,
        "aspect_ratio": aspect_ratio,
        "image_provider": image_provider,
    }


async def generate_image_from_text(
    structured_input: dict | None = None,
    free_text_description: str | None = None,
    reference_image_url: str | None = None,
    aspect_ratio: str = "9:16",
    image_provider: str = "nanobanana",
    reference_images: list[dict] | None = None,
    negative_prompt: str | None = None
) -> dict:
    """
    構造化テキスト入力またはフリーテキストからシーン画像を生成（Text-to-Image）

    Args:
        structured_input: 構造化入力（nanobananaテンプレートベース）- Noneの場合はfree_textを使用
            - subject: 被写体（必須）
            - subject_position: 被写体の位置（オプション）
            - background: 背景（オプション）
            - lighting: 照明（オプション）
            - color_palette: カラーパレット（オプション）
            - mood: ムード（オプション）
            - additional_notes: 追加指示（オプション）
        free_text_description: フリーテキストでの画像説明（日本語）
        negative_prompt: ネガティブプロンプト（BFL FLUX.2のみ対応）
        reference_image_url: 参照画像のURL（Nano Banana用、後方互換性のため残存）
        aspect_ratio: アスペクト比
        image_provider: 画像生成プロバイダー ("nanobanana", "bfl_flux2_pro")
        reference_images: 参照画像リスト
            - Nano Banana: 最大3枚（掛け合わせ生成）
            - BFL FLUX.2: 最大8枚
            [{"url": "...", "purpose": "character"}, ...]

    Note:
        structured_input または free_text_description のどちらかは必須

    Returns:
        dict: {
            "image_url": str,
            "generated_prompt_ja": str,
            "generated_prompt_en": str
        }

    Raises:
        ValueError: 画像生成に失敗した場合
    """
    import io
    import logging
    from uuid import uuid4

    from app.external.gemini_client import (
        generate_image_prompt_from_scene,
        translate_structured_input_to_english,
        generate_image,
        _translate_text_to_english
    )
    from app.external.r2 import upload_image
    from app.videos.schemas import ASPECT_RATIO_TO_DIMENSIONS

    logger = logging.getLogger(__name__)

    # BFL FLUX.2 Pro プロバイダーの場合
    if image_provider == "bfl_flux2_pro":
        from app.external.bfl_flux2_provider import BFLFlux2Provider

        # 1. 入力テキストを決定
        if free_text_description:
            prompt_ja = free_text_description
        elif structured_input:
            # 構造化入力を簡易テキストに変換
            prompt_ja = _structured_input_to_text(structured_input)
        else:
            raise ValueError("プロンプトが指定されていません")

        # 2. 日本語→英語翻訳
        prompt_en = await _translate_text_to_english(prompt_ja)

        # 3. 参照画像がある場合、プロンプトを強化
        if reference_images:
            prompt_en = _enhance_prompt_for_reference(prompt_en, reference_images)

        logger.info(f"BFL FLUX.2 prompt (translated, {len(prompt_en)} chars): {prompt_en[:100]}...")

        # 4. アスペクト比→ピクセル変換
        width, height = ASPECT_RATIO_TO_DIMENSIONS.get(aspect_ratio, (768, 1344))

        # 5. 参照画像URLリストを抽出
        input_images = None
        if reference_images:
            input_images = [img["url"] for img in reference_images]
            logger.info(f"Using {len(input_images)} reference image(s)")

        # 6. BFL FLUX.2 Pro 画像生成
        provider = BFLFlux2Provider(model="flux-2-pro")
        bfl_image_url = await provider.generate_image(
            prompt=prompt_en,
            width=width,
            height=height,
            input_images=input_images,
            negative_prompt=negative_prompt,
        )

        # 7. R2にコピー（永続化）
        image_url = await _copy_image_to_r2(bfl_image_url)

        # 8. 画像サイズを取得（BFL APIから取得）
        from PIL import Image
        import httpx
        async with httpx.AsyncClient() as client:
            img_response = await client.get(bfl_image_url)
            img_response.raise_for_status()
            pil_img = Image.open(io.BytesIO(img_response.content))
            img_width, img_height = pil_img.size

        # R2キーを抽出
        r2_key = image_url.split("/", 3)[-1] if "/" in image_url else f"generated/flux_{uuid4().hex}.png"

        logger.info(f"BFL FLUX.2 text-to-image generation completed: {image_url}")
        return {
            "image_url": image_url,
            "generated_prompt_ja": prompt_ja,
            "generated_prompt_en": prompt_en,
            "r2_key": r2_key,
            "width": img_width,
            "height": img_height,
            "aspect_ratio": aspect_ratio,
            "image_provider": image_provider,
        }

    # Nano Banana (Gemini) プロバイダーの場合（既存ロジック）
    # 入力モードを判定
    use_structured = structured_input is not None and structured_input.get("subject", "").strip()

    if use_structured:
        # 構造化入力モード（既存ロジック）
        logger.info(f"Using structured input mode: {structured_input}")

        # 1. 構造化入力を英語に翻訳
        logger.info(f"Translating structured input to English")
        translated_input = await translate_structured_input_to_english(structured_input)
        logger.info(f"Translated input: {translated_input}")

        # 2. プロンプト生成（nanobanana 5段階テンプレート使用）
        logger.info(f"Generating image prompt from structured input")
        prompt_ja, prompt_en = await generate_image_prompt_from_scene(
            description_ja=None,  # 構造化入力を使用するので None
            dialogue=None,
            aspect_ratio=aspect_ratio,
            structured_input=translated_input,
            reference_image_url=reference_image_url
        )
    else:
        # フリーテキストモード
        logger.info(f"Using free text mode: {free_text_description}")

        # プロンプト生成（description_jaとして渡す）
        prompt_ja, prompt_en = await generate_image_prompt_from_scene(
            description_ja=free_text_description,
            dialogue=None,
            aspect_ratio=aspect_ratio,
            structured_input=None,
            reference_image_url=reference_image_url
        )

    logger.info(f"Generated prompt: {prompt_en[:100]}...")

    # 3. 画像生成（Gemini 3 Pro）
    # 参照画像がある場合は、Geminiに直接渡して元画像のスタイルを維持
    # reference_images（複数）が優先、なければreference_image_url（単一）を使用
    reference_image_urls = None
    if reference_images:
        reference_image_urls = [img["url"] for img in reference_images[:3] if img.get("url")]
        logger.info(f"Using {len(reference_image_urls)} reference image(s) for Nano Banana")
    elif reference_image_url:
        reference_image_urls = [reference_image_url]
        logger.info("Using single reference image for Nano Banana (legacy)")

    logger.info(f"Starting image generation with Gemini 3 Pro (reference_images: {len(reference_image_urls) if reference_image_urls else 0})...")
    image = await generate_image(prompt_en, reference_image_urls=reference_image_urls)
    if image is None:
        logger.error("Image generation returned None")
        raise ValueError("画像生成に失敗しました。プロンプトを変更して再試行してください。")

    # 4. R2にアップロード
    buffer = io.BytesIO()

    logger.info(f"Image object type: {type(image)}")

    try:
        # 方法1: _pil_image 属性から PIL Image を取得
        pil_image = getattr(image, "_pil_image", None)
        if pil_image is not None:
            logger.info("Using _pil_image attribute")
            pil_image.save(buffer, "PNG")
        # 方法2: PIL Image の場合は直接保存
        elif hasattr(image, "mode") and hasattr(image, "size"):
            logger.info("Image appears to be PIL Image")
            image.save(buffer, "PNG")
        # 方法3: data 属性がある場合はそれを使用
        elif hasattr(image, "data"):
            logger.info("Using data attribute")
            buffer.write(image.data)
        # 方法4: _image_bytes 属性がある場合
        elif hasattr(image, "_image_bytes"):
            logger.info("Using _image_bytes attribute")
            buffer.write(image._image_bytes)
        else:
            # 最後の手段: 一時ファイルに保存してから読み込み
            import tempfile
            import os
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                image.save(tmp_path)
                with open(tmp_path, "rb") as f:
                    buffer.write(f.read())
            finally:
                os.unlink(tmp_path)
            logger.info("Used temporary file method")
    except Exception as e:
        logger.exception(f"Failed to extract image data: {e}")
        raise ValueError(f"画像データの取得に失敗しました: {type(image)}, error: {e}")

    buffer.seek(0)

    filename = f"generated/text_to_image_{uuid4().hex}.png"
    logger.info(f"Uploading generated image to R2: {filename}")

    # バッファから画像サイズを取得（アップロード前にバイトから読み込む）
    from PIL import Image
    buffer_copy = io.BytesIO(buffer.read())
    buffer.seek(0)  # 元のバッファを巻き戻し
    pil_img = Image.open(buffer_copy)
    img_width, img_height = pil_img.size

    image_url = await upload_image(buffer.read(), filename)
    r2_key = f"images/{filename}"  # upload_image内部でimages/プレフィックスが付く想定

    logger.info(f"Text-to-image generation completed: {image_url}")
    return {
        "image_url": image_url,
        "generated_prompt_ja": prompt_ja,
        "generated_prompt_en": prompt_en,
        "r2_key": r2_key,
        "width": img_width,
        "height": img_height,
        "aspect_ratio": aspect_ratio,
        "image_provider": image_provider,
    }


# ===== Flux用ヘルパー関数 =====

def _structured_input_to_text(structured_input: dict) -> str:
    """構造化入力をシンプルなテキストに変換（Flux用）"""
    parts = []
    if structured_input.get("subject"):
        parts.append(structured_input["subject"])
    if structured_input.get("background"):
        parts.append(f"背景: {structured_input['background']}")
    if structured_input.get("lighting"):
        parts.append(f"照明: {structured_input['lighting']}")
    if structured_input.get("color_palette"):
        parts.append(f"カラー: {structured_input['color_palette']}")
    if structured_input.get("mood"):
        parts.append(f"ムード: {structured_input['mood']}")
    if structured_input.get("additional_notes"):
        parts.append(structured_input["additional_notes"])
    return "。".join(parts)


async def _copy_image_to_r2(source_url: str) -> str:
    """外部画像URLからR2にコピー"""
    import httpx
    from uuid import uuid4
    from app.external.r2 import upload_image

    async with httpx.AsyncClient() as client:
        response = await client.get(source_url, timeout=60.0)
        response.raise_for_status()
        image_data = response.content

    filename = f"generated/flux_{uuid4().hex}.png"
    return await upload_image(image_data, filename)
