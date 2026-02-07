"""
HailuoAI (MiniMax) Video Provider

MiniMax社のHailuoAI動画生成APIを使用した動画生成プロバイダー。
- Image-to-Video: first_frame_imageパラメータ
- End Frame: last_frame_imageパラメータ (Hailuo-02のみ)
- Camera Control: プロンプト内[command]構文
- Duration: 6秒または10秒のみ対応
"""

import httpx
import logging
from typing import Optional

from app.core.config import settings
from app.external.video_provider import (
    VideoProviderInterface,
    VideoProviderError,
    VideoStatus,
    VideoGenerationStatus,
)

logger = logging.getLogger(__name__)

HAILUO_BASE_URL = "https://api.minimax.io"

# カメラワークマッピング（既存のカメラワーク名 → Hailuoコマンド）
# フロントエンド(camera-works.ts)の名前に合わせてエイリアスを追加
HAILUO_CAMERA_MAPPING: dict[str, str] = {
    # ==========================================
    # 基本移動（17種 - フロントエンドと完全一致）
    # ==========================================
    "dolly_in": "[Push in]",
    "dolly_out": "[Pull out]",
    "push_in": "[Push in]",
    "pull_out": "[Pull out]",
    "truck_left": "[Truck left]",
    "truck_right": "[Truck right]",
    "pan_left": "[Pan left]",
    "pan_right": "[Pan right]",
    "tilt_up": "[Tilt up]",
    "tilt_down": "[Tilt down]",
    "pedestal_up": "[Pedestal up]",
    "pedestal_down": "[Pedestal down]",
    "zoom_in": "[Zoom in]",
    "zoom_out": "[Zoom out]",
    "crane_up": "[Pedestal up, Tilt down]",
    "crane_down": "[Pedestal down, Tilt up]",
    "static_shot": "[Static shot]",

    # ==========================================
    # フロントエンド名のエイリアス（追加分）
    # ==========================================
    # tracking系
    "tracking": "[Tracking shot]",  # フロントエンド名
    "tracking_shot": "[Tracking shot]",  # 旧名も維持

    # orbit/arc系（フロントエンド名に合わせる）
    "arc_shot": "[Truck left, Pan right]",  # フロントエンド名
    "orbit_clockwise": "[Truck left, Pan right]",  # フロントエンド名
    "orbit_counterclockwise": "[Truck right, Pan left]",  # フロントエンド名
    "orbit_shot": "[Truck left, Pan right]",  # フロントエンド名
    "circle_slow": "[Truck left, Pan right]",  # フロントエンド名
    "360_shot": "[Truck left, Pan right]",  # フロントエンド名

    # 旧名のエイリアス（後方互換性）
    "arc_left": "[Truck left, Pan right]",
    "arc_right": "[Truck right, Pan left]",
    "orbit_left": "[Truck left, Pan right]",
    "orbit_right": "[Truck right, Pan left]",

    # ==========================================
    # 削除済みカメラワーク（後方互換性のため維持）
    # ==========================================
    "shake": "[Shake]",
    "handheld": "[Shake]",
    "static": "[Static shot]",
    "slow_zoom_in": "[Zoom in]",
    "slow_zoom_out": "[Zoom out]",
    "gentle_pan_left": "[Pan left]",
    "gentle_pan_right": "[Pan right]",
    "subtle_push": "[Push in]",
    "follow": "[Tracking shot]",
}


