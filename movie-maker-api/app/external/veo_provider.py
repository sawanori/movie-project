"""
Google Gemini Veo 3 API Provider for Video Generation

VideoProviderInterfaceを実装したVeo 3 APIプロバイダー
Google AI Python SDK (google-genai) を使用
"""

import logging
import asyncio
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

# Veo 3.1モデル設定（最新版）
# veo-3.1-generate-preview が過負荷の場合、fast版を使用
VEO_MODELS = [
    "veo-3.1-generate-preview",       # 通常版（高品質）
    "veo-3.1-fast-generate-preview",  # 高速版（やや低品質だが安定）
    "veo-3.0-generate-001",           # Veo 3.0 フォールバック
]
VEO_MODEL = VEO_MODELS[0]  # デフォルト


class VeoProvider(VideoProviderInterface):
    """Google Gemini Veo 3 API を使用した動画生成プロバイダー"""

    def __init__(self):
        self._client = None
        self._pending_operations = {}  # task_id -> operation mapping

    @property
    def provider_name(self) -> str:
        return "veo"

    def _get_client(self):
        """Google GenAI クライアントを取得（遅延初期化）"""
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=settings.GOOGLE_API_KEY)
            except ImportError:
                raise VideoProviderError(
                    "google-genai パッケージがインストールされていません。"
                    "pip install google-genai を実行してください。"
                )
        return self._client

    async def _download_image(self, image_url: str) -> bytes:
        """画像をダウンロード（リダイレクト対応）"""
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                response = await client.get(image_url, timeout=60.0)
                response.raise_for_status()
                return response.content
        except Exception as e:
            logger.exception(f"Failed to download image: {e}")
            raise VideoProviderError(f"画像のダウンロードに失敗しました: {str(e)}")

    def _get_mime_type(self, image_url: str) -> str:
        """画像URLからMIMEタイプを推定"""
        lower_url = image_url.lower()
        if ".png" in lower_url:
            return "image/png"
        elif ".gif" in lower_url:
            return "image/gif"
        elif ".webp" in lower_url:
            return "image/webp"
        return "image/jpeg"

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        Veo 3 API で画像から動画を生成

        Args:
            image_url: 入力画像URL
            prompt: 動画生成プロンプト
            duration: 動画長さ（Veo 3は8秒固定のため無視）
            aspect_ratio: アスペクト比 ("9:16", "16:9")
            camera_work: カメラワーク名（オプション）

        Returns:
            str: オペレーション名（ポーリング用識別子）

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            from google import genai
            from google.genai import types

            client = self._get_client()

            # カメラワークをプロンプトに追加（VEO用フォールバック適用）
            full_prompt = build_prompt_with_camera(prompt, camera_work, provider="veo")

            # 画像をダウンロード
            logger.info(f"Downloading image for Veo: {image_url}")
            image_bytes = await self._download_image(image_url)
            mime_type = self._get_mime_type(image_url)

            logger.info(f"Image downloaded, size: {len(image_bytes)} bytes, mime: {mime_type}")

            # types.Imageを使用してバイト形式の画像を渡す
            image_data = types.Image(
                imageBytes=image_bytes,
                mimeType=mime_type,
            )

            # 複数モデルでフォールバック試行
            last_error = None
            for model_name in VEO_MODELS:
                try:
                    logger.info(f"Trying Veo model: {model_name}, prompt: {full_prompt[:100]}...")

                    # 同期APIを非同期で実行
                    def _generate(m=model_name):
                        return client.models.generate_videos(
                            model=m,
                            prompt=full_prompt,
                            image=image_data,
                            config=types.GenerateVideosConfig(
                                aspect_ratio=aspect_ratio,
                                number_of_videos=1,
                            ),
                        )

                    operation = await asyncio.get_event_loop().run_in_executor(None, _generate)

                    # オペレーション名を取得
                    operation_name = operation.name
                    if not operation_name:
                        logger.warning(f"Model {model_name} returned no operation name, trying next...")
                        continue

                    # operationをキャッシュに保存（ポーリング用）
                    self._pending_operations[operation_name] = operation

                    logger.info(f"Veo operation created with {model_name}: {operation_name}")
                    return operation_name

                except Exception as e:
                    error_str = str(e).lower()
                    logger.warning(f"Model {model_name} failed: {e}")
                    last_error = e
                    # 過負荷エラーの場合は次のモデルを試す
                    if "overload" in error_str or "quota" in error_str or "limit" in error_str:
                        logger.info(f"Model {model_name} is overloaded, trying next model...")
                        continue
                    # その他のエラーは再スロー
                    raise

            # 全モデルが失敗した場合
            raise VideoProviderError(f"全てのVeoモデルが利用不可です。しばらく待ってから再試行してください。: {last_error}")

        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"Veo 3 video generation failed: {e}")
            error_msg = str(e)
            if "quota" in error_msg.lower() or "limit" in error_msg.lower():
                raise VideoProviderError("Veo APIの使用制限に達しました。")
            if "billing" in error_msg.lower() or "paid" in error_msg.lower():
                raise VideoProviderError(
                    "Veo 3は有料プラン（Paid tier）が必要です。"
                    "Google AI Studioで有料プランに登録してください。"
                )
            raise VideoProviderError(f"動画生成に失敗しました: {error_msg}")

    async def check_status(self, task_id: str) -> VideoStatus:
        """
        動画生成オペレーションの進捗を確認

        Args:
            task_id: オペレーション名

        Returns:
            VideoStatus: 現在のステータス情報
        """
        try:
            client = self._get_client()

            # キャッシュからoperationを取得
            operation = self._pending_operations.get(task_id)

            if operation is None:
                # キャッシュにない場合はエラー（operationオブジェクトが必要）
                logger.error(f"Operation not found in cache: {task_id}")
                return VideoStatus(
                    status=VideoGenerationStatus.FAILED,
                    progress=0,
                    error_message="オペレーションがキャッシュにありません。再度動画生成を開始してください。",
                )

            # 最新の状態を取得
            def _refresh_operation():
                return client.operations.get(operation)

            operation = await asyncio.get_event_loop().run_in_executor(None, _refresh_operation)
            self._pending_operations[task_id] = operation

            # 完了チェック
            if not operation.done:
                return VideoStatus(
                    status=VideoGenerationStatus.PROCESSING,
                    progress=50,
                )

            # デバッグ用：operationの内容をログ出力
            logger.info(f"Veo operation done: {operation.done}, error: {operation.error}, response type: {type(operation.response)}")

            # エラーチェック（dictまたはオブジェクト両方に対応）
            if operation.error:
                error = operation.error
                if isinstance(error, dict):
                    error_message = error.get("message", str(error))
                elif hasattr(error, 'message'):
                    error_message = str(error.message) if error.message else "動画生成に失敗しました"
                else:
                    error_message = str(error)
                logger.error(f"Veo operation failed: {error_message}")
                # キャッシュから削除
                self._pending_operations.pop(task_id, None)
                return VideoStatus(
                    status=VideoGenerationStatus.FAILED,
                    progress=0,
                    error_message=error_message,
                )

            # 成功 - 動画URLを取得
            response = operation.response
            logger.info(f"Veo response: {response}")

            # responseがdictの場合とオブジェクトの場合両方に対応
            generated_videos = None
            if isinstance(response, dict):
                generated_videos = response.get('generated_videos') or response.get('generatedVideos')
            elif hasattr(response, 'generated_videos'):
                generated_videos = response.generated_videos

            if generated_videos and len(generated_videos) > 0:
                video = generated_videos[0]
                video_uri = None

                # videoがdictの場合とオブジェクトの場合両方に対応
                if isinstance(video, dict):
                    video_data = video.get('video', {})
                    if isinstance(video_data, dict):
                        video_uri = video_data.get('uri')
                    elif hasattr(video_data, 'uri'):
                        video_uri = video_data.uri
                elif hasattr(video, 'video') and video.video:
                    if hasattr(video.video, 'uri'):
                        video_uri = video.video.uri
                    elif hasattr(video.video, 'name'):
                        video_uri = f"gemini://files/{video.video.name}"

                if video_uri:
                    logger.info(f"Veo operation completed: {video_uri}")
                    # 注意：キャッシュはdownload_video_bytes後に削除
                    return VideoStatus(
                        status=VideoGenerationStatus.COMPLETED,
                        progress=100,
                        video_url=video_uri,
                    )

            # 結果が見つからない
            logger.warning(f"Veo operation completed but no video found. Response: {response}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message="動画の生成結果が見つかりませんでした",
            )

        except Exception as e:
            logger.exception(f"Veo status check failed: {e}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {str(e)}",
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画URLを取得

        Args:
            task_id: オペレーション名

        Returns:
            str: 動画URL（未完了の場合はNone）
        """
        status = await self.check_status(task_id)
        return status.video_url

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了した動画をバイト形式でダウンロード

        Args:
            task_id: オペレーション名

        Returns:
            bytes: 動画コンテンツ（失敗時はNone）
        """
        try:
            client = self._get_client()
            operation = self._pending_operations.get(task_id)

            if operation is None:
                logger.error(f"Operation not found in cache: {task_id}")
                return None

            if not operation.done:
                logger.error(f"Operation not completed: {task_id}")
                return None

            response = operation.response

            # responseがdictの場合とオブジェクトの場合両方に対応
            generated_videos = None
            if isinstance(response, dict):
                generated_videos = response.get('generated_videos') or response.get('generatedVideos')
            elif hasattr(response, 'generated_videos'):
                generated_videos = response.generated_videos

            if not generated_videos or len(generated_videos) == 0:
                logger.error(f"No generated videos in response")
                return None

            video = generated_videos[0]

            # videoオブジェクトからダウンロード
            def _download():
                # videoがdictの場合
                if isinstance(video, dict):
                    video_obj = video.get('video')
                    if video_obj:
                        return client.files.download(file=video_obj)
                # videoがオブジェクトの場合
                elif hasattr(video, 'video') and video.video:
                    return client.files.download(file=video.video)
                return None

            video_bytes = await asyncio.get_event_loop().run_in_executor(None, _download)

            if video_bytes:
                logger.info(f"Video downloaded: {len(video_bytes)} bytes")
                # ダウンロード成功後にキャッシュから削除
                self._pending_operations.pop(task_id, None)
                return video_bytes
            else:
                logger.error(f"Failed to download video bytes")
                return None

        except Exception as e:
            logger.exception(f"Video download failed: {e}")
            return None

    async def download_video(self, task_id: str, output_path: str) -> bool:
        """
        完了した動画をファイルにダウンロード

        Args:
            task_id: オペレーション名
            output_path: 保存先パス

        Returns:
            bool: 成功/失敗
        """
        video_bytes = await self.download_video_bytes(task_id)
        if video_bytes:
            with open(output_path, 'wb') as f:
                f.write(video_bytes)
            logger.info(f"Video saved to: {output_path}")
            return True
        return False
