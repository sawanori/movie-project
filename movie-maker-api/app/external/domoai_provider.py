"""
DomoAI Enterprise API Provider for Video Generation

VideoProviderInterfaceを実装したDomoAI APIプロバイダー
"""

import logging
import base64
from typing import Optional
import httpx

from app.core.config import settings
from app.external.video_provider import (
    VideoProviderInterface,
    VideoStatus,
    VideoGenerationStatus,
    VideoProviderError,
    build_prompt_with_camera,
)

logger = logging.getLogger(__name__)

# DomoAI API設定
DOMOAI_API_BASE = "https://api.domoai.com"


class DomoAIProvider(VideoProviderInterface):
    """DomoAI Enterprise API を使用した動画生成プロバイダー"""

    @property
    def provider_name(self) -> str:
        return "domoai"

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得"""
        return {
            "Authorization": f"Bearer {settings.DOMOAI_API_KEY}",
            "Content-Type": "application/json",
        }

    def _convert_aspect_ratio(self, aspect_ratio: str) -> str:
        """
        アスペクト比をDomoAI API形式に変換
        DomoAIは "9:16", "16:9", "1:1" をそのまま受け付ける
        """
        return aspect_ratio

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        DomoAI API で画像から動画を生成 (image2video)

        Args:
            image_url: 入力画像URL
            prompt: 動画生成プロンプト
            duration: 動画長さ（1-10秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9", "1:1")
            camera_work: カメラワーク名（オプション）

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        # APIキーのチェック
        if not settings.DOMOAI_API_KEY:
            raise VideoProviderError("DomoAI APIキーが設定されていません。.envファイルでDOMOAI_API_KEYを設定してください。")

        try:
            # カメラワークをプロンプトに追加（Runwayと同じ形式を使用）
            full_prompt = build_prompt_with_camera(prompt, camera_work, provider="runway")

            # 画像をダウンロードしてBase64エンコード
            async with httpx.AsyncClient(follow_redirects=True) as client:
                image_response = await client.get(image_url, timeout=60.0)
                image_response.raise_for_status()
                image_bytes = image_response.content
                image_base64 = base64.b64encode(image_bytes).decode("utf-8")

            request_body = {
                "model": "animate-2.4-faster",  # 高速モデル（コスト効率）
                "image": {
                    "bytes_base64_encoded": image_base64
                },
                "prompt": full_prompt,
                "seconds": min(max(duration, 1), 10),  # 1-10秒に制限
                "aspect_ratio": self._convert_aspect_ratio(aspect_ratio),
            }

            logger.info(f"DomoAI request: model={request_body['model']}, seconds={request_body['seconds']}, aspect_ratio={request_body['aspect_ratio']}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{DOMOAI_API_BASE}/v1/video/image2video",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"DomoAI image2video response: {result}")

                task_id = result.get("data", {}).get("task_id")
                if task_id:
                    logger.info(f"DomoAI task created: {task_id}")
                    return task_id

                raise VideoProviderError("DomoAI APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"DomoAI HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                # DomoAI APIのエラー形式に対応（message, error, detailなど）
                error_msg = (
                    error_data.get("message") or
                    error_data.get("error") or
                    error_data.get("detail") or
                    str(error_data)
                )

                if e.response.status_code == 401:
                    raise VideoProviderError("DomoAI APIキーが無効または未設定です。設定を確認してください。")
                if e.response.status_code == 402:
                    raise VideoProviderError("DomoAIのクレジットが不足しています。")
                if e.response.status_code == 429:
                    raise VideoProviderError("DomoAIのレート制限に達しました。しばらく待ってから再試行してください。")
                raise VideoProviderError(f"DomoAI API エラー ({e.response.status_code}): {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"DomoAI API エラー ({e.response.status_code}): {e.response.text[:200]}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"DomoAI video generation failed: {e}")
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
                    f"{DOMOAI_API_BASE}/v1/tasks/{task_id}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

                data = result.get("data", {})
                domoai_status = data.get("status", "").upper()

                # DomoAIのステータスを内部ステータスに変換
                status_mapping = {
                    "PENDING": VideoGenerationStatus.PENDING,
                    "PROCESSING": VideoGenerationStatus.PROCESSING,
                    "SUCCESS": VideoGenerationStatus.COMPLETED,
                    "FAILED": VideoGenerationStatus.FAILED,
                }

                internal_status = status_mapping.get(domoai_status, VideoGenerationStatus.PROCESSING)

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
                    output_videos = data.get("output_videos", [])
                    if output_videos and len(output_videos) > 0:
                        video_url = output_videos[0].get("url")
                        logger.info(f"DomoAI task completed: {video_url}")
                elif internal_status == VideoGenerationStatus.FAILED:
                    error_message = data.get("error", "動画生成に失敗しました")
                    logger.error(f"DomoAI task failed: {error_message}")

                return VideoStatus(
                    status=internal_status,
                    progress=progress,
                    video_url=video_url,
                    error_message=error_message,
                )

        except httpx.HTTPStatusError as e:
            logger.error(f"DomoAI status check HTTP error: {e.response.status_code}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"DomoAI status check failed: {e}")
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

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了したタスクの動画をダウンロード

        Note:
            DomoAIの動画URLは8時間で失効するため、
            取得後すぐにR2に永続化する必要がある。
        """
        try:
            video_url = await self.get_video_url(task_id)
            if not video_url:
                logger.warning(f"No video URL for task {task_id}")
                return None

            async with httpx.AsyncClient(follow_redirects=True) as client:
                response = await client.get(video_url, timeout=120.0)
                response.raise_for_status()
                return response.content

        except Exception as e:
            logger.exception(f"Failed to download video for task {task_id}: {e}")
            return None
