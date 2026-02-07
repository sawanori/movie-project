"""
Runway API Client for Video Generation

KlingAI代替として使用するRunway APIクライアント
Image-to-Video生成をサポート
"""

import logging
from typing import Optional
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class RunwayAPIError(Exception):
    """Runway API エラー（ユーザー向けメッセージ付き）"""
    pass

# Runway API設定
RUNWAY_API_BASE = "https://api.dev.runwayml.com"
RUNWAY_API_VERSION = "2024-11-06"

# カメラワーク → プロンプトテキスト マッピング
CAMERA_PROMPT_MAPPING = {
    # ズーム系
    "zoom_in": "slowly zoom in on the subject",
    "zoom_out": "camera zooms out to reveal the scene",
    "slow_zoom_in": "very slow zoom in on the subject",
    "slow_zoom_out": "very slow zoom out from the subject",

    # パン系
    "pan_left": "camera pans left across the scene",
    "pan_right": "camera pans right across the scene",
    "slow_pan_left": "camera slowly pans left",
    "slow_pan_right": "camera slowly pans right",

    # ティルト系
    "tilt_up": "camera tilts up",
    "tilt_down": "camera tilts down",

    # クレーン系
    "crane_up": "crane shot moving upward",
    "crane_down": "crane shot moving downward, looking down at subject",

    # ドリー系
    "dolly_in": "dolly in toward the subject",
    "dolly_out": "dolly out from the subject",
    "dolly_forward": "camera moves forward through the scene",
    "dolly_backward": "camera moves backward through the scene",

    # オービット系
    "orbit_left": "camera orbits left around the subject",
    "orbit_right": "camera orbits right around the subject",

    # ペデスタル系
    "pedestal_up": "camera moves upward while keeping level",
    "pedestal_down": "camera moves downward while keeping level",

    # トラッキング系
    "tracking_shot": "tracking shot following the subject",
    "tracking_left": "tracking shot moving left",
    "tracking_right": "tracking shot moving right",

    # 特殊系
    "static": "static camera, locked shot, no movement",
    "handheld": "handheld camera with subtle natural movement",
    "push_in": "camera pushes in toward the subject",
    "pull_out": "camera pulls out from the subject",

    # KlingAIからの移行用
    "through_tree_canopy": "camera moves through tree canopy, looking up",
    "through_branches": "camera moves through branches",
    "tilt_feet_to_head": "camera tilts from feet to head",
    "tilt_head_to_feet": "camera tilts from head to feet",
}

# UI用カメラワーク一覧
CAMERA_WORKS = [
    {"id": "static", "label": "静止", "label_en": "Static", "description": "カメラ固定"},
    {"id": "zoom_in", "label": "ズームイン", "label_en": "Zoom In", "description": "被写体に寄る"},
    {"id": "zoom_out", "label": "ズームアウト", "label_en": "Zoom Out", "description": "被写体から離れる"},
    {"id": "pan_left", "label": "パン左", "label_en": "Pan Left", "description": "左に水平移動"},
    {"id": "pan_right", "label": "パン右", "label_en": "Pan Right", "description": "右に水平移動"},
    {"id": "tilt_up", "label": "ティルトアップ", "label_en": "Tilt Up", "description": "上に傾ける"},
    {"id": "tilt_down", "label": "ティルトダウン", "label_en": "Tilt Down", "description": "下に傾ける"},
    {"id": "crane_up", "label": "クレーンアップ", "label_en": "Crane Up", "description": "高い位置から見下ろす"},
    {"id": "crane_down", "label": "クレーンダウン", "label_en": "Crane Down", "description": "低い位置から見上げる"},
    {"id": "dolly_in", "label": "ドリーイン", "label_en": "Dolly In", "description": "被写体に近づく"},
    {"id": "dolly_out", "label": "ドリーアウト", "label_en": "Dolly Out", "description": "被写体から離れる"},
    {"id": "orbit_left", "label": "オービット左", "label_en": "Orbit Left", "description": "被写体の周りを左回り"},
    {"id": "orbit_right", "label": "オービット右", "label_en": "Orbit Right", "description": "被写体の周りを右回り"},
    {"id": "handheld", "label": "手持ち風", "label_en": "Handheld", "description": "自然な揺れ"},
    {"id": "tracking_shot", "label": "トラッキング", "label_en": "Tracking", "description": "被写体を追従"},
]

