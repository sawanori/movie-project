"""
PiAPI Kling Video Provider

PiAPI経由でKling AIの動画生成機能を利用するプロバイダー。
VideoProviderInterface を実装。

API Documentation: https://piapi.ai/docs/kling-api/create-task
"""
import httpx
import json
import logging
from typing import Optional

from app.core.config import settings
from app.external.video_provider import (
    VideoProviderInterface,
    VideoStatus,
    VideoGenerationStatus,
    VideoProviderError,
)

logger = logging.getLogger(__name__)

PIAPI_BASE_URL = "https://api.piapi.ai/api/v1"


# ============================================================================
# カメラワーク名 → PiAPI Kling camera_control 形式マッピング
# ============================================================================
# 既存の kling.py から完全移植（PiAPI形式に変換）
# 値: {"type": "simple", "config": {...}} または None（カメラ制御なし）

def _make_camera_control(horizontal: int = 0, vertical: int = 0, pan: int = 0,
                         tilt: int = 0, roll: int = 0, zoom: int = 0) -> dict:
    """カメラ制御dictを生成するヘルパー"""
    return {
        "type": "simple",
        "config": {
            "horizontal": horizontal,
            "vertical": vertical,
            "pan": pan,
            "tilt": tilt,
            "roll": roll,
            "zoom": zoom,
        }
    }


