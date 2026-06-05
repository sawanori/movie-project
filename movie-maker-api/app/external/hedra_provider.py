"""
Hedra API を使った LipSync プロバイダー実装

Hedra API (https://api.hedra.com) を使ってリップシンク動画を生成する
"""

import logging
from typing import Optional

import httpx

from app.external.lip_sync_provider import LipSyncProviderInterface, LipSyncStatus

logger = logging.getLogger(__name__)

HEDRA_API_BASE_URL = "https://api.hedra.com"


class HedraProvider(LipSyncProviderInterface):
    """Hedra API を使った LipSync プロバイダー"""

    @property
    def provider_name(self) -> str:
        return "hedra"

    def _get_api_key(self) -> str:
        """API キーを環境変数から取得"""
        from app.core.config import settings
        return getattr(settings, 'HEDRA_API_KEY', '')

    def _get_headers(self) -> dict:
        """認証ヘッダーを返す"""
        api_key = self._get_api_key()
        if not api_key:
            # キー未設定だと httpx が "Illegal header value b'Bearer '" という
            # 分かりにくいエラーを投げるため、ここで明確なメッセージに置き換える
            raise ValueError(
                "Hedra API キーが設定されていません。リップシンク機能を使うには、"
                "バックエンドの環境変数 HEDRA_API_KEY を設定してサーバーを再起動してください。"
            )
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def generate_lip_sync(
        self,
        source_url: str,
        audio_url: str,
        source_type: str = "image",
    ) -> str:
        """
        Hedra API で LipSync 生成を開始

        Args:
            source_url: ソース画像または動画の URL
            audio_url: 音声ファイルの URL
            source_type: ソースタイプ ("image" または "video")

        Returns:
            str: Hedra タスク ID

        Raises:
            ValueError: source_url が空の場合
            Exception: API エラーの場合
        """
        if not source_url:
            raise ValueError("source_url must not be empty")

        payload: dict = {"voice_url": audio_url}
        if source_type == "video":
            payload["video_url"] = source_url
        else:
            payload["image_url"] = source_url

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{HEDRA_API_BASE_URL}/v1/characters",
                headers=self._get_headers(),
                json=payload,
                timeout=30.0,
            )

        if response.status_code != 200:
            logger.error(
                f"Hedra API error: status={response.status_code}, body={response.text}"
            )
            raise Exception(
                f"Hedra API returned {response.status_code}: {response.text}"
            )

        data = response.json()
        task_id = data["id"]
        logger.info(f"Hedra lip sync generation started: task_id={task_id}")
        return task_id

    async def check_status(self, task_id: str) -> LipSyncStatus:
        """
        Hedra API でタスクのステータスを確認

        Args:
            task_id: Hedra タスク ID

        Returns:
            LipSyncStatus: 現在のステータス情報
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{HEDRA_API_BASE_URL}/v1/projects/{task_id}",
                headers=self._get_headers(),
                timeout=30.0,
            )

        if response.status_code != 200:
            logger.error(
                f"Hedra status check error: status={response.status_code}, body={response.text}"
            )
            return LipSyncStatus(
                status="failed",
                progress=0,
                error_message=f"Status check failed: {response.status_code}",
            )

        data = response.json()
        hedra_status = data.get("status", "pending")
        progress = data.get("progress", 0)
        video_url = data.get("video_url")
        error = data.get("error")

        # Hedra の status を内部ステータスにマッピング
        if hedra_status in ("error", "failed"):
            return LipSyncStatus(
                status="failed",
                progress=progress,
                error_message=error or "Provider reported failure",
            )
        elif hedra_status == "completed":
            return LipSyncStatus(
                status="completed",
                progress=100,
                video_url=video_url,
            )
        elif hedra_status == "processing":
            return LipSyncStatus(
                status="processing",
                progress=progress,
            )
        else:
            return LipSyncStatus(
                status="pending",
                progress=0,
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画 URL を取得

        Args:
            task_id: Hedra タスク ID

        Returns:
            str: 動画 URL（未完了の場合は None）
        """
        status = await self.check_status(task_id)
        if status.status == "completed":
            return status.video_url
        return None
