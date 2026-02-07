"""
Runway API Provider for Video Generation

VideoProviderInterfaceを実装したRunway APIプロバイダー
"""

import logging
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

# Runway API設定
RUNWAY_API_BASE = "https://api.dev.runwayml.com"
RUNWAY_API_VERSION = "2024-11-06"

# アイデンティティ保持プレフィックス（元画像の要素のみ維持）
# 注: 穏やかな表現でコンテンツモデレーションを回避
IDENTITY_PRESERVATION_PREFIX = (
    "Preserve exact appearance from reference image. "
    "Same face, same hair, same clothing. "
)

# 品質向上サフィックス（クレジット消費を増やさずに品質向上）
# 映画的な表現キーワードを追加
QUALITY_SUFFIX = (
    " Cinematic quality, natural lighting, smooth motion, "
    "photorealistic details, professional cinematography, "
    "subtle camera movement, film grain, shallow depth of field."
)


class RunwayProvider(VideoProviderInterface):
    """Runway API を使用した動画生成プロバイダー"""

    @property
    def provider_name(self) -> str:
        return "runway"

    @property
    def supports_v2v(self) -> bool:
        """Runway は gen4_aleph モデルで V2V をサポート"""
        return True

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得"""
        return {
            "Authorization": f"Bearer {settings.RUNWAY_API_KEY}",
            "X-Runway-Version": RUNWAY_API_VERSION,
            "Content-Type": "application/json",
        }

    def _convert_aspect_ratio(self, aspect_ratio: str) -> str:
        """
        アスペクト比をRunway API形式に変換

        Args:
            aspect_ratio: "9:16" or "16:9" 形式

        Returns:
            str: "720:1280" or "1280:720" 形式
        """
        ratio_mapping = {
            "9:16": "720:1280",
            "16:9": "1280:720",
            "1:1": "720:720",
        }
        return ratio_mapping.get(aspect_ratio, "720:1280")

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        Runway API で画像から動画を生成

        Args:
            image_url: 入力画像URL
            prompt: 動画生成プロンプト
            duration: 動画長さ（5-10秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9")
            camera_work: カメラワーク名（オプション）

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            # カメラワークをプロンプトに追加（Runway用）
            full_prompt = build_prompt_with_camera(prompt, camera_work, provider="runway")

            # アイデンティティ保持プレフィックスを追加
            full_prompt = IDENTITY_PRESERVATION_PREFIX + full_prompt

            # 品質向上サフィックスを追加
            full_prompt = full_prompt + QUALITY_SUFFIX

            # プロンプト長さ制限（1000文字）
            if len(full_prompt) > 1000:
                full_prompt = full_prompt[:997] + "..."
                logger.warning("Prompt truncated to 1000 chars")

            # アスペクト比を変換
            ratio = self._convert_aspect_ratio(aspect_ratio)

            request_body = {
                "model": "gen4_turbo",
                "promptImage": image_url,
                "promptText": full_prompt,
                "duration": duration,
                "ratio": ratio,
                # Note: motionScore は公式パラメータではないため削除
            }

            logger.info(f"Runway request_body: {request_body}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{RUNWAY_API_BASE}/v1/image_to_video",
                    headers=self._get_headers(),
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

                raise VideoProviderError("Runway APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"Runway HTTP error: {e.response.status_code} - {e.response.text}")
            # Parse error message for user-friendly feedback
            try:
                error_data = e.response.json()
                error_msg = error_data.get("error", "")
                issues = error_data.get("issues", [])
                if issues:
                    issue_msgs = [issue.get("message", "") for issue in issues if issue.get("message")]
                    if issue_msgs:
                        error_msg = "; ".join(issue_msgs)

                if "aspect ratio" in error_msg.lower():
                    raise VideoProviderError("画像のアスペクト比が不正です。縦横比が1:2以上の画像をお使いください。")
                if "credits" in error_msg.lower():
                    raise VideoProviderError("Runwayのクレジットが不足しています。")
                if "daily" in error_msg.lower() and "limit" in error_msg.lower():
                    raise VideoProviderError("Runwayの1日の使用制限に達しました。")
                raise VideoProviderError(f"Runway API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"Runway API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Runway video generation failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

    async def generate_video_act_two(
        self,
        image_url: str,
        motion_url: str,
        expression_intensity: int = 3,
        body_control: bool = True,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        Runway Act-Two API でキャラクターパフォーマンス動画を生成

        Act-Twoはパフォーマンス動画（モーション）を使ってキャラクターを動かす。
        テキストプロンプトではなく、実際の人間の動きを転写する精密な制御が可能。

        Args:
            image_url: キャラクター画像URL
            motion_url: パフォーマンス動画URL（R2に保存されたモーション動画）
            expression_intensity: 表情の強度（1-5、デフォルト3）
            body_control: ボディモーション転写の有効化（デフォルトTrue）
            aspect_ratio: アスペクト比（"9:16", "16:9", "1:1"）

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            ratio = self._convert_aspect_ratio(aspect_ratio)

            request_body = {
                "model": "act_two",
                "character": {
                    "type": "image",
                    "uri": image_url,
                },
                "reference": {
                    "type": "video",
                    "uri": motion_url,
                },
                "ratio": ratio,
                "expressionIntensity": expression_intensity,
                "bodyControl": body_control,
            }

            logger.info(f"Act-Two request: model=act_two, ratio={ratio}, expressionIntensity={expression_intensity}, bodyControl={body_control}")
            logger.debug(f"Act-Two full request_body: {request_body}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{RUNWAY_API_BASE}/v1/character_performance",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Act-Two response: {result}")

                task_id = result.get("id")
                if task_id:
                    logger.info(f"Act-Two task created: {task_id}")
                    return task_id

                raise VideoProviderError("Act-Two APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"Act-Two HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                error_msg = error_data.get("error", "")
                issues = error_data.get("issues", [])
                if issues:
                    issue_msgs = [issue.get("message", "") for issue in issues if issue.get("message")]
                    if issue_msgs:
                        error_msg = "; ".join(issue_msgs)

                if "face" in error_msg.lower():
                    raise VideoProviderError("キャラクター画像に認識可能な顔が必要です。")
                if "credits" in error_msg.lower():
                    raise VideoProviderError("Runwayのクレジットが不足しています。")
                raise VideoProviderError(f"Act-Two API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"Act-Two API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Act-Two video generation failed: {e}")
            raise VideoProviderError(f"Act-Two動画生成に失敗しました: {str(e)}")

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
                    f"{RUNWAY_API_BASE}/v1/tasks/{task_id}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

                # Runwayのステータスを内部ステータスに変換
                runway_status = result.get("status", "").upper()

                status_mapping = {
                    "PENDING": VideoGenerationStatus.PENDING,
                    "RUNNING": VideoGenerationStatus.PROCESSING,
                    "SUCCEEDED": VideoGenerationStatus.COMPLETED,
                    "FAILED": VideoGenerationStatus.FAILED,
                    "THROTTLED": VideoGenerationStatus.PENDING,
                }

                internal_status = status_mapping.get(runway_status, VideoGenerationStatus.PROCESSING)

                # 進捗を推定（Runwayは進捗を返さないため推定値を使用）
                progress = 0
                if internal_status == VideoGenerationStatus.PENDING:
                    progress = 10
                elif internal_status == VideoGenerationStatus.PROCESSING:
                    progress = 50
                elif internal_status == VideoGenerationStatus.COMPLETED:
                    progress = 100
                elif internal_status == VideoGenerationStatus.FAILED:
                    progress = 0

                video_url = None
                error_message = None

                if internal_status == VideoGenerationStatus.COMPLETED:
                    output = result.get("output", [])
                    if output and len(output) > 0:
                        video_url = output[0]
                        logger.info(f"Runway task completed: {video_url}")
                elif internal_status == VideoGenerationStatus.FAILED:
                    error_message = result.get("failure", "動画生成に失敗しました")
                    logger.error(f"Runway task failed: {error_message}")

                return VideoStatus(
                    status=internal_status,
                    progress=progress,
                    video_url=video_url,
                    error_message=error_message,
                )

        except httpx.HTTPStatusError as e:
            logger.error(f"Runway status check HTTP error: {e.response.status_code} - {e.response.text}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"Runway status check failed: {e}")
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

    def _convert_aspect_ratio_v2v(self, aspect_ratio: str) -> str:
        """
        V2V用のframe_size変換（gen4_alephはframe_sizeパラメータを使用）

        Args:
            aspect_ratio: "9:16" or "16:9" 形式

        Returns:
            str: "720:1280" or "1280:720" 形式
        """
        ratio_mapping = {
            "9:16": "720:1280",
            "16:9": "1280:720",
            "1:1": "960:960",
        }
        return ratio_mapping.get(aspect_ratio, "720:1280")

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        Runway gen4_aleph を使用したV2V（Video-to-Video）生成

        前のシーンの動画を入力として、次のシーンの動画を生成する。
        シーン間の連続性を維持するために使用。

        Args:
            video_url: 入力動画のURL（前のシーンの動画）
            prompt: 動画生成プロンプト
            aspect_ratio: アスペクト比 ("9:16", "16:9")

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合

        Note:
            gen4_aleph は Duration 5秒固定のため、duration パラメータは不要
        """
        try:
            # プロンプト長さ制限（1000文字）
            if len(prompt) > 1000:
                prompt = prompt[:997] + "..."
                logger.warning("V2V prompt truncated to 1000 chars")

            # アスペクト比を変換（V2V用）
            frame_size = self._convert_aspect_ratio_v2v(aspect_ratio)

            # gen4_aleph 用リクエストボディ
            # 注意: パラメータ名が I2V (gen4_turbo) と異なる
            request_body = {
                "model": "gen4_aleph",
                "video_url": video_url,      # I2Vの promptImage ではなく video_url
                "prompt": prompt,             # I2Vの promptText ではなく prompt
                "frame_size": frame_size,     # I2Vの ratio ではなく frame_size
                # duration: gen4_aleph は 5秒固定のため指定不要
            }

            logger.info(f"Runway V2V request_body: {request_body}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{RUNWAY_API_BASE}/v1/video_to_video",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Runway V2V response: {result}")

                task_id = result.get("id")
                if task_id:
                    logger.info(f"Runway V2V task created: {task_id}")
                    return task_id

                raise VideoProviderError("Runway V2V APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"Runway V2V HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                error_msg = error_data.get("error", "")
                issues = error_data.get("issues", [])
                if issues:
                    issue_msgs = [issue.get("message", "") for issue in issues if issue.get("message")]
                    if issue_msgs:
                        error_msg = "; ".join(issue_msgs)

                if "video" in error_msg.lower() and "invalid" in error_msg.lower():
                    raise VideoProviderError("入力動画が無効です。動画URLを確認してください。")
                if "credits" in error_msg.lower():
                    raise VideoProviderError("Runwayのクレジットが不足しています。")
                if "daily" in error_msg.lower() and "limit" in error_msg.lower():
                    raise VideoProviderError("Runwayの1日の使用制限に達しました。")
                raise VideoProviderError(f"Runway V2V API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"Runway V2V API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Runway V2V generation failed: {e}")
            raise VideoProviderError(f"V2V動画生成に失敗しました: {str(e)}")

    async def upscale_video(self, video_url: str) -> str:
        """
        Runway Upscale v1 を使用して動画を4Kにアップスケール

        Args:
            video_url: 入力動画のURL

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: アップスケール開始に失敗した場合

        Note:
            - 4倍アップスケール（最大4096px）
            - 入力動画は40秒以内
            - 処理時間: 約1〜2分
        """
        try:
            request_body = {
                "model": "upscale_v1",
                "videoUri": video_url,
            }

            logger.info(f"Runway upscale request: {request_body}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{RUNWAY_API_BASE}/v1/video_upscale",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Runway upscale response: {result}")

                task_id = result.get("id")
                if task_id:
                    logger.info(f"Runway upscale task created: {task_id}")
                    return task_id

                raise VideoProviderError("Runway Upscale APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"Runway upscale HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                error_msg = error_data.get("error", "")
                issues = error_data.get("issues", [])
                if issues:
                    issue_msgs = [issue.get("message", "") for issue in issues if issue.get("message")]
                    if issue_msgs:
                        error_msg = "; ".join(issue_msgs)

                if "duration" in error_msg.lower() or "40" in error_msg:
                    raise VideoProviderError("動画が長すぎます。40秒以内の動画のみアップスケールできます。")
                if "credits" in error_msg.lower():
                    raise VideoProviderError("Runwayのクレジットが不足しています。")
                raise VideoProviderError(f"Runway Upscale API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"Runway Upscale API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Runway upscale failed: {e}")
            raise VideoProviderError(f"動画アップスケールに失敗しました: {str(e)}")

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了したタスクの動画をダウンロード

        Args:
            task_id: タスクID

        Returns:
            bytes: 動画データ（失敗時はNone）
        """
        try:
            status = await self.check_status(task_id)
            if not status.video_url:
                logger.warning(f"No video URL for task {task_id}")
                return None

            async with httpx.AsyncClient() as client:
                # Runway SDKの認証付きでダウンロード
                response = await client.get(
                    status.video_url,
                    headers=self._get_headers(),
                    timeout=120.0,
                    follow_redirects=True,
                )
                response.raise_for_status()
                return response.content

        except Exception as e:
            logger.exception(f"Failed to download video for task {task_id}: {e}")
            return None