CAMERA_CONTROL_MAPPING: dict[str, dict | None] = {
    # ==========================================
    # 静止 (static) - カメラを動かさない
    # ==========================================
    "static_shot": None,
    "over_the_shoulder": None,

    # ==========================================
    # 近づく・離れる (approach) - zoom, vertical を使用
    # ==========================================
    "zoom_in": _make_camera_control(zoom=5),
    "zoom_out": _make_camera_control(zoom=-5),
    "quick_zoom_in": _make_camera_control(zoom=10),
    "quick_zoom_out": _make_camera_control(zoom=-10),
    "dolly_in": _make_camera_control(vertical=5),
    "dolly_out": _make_camera_control(vertical=-5),
    "push_in": _make_camera_control(vertical=7),
    "pull_out": _make_camera_control(vertical=-7),
    "zoom_in_background": _make_camera_control(zoom=6),
    "zoom_out_landscape": _make_camera_control(zoom=-6),
    "dolly_in_tilt_up": _make_camera_control(vertical=5, tilt=4),
    "dolly_zoom_in": _make_camera_control(vertical=5, zoom=-3),
    "dolly_zoom_out": _make_camera_control(vertical=-5, zoom=3),
    "vertigo_in": _make_camera_control(vertical=6, zoom=-4),
    "vertigo_out": _make_camera_control(vertical=-6, zoom=4),
    "rapid_face_approach": _make_camera_control(vertical=10),
    "dolly_diagonal": _make_camera_control(horizontal=4, vertical=4),
    "slow_approach_building": _make_camera_control(vertical=3),
    "backward_from_character": _make_camera_control(vertical=-5),
    "dolly_out_doorway": _make_camera_control(vertical=-6),
    "zoom_eyes": _make_camera_control(zoom=8),

    # ==========================================
    # 左右に動く (horizontal) - horizontal, pan を使用
    # ==========================================
    "pan_left": _make_camera_control(pan=-5),
    "pan_right": _make_camera_control(pan=5),
    "truck_left": _make_camera_control(horizontal=-5),
    "truck_right": _make_camera_control(horizontal=5),
    "track_left": _make_camera_control(horizontal=-6),
    "track_right": _make_camera_control(horizontal=6),
    "diagonal_up_right": _make_camera_control(horizontal=4, tilt=4),
    "diagonal_down_left": _make_camera_control(horizontal=-4, tilt=-4),
    "pan_quick_left": _make_camera_control(pan=-10),
    "move_through_crowd": _make_camera_control(horizontal=5, vertical=3),
    "curved_path_right": _make_camera_control(horizontal=5, vertical=2, pan=3),
    "curved_path_left": _make_camera_control(horizontal=-5, vertical=2, pan=-3),
    "pan_face_to_surrounding": _make_camera_control(pan=6, zoom=-2),
    "slow_pan_horizon": _make_camera_control(pan=3),

    # ==========================================
    # 上下に動く (vertical) - vertical, tilt を使用
    # ==========================================
    "tilt_up": _make_camera_control(tilt=5),
    "tilt_down": _make_camera_control(tilt=-5),
    "pedestal_up": _make_camera_control(tilt=6),
    "pedestal_down": _make_camera_control(tilt=-6),
    "crane_up": _make_camera_control(tilt=7),
    "crane_down": _make_camera_control(tilt=-7),
    "through_tree_canopy": _make_camera_control(tilt=5),
    "through_branches": _make_camera_control(tilt=6),
    "tilt_feet_to_head": _make_camera_control(tilt=6),
    "tilt_reveal_hidden": _make_camera_control(tilt=-5),
    "tilt_reveal_path": _make_camera_control(tilt=-6),
    "tilt_over_cityscape": _make_camera_control(tilt=-4),
    "quick_tilt_up_sky": _make_camera_control(tilt=10),
    "quick_tilt_down_ground": _make_camera_control(tilt=-10),
    "tilt_zoom_combo": _make_camera_control(tilt=5, zoom=4),
    "jib_up_tilt_down": _make_camera_control(tilt=3),
    "jib_down_tilt_up": _make_camera_control(tilt=5),
    "tilt_head_to_object": _make_camera_control(tilt=-6),

    # ==========================================
    # 回り込む (orbit) - pan, horizontal, roll を組み合わせ
    # ==========================================
    "orbit_clockwise": _make_camera_control(horizontal=5, pan=5),
    "orbit_counterclockwise": _make_camera_control(horizontal=-5, pan=-5),
    "circle_slow": _make_camera_control(horizontal=3, pan=3),
    "orbit_shot": _make_camera_control(horizontal=5, pan=5),
    "360_shot": _make_camera_control(horizontal=7, pan=7),
    "arc_shot": _make_camera_control(horizontal=4, pan=4),
    "arc_left_tilt_up": _make_camera_control(horizontal=-5, pan=-4, tilt=4),
    "arc_right_tilt_down": _make_camera_control(horizontal=5, pan=4, tilt=-4),
    "rotate_vertical": _make_camera_control(tilt=6, roll=3),
    "rotate_left_45": _make_camera_control(horizontal=-3, pan=-3),
    "rotate_right_45": _make_camera_control(horizontal=3, pan=3),
    "rotate_360": _make_camera_control(horizontal=8, pan=8),
    "rotate_looking_up": _make_camera_control(horizontal=5, pan=5, tilt=4),
    "orbit_group": _make_camera_control(horizontal=5, pan=4),
    "circle_statue": _make_camera_control(horizontal=4, pan=4),
    "rotate_table_conversation": _make_camera_control(horizontal=4, pan=4),
    "circle_duel": _make_camera_control(horizontal=6, pan=6),

    # ==========================================
    # 追いかける (follow) - 様々な組み合わせ
    # ==========================================
    "handheld": _make_camera_control(horizontal=1, vertical=1, pan=1, tilt=1, roll=1),
    "shake": _make_camera_control(horizontal=2, vertical=2, roll=2),
    "shake_explosion": _make_camera_control(horizontal=3, vertical=2, roll=3),
    "shake_earthquake": _make_camera_control(horizontal=5, vertical=3, roll=4),
    "steadicam": _make_camera_control(horizontal=3, vertical=3),
    "drone": _make_camera_control(tilt=6, zoom=-3),
    "pov": _make_camera_control(horizontal=2, vertical=3),
    "tracking": _make_camera_control(horizontal=5, vertical=3),
    "follow_behind": _make_camera_control(vertical=4),
    "follow_side": _make_camera_control(horizontal=5, vertical=2),
    "track_hand": _make_camera_control(horizontal=2, tilt=-3, zoom=3),
    "follow_bird": _make_camera_control(tilt=6),
    "track_car": _make_camera_control(horizontal=6, vertical=3, pan=3),
    "follow_running": _make_camera_control(vertical=5),
    "push_narrow": _make_camera_control(vertical=5),
    "backward_hallway": _make_camera_control(vertical=-5),
    "backward_forest": _make_camera_control(vertical=-4),
    "glide_lake": _make_camera_control(horizontal=5, vertical=2),
    "glide_river": _make_camera_control(horizontal=4, vertical=3),
    "glide_desert": _make_camera_control(horizontal=5, vertical=2),
    "glide_ocean_sunset": _make_camera_control(horizontal=4, vertical=2),
    "follow_eye_level": _make_camera_control(horizontal=3, vertical=3),
    "follow_ball": _make_camera_control(horizontal=4, vertical=2, pan=3, tilt=-2),
    "dolly_up_climbing": _make_camera_control(tilt=5),
    "diagonal_through_crowd": _make_camera_control(horizontal=4, vertical=3, pan=2),

    # ==========================================
    # ドラマ演出 (dramatic) - 様々な組み合わせ
    # ==========================================
    "top_shot": _make_camera_control(tilt=-8),
    "hero_shot": _make_camera_control(tilt=5),
    "dutch_angle": _make_camera_control(roll=5),
    "reveal_shot": _make_camera_control(horizontal=4, pan=4),
    "slow_motion": _make_camera_control(zoom=2),
    "zoom_object": _make_camera_control(zoom=6),
    "dramatic_zoom": _make_camera_control(zoom=10),
    "zoom_out_eye_scene": _make_camera_control(zoom=-7),
    "zoom_out_to_crowd": _make_camera_control(zoom=-8),
    "pan_face_surrounding": _make_camera_control(pan=6, zoom=-2),
    "tilt_up_fireworks": _make_camera_control(tilt=7),
    "rotational_shot": _make_camera_control(roll=7),
    "zoom_news_headline": _make_camera_control(zoom=8),
    "slow_motion_leaves": _make_camera_control(tilt=-2, zoom=3),
    "pan_battlefield": _make_camera_control(pan=7),
    "pan_sunset_skyline": _make_camera_control(pan=-5),
    "pan_painting": _make_camera_control(pan=3),
    "pull_back_wide_to_medium": _make_camera_control(vertical=-4),
    "pull_focus_distant": _make_camera_control(zoom=3),
    "rack_focus_fg_bg": _make_camera_control(zoom=2),
    "rack_focus_bg_fg": _make_camera_control(zoom=-2),
    "rack_focus_characters": _make_camera_control(horizontal=3, pan=2),

    # ==========================================
    # 時間表現 (timelapse) - 様々な組み合わせ
    # ==========================================
    "timelapse": _make_camera_control(pan=2),
    "motion_timelapse": _make_camera_control(horizontal=3, pan=3),
    "hyperlapse": _make_camera_control(horizontal=4, vertical=4, pan=2),
}