class HailuoProvider(VideoProviderInterface):
    """HailuoAI (MiniMax) 動画生成プロバイダー"""

    def __init__(self):
        self.api_key = getattr(settings, "HAILUO_API_KEY", None)
        self.model = getattr(settings, "HAILUO_MODEL", "MiniMax-Hailuo-02")
        self.prompt_optimizer = getattr(settings, "HAILUO_PROMPT_OPTIMIZER", False)

        if not self.api_key:
            raise ValueError("HAILUO_API_KEY must be configured")

    @property
    def provider_name(self) -> str:
        return "hailuo"

    @property
    def supports_v2v(self) -> bool:
        """First/Last Frame方式で代替実装のためTrue"""
        return True

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得（Bearer Token形式）"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
        last_frame_image_url: Optional[str] = None,
    ) -> str:
        """
        Hailuo API で画像から動画を生成

        Args:
            image_url: 入力画像URL（開始フレーム）
            prompt: 動画生成プロンプト（最大2000文字）
            duration: 動画長さ（5→6秒, 6以上→10秒に変換）
            aspect_ratio: アスペクト比（"9:16", "16:9", "1:1"）
            camera_work: カメラワーク名（オプション）
            last_frame_image_url: 終了フレーム画像URL（オプション、Hailuo-02のみ）

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            # 1. プロンプト長さ制限（2000文字）
            if len(prompt) > 2000:
                prompt = prompt[:1997] + "..."
                logger.warning("Prompt truncated to 2000 chars")

            # 2. カメラコマンドをプロンプトに追加
            if camera_work and camera_work in HAILUO_CAMERA_MAPPING:
                camera_command = HAILUO_CAMERA_MAPPING[camera_work]
                prompt = f"{camera_command} {prompt}"
                logger.info(f"Added camera command: {camera_command}")

            # 3. duration調整（6秒 or 10秒のみ対応）
            # 5秒以下→6秒、6秒以上→10秒
            effective_duration = 6 if duration <= 6 else 10

            # 4. リクエストボディ構築
            request_body = {
                "model": self.model,
                "prompt": prompt,
                "first_frame_image": image_url,
                "duration": effective_duration,
                "prompt_optimizer": self.prompt_optimizer,
            }

            # 5. End Frame対応（Hailuo-02のみ）
            if last_frame_image_url and self.model == "MiniMax-Hailuo-02":
                request_body["last_frame_image"] = last_frame_image_url
                logger.info("Using First/Last Frame mode")

            logger.info(
                f"Hailuo request: model={self.model}, duration={effective_duration}"
            )

            # 6. API呼び出し
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{HAILUO_BASE_URL}/v1/video_generation",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()

            # 7. レスポンス解析
            base_resp = result.get("base_resp", {})
            if base_resp.get("status_code") != 0:
                error_msg = base_resp.get("status_msg", "Unknown error")
                raise VideoProviderError(f"Hailuo API エラー: {error_msg}")

            task_id = result.get("task_id")
            if not task_id:
                raise VideoProviderError("Hailuo APIからtask_idが返されませんでした")

            logger.info(f"Hailuo task created: {task_id}")
            return task_id

        except httpx.HTTPStatusError as e:
            logger.error(
                f"Hailuo HTTP error: {e.response.status_code} - {e.response.text}"
            )
            self._handle_http_error(e)
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Hailuo video generation failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

    def _handle_http_error(self, e: httpx.HTTPStatusError):
        """HTTPエラーをユーザーフレンドリーなメッセージに変換"""
        try:
            error_data = e.response.json()
            base_resp = error_data.get("base_resp", {})
            status_code = base_resp.get("status_code", 0)
            status_msg = base_resp.get("status_msg", "")

            error_messages = {
                1002: "レート制限に達しました。しばらく待ってから再試行してください。",
                1004: "認証に失敗しました。APIキーを確認してください。",
                1008: "MiniMaxのクレジットが不足しています。",
                1026: "不適切なコンテンツが検出されました。プロンプトを修正してください。",
                2013: "パラメータが不正です。入力を確認してください。",
                2049: "無効なAPIキーです。APIキーを再生成してください。",
            }

            if status_code in error_messages:
                raise VideoProviderError(error_messages[status_code])
            raise VideoProviderError(
                f"Hailuo API エラー: {status_msg or e.response.status_code}"
            )
        except VideoProviderError:
            raise
        except Exception:
            raise VideoProviderError(f"Hailuo API エラー: {e.response.status_code}")

    async def _retrieve_file_url(self, file_id: int) -> Optional[str]:
        """
        file_idから動画のダウンロードURLを取得

        Args:
            file_id: ファイルID（タスク完了時に返される）

        Returns:
            str | None: 動画のダウンロードURL
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{HAILUO_BASE_URL}/v1/files/retrieve",
                    headers=self._get_headers(),
                    params={"file_id": file_id},
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

            # base_resp チェック
            base_resp = result.get("base_resp", {})
            if base_resp.get("status_code") != 0:
                error_msg = base_resp.get("status_msg", "Unknown error")
                logger.error(f"Hailuo file retrieve failed: {error_msg}")
                return None

            # file オブジェクトから download_url を取得
            file_info = result.get("file", {})
            download_url = file_info.get("download_url")

            if download_url:
                logger.info(f"Hailuo file retrieved: {download_url[:80]}...")
                return download_url
            else:
                logger.warning(f"Hailuo file retrieve: no download_url in response: {result}")
                return None

        except Exception as e:
            logger.exception(f"Hailuo file retrieve failed: {e}")
            return None

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
                    f"{HAILUO_BASE_URL}/v1/query/video_generation",
                    headers=self._get_headers(),
                    params={"task_id": task_id},
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

            logger.debug(f"Hailuo status response: {result}")

            # ステータス文字列（大文字小文字混在の可能性あり）
            status_str = result.get("status", "").lower()

            # ステータスマッピング
            status_mapping = {
                "success": VideoGenerationStatus.COMPLETED,
                "processing": VideoGenerationStatus.PROCESSING,
                "pending": VideoGenerationStatus.PENDING,
                "queueing": VideoGenerationStatus.PENDING,
                "preparing": VideoGenerationStatus.PENDING,
                "fail": VideoGenerationStatus.FAILED,
                "failed": VideoGenerationStatus.FAILED,
            }
            internal_status = status_mapping.get(
                status_str, VideoGenerationStatus.PROCESSING
            )

            # 進捗計算
            progress_map = {
                VideoGenerationStatus.PENDING: 10,
                VideoGenerationStatus.PROCESSING: 50,
                VideoGenerationStatus.COMPLETED: 100,
                VideoGenerationStatus.FAILED: 0,
            }
            progress = progress_map.get(internal_status, 50)

            video_url = None
            error_message = None

            if internal_status == VideoGenerationStatus.COMPLETED:
                # MiniMax API: 完了時は file_id を返す
                # file_id を使って別途 /v1/files/retrieve で download_url を取得
                file_id = result.get("file_id")

                if file_id:
                    logger.info(f"Hailuo task completed with file_id: {file_id}")
                    video_url = await self._retrieve_file_url(file_id)
                    if video_url:
                        logger.info(f"Hailuo video URL retrieved successfully")
                    else:
                        logger.error(f"Failed to retrieve video URL for file_id: {file_id}")
                else:
                    # フォールバック: 一部APIは直接video_urlを返す可能性
                    video_url = result.get("video_url")
                    if video_url:
                        logger.info(f"Hailuo task completed with direct video_url")
                    else:
                        logger.warning(
                            f"Hailuo completed but no file_id or video_url found: {result}"
                        )

            elif internal_status == VideoGenerationStatus.FAILED:
                base_resp = result.get("base_resp", {})
                error_message = base_resp.get("status_msg", "動画生成に失敗しました")
                logger.error(f"Hailuo task failed: {error_message}")

            return VideoStatus(
                status=internal_status,
                progress=progress,
                video_url=video_url,
                error_message=error_message,
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"Hailuo status check HTTP error: {e.response.status_code}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"Hailuo status check failed: {e}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {str(e)}",
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """完了したタスクの動画URLを取得"""
        status = await self.check_status(task_id)
        return status.video_url

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        V2V代替実装: 動画の最終フレームを抽出してFirst Frameとして使用

        注意: この実装には事前に動画からフレーム抽出が必要
        呼び出し元（video_processor.py）で以下を実行:
        1. ffmpegで最終フレーム抽出
        2. R2にアップロード
        3. generate_video(first_frame_image=抽出画像URL) を呼び出し
        """
        raise NotImplementedError(
            "Hailuo extend_video requires pre-extracted last frame. "
            "Use generate_video with extracted frame URL instead."
        )

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """完了した動画をバイト形式でダウンロード"""
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
