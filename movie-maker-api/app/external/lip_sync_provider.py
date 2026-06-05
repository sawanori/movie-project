"""
LipSync (Lip Synchronization) プロバイダー共通インターフェース

Hedra などの lip sync サービスを統一的に扱うための抽象化レイヤー
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class LipSyncStatus:
    """LipSync 生成ステータス情報"""
    status: str  # "pending", "processing", "completed", "failed"
    progress: int  # 0-100
    video_url: Optional[str] = None
    error_message: Optional[str] = None


class LipSyncProviderInterface(ABC):
    """LipSync プロバイダーの共通インターフェース"""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """プロバイダー名を返す"""
        pass

    @abstractmethod
    async def generate_lip_sync(
        self,
        source_url: str,
        audio_url: str,
        source_type: str = "image",
    ) -> str:
        """
        LipSync 生成を開始

        Args:
            source_url: ソース画像または動画の URL
            audio_url: 音声ファイルの URL
            source_type: ソースタイプ ("image" または "video")

        Returns:
            str: task_id（ポーリング用識別子）

        Raises:
            ValueError: source_url が空の場合
            Exception: API エラーの場合
        """
        pass

    @abstractmethod
    async def check_status(self, task_id: str) -> LipSyncStatus:
        """
        生成状況を確認

        Args:
            task_id: generate_lip_sync() で返されたタスク ID

        Returns:
            LipSyncStatus: 現在のステータス情報
        """
        pass

    @abstractmethod
    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画 URL を取得

        Args:
            task_id: タスク ID

        Returns:
            str: 動画 URL（未完了の場合は None）
        """
        pass


def get_lip_sync_provider(provider_name: Optional[str] = None) -> LipSyncProviderInterface:
    """
    設定に応じた LipSync プロバイダーを返すファクトリー関数

    Args:
        provider_name: プロバイダー名（"hedra" | "piapi_kling"）。
                       指定がなければ環境変数 LIP_SYNC_PROVIDER を使用

    Returns:
        LipSyncProviderInterface: LipSync プロバイダーインスタンス

    Raises:
        ValueError: 不明なプロバイダー名が指定された場合
    """
    if provider_name is None:
        from app.core.config import settings
        provider_name = getattr(settings, 'LIP_SYNC_PROVIDER', 'hedra')

    if provider_name == "hedra":
        from app.external.hedra_provider import HedraProvider
        logger.info("Using Hedra lip sync provider")
        return HedraProvider()

    if provider_name == "piapi_kling":
        from app.external.piapi_kling_lipsync_provider import PiAPIKlingLipSyncProvider
        logger.info("Using PiAPI Kling lip sync provider")
        return PiAPIKlingLipSyncProvider()

    raise ValueError(f"Unknown lip sync provider: {provider_name}")
