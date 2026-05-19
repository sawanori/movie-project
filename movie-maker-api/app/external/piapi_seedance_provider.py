"""
PiAPI Seedance 2.0 Video Provider

PiAPI経由で Seedance 2.0 モデルによる動画生成を行うプロバイダー。
VideoProviderInterface を実装。

認証: PIAPI_API_KEY (既存設定と共用)
サポートパラメータ (UI から制御可能):
  - prompt / duration (4-15秒、1秒刻み) / aspect_ratio / resolution
  - seedance_mode (pro/fast)、generate_audio (BGM)、seed (再現性)、camerafixed
  - 1080p は -vip task_type 必須 (router で 422 reject)
  - omni_reference (image_urls / video_urls / audio_urls) -- VIP モデル必須

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

DURATION_MIN = 4
DURATION_MAX = 15

# Omni reference 上限 (v3 §6.2)
MAX_IMAGE_URLS = 9
MAX_VIDEO_URLS = 3
MAX_AUDIO_URLS = 3
MAX_VIDEO_TOTAL_SECONDS = 15.4
MAX_AUDIO_TOTAL_SECONDS = 15.0  # v3: PiAPI 公式 spec (合計)


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

    def _resolve_task_type(self, mode: Optional[str]) -> str:
        """
        mode と env の組合せから task_type を決定する。
        env の VIP suffix は維持し、preview <-> fast-preview だけ置換する。

        例:
            env=seedance-2-preview-vip + mode='fast' → seedance-2-fast-preview-vip
            env=seedance-2-fast-preview-vip + mode='pro' → seedance-2-preview-vip
            env=seedance-2-preview + mode='fast' → seedance-2-fast-preview
            mode=None → env そのまま
        """
        base = self.task_type
        if mode is None:
            return base
        if mode == 'pro':
            return base.replace('-fast-preview', '-preview')
        if mode == 'fast':
            if '-fast-preview' in base:
                return base
            return base.replace('-preview', '-fast-preview')
        raise ValueError(f"Invalid seedance mode: {mode}")

    @property
    def supports_t2v(self) -> bool:
        """Seedance は T2V をサポート（image_urls を省略）"""
        return True

    def _get_headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def _post_task(self, payload: dict) -> str:
        """
        PiAPI /task に POST し task_id を返す共通ヘルパー。

        Rule of Three に従い、generate_video / generate_video_from_text /
        generate_video_with_omni_references で共通化された
        `httpx POST → task_id 抽出 → エラーマッピング` フロー。

        Raises:
            VideoProviderError: HTTP エラー or 想定外例外
        """
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
            logger.exception(f"Seedance _post_task failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
        mode: Optional[str] = None,
        generate_audio: bool = False,
        seed: Optional[int] = None,
        resolution: Optional[str] = None,
        camera_fixed: Optional[bool] = None,
    ) -> str:
        """
        Seedance 2.0 で画像+プロンプトから動画を生成

        Args:
            image_url: 先頭フレーム画像 URL
            prompt: 動画生成プロンプト（最大4000文字）
            duration: 動画長さ（秒）。4-15 の範囲でクランプ。
            aspect_ratio: アスペクト比 ("9:16" | "16:9" | "4:3" | "3:4")
            camera_work: 無視（Seedanceはプロンプト追従のみ）
            mode: モデルモード ('pro' | 'fast' | None)。None の場合は env デフォルト採用。
            generate_audio: BGM 自動生成 ON/OFF (default: False)
            seed: 再現性用シード値 (None=ランダム)
            resolution: 出力解像度 ('480p' | '720p' | '1080p')。None の場合は env fallback。
            camera_fixed: カメラ固定モード (default: None=False 相当)

        Returns:
            str: task_id

        Raises:
            VideoProviderError: タスク作成失敗
            ValueError: resolution=1080p かつ 非 VIP task_type
        """
        if camera_work:
            logger.warning(f"Seedance: camera_work '{camera_work}' ignored (prompt-only)")

        task_type = self._resolve_task_type(mode)
        # C-1 修正: VALID_DURATIONS 廃止、4-15 範囲クランプで透過送信
        clamped_duration = max(DURATION_MIN, min(DURATION_MAX, int(duration)))

        # resolution: UI 指定 > env (フォールバック)
        effective_resolution = resolution or self.resolution

        input_payload: dict = {
            "prompt": prompt[:4000],
            "duration": clamped_duration,
            "aspect_ratio": aspect_ratio,
            "image_urls": [image_url],
        }

        if task_type.endswith("-vip"):
            input_payload["resolution"] = effective_resolution
        elif effective_resolution == '1080p':
            # 非 VIP env で 1080p が来た場合は例外 (正常系では backend で弾かれるが safety net)
            raise ValueError(
                "resolution=1080p requires VIP plan. "
                "Either change resolution to 480p/720p or set PIAPI_SEEDANCE_TASK_TYPE to a -vip variant."
            )

        # 常に generate_audio を送信
        input_payload["generate_audio"] = generate_audio
        if seed is not None:
            input_payload["seed"] = seed
        if camera_fixed is not None:
            input_payload["camerafixed"] = camera_fixed

        payload = {
            "model": "seedance",
            "task_type": task_type,
            "input": input_payload,
            "config": {"service_mode": "public"},
        }

        return await self._post_task(payload)

    async def generate_video_from_text(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        mode: Optional[str] = None,
        generate_audio: bool = False,
        seed: Optional[int] = None,
        resolution: Optional[str] = None,
        camera_fixed: Optional[bool] = None,
    ) -> str:
        """
        Seedance T2V: image_urls を送信しない

        Args:
            prompt: 動画生成プロンプト（最大4000文字）
            duration: 動画長さ（秒）。4-15 の範囲でクランプ。
            aspect_ratio: アスペクト比 ("9:16" | "16:9" | "4:3" | "3:4")
            mode: モデルモード ('pro' | 'fast' | None)。None の場合は env デフォルト採用。
            generate_audio: BGM 自動生成 ON/OFF (default: False)
            seed: 再現性用シード値 (None=ランダム)
            resolution: 出力解像度 ('480p' | '720p' | '1080p')。None の場合は env fallback。
            camera_fixed: カメラ固定モード (default: None=False 相当)

        Returns:
            str: task_id
        """
        task_type = self._resolve_task_type(mode)
        # C-1 修正: VALID_DURATIONS 廃止、4-15 範囲クランプで透過送信
        clamped_duration = max(DURATION_MIN, min(DURATION_MAX, int(duration)))

        # resolution: UI 指定 > env (フォールバック)
        effective_resolution = resolution or self.resolution

        input_payload: dict = {
            "prompt": prompt[:4000],
            "duration": clamped_duration,
            "aspect_ratio": aspect_ratio,
            # image_urls を省略 = T2V
        }

        if task_type.endswith("-vip"):
            input_payload["resolution"] = effective_resolution
        elif effective_resolution == '1080p':
            raise ValueError(
                "resolution=1080p requires VIP plan. "
                "Either change resolution to 480p/720p or set PIAPI_SEEDANCE_TASK_TYPE to a -vip variant."
            )

        # 常に generate_audio を送信
        input_payload["generate_audio"] = generate_audio
        if seed is not None:
            input_payload["seed"] = seed
        if camera_fixed is not None:
            input_payload["camerafixed"] = camera_fixed

        payload = {
            "model": "seedance",
            "task_type": task_type,
            "input": input_payload,
            "config": {"service_mode": "public"},
        }

        return await self._post_task(payload)

    async def generate_video_with_omni_references(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        mode: Optional[str] = None,
        image_urls: Optional[list[str]] = None,
        video_urls: Optional[list[str]] = None,
        audio_urls: Optional[list[str]] = None,
        resolution: Optional[str] = None,
    ) -> str:
        """
        Seedance omni-reference 生成 (v3 §6.2)

        既存 task_type をそのまま使用し、input.{image_urls, video_urls, audio_urls}
        を構築して送信する。`input.mode` は送信しない (preview 系統不要)。

        Args:
            prompt: 動画生成プロンプト (最大 4000 文字)
            duration: 動画長さ (秒)。整数 4-15。
            aspect_ratio: アスペクト比
            mode: モデルモード ('pro' | 'fast' | None)
            image_urls: 参照画像 URL (最大 9)
            video_urls: 参照動画 URL (最大 3)
            audio_urls: 参照音声 URL (最大 3)
            resolution: Optional[str] 出力解像度 ('480p' | '720p' | '1080p')。
                None の場合は env (self.resolution) を fallback として使用。

        Returns:
            str: task_id

        Raises:
            VideoProviderError: VIP 非対応 / 上限超過 / audio 単独 / 全 0
            ValueError: resolution=1080p かつ 非 VIP task_type (omni 自体が VIP 必須なので通常 raise されない)
        """
        task_type = self._resolve_task_type(mode)
        if not task_type.endswith("-vip"):
            raise VideoProviderError(
                "omni_reference 用途は VIP モデル必須です "
                "(PIAPI_SEEDANCE_TASK_TYPE に -vip suffix 必須)"
            )

        image_urls = image_urls or []
        video_urls = video_urls or []
        audio_urls = audio_urls or []

        if len(image_urls) > MAX_IMAGE_URLS:
            raise VideoProviderError(f"image_urls は最大 {MAX_IMAGE_URLS} 個")
        if len(video_urls) > MAX_VIDEO_URLS:
            raise VideoProviderError(f"video_urls は最大 {MAX_VIDEO_URLS} 個")
        if len(audio_urls) > MAX_AUDIO_URLS:
            raise VideoProviderError(f"audio_urls は最大 {MAX_AUDIO_URLS} 個")

        # 防御コード (Router で事前検証済)
        if not image_urls and not video_urls and audio_urls:
            raise VideoProviderError(
                "audio_urls 単独不可。image_urls か video_urls が必要 (防御)"
            )
        if not image_urls and not video_urls and not audio_urls:
            raise VideoProviderError("参照素材を 1 つ以上指定 (防御)")

        # resolution: UI 指定 > env (フォールバック)
        # generate_video / generate_video_from_text と同じパターン
        effective_resolution = resolution or self.resolution

        input_payload: dict = {
            "prompt": prompt[:4000],
            "duration": int(duration),
            "aspect_ratio": aspect_ratio,
        }

        if task_type.endswith("-vip"):
            input_payload["resolution"] = effective_resolution
        elif effective_resolution == '1080p':
            # 非 VIP env で 1080p が来た場合は例外
            # (omni は VIP 必須なので上の guard で raise されるが safety net として保持)
            raise ValueError(
                "resolution=1080p requires VIP plan. "
                "Either change resolution to 480p/720p or set PIAPI_SEEDANCE_TASK_TYPE to a -vip variant."
            )

        if image_urls:
            input_payload["image_urls"] = image_urls
        if video_urls:
            input_payload["video_urls"] = video_urls
        if audio_urls:
            input_payload["audio_urls"] = audio_urls
        # input.mode は送信しない (preview 系統不要)

        payload = {
            "model": "seedance",
            "task_type": task_type,
            "input": input_payload,
            "config": {"service_mode": "public"},
        }
        return await self._post_task(payload)

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
                # PiAPI は lowercase で返すが、ドキュメント上 Title case 表記なので
                # 両対応するため title-case に正規化して比較する
                status = data.get("status", "").strip().title()

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
