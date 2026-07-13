"""
get_video_provider のゲートウェイ統合テスト

TDD: テストを先に書いてから実装する

GATEWAY_ENABLED=True の場合はGatewayを通してルーティングし、
GATEWAY_ENABLED=False (デフォルト) の場合は従来の直接プロバイダーを返す。
"""
import pytest
from unittest.mock import patch, MagicMock


class TestVideoProviderGatewayIntegration:
    """get_video_provider のゲートウェイ統合テスト"""

    def test_get_video_provider_gateway_disabled_returns_direct_provider(self):
        """GATEWAY_ENABLED=False の場合は直接プロバイダーを返す（デフォルト動作）"""
        with patch('app.core.config.settings') as mock_settings:
            mock_settings.GATEWAY_ENABLED = False
            mock_settings.VIDEO_PROVIDER = "runway"

            with patch('app.external.runway_provider.settings') as mock_runway_settings:
                mock_runway_settings.RUNWAY_API_KEY = "test_runway_key"

                from app.external.video_provider import get_video_provider
                from app.external.runway_provider import RunwayProvider

                # settingsを関数内でimportしているため、app.core.config.settingsをパッチ
                with patch('app.external.video_provider.settings', mock_settings, create=True):
                    provider = get_video_provider()

                assert isinstance(provider, RunwayProvider)
                assert provider.provider_name == "runway"

    def test_get_video_provider_gateway_enabled_uses_gateway(self):
        """GATEWAY_ENABLED=True の場合はゲートウェイを通してプロバイダーを返す"""
        mock_provider = MagicMock()
        mock_provider.provider_name = "piapi_kling"

        mock_router = MagicMock()
        mock_router.route.return_value = mock_provider

        mock_gateway = MagicMock()
        mock_gateway._router = mock_router

        mock_settings = MagicMock()
        mock_settings.GATEWAY_ENABLED = True
        mock_settings.GATEWAY_DEFAULT_PRIORITY = "quality"
        mock_settings.VIDEO_PROVIDER = "piapi_kling"

        with patch('app.external.video_provider.get_gateway', return_value=mock_gateway, create=True):
            # settings の GATEWAY_ENABLED を True にして get_video_provider を呼ぶ
            # get_video_provider は内部で `from app.core.config import settings` しているため
            # app.core.config.settings をパッチする
            with patch('app.core.config.settings', mock_settings):
                from app.external.video_provider import get_video_provider

                # gateway_init.get_gateway をパッチして gateway を返す
                with patch('app.external.gateway_init.get_gateway', return_value=mock_gateway):
                    provider = get_video_provider()

                    # ゲートウェイのroute()が呼ばれたことを確認
                    mock_router.route.assert_called_once()

    def test_get_video_provider_gateway_enabled_with_preferred_provider(self):
        """GATEWAY_ENABLED=True で provider_name を指定すると preferred_provider として渡される"""
        mock_provider = MagicMock()
        mock_provider.provider_name = "piapi_kling"

        mock_router = MagicMock()
        mock_router.route.return_value = mock_provider

        mock_gateway = MagicMock()
        mock_gateway._router = mock_router

        mock_settings = MagicMock()
        mock_settings.GATEWAY_ENABLED = True
        mock_settings.GATEWAY_DEFAULT_PRIORITY = "quality"

        with patch('app.core.config.settings', mock_settings):
            with patch('app.external.gateway_init.get_gateway', return_value=mock_gateway):
                from app.external.video_provider import get_video_provider

                get_video_provider(provider_name="piapi_kling")

                # route が preferred_provider="piapi_kling" で呼ばれたことを確認
                call_kwargs = mock_router.route.call_args
                assert call_kwargs is not None
                # キーワード引数またはポジション引数で preferred_provider が渡されている
                kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
                args = call_kwargs.args if call_kwargs.args else ()
                # preferred_provider が kwargs または args に含まれている
                preferred = kwargs.get("preferred_provider", args[2] if len(args) > 2 else None)
                assert preferred == "piapi_kling"
