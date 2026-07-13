"""
Gateway 設定エンドポイント

休眠中の model_registry のメタデータを読み取り専用で HTTP 公開する。
動画生成経路や GATEWAY_ENABLED フラグには一切触れない、独立した経路。

エンドポイント:
- GET /config/models         登録済みモデルのメタデータ一覧（capability で絞り込み可）
- GET /config/capabilities   capability -> [{name, provider}] のマップ
- GET /config/recommended    priority/capability に対する推奨モデル {name, provider}

レジストリは gateway_init のシングルトン（get_gateway が遅延初期化）から取得する。
"""
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user
from app.external.gateway_init import get_gateway
from app.external.model_registry import ModelMetadata, ModelRegistry

router = APIRouter(tags=["gateway-config"])


class RoutingPriority(str, Enum):
    """推奨モデル選択の優先基準"""

    quality = "quality"
    speed = "speed"
    cost = "cost"


def get_registry() -> ModelRegistry:
    """gateway_init のシングルトンからレジストリを取得する

    get_gateway() は未初期化なら遅延初期化するため、レジストリは常に
    登録済みモデルを持った状態で返る（別途 503 分岐は不要）。
    """
    return get_gateway()._router._registry


def _serialize(metadata: ModelMetadata) -> dict:
    """ModelMetadata をワイヤ形式（バックエンド実フィールド名）へシリアライズ"""
    return {
        "name": metadata.name,
        "provider": metadata.provider,
        "capabilities": metadata.capabilities,
        "quality_score": metadata.quality_score,
        "speed_score": metadata.speed_score,
        "cost_per_second": metadata.cost_per_second,
        "max_duration": metadata.max_duration,
        "supported_aspect_ratios": metadata.supported_aspect_ratios,
    }


@router.get("/config/models")
async def list_models(
    capability: Optional[str] = Query(default=None),
    _user: dict = Depends(get_current_user),
    registry: ModelRegistry = Depends(get_registry),
) -> list[dict]:
    """登録済みモデルのメタデータ一覧を返す。capability があれば絞り込む。"""
    return [_serialize(m) for m in registry.list_models(capability)]


@router.get("/config/capabilities")
async def get_capabilities(
    _user: dict = Depends(get_current_user),
    registry: ModelRegistry = Depends(get_registry),
) -> dict[str, list[dict]]:
    """capability -> [{name, provider}] のマップを返す。"""
    result: dict[str, list[dict]] = {}
    for model in registry.list_models():
        for cap in model.capabilities:
            result.setdefault(cap, []).append(
                {"name": model.name, "provider": model.provider}
            )
    return result


@router.get("/config/recommended")
async def get_recommended(
    priority: RoutingPriority = Query(...),
    capability: str = Query(...),
    _user: dict = Depends(get_current_user),
    registry: ModelRegistry = Depends(get_registry),
) -> dict:
    """priority/capability に最適なモデルの {name, provider} を返す。

    不正な priority は FastAPI が 422 を返す（Enum 検証）。
    該当モデルが無い場合は 404。
    """
    metadata = registry.find_best_metadata(
        priority=priority.value, capability=capability
    )
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No model available for capability: {capability}",
        )
    return {"name": metadata.name, "provider": metadata.provider}
