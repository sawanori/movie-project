"""
ModelRegistry - モデルとプロバイダーの登録・管理

動画生成モデルとそのプロバイダーを一元管理するレジストリ。
各モデルのメタデータ（品質スコア、速度スコア、コスト等）を保持し、
優先度に応じた最適なプロバイダー選択を提供する。
"""
from dataclasses import dataclass, field
from typing import Optional

from app.external.video_provider import VideoProviderInterface


@dataclass
class ModelMetadata:
    """動画生成モデルのメタデータ"""
    name: str
    provider: str
    capabilities: list[str]  # ["i2v", "v2v", "t2v"]
    quality_score: int  # 1-10
    speed_score: int  # 1-10
    cost_per_second: float
    max_duration: int = 10
    supported_aspect_ratios: list[str] = field(default_factory=lambda: ["9:16", "16:9"])


class ModelRegistry:
    """モデルとプロバイダーの登録・管理"""

    def __init__(self):
        self._models: dict[str, tuple[ModelMetadata, VideoProviderInterface]] = {}

    def register(self, metadata: ModelMetadata, provider: VideoProviderInterface) -> None:
        """モデルとプロバイダーを登録する"""
        self._models[metadata.name] = (metadata, provider)

    def get_provider(self, name: str) -> VideoProviderInterface:
        """モデル名でプロバイダーを取得する"""
        if name not in self._models:
            raise KeyError(f"Model not found: {name}")
        return self._models[name][1]

    def get_metadata(self, name: str) -> ModelMetadata:
        """モデル名でメタデータを取得する"""
        if name not in self._models:
            raise KeyError(f"Model not found: {name}")
        return self._models[name][0]

    def list_models(self, capability: Optional[str] = None) -> list[ModelMetadata]:
        """登録済みモデルの一覧を返す。capabilityで絞り込み可能"""
        models = [m for m, _ in self._models.values()]
        if capability:
            models = [m for m in models if capability in m.capabilities]
        return models

    def _rank_candidates(
        self, priority: str, capability: str
    ) -> list[tuple[ModelMetadata, VideoProviderInterface]]:
        """capabilityで絞り込み、priorityで並べた候補リストを返す（内部共通ロジック）

        並び順: quality/speed は降順、cost は昇順。該当なしなら空リスト。
        """
        candidates = [
            (m, p) for m, p in self._models.values() if capability in m.capabilities
        ]
        if priority == "quality":
            candidates.sort(key=lambda x: x[0].quality_score, reverse=True)
        elif priority == "speed":
            candidates.sort(key=lambda x: x[0].speed_score, reverse=True)
        elif priority == "cost":
            candidates.sort(key=lambda x: x[0].cost_per_second)
        return candidates

    def find_best(self, priority: str = "quality", capability: str = "i2v") -> VideoProviderInterface:
        """優先度に基づいて最適なプロバイダーを返す

        Args:
            priority: 優先基準 ("quality" | "speed" | "cost")
            capability: 必要な機能 ("i2v" | "v2v" | "t2v")

        Returns:
            最適なVideoProviderInterface実装

        Raises:
            ValueError: 対応プロバイダーが存在しない場合
        """
        candidates = self._rank_candidates(priority, capability)
        if not candidates:
            raise ValueError(f"No providers for capability: {capability}")

        return candidates[0][1]

    def rank_metadata(
        self, priority: str = "quality", capability: str = "i2v"
    ) -> list[ModelMetadata]:
        """優先度で並べた候補メタデータのリストを返す（ランキング済み）

        find_best / find_best_metadata と同一のソート規則
        （quality/speed 降順・cost 昇順、内部 _rank_candidates を共有）。
        フォールバック時に「次点」を取得する用途で使用する。

        Args:
            priority: 優先基準 ("quality" | "speed" | "cost")
            capability: 必要な機能 ("i2v" | "v2v" | "t2v")

        Returns:
            ランキング順の ModelMetadata リスト。該当なしなら空リスト。
        """
        return [m for m, _ in self._rank_candidates(priority, capability)]

    def find_best_metadata(
        self, priority: str = "quality", capability: str = "i2v"
    ) -> Optional[ModelMetadata]:
        """優先度に基づいて最適なモデルのメタデータを返す

        find_best と同一のソート規則（quality/speed 降順・cost 昇順）で選択するが、
        プロバイダーインスタンスではなくメタデータを返す。

        Args:
            priority: 優先基準 ("quality" | "speed" | "cost")
            capability: 必要な機能 ("i2v" | "v2v" | "t2v")

        Returns:
            最適な ModelMetadata。該当プロバイダーが存在しない場合は None
        """
        candidates = self._rank_candidates(priority, capability)
        if not candidates:
            return None

        return candidates[0][0]