# アイデンティティ保持プレフィックス（元画像の要素のみ維持）
IDENTITY_PRESERVATION_PREFIX = (
    "CRITICAL: Preserve exact identity and scene composition. "
    "Same face, same hair, same clothing, same accessories, same number of people/subjects. "
    "Do NOT add any new elements, people, objects, or characters not present in the original image. "
    "Only subtle movement and expression changes are allowed. "
)

# アニメーションスタイル用プレフィックス（動きを許可）
ANIMATION_STYLE_PREFIX = (
    "Preserve character identity (same face, hair, clothing). "
)

# アニメーションスタイル用サフィックス（最後に追加して動きを強調）
ANIMATION_STYLE_SUFFIX = (
    " The subject MUST move and animate: show visible breathing motion, "
    "natural eye blinks, facial expression changes, subtle body movement, hair swaying. "
    "Bring the character to life with continuous natural motion throughout the video."
)

# アニメーションスタイルを検出するキーワード
ANIMATION_STYLE_KEYWORDS = [
    "anime style", "cel-shading", "Ghibli", "Pixar", "3D animation",
    "modern anime", "retro anime", "flat design", "photorealistic 3D",
    "Unreal Engine", "low poly", "game cinematic"
]


def get_camera_works() -> list[dict]:
    """UI表示用のカメラワーク一覧を取得"""
    return CAMERA_WORKS


def _is_animation_style(prompt: str) -> bool:
    """プロンプトがアニメーションスタイルかどうかを判定"""
    prompt_lower = prompt.lower()
    return any(keyword.lower() in prompt_lower for keyword in ANIMATION_STYLE_KEYWORDS)


def build_prompt_with_camera(
    base_prompt: str,
    camera_work: str | None = None,
    preserve_identity: bool = True
) -> str:
    """
    ベースプロンプトにカメラ動作とアイデンティティ保持指示を追加

    Args:
        base_prompt: 元のプロンプト
        camera_work: カメラワーク名 または カメラプロンプトテキスト
        preserve_identity: アイデンティティ保持プレフィックスを追加するか（デフォルト: True）

    Returns:
        カメラ指示とアイデンティティ保持を含むプロンプト
    """
    # アニメーションスタイルの判定
    is_animation = _is_animation_style(base_prompt)

    # アニメーションスタイルの場合は動きを許可するプレフィックスを使用
    if preserve_identity:
        if is_animation:
            full_prompt = ANIMATION_STYLE_PREFIX + base_prompt
            logger.info("Using ANIMATION_STYLE_PREFIX for animation prompt")
        else:
            full_prompt = IDENTITY_PRESERVATION_PREFIX + base_prompt
    else:
        full_prompt = base_prompt

    if not camera_work:
        # アニメーションスタイルの場合はサフィックスを追加
        if is_animation:
            return full_prompt + ANIMATION_STYLE_SUFFIX
        return full_prompt

    # "static" の場合はカメラ動作なし（アニメーションの場合はサフィックス追加）
    if camera_work.lower() in ["static", "static shot", "static shot, camera remains still"]:
        if is_animation:
            return full_prompt + ANIMATION_STYLE_SUFFIX
        return full_prompt

    # まずマッピングから検索（後方互換性）
    camera_prompt = CAMERA_PROMPT_MAPPING.get(camera_work)

    # マッピングになければ、camera_work自体をプロンプトとして使用
    if not camera_prompt:
        camera_prompt = camera_work
        logger.info(f"Using camera_work as raw prompt: {camera_work}")

    # アニメーションスタイルの場合はサフィックスを最後に追加（カメラ指示の後）
    if is_animation:
        return f"{full_prompt}. Camera: {camera_prompt}.{ANIMATION_STYLE_SUFFIX}"
    return f"{full_prompt}. Camera: {camera_prompt}."


def _get_headers() -> dict:
    """API認証ヘッダーを取得"""
    return {
        "Authorization": f"Bearer {settings.RUNWAY_API_KEY}",
        "X-Runway-Version": RUNWAY_API_VERSION,
        "Content-Type": "application/json",
    }


