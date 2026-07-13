"""
Gateway初期化 (gateway_init) のユニットテスト

TDD: テストを先に書いてから実装する
"""
import pytest
from unittest.mock import patch, MagicMock


class TestGatewayInit:
    """gateway_init モジュールのテスト"""

    def setup_method(self):
        """各テスト前にシングルトン状態をリセット"""
        import app.external.gateway_init as module
        module._gateway = None

    def test_init_gateway_creates_gateway(self):
        """init_gatewayがUnifiedGatewayを返す"""
        from app.external.gateway_init import init_gateway
        from app.external.unified_gateway import UnifiedGateway

        gateway = init_gateway()

        assert gateway is not None
        assert isinstance(gateway, UnifiedGateway)

    def test_get_gateway_returns_singleton(self):
        """get_gatewayが同一インスタンスを返す（シングルトン）"""
        from app.external.gateway_init import get_gateway, init_gateway

        # 最初のgetting
        gateway1 = get_gateway()
        # 2回目のgetting
        gateway2 = get_gateway()

        assert gateway1 is gateway2

    def test_get_gateway_initializes_on_first_call(self):
        """get_gatewayは最初の呼び出し時に自動的に初期化する"""
        import app.external.gateway_init as module
        # シングルトンがNoneであることを確認
        assert module._gateway is None

        from app.external.gateway_init import get_gateway
        from app.external.unified_gateway import UnifiedGateway

        gateway = get_gateway()

        assert gateway is not None
        assert isinstance(gateway, UnifiedGateway)
        # シングルトンが設定されたことを確認
        assert module._gateway is not None
