from supabase import create_client, Client
from app.core.config import settings

_supabase_client: Client | None = None
_supabase_admin_client: Client | None = None


def get_supabase_client() -> Client:
    """
    Initializes and returns a Supabase client (anon key).
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def get_supabase() -> Client:
    """
    Returns a singleton Supabase admin client (service_role key).
    バックエンドからのDB操作はRLSをバイパスするためservice_roleを使用。
    """
    global _supabase_admin_client
    if _supabase_admin_client is None:
        # SERVICE_ROLE_KEYがあれば使用、なければKEYにフォールバック
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
        _supabase_admin_client = create_client(settings.SUPABASE_URL, key)
    return _supabase_admin_client


# Create a global instance to be reused (legacy)
supabase: Client = get_supabase_client()
