"""
Topaz Video API Service

フレーム補間（60fps変換）およびアップスケール（Enhancement）機能を提供
"""

import logging
import asyncio
import tempfile
from typing import Optional, Literal
from pathlib import Path
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

TOPAZ_API_BASE = "https://api.topazlabs.com"

class TopazServiceError(Exception):
    """Topaz API エラー"""
    pass

class TopazVideoService:
    """Topaz Video API フレーム補間・アップスケールサービス"""

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """HTTPクライアントの再利用"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(600.0, connect=10.0),  # アップロード用に10分に延長
                limits=httpx.Limits(max_connections=10),
            )
        return self._client

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()

    def _get_headers(self) -> dict:
        """API認証ヘッダー（APIキーをログ出力しない）"""
        return {
            "X-API-Key": settings.TOPAZ_API_KEY,
            "Content-Type": "application/json",
        }

    async def _get_video_metadata(self, video_url: str) -> dict:
        """URLから動画メタデータを取得（ffprobe使用）"""
        import subprocess
        import json

        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_url,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0 and stdout:
                data = json.loads(stdout.decode())

                # 動画ストリームを探す
                video_stream = None
                for stream in data.get("streams", []):
                    if stream.get("codec_type") == "video":
                        video_stream = stream
                        break

                # 音声ストリームを探す
                audio_stream = None
                for stream in data.get("streams", []):
                    if stream.get("codec_type") == "audio":
                        audio_stream = stream
                        break

                if not video_stream:
                    raise TopazServiceError("動画ストリームが見つかりません")

                format_info = data.get("format", {})

                # フレームレートをパース（例: "30/1" → 30）
                frame_rate_str = video_stream.get("r_frame_rate", "30/1")
                if "/" in frame_rate_str:
                    num, den = frame_rate_str.split("/")
                    frame_rate = float(num) / float(den)
                else:
                    frame_rate = float(frame_rate_str)

                # フレーム数を計算
                duration = float(format_info.get("duration", 0))
                frame_count = int(duration * frame_rate)

                # ファイルサイズ
                size = int(format_info.get("size", 0))

                metadata = {
                    "container": "mp4",  # 通常mp4
                    "size": size,
                    "duration": duration,
                    "frameCount": frame_count,
                    "frameRate": round(frame_rate, 2),
                    "resolution": {
                        "width": video_stream.get("width", 1080),
                        "height": video_stream.get("height", 1920),
                    },
                    "hasAudio": audio_stream is not None,
                }
                logger.info(f"動画メタデータ取得成功: {metadata}")
                return metadata

        except Exception as e:
            logger.warning(f"動画メタデータ取得に失敗: {e}")

        # フォールバック：デフォルト値を返す
        logger.warning("フォールバック：デフォルトメタデータを使用")
        return {
            "container": "mp4",
            "size": 50000000,  # 50MB推定
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {
                "width": 1080,
                "height": 1920,
            },
            "hasAudio": True,
        }

    @staticmethod
    def calculate_target_resolution(
        source_width: int,
        source_height: int,
        scale_factor: int = 2,
    ) -> dict:
        """
        アスペクト比を維持した目標解像度を計算。
        偶数に丸め、H265上限(8192x8192)を考慮。

        Args:
            source_width: ソース幅
            source_height: ソース高さ
            scale_factor: 倍率 (2 or 4)

        Returns:
            dict: {"width": int, "height": int}
        """
        target_width = source_width * scale_factor
        target_height = source_height * scale_factor

        # H265上限: 8192x8192
        max_dim = 8192
        if target_width > max_dim or target_height > max_dim:
            # アスペクト比を維持して縮小
            ratio = min(max_dim / target_width, max_dim / target_height)
            target_width = int(target_width * ratio)
            target_height = int(target_height * ratio)

        # 偶数に丸める（動画エンコーダ要件）
        target_width = target_width + (target_width % 2)
        target_height = target_height + (target_height % 2)

        return {"width": target_width, "height": target_height}

    async def interpolate_to_60fps(
        self,
        video_url: str,
        model: Literal["apo-8", "chr-2", "apf-2", "chf-3"] = "apo-8",
        progress_callback: Optional[callable] = None,
    ) -> str:
        """
        動画を60fpsに補間

        Args:
            video_url: 入力動画URL
            model: 使用するAIモデル
            progress_callback: 進捗報告コールバック（60-90%の範囲で更新）

        Returns:
            str: 変換後の動画URL

        Raises:
            TopazServiceError: API呼び出しエラー
        """
        try:
            logger.info(f"Topaz 60fps補間開始: model={model}")

            # Step 0: 動画メタデータ取得
            video_metadata = await self._get_video_metadata(video_url)

            # Step 1: リクエスト作成
            request_id = await self._create_request(video_url, model, video_metadata)
            logger.info(f"Topaz リクエストID: {request_id}")

            # Step 2: アップロードURL取得
            upload_info = await self._accept_request(request_id)

            # Step 3: 動画をアップロード
            upload_results = await self._upload_video_streaming(video_url, upload_info)

            # Step 4: アップロード完了通知
            await self._complete_upload(request_id, upload_results)

            # 進捗報告（アップロード完了）
            if progress_callback:
                await progress_callback(65)

            # Step 5: 処理完了を待つ（ポーリング、20分に延長）
            download_url = await self._wait_for_completion(
                request_id,
                max_attempts=120,  # 10分 → 20分
                progress_callback=progress_callback,
            )

            logger.info(f"Topaz 60fps補間完了: {download_url}")
            return download_url

        except httpx.HTTPStatusError as e:
            logger.error(f"Topaz HTTP error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                raise TopazServiceError("APIキーが無効です。設定を確認してください。")
            elif e.response.status_code == 429:
                raise TopazServiceError("レート制限に達しました。しばらくしてからお試しください。")
            elif e.response.status_code == 413:
                raise TopazServiceError("動画サイズが500MBを超えています。")
            elif e.response.status_code == 402:
                raise TopazServiceError("Topazクレジットが不足しています。")
            raise TopazServiceError(f"Topaz API エラー: {e.response.text}")
        except Exception as e:
            logger.exception(f"Topaz補間処理失敗: {e}")
            raise TopazServiceError(f"フレーム補間に失敗しました: {str(e)}")

    async def enhance_video(
        self,
        video_url: str,
        model: str = "prob-4",
        scale_factor: int = 2,
        target_width: int | None = None,
        target_height: int | None = None,
        progress_callback: Optional[callable] = None,
    ) -> dict:
        """
        動画をアップスケール（Enhancement）

        Args:
            video_url: 入力動画URL
            model: Enhancementモデル (prob-4等)
            scale_factor: アップスケール倍率 (2 or 4) - target_width/height未指定時に使用
            target_width: 目標幅（直接指定時はscale_factorを無視）
            target_height: 目標高さ（直接指定時はscale_factorを無視）
            progress_callback: 進捗報告コールバック

        Returns:
            dict: {
                "download_url": str,
                "request_id": str,
                "estimated_credits_min": int,
                "estimated_credits_max": int,
                "estimated_time_min": int,
                "estimated_time_max": int,
            }

        Raises:
            TopazServiceError: API呼び出しエラー
        """
        try:
            logger.info(f"Topaz Enhancement開始: model={model}, scale={scale_factor}x")

            # Step 0: 動画メタデータ取得
            video_metadata = await self._get_video_metadata(video_url)

            # 目標解像度を計算（直接指定がなければscale_factorから計算）
            source_res = video_metadata.get("resolution", {"width": 1080, "height": 1920})
            if target_width is not None and target_height is not None:
                target_resolution = {"width": target_width, "height": target_height}
            else:
                target_resolution = self.calculate_target_resolution(
                    source_res["width"], source_res["height"], scale_factor
                )
            logger.info(f"Target resolution: {target_resolution}")

            # Step 1: Enhancementリクエスト作成
            request_result = await self._create_enhancement_request(
                video_url, model, target_resolution, video_metadata
            )
            request_id = request_result["request_id"]
            logger.info(f"Topaz Enhancement リクエストID: {request_id}")

            # Step 2: アップロードURL取得
            upload_info = await self._accept_request(request_id)

            # Step 3: 動画をアップロード
            upload_results = await self._upload_video_streaming(video_url, upload_info)

            # Step 4: アップロード完了通知
            await self._complete_upload(request_id, upload_results)

            # 進捗報告（アップロード完了）
            if progress_callback:
                await progress_callback(65)

            # Step 5: 処理完了を待つ（ポーリング、最大60分）
            download_url = await self._wait_for_completion(
                request_id,
                max_attempts=360,  # 60分（10秒間隔 x 360回）
                progress_callback=progress_callback,
            )

            logger.info(f"Topaz Enhancement完了: {download_url[:100]}...")
            return {
                "download_url": download_url,
                "request_id": request_id,
                "estimated_credits_min": request_result["estimated_credits_min"],
                "estimated_credits_max": request_result["estimated_credits_max"],
                "estimated_time_min": request_result["estimated_time_min"],
                "estimated_time_max": request_result["estimated_time_max"],
            }

        except httpx.HTTPStatusError as e:
            logger.error(f"Topaz HTTP error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 400:
                raise TopazServiceError("リクエスト形式が不正です。動画の仕様を確認してください。")
            elif e.response.status_code == 401:
                raise TopazServiceError("APIキーが無効です。設定を確認してください。")
            elif e.response.status_code == 402:
                raise TopazServiceError("Topazクレジットが不足しています。")
            elif e.response.status_code == 403:
                raise TopazServiceError("このリソースへのアクセス権限がありません。")
            elif e.response.status_code == 404:
                raise TopazServiceError("リクエストが見つかりません。")
            elif e.response.status_code == 413:
                raise TopazServiceError("動画サイズが500MBを超えています。")
            elif e.response.status_code == 429:
                raise TopazServiceError("レート制限に達しました。しばらくしてからお試しください。")
            elif e.response.status_code == 503:
                raise TopazServiceError("Topaz APIがメンテナンス中です。しばらくしてからお試しください。")
            raise TopazServiceError(f"Topaz API エラー: {e.response.text}")
        except Exception as e:
            logger.exception(f"Topaz Enhancement処理失敗: {e}")
            raise TopazServiceError(f"アップスケールに失敗しました: {str(e)}")

    async def _create_request(self, video_url: str, model: str, video_metadata: dict) -> str:
        """Step 1: リクエスト作成"""
        # 音声転送設定（音声なし動画に対応）
        audio_transfer = "Copy" if video_metadata.get("hasAudio", True) else "None"

        request_body = {
            "source": {
                "container": video_metadata.get("container", "mp4"),
                "size": int(video_metadata.get("size", 50000000)),  # int明示
                "duration": float(video_metadata.get("duration", 10.0)),  # float明示
                "frameCount": int(video_metadata.get("frameCount", 300)),  # int明示
                "frameRate": float(video_metadata.get("frameRate", 30.0)),  # float明示
                "resolution": video_metadata.get("resolution", {"width": 1080, "height": 1920}),
            },
            "filters": [{
                "model": model,
                "fps": 60,
                "slowmo": 1,
                "duplicate": True,
                "duplicateThreshold": 0.1,
            }],
            "output": {
                "resolution": video_metadata.get("resolution", {"width": 1080, "height": 1920}),
                "frameRate": int(video_metadata.get("frameRate", 30)),  # 元動画のフレームレート
                "audioCodec": "AAC",
                "audioTransfer": audio_transfer,
                "dynamicCompressionLevel": "High",
                "container": "mp4",
            },
        }

        logger.debug(f"Topaz request body: {request_body}")

        client = await self._get_client()
        response = await client.post(
            f"{TOPAZ_API_BASE}/video/",
            headers=self._get_headers(),
            json=request_body,
        )
        response.raise_for_status()
        result = response.json()
        logger.info(f"Topaz create_request response: {result}")
        return result["requestId"]

    async def _create_enhancement_request(
        self,
        video_url: str,
        model: str,
        target_resolution: dict,
        video_metadata: dict,
    ) -> dict:
        """
        Enhancement用リクエスト作成（Step 1）

        Returns:
            dict: {
                "request_id": str,
                "estimated_credits_min": int,
                "estimated_credits_max": int,
                "estimated_time_min": int,
                "estimated_time_max": int,
            }
        """
        audio_transfer = "Copy" if video_metadata.get("hasAudio", True) else "None"

        request_body = {
            "source": {
                "container": video_metadata.get("container", "mp4"),
                "size": int(video_metadata.get("size", 50000000)),
                "duration": float(video_metadata.get("duration", 10.0)),
                "frameCount": int(video_metadata.get("frameCount", 300)),
                "frameRate": float(video_metadata.get("frameRate", 30.0)),
                "resolution": video_metadata.get("resolution", {"width": 1080, "height": 1920}),
            },
            "filters": [{
                "model": model,
                "auto": "Auto",
                "videoType": "Progressive",
            }],
            "output": {
                "resolution": target_resolution,
                "frameRate": int(video_metadata.get("frameRate", 30)),
                "audioCodec": "AAC",
                "audioTransfer": audio_transfer,
                "videoEncoder": "H265",
                "dynamicCompressionLevel": "High",
                "container": "mp4",
            },
        }

        logger.debug(f"Topaz enhancement request body: {request_body}")

        client = await self._get_client()
        response = await client.post(
            f"{TOPAZ_API_BASE}/video/",
            headers=self._get_headers(),
            json=request_body,
        )
        response.raise_for_status()
        result = response.json()
        logger.info(f"Topaz create_enhancement_request response: {result}")

        # estimates.cost は [min, max] 配列
        estimates = result.get("estimates", {})
        cost = estimates.get("cost", [0, 0])
        time_est = estimates.get("time", [0, 0])

        return {
            "request_id": result["requestId"],
            "estimated_credits_min": cost[0] if isinstance(cost, list) and len(cost) > 0 else 0,
            "estimated_credits_max": cost[1] if isinstance(cost, list) and len(cost) > 1 else 0,
            "estimated_time_min": time_est[0] if isinstance(time_est, list) and len(time_est) > 0 else 0,
            "estimated_time_max": time_est[1] if isinstance(time_est, list) and len(time_est) > 1 else 0,
        }

    async def _accept_request(self, request_id: str) -> dict:
        """Step 2: アップロードURL取得"""
        client = await self._get_client()
        response = await client.patch(
            f"{TOPAZ_API_BASE}/video/{request_id}/accept",
            headers=self._get_headers(),
        )
        response.raise_for_status()
        result = response.json()
        logger.info(f"Topaz accept_request response: uploadUrls count={len(result.get('uploadUrls', []))}")
        return result

    async def _upload_video_streaming(self, video_url: str, upload_info: dict) -> list:
        """
        Step 3: 動画をアップロード

        Returns:
            list: uploadResults (partNum, eTag のリスト)
        """
        client = await self._get_client()
        upload_urls = upload_info.get("urls", upload_info.get("uploadUrls", []))

        if not upload_urls:
            raise TopazServiceError("アップロードURLが取得できませんでした")

        logger.info(f"Topaz upload: urls count={len(upload_urls)}")

        upload_results = []

        # 一時ファイルを使ってストリーミングダウンロード
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_video_path = Path(tmpdir) / "source_video.mp4"

            # ストリーミングダウンロード
            async with client.stream("GET", video_url) as response:
                response.raise_for_status()
                with open(tmp_video_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)

            logger.info(f"Downloaded video to temp file: {tmp_video_path}")

            # ファイル全体をアップロード（シングルパート）
            with open(tmp_video_path, "rb") as f:
                video_data = f.read()

            for i, upload_url in enumerate(upload_urls):
                logger.debug(f"Uploading to URL {i+1}/{len(upload_urls)}")
                upload_response = await client.put(
                    upload_url,
                    content=video_data,
                    timeout=600.0,
                )
                upload_response.raise_for_status()

                # eTagを取得（S3レスポンスヘッダーから）
                etag = upload_response.headers.get("ETag", "").strip('"')
                upload_results.append({
                    "partNum": i + 1,
                    "eTag": etag,
                })
                logger.info(f"Upload part {i+1} completed, eTag: {etag}")

        logger.info("Topaz upload completed")
        return upload_results

    async def _complete_upload(self, request_id: str, upload_results: list) -> None:
        """Step 4: アップロード完了通知"""
        client = await self._get_client()
        response = await client.patch(
            f"{TOPAZ_API_BASE}/video/{request_id}/complete-upload/",
            headers=self._get_headers(),
            json={"uploadResults": upload_results},
        )
        response.raise_for_status()
        logger.info("Topaz upload complete notification sent")

    async def _wait_for_completion(
        self,
        request_id: str,
        max_attempts: int = 360,  # 60分（10秒間隔 × 360回）
        poll_interval: int = 10,
        progress_callback: Optional[callable] = None,
    ) -> str:
        """
        Step 5: 処理完了をポーリング

        進捗を60-90%の範囲で更新
        """
        client = await self._get_client()

        for attempt in range(max_attempts):
            await asyncio.sleep(poll_interval)

            response = await client.get(
                f"{TOPAZ_API_BASE}/video/{request_id}/status",
                headers=self._get_headers(),
            )
            response.raise_for_status()
            status_data = response.json()

            status = status_data.get("status")
            progress_pct = status_data.get("progress", 0)
            
            # 詳細ログ出力（1分ごと、または状態変化時）
            if attempt % 6 == 0 or attempt < 3:
                logger.info(
                    f"Topaz status [{attempt+1}/{max_attempts}]: "
                    f"status={status}, progress={progress_pct}%, "
                    f"elapsed={attempt * poll_interval}s"
                )

            # 進捗報告（60-90%の範囲）
            if progress_callback:
                progress = 60 + int((attempt / max_attempts) * 30)
                await progress_callback(min(progress, 90))

            # APIは "complete" を返す（"completed" ではない）
            if status in ("complete", "completed"):
                # download.url または downloadUrl からURLを取得
                download_info = status_data.get("download", {})
                download_url = download_info.get("url") or status_data.get("downloadUrl")
                
                if not download_url:
                    logger.error(f"Topaz response missing download URL: {status_data}")
                    raise TopazServiceError("TopazAPIからダウンロードURLが返されませんでした")
                
                logger.info(f"Topaz processing completed: {download_url[:100]}...")
                return download_url
            elif status == "failed":
                error = status_data.get("error", "Unknown error")
                logger.error(f"Topaz processing failed: {error}")
                raise TopazServiceError(f"処理に失敗しました: {error}")

        raise TopazServiceError("処理がタイムアウトしました（60分）")

    async def cancel_task(self, request_id: str) -> bool:
        """
        タスクをキャンセル

        Args:
            request_id: Topaz リクエストID

        Returns:
            bool: キャンセル成功時True
        """
        try:
            client = await self._get_client()
            response = await client.delete(
                f"{TOPAZ_API_BASE}/video/{request_id}",
                headers=self._get_headers(),
            )
            response.raise_for_status()
            logger.info(f"Topaz task cancelled: {request_id}")
            return True
        except Exception as e:
            logger.error(f"Topaz cancel failed: {e}")
            return False

    async def estimate_cost(self, video_url: str) -> dict:
        """
        処理コストを事前見積もり

        Args:
            video_url: 動画URL

        Returns:
            dict: {"credits": int, "processing_time_minutes": int}
        """
        # TODO: Topaz APIのコスト見積もりエンドポイントを実装
        # 現在は概算値を返す
        return {
            "credits": 15,  # 概算
            "processing_time_minutes": 5,  # 概算
        }

    async def estimate_enhancement_cost(
        self,
        video_url: str,
        model: str = "prob-4",
        scale_factor: int = 2,
    ) -> dict:
        """
        Enhancement処理コストを事前見積もり（Step 1のみ実行、クレジット消費なし）

        Returns:
            dict: {
                "request_id": str,
                "estimated_credits_min": int,
                "estimated_credits_max": int,
                "estimated_time_min": int,
                "estimated_time_max": int,
                "target_width": int,
                "target_height": int,
            }
        """
        video_metadata = await self._get_video_metadata(video_url)
        source_res = video_metadata.get("resolution", {"width": 1080, "height": 1920})
        target_resolution = self.calculate_target_resolution(
            source_res["width"], source_res["height"], scale_factor
        )

        result = await self._create_enhancement_request(
            video_url, model, target_resolution, video_metadata
        )

        # try/finallyでキャンセルを保証（クレジット消費防止）
        try:
            return {
                **result,
                "target_width": target_resolution["width"],
                "target_height": target_resolution["height"],
            }
        finally:
            # キャンセル失敗してもクラッシュさせない
            cancelled = await self.cancel_task(result["request_id"])
            if not cancelled:
                logger.warning(
                    f"Failed to cancel estimate request {result['request_id']}. "
                    "Credits may be consumed."
                )


# 後方互換性のためのエイリアス
TopazInterpolationService = TopazVideoService

# シングルトンインスタンス
_topaz_service = None

def get_topaz_service() -> TopazVideoService:
    """TopazVideoServiceのシングルトンインスタンスを取得"""
    global _topaz_service
    if _topaz_service is None:
        _topaz_service = TopazVideoService()
    return _topaz_service