def _get_camera_control(camera_work: Optional[str]) -> Optional[dict]:
    """カメラワーク名からPiAPI形式のcamera_controlを取得"""
    if not camera_work:
        return None
    return CAMERA_CONTROL_MAPPING.get(camera_work)


class PiAPIKlingProvider(VideoProviderInterface):
    """PiAPI Kling 動画生成プロバイダー"""

    def __init__(self):
        self.api_key = getattr(settings, 'PIAPI_API_KEY', None)
        self.version = getattr(settings, 'PIAPI_KLING_VERSION', '2.6')
        self.mode = getattr(settings, 'PIAPI_KLING_MODE', 'std')

        if not self.api_key:
            raise ValueError("PIAPI_API_KEY must be configured")

    @property
    def provider_name(self) -> str:
        return "piapi_kling"

    @property
    def supports_v2v(self) -> bool:
        """PiAPI Kling は extend_video をサポート"""
        return True

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得"""
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
        mode: Optional[str] = None,
        image_tail_url: Optional[str] = None,
        element_images: Optional[list[str]] = None,
    ) -> str:
        """
        PiAPI Kling API で画像から動画を生成

        Args:
            image_url: 入力画像URL（開始フレーム）。element_images未指定時に使用
            prompt: 動画生成プロンプト（最大2500文字）
            duration: 動画長さ（5 or 10秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9", "1:1")
            camera_work: カメラワーク名（オプション）
            mode: Klingモード（"std": 標準, "pro": 高品質）。未指定時は設定値を使用
            image_tail_url: 終了フレーム画像URL（オプション）。指定時は開始→終了への遷移動画を生成
            element_images: Elements用参照画像URLリスト（1〜4枚）。指定時はimage_urlより優先

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            # プロンプト長さ制限（2500文字）
            if len(prompt) > 2500:
                prompt = prompt[:2497] + "..."
                logger.warning("Prompt truncated to 2500 chars")

            # モードの決定（引数指定 > 設定値）
            effective_mode = mode if mode else self.mode

            # リクエストボディを構築
            request_body = {
                "model": "kling",
                "task_type": "video_generation",
                "input": {
                    "prompt": prompt,
                    "duration": duration,
                    "aspect_ratio": aspect_ratio,
                    "mode": effective_mode,
                    "version": self.version,
                }
            }

            # Elements対応: element_imagesがある場合は elements パラメータを使用
            # TODO: PiAPI Elements API のバリデーションエラーを調査中のため一時的に無効化
            using_elements = False
            if element_images and len(element_images) > 0:
                # 一時的に無効化: Elements使用時でもimage_urlを使用（先頭画像のみ）
                logger.warning(f"Elements機能は調査中のため無効化されています。先頭画像のみ使用: {element_images[0]}")
                request_body["input"]["image_url"] = element_images[0]
                # 本来のElements実装（調査後に有効化）
                # request_body["input"]["elements"] = [
                #     {"image_url": url} for url in element_images
                # ]
                # using_elements = True
                # logger.info(f"Using Kling Elements with {len(element_images)} images: {element_images}")
            else:
                # 従来通り単一画像
                request_body["input"]["image_url"] = image_url

            # 終了フレーム画像を追加（指定時のみ）
            # 注意: Elementsとimage_tail_urlは併用できない可能性があるため、Elements使用時はスキップ
            if image_tail_url and not using_elements:
                request_body["input"]["image_tail_url"] = image_tail_url
                logger.info(f"Using dual image mode: start -> end frame transition")
            elif image_tail_url and using_elements:
                logger.warning("Elements使用時はimage_tail_url（終了フレーム）は無効化されます")

            # カメラ制御を追加（camera_work文字列からdict形式に変換、Elementsと併用可能）
            camera_control = _get_camera_control(camera_work)
            if camera_control:
                request_body["input"]["camera_control"] = camera_control
                logger.info(f"Using camera_control for {camera_work}: {camera_control}")

            # デバッグ用: リクエストボディをログ出力
            logger.info(f"PiAPI Kling request body: {json.dumps(request_body, indent=2)}")
            logger.info(f"PiAPI Kling request: version={self.version}, mode={effective_mode}, aspect_ratio={aspect_ratio}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{PIAPI_BASE_URL}/task",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()

                task_id = result.get("data", {}).get("task_id")
                if task_id:
                    logger.info(f"PiAPI Kling task created: {task_id}")
                    return task_id

                logger.error(f"PiAPI response missing task_id: {result}")
                raise VideoProviderError("PiAPI Kling APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                error_msg = error_data.get("message", "")
                if "credit" in error_msg.lower():
                    raise VideoProviderError("PiAPIのクレジットが不足しています。")
                if "rate" in error_msg.lower() or "limit" in error_msg.lower():
                    raise VideoProviderError("PiAPIのレート制限に達しました。しばらく待ってから再試行してください。")
                raise VideoProviderError(f"PiAPI Kling API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"PiAPI Kling API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"PiAPI Kling generation failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

    async def check_status(self, task_id: str) -> VideoStatus:
        """
        動画生成タスクの進捗を確認

        Args:
            task_id: タスクID

        Returns:
            VideoStatus: 現在のステータス情報
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{PIAPI_BASE_URL}/task/{task_id}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

            data = result.get("data", {})
            status_str = data.get("status", "")

            # PiAPIステータス → VideoGenerationStatus 変換
            # 注意: APIは小文字で返す場合がある（"completed" vs "Completed"）
            status_lower = status_str.lower()
            status_mapping = {
                "completed": VideoGenerationStatus.COMPLETED,
                "processing": VideoGenerationStatus.PROCESSING,
                "pending": VideoGenerationStatus.PENDING,
                "staged": VideoGenerationStatus.PENDING,
                "failed": VideoGenerationStatus.FAILED,
            }
            internal_status = status_mapping.get(status_lower, VideoGenerationStatus.PROCESSING)

            # 進捗を推定
            progress = 0
            if internal_status == VideoGenerationStatus.PENDING:
                progress = 10
            elif internal_status == VideoGenerationStatus.PROCESSING:
                progress = 50
            elif internal_status == VideoGenerationStatus.COMPLETED:
                progress = 100

            video_url = None
            error_message = None

            if internal_status == VideoGenerationStatus.COMPLETED:
                # PiAPI Kling のレスポンス構造から動画URLを取得
                # 複数パターンに対応（url または resource フィールド）
                output = data.get("output", {})
                works = output.get("works", [{}])
                works_video = works[0].get("video", {}) if works else {}
                video_url = (
                    output.get("video_url") or
                    output.get("video", {}).get("url") or
                    output.get("video", {}).get("resource") or
                    works_video.get("url") or
                    works_video.get("resource")
                )
                if video_url:
                    logger.info(f"PiAPI Kling task completed: {video_url}")
                else:
                    logger.warning(f"PiAPI Kling completed but no video_url found: {output}")

            elif internal_status == VideoGenerationStatus.FAILED:
                error_data = data.get("error", {})
                raw_error = error_data.get("message", "動画生成に失敗しました")
                logger.error(f"PiAPI Kling task failed: {raw_error}")

                # エラーメッセージを分かりやすく変換
                if "preprocess" in raw_error.lower():
                    error_message = "画像の処理に失敗しました。画像URLがアクセス可能か、サイズが300px以上10MB以下か確認してください。"
                elif "credit" in raw_error.lower() or "balance" in raw_error.lower():
                    error_message = "PiAPIのクレジットが不足しています。"
                elif "rate" in raw_error.lower() or "limit" in raw_error.lower():
                    error_message = "APIのレート制限に達しました。しばらく待ってから再試行してください。"
                elif "timeout" in raw_error.lower():
                    error_message = "処理がタイムアウトしました。再試行してください。"
                elif "nsfw" in raw_error.lower() or "content" in raw_error.lower():
                    error_message = "コンテンツポリシーに違反する可能性があります。プロンプトや画像を確認してください。"
                else:
                    error_message = raw_error

            return VideoStatus(
                status=internal_status,
                progress=progress,
                video_url=video_url,
                error_message=error_message,
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI status check HTTP error: {e.response.status_code}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"PiAPI status check failed: {e}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {str(e)}",
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画URLを取得

        Args:
            task_id: タスクID

        Returns:
            str: 動画URL（未完了の場合はNone）
        """
        status = await self.check_status(task_id)
        return status.video_url

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        PiAPI Kling の Video Extend 機能を使用

        Args:
            video_url: 入力動画のURL
            prompt: 動画生成プロンプト
            aspect_ratio: アスペクト比

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            request_body = {
                "model": "kling",
                "task_type": "extend_video",
                "input": {
                    "prompt": prompt,
                    "video_url": video_url,
                    "aspect_ratio": aspect_ratio,
                    "mode": self.mode,
                    "version": self.version,
                }
            }

            logger.info(f"PiAPI Kling extend_video request: aspect_ratio={aspect_ratio}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{PIAPI_BASE_URL}/task",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()

                task_id = result.get("data", {}).get("task_id")
                if task_id:
                    logger.info(f"PiAPI Kling extend task created: {task_id}")
                    return task_id

                raise VideoProviderError("PiAPI Kling Extend APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI extend HTTP error: {e.response.status_code} - {e.response.text}")
            raise VideoProviderError(f"動画延長に失敗しました: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"PiAPI Kling extend failed: {e}")
            raise VideoProviderError(f"動画延長に失敗しました: {str(e)}")

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了した動画をバイト形式でダウンロード

        Args:
            task_id: タスクID

        Returns:
            bytes: 動画コンテンツ（失敗時はNone）
        """
        video_url = await self.get_video_url(task_id)
        if not video_url:
            return None

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                response = await client.get(video_url, timeout=120.0)
                response.raise_for_status()
                return response.content
        except Exception as e:
            logger.exception(f"Failed to download video: {e}")
            return None
