"""
PiAPI Seedance 2.0 Video Provider

PiAPI経由で Seedance 2.0 モデルによる動画生成を行うプロバイダー。
VideoProviderInterface を実装。

認証: PIAPI_API_KEY (既存設定と共用)
Phase 1 制限:
  - audio は常に OFF（APIに送信しない）
  - video_references / audio_references / parent_task_id は未対応
  - VIP以外 (standard) は480p のみ

API: POST/GET https://api.piapi.ai/api/v1/task
"""
import logging
from typing import Optional

import httpx

from app.core.config import settings
from app.external.video_provider import (
    VideoGenerationStatus,
    VideoProviderError,
    VideoProviderInterface,
    VideoStatus,
)

logger = logging.getLogger(__name__)

PIAPI_BASE_URL = "https://api.piapi.ai/api/v1"

VALID_DURATIONS = [5, 10, 15]


def _map_error_message(error: str) -> str:
    """Seedance エラーメッセージを日本語ユーザー向けメッセージに変換"""
    error_lower = error.lower()
    if "credit" in error_lower or "balance" in error_lower:
        return "PiAPI のクレジットが不足しています。"
    if "rate" in error_lower or "limit" in error_lower:
        return "API レート制限に達しました。しばらく待ってから再試行してください。"
    if "queue" in error_lower:
        return "サーバーが混雑しています（09:00–15:00 GMT はピーク時間帯）。しばらく後に再試行してください。"
    if "nsfw" in error_lower or "content" in error_lower:
        return "コンテンツポリシーに違反する可能性があります。プロンプトや画像を確認してください。"
    return error


class PiAPISeedanceProvider(VideoProviderInterface):
    """PiAPI Seedance 2.0 動画生成プロバイダー"""

    def __init__(self) -> None:
        self.api_key: str = settings.PIAPI_API_KEY
        self.task_type: str = settings.PIAPI_SEEDANCE_TASK_TYPE
        self.resolution: str = settings.PIAPI_SEEDANCE_RESOLUTION
        if not self.api_key:
            raise ValueError("PIAPI_API_KEY must be configured")

    @property
    def provider_name(self) -> str:
        return "seedance"

    @property
    def supports_t2v(self) -> bool:
        """Seedance は T2V をサポート（image_urls を省略）"""
        return True

    def _get_headers(self) -> dict[str, str]:
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
    ) -> str:
        """
        Seedance 2.0 で画像+プロンプトから動画を生成

        Args:
            image_url: 先頭フレーム画像 URL
            prompt: 動画生成プロンプト（最大4000文字）
            duration: 動画長さ（5 | 10 | 15 秒）
            aspect_ratio: アスペクト比 ("9:16" | "16:9" | "4:3" | "3:4")
            camera_work: 無視（Seedanceはプロンプト追従のみ）

        Returns:
            str: task_id

        Raises:
            VideoProviderError: タスク作成失敗
        """
        if camera_work:
            logger.warning(f"Seedance: camera_work '{camera_work}' ignored (prompt-only)")

        clamped_duration = min(VALID_DURATIONS, key=lambda d: abs(d - duration))

        input_payload: dict = {
            "prompt": prompt[:4000],
            "duration": clamped_duration,
            "aspect_ratio": aspect_ratio,
            "image_urls": [image_url],
        }
        if self.task_type.endswith("-vip"):
            input_payload["resolution"] = self.resolution

        payload = {
            "model": "seedance",
            "task_type": self.task_type,
            "input": input_payload,
            "config": {"service_mode": "public"},
        }
        # audio フィールドは Phase 1 では送信しない

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{PIAPI_BASE_URL}/task",
                    headers=self._get_headers(),
                    json=payload,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                task_id = data["data"]["task_id"]
                logger.info(f"Seedance task created: {task_id}")
                return task_id

        except httpx.HTTPStatusError as e:
            logger.error(f"Seedance HTTP error: {e.response.status_code} - {e.response.text}")
            raise VideoProviderError(f"Seedance API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Seedance generate_video failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

    async def generate_video_from_text(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        Seedance T2V: image_urls を送信しない

        Returns:
            str: task_id
        """
        clamped_duration = min(VALID_DURATIONS, key=lambda d: abs(d - duration))

        input_payload: dict = {
            "prompt": prompt[:4000],
            "duration": clamped_duration,
            "aspect_ratio": aspect_ratio,
            # image_urls を省略 = T2V
        }
        if self.task_type.endswith("-vip"):
            input_payload["resolution"] = self.resolution

        payload = {
            "model": "seedance",
            "task_type": self.task_type,
            "input": input_payload,
            "config": {"service_mode": "public"},
        }
        # audio フィールドは Phase 1 では送信しない

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{PIAPI_BASE_URL}/task",
                    headers=self._get_headers(),
                    json=payload,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                task_id = data["data"]["task_id"]
                logger.info(f"Seedance T2V task created: {task_id}")
                return task_id

        except httpx.HTTPStatusError as e:
            logger.error(f"Seedance T2V HTTP error: {e.response.status_code} - {e.response.text}")
            raise VideoProviderError(f"Seedance API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Seedance generate_video_from_text failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

    async def check_status(self, task_id: str) -> VideoStatus:
        """
        PiAPI タスクステータスを確認
        piapi_kling_provider.py の check_status と同じパターン

        PiAPI ステータス → VideoGenerationStatus マッピング:
            Pending / Staged  → PENDING
            Processing        → PROCESSING
            Completed         → COMPLETED
            Failed            → FAILED

        video URL は data.output.video フィールドから取得
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{PIAPI_BASE_URL}/task/{task_id}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()["data"]
                status = data.get("status", "")

                if status in ("Pending", "Staged"):
                    return VideoStatus(status=VideoGenerationStatus.PENDING, progress=0)
                elif status == "Processing":
                    return VideoStatus(status=VideoGenerationStatus.PROCESSING, progress=50)
                elif status == "Completed":
                    video_url = data.get("output", {}).get("video")
                    return VideoStatus(
                        status=VideoGenerationStatus.COMPLETED,
                        progress=100,
                        video_url=video_url,
                    )
                elif status == "Failed":
                    error_msg = data.get("error", {}).get("message", "Unknown error")
                    mapped_msg = _map_error_message(error_msg)
                    return VideoStatus(
                        status=VideoGenerationStatus.FAILED,
                        progress=0,
                        error_message=mapped_msg,
                    )
                else:
                    # 未知ステータスは PROCESSING 扱い
                    logger.warning(f"Seedance: unknown status '{status}' for task {task_id}")
                    return VideoStatus(status=VideoGenerationStatus.PROCESSING, progress=50)

        except httpx.HTTPStatusError as e:
            logger.error(f"Seedance check_status HTTP error: {e.response.status_code}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"Seedance API エラー: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"Seedance check_status failed: {e}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {str(e)}",
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """check_status() から video_url を返す"""
        status = await self.check_status(task_id)
        return status.video_url if status.status == VideoGenerationStatus.COMPLETED else None
