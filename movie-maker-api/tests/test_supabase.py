"""
Supabaseクライアントのテスト
"""
from unittest.mock import patch, MagicMock


def test_supabase_client_initialization():
    """Supabaseクライアントが正しく初期化されることを確認"""
    with patch("app.core.supabase.create_client") as mock_create_client, \
         patch("app.core.supabase.settings") as mock_settings:
        mock_settings.SUPABASE_URL = "https://example.supabase.co"
        mock_settings.SUPABASE_KEY = "example-key"
        mock_settings.SUPABASE_SERVICE_ROLE_KEY = None

        mock_client = MagicMock()
        mock_create_client.return_value = mock_client

        # Import after patching to use mocked settings
        from app.core.supabase import get_supabase

        # Reset the cached client to force reinitialization
        import app.core.supabase
        app.core.supabase._supabase_admin_client = None

        client = get_supabase()
        assert client is not None
        mock_create_client.assert_called_once()