async def generate_video_single(
    image_url: str,
    prompt: str,
    camera_work: str | None = None,
    duration: int = 5,
    ratio: str = "720:1280",  # 9:16 縦型
) -> Optional[str]:
    """
    Runway API で画像から動画を生成

    Args:
        image_url: 入力画像URL
        prompt: 動画生成プロンプト
        camera_work: カメラワーク名（オプション）
        duration: 動画長さ（2-10秒）
        ratio: アスペクト比

    Returns:
        str: タスクID（成功時）、None（失敗時）
    """
    try:
        # カメラワークをプロンプトに追加
        full_prompt = build_prompt_with_camera(prompt, camera_work)

        # プロンプト長さ制限（1000文字）
        if len(full_prompt) > 1000:
            full_prompt = full_prompt[:997] + "..."
            logger.warning(f"Prompt truncated to 1000 chars")

        request_body = {
            "model": "gen4_turbo",
            "promptImage": image_url,
            "promptText": full_prompt,
            "duration": duration,
            "ratio": ratio,
        }

        logger.info(f"Runway request_body: {request_body}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RUNWAY_API_BASE}/v1/image_to_video",
                headers=_get_headers(),
                json=request_body,
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Runway image_to_video response: {result}")

            task_id = result.get("id")
            if task_id:
                logger.info(f"Runway task created: {task_id}")
                return task_id

            logger.error(f"Runway response missing task_id: {result}")
            return None

    except httpx.HTTPStatusError as e:
        logger.error(f"Runway HTTP error: {e.response.status_code} - {e.response.text}")
        # Parse error message for user-friendly feedback
        try:
            error_data = e.response.json()
            error_msg = error_data.get("error", "")
            issues = error_data.get("issues", [])
            if issues:
                # Extract meaningful error messages
                issue_msgs = [issue.get("message", "") for issue in issues if issue.get("message")]
                if issue_msgs:
                    error_msg = "; ".join(issue_msgs)
            if "aspect ratio" in error_msg.lower():
                raise RunwayAPIError("画像のアスペクト比が不正です。縦横比が1:2以上の画像をお使いください。")
            if "credits" in error_msg.lower():
                raise RunwayAPIError("Runwayのクレジットが不足しています。")
            raise RunwayAPIError(f"Runway API エラー: {error_msg}")
        except RunwayAPIError:
            raise
        except Exception:
            raise RunwayAPIError(f"Runway API エラー: {e.response.status_code}")
    except Exception as e:
        logger.exception(f"Runway video generation failed: {e}")
        raise RunwayAPIError(f"動画生成に失敗しました: {str(e)}")


async def check_video_status_single(task_id: str) -> Optional[dict]:
    """
    動画生成タスクの進捗を確認

    Args:
        task_id: タスクID

    Returns:
        dict: {
            "status": "pending" | "processing" | "completed" | "failed",
            "video_url": str (完了時),
            "error": str (失敗時)
        }
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RUNWAY_API_BASE}/v1/tasks/{task_id}",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

            # Runwayのステータスを内部ステータスに変換
            runway_status = result.get("status", "").upper()

            status_mapping = {
                "PENDING": "pending",
                "RUNNING": "processing",
                "SUCCEEDED": "completed",
                "FAILED": "failed",
                "THROTTLED": "pending",  # レート制限時は待機扱い
            }

            internal_status = status_mapping.get(runway_status, "processing")

            response_data = {"status": internal_status}

            if internal_status == "completed":
                # 出力URLを取得
                output = result.get("output", [])
                if output and len(output) > 0:
                    response_data["video_url"] = output[0]
                    logger.info(f"Runway task completed: {output[0]}")
            elif internal_status == "failed":
                response_data["error"] = result.get("failure", "Unknown error")
                logger.error(f"Runway task failed: {response_data['error']}")

            return response_data

    except httpx.HTTPStatusError as e:
        logger.error(f"Runway status check HTTP error: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.exception(f"Runway status check failed: {e}")
        return None


async def download_video(video_url: str, output_path: str) -> bool:
    """
    動画をダウンロード

    Args:
        video_url: 動画URL
        output_path: 保存先パス

    Returns:
        bool: 成功/失敗
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(video_url, timeout=120.0)
            response.raise_for_status()

            with open(output_path, "wb") as f:
                f.write(response.content)

            logger.info(f"Video downloaded: {output_path}")
            return True

    except Exception as e:
        logger.exception(f"Video download failed: {e}")
        return False


# 後方互換性のためのエイリアス
async def generate_video(
    image_urls: list[str],
    prompt: str,
    camera_work: str | None = None,
) -> Optional[str]:
    """
    後方互換性のためのラッパー
    最初の画像のみ使用
    """
    if not image_urls:
        logger.error("No images provided")
        return None

    return await generate_video_single(
        image_url=image_urls[0],
        prompt=prompt,
        camera_work=camera_work,
    )


async def check_video_status(task_id: str) -> Optional[dict]:
    """後方互換性のためのエイリアス"""
    return await check_video_status_single(task_id)
