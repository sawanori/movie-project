"""
Gateway初期化

全プロバイダーを登録してUnifiedGatewayを初期化するモジュール。
シングルトンパターンで一度だけ初期化し、以降は同一インスタンスを返す。

各プロバイダーはtry/exceptで個別に登録するため、
一部のプロバイダーが設定不足で起動できない場合でも
他のプロバイダーは正常に登録される。
"""
import logging
from typing import Optional

from app.external.model_registry import ModelMetadata, ModelRegistry
from app.external.gateway_router import GatewayRouter
from app.external.unified_gateway import UnifiedGateway

logger = logging.getLogger(__name__)

_gateway: Optional[UnifiedGateway] = None


def init_gateway() -> UnifiedGateway:
    """ゲートウェイを全プロバイダーで初期化する

    各プロバイダーの初期化は独立したtry/exceptで保護されているため、
    一部のAPIキーが未設定の場合でも残りのプロバイダーは正常に登録される。

    Returns:
        UnifiedGateway: 初期化済みのゲートウェイ
    """
    global _gateway
    registry = ModelRegistry()

    try:
        from app.external.piapi_kling_provider import PiAPIKlingProvider
        registry.register(
            ModelMetadata(
                name="piapi_kling",
                provider="kling",
                capabilities=["i2v", "v2v", "t2v"],
                quality_score=8,
                speed_score=7,
                cost_per_second=0.05,
            ),
            PiAPIKlingProvider(),
        )
        logger.info("Gateway: Registered piapi_kling provider")
    except Exception as e:
        logger.debug(f"Gateway: Skipped piapi_kling provider: {e}")

    try:
        from app.external.veo_provider import VeoProvider
        registry.register(
            ModelMetadata(
                name="veo",
                provider="google",
                capabilities=["i2v", "t2v"],
                quality_score=9,
                speed_score=6,
                cost_per_second=0.08,
            ),
            VeoProvider(),
        )
        logger.info("Gateway: Registered veo provider")
    except Exception as e:
        logger.debug(f"Gateway: Skipped veo provider: {e}")

    try:
        from app.external.runway_provider import RunwayProvider
        registry.register(
            ModelMetadata(
                name="runway",
                provider="runway",
                capabilities=["i2v", "v2v"],
                quality_score=9,
                speed_score=8,
                cost_per_second=0.10,
            ),
            RunwayProvider(),
        )
        logger.info("Gateway: Registered runway provider")
    except Exception as e:
        logger.debug(f"Gateway: Skipped runway provider: {e}")

    try:
        from app.external.hailuo_provider import HailuoProvider
        registry.register(
            ModelMetadata(
                name="hailuo",
                provider="minimax",
                capabilities=["i2v"],
                quality_score=7,
                speed_score=7,
                cost_per_second=0.04,
            ),
            HailuoProvider(),
        )
        logger.info("Gateway: Registered hailuo provider")
    except Exception as e:
        logger.debug(f"Gateway: Skipped hailuo provider: {e}")

    try:
        from app.external.piapi_seedance_provider import PiAPISeedanceProvider
        registry.register(
            ModelMetadata(
                name="seedance",
                provider="piapi",
                capabilities=["i2v", "t2v"],
                quality_score=8,
                speed_score=6,
                cost_per_second=0.20,  # 720p VIP tier
            ),
            PiAPISeedanceProvider(),
        )
        logger.info("Gateway: Registered seedance provider")
    except Exception as e:
        logger.debug(f"Gateway: Skipped seedance provider: {e}")

    router = GatewayRouter(registry)
    _gateway = UnifiedGateway(router)
    return _gateway


def get_gateway() -> UnifiedGateway:
    """シングルトンのゲートウェイを返す。未初期化の場合は自動的に初期化する"""
    global _gateway
    if _gateway is None:
        return init_gateway()
    return _gateway
