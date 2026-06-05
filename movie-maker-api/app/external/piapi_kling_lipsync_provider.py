"""
PiAPI Kling lip_sync プロバイダー実装

PiAPI 経由で Kling AI の `lip_sync` タスクを使い、動画キャラクターに
音声を合わせて口を動かしたリップシンク動画を生成する。
LipSyncProviderInterface を実装。

API Documentation: https://piapi.ai/docs/kling-api/lip-sync
"""

import logging
from typing import Optional

import httpx

from app.core.config import settings
from app.external.lip_sync_provider import LipSyncProviderInterface, LipSyncStatus

logger = logging.getLogger(__name__)

PIAPI_BASE_URL = "https://api.piapi.ai/api/v1"


class PiAPIKlingLipSyncProvider(LipSyncProviderInterface):
    """PiAPI Kling lip_sync タスクを使った LipSync プロバイダー"""

    def __init__(self) -> None:
        """
        プロバイダーを初期化する

        Raises:
            ValueError: PIAPI_API_KEY が未設定の場合
        """
        self.api_key = getattr(settings, "PIAPI_API_KEY", "") or ""
        if not self.api_key:
            # キー未設定だと httpx が分かりにくいヘッダーエラーを投げるため、
            # ここで明確なメッセージに置き換える（既存 Kling と同様の方針）
            raise ValueError("PIAPI_API_KEY must be configured")

    @property
    def provider_name(self) -> str:
        return "piapi_kling"

    def _get_headers(self) -> dict:
        """API 認証ヘッダーを返す（piapi_kling_provider.py に倣う）"""
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def generate_lip_sync(
        self,
        source_url: str,
        audio_url: str,
        source_type: str = "image",
    ) -> str:
        """
        PiAPI Kling lip_sync 生成を開始する

        Args:
            source_url: ソース動画の URL（Kling lip_sync は動画のみ対応）
            audio_url: 音声ファイルの URL（local_dubbing_url として渡す）
            source_type: ソースタイプ。Kling lip_sync は "video" のみ対応

        Returns:
            str: PiAPI タスク ID（ポーリング用）

        Raises:
            ValueError: source_url が空、または source_type が "video" 以外の場合
            Exception: API エラーの場合
        """
        if not source_url:
            raise ValueError("source_url must not be empty")

        if source_type != "video":
            raise ValueError(
                "Kling リップシンクは動画ソースのみ対応しています。静止画は非対応です。"
                "動画を選択してください。"
            )

        request_body = {
            "model": "kling",
            "task_type": "lip_sync",
            "input": {
                "video_url": source_url,
                "local_dubbing_url": audio_url,
            },
        }

        try:
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
            if not task_id:
                logger.error(f"PiAPI lip_sync response missing task_id: {result}")
                raise Exception("PiAPI Kling lip_sync APIからタスクIDが返されませんでした")

            logger.info(f"PiAPI Kling lip_sync task created: {task_id}")
            return task_id

        except httpx.HTTPStatusError as e:
            logger.error(
                f"PiAPI lip_sync HTTP error: {e.response.status_code} - {e.response.text}"
            )
            # エラーボディ(JSON)から人間向けメッセージを抽出し、日本語化する
            # (PiAPI は 5xx でも data.error.message / 直下 message に理由を返す)
            raw_message = ""
            try:
                body = e.response.json()
                err = body.get("data", {}).get("error", {})
                raw_message = (
                    err.get("raw_message")
                    or err.get("message")
                    or body.get("message")
                    or ""
                )
            except Exception:
                raw_message = ""
            if raw_message:
                raise Exception(self._humanize_error(raw_message))
            raise Exception(
                f"PiAPI Kling lip_sync API がエラーを返しました (HTTP {e.response.status_code})。"
            )
        except httpx.HTTPError as e:
            logger.exception(f"PiAPI Kling lip_sync request failed: {e}")
            raise Exception(f"リップシンク生成に失敗しました: {str(e)}")

    async def check_status(self, task_id: str) -> LipSyncStatus:
        """
        PiAPI Kling lip_sync タスクの進捗を確認する

        Args:
            task_id: generate_lip_sync() で返されたタスク ID

        Returns:
            LipSyncStatus: 現在のステータス情報
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
            status_lower = data.get("status", "").lower()

            # PiAPI ステータス → 内部ステータス変換
            # 未知ステータスは processing にフォールバック（piapi_kling_provider.py に倣う）
            status_mapping = {
                "completed": "completed",
                "processing": "processing",
                "pending": "pending",
                "staged": "pending",
                "failed": "failed",
            }
            internal_status = status_mapping.get(status_lower, "processing")

            progress_mapping = {
                "completed": 100,
                "processing": 50,
                "pending": 10,
                "failed": 0,
            }
            progress = progress_mapping.get(internal_status, 50)

            video_url: Optional[str] = None
            error_message: Optional[str] = None

            if internal_status == "completed":
                video_url = self._extract_video_url(data.get("output", {}))
                if video_url:
                    logger.info(f"PiAPI Kling lip_sync completed: {video_url}")
                else:
                    logger.warning(
                        f"PiAPI Kling lip_sync completed but no video_url found: "
                        f"{data.get('output')}"
                    )
            elif internal_status == "failed":
                error_data = data.get("error", {})
                # message は "task failed" のような汎用文言になりがちなので、
                # 真因が入る raw_message を優先する
                raw_error = (
                    error_data.get("raw_message")
                    or error_data.get("message")
                    or "リップシンク生成に失敗しました"
                )
                logger.error(
                    f"PiAPI Kling lip_sync task failed: {raw_error} (full error={error_data})"
                )
                error_message = self._humanize_error(raw_error)

            return LipSyncStatus(
                status=internal_status,
                progress=progress,
                video_url=video_url,
                error_message=error_message,
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI lip_sync status check HTTP error: {e.response.status_code}")
            return LipSyncStatus(
                status="failed",
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except httpx.HTTPError as e:
            logger.exception(f"PiAPI lip_sync status check failed: {e}")
            return LipSyncStatus(
                status="failed",
                progress=0,
                error_message=f"ステータス確認に失敗しました: {str(e)}",
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画 URL を取得する

        Args:
            task_id: タスク ID

        Returns:
            str: 動画 URL（未完了の場合は None）
        """
        status = await self.check_status(task_id)
        if status.status == "completed":
            return status.video_url
        return None

    @staticmethod
    def _extract_video_url(output: dict) -> Optional[str]:
        """
        PiAPI Kling のレスポンス構造から動画 URL を抽出する

        複数パターンに対応（output.video_url / works[0].video.url|resource /
        output.video が str/dict 等）。piapi_kling_provider.py と同じロジック。
        """
        works = output.get("works", [{}])
        works_video = works[0].get("video", {}) if works else {}
        raw_video = output.get("video")
        return (
            output.get("video_url")
            or (raw_video if isinstance(raw_video, str) and raw_video.startswith("http") else None)
            or (raw_video.get("url") if isinstance(raw_video, dict) else None)
            or (raw_video.get("resource") if isinstance(raw_video, dict) else None)
            or works_video.get("url")
            or works_video.get("resource")
        )

    @staticmethod
    def _humanize_error(raw_error: str) -> str:
        """
        PiAPI のエラーメッセージを分かりやすい日本語に変換する
        （piapi_kling_provider.py の変換に倣う）
        """
        lowered = raw_error.lower()
        if (
            "free plan" in lowered
            or "hobbyist" in lowered
            or "upgrade" in lowered
            or "subscription" in lowered
        ):
            return (
                "PiAPI が Free（Hobbyist）プランのため、リップシンク（lip_sync）を実行できません。"
                "PiAPI の有料プランにアップグレードしてください（https://piapi.ai の Pricing 参照）。"
            )
        if (
            "upload_verify_timeout" in lowered
            or "failed to upload video" in lowered
            or ("upload" in lowered and "timeout" in lowered)
        ):
            return (
                "Kling が動画の取得に失敗しました（タイムアウト）。"
                "動画のサイズを小さく/短くするか、少し時間をおいて再試行してください。"
                "（動画URLの読み込みが遅いと発生します）"
            )
        if "credit" in lowered or "balance" in lowered:
            return "PiAPIのクレジットが不足しています。"
        if "rate" in lowered or "limit" in lowered:
            return "APIのレート制限に達しました。しばらく待ってから再試行してください。"
        if "timeout" in lowered:
            return "処理がタイムアウトしました。再試行してください。"
        if "preprocess" in lowered:
            return (
                "動画の処理に失敗しました。顔がはっきり映った動画か、"
                "動画URLがアクセス可能か確認してください。"
            )
        return raw_error
