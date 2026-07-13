"""
LipSyncProviderInterface のテスト
"""
import pytest
from typing import Optional


class TestLipSyncProviderInterface:
    """LipSyncProviderInterface 抽象クラスのテスト"""

    def test_abstract_class_cannot_be_instantiated(self):
        """抽象クラスは直接インスタンス化できない"""
        from app.external.lip_sync_provider import LipSyncProviderInterface

        with pytest.raises(TypeError):
            LipSyncProviderInterface()

    def test_concrete_subclass_must_implement_all_abstract_methods(self):
        """具象サブクラスはすべての抽象メソッドを実装しなければならない"""
        from app.external.lip_sync_provider import LipSyncProviderInterface

        # generate_lip_sync が未実装の不完全な具象クラス
        class IncompleteProvider(LipSyncProviderInterface):
            @property
            def provider_name(self) -> str:
                return "incomplete"

        # check_status, get_video_url が未実装
        with pytest.raises(TypeError):
            IncompleteProvider()

    def test_lip_sync_status_dataclass_creation(self):
        """LipSyncStatus データクラスが正しく作成できる"""
        from app.external.lip_sync_provider import LipSyncStatus

        status = LipSyncStatus(
            status="completed",
            progress=100,
            video_url="https://example.com/video.mp4",
            error_message=None,
        )

        assert status.status == "completed"
        assert status.progress == 100
        assert status.video_url == "https://example.com/video.mp4"
        assert status.error_message is None

    def test_get_lip_sync_provider_returns_hedra_provider(self):
        """get_lip_sync_provider が HedraProvider を返す"""
        from app.external.lip_sync_provider import get_lip_sync_provider

        provider = get_lip_sync_provider("hedra")
        assert provider.provider_name == "hedra"

    def test_get_lip_sync_provider_with_unknown_provider_raises_value_error(self):
        """get_lip_sync_provider に不明なプロバイダー名を渡すと ValueError を発生させる"""
        from app.external.lip_sync_provider import get_lip_sync_provider

        with pytest.raises(ValueError, match="Unknown lip sync provider"):
            get_lip_sync_provider("unknown_provider")
