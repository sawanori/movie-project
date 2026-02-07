from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    ENV: str = "development"
    DEBUG: bool = True

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PUBLIC_URL: str = ""

    # OpenAI
    OPENAI_API_KEY: str = ""

    # Google Gemini
    GOOGLE_API_KEY: str = ""

    # KlingAI (deprecated)
    KLING_ACCESS_KEY: str = ""
    KLING_SECRET_KEY: str = ""

    # Runway API
    RUNWAY_API_KEY: str = ""

    # DomoAI API
    DOMOAI_API_KEY: str = ""

    # PiAPI (Kling AI via PiAPI gateway)
    PIAPI_API_KEY: str = ""
    PIAPI_KLING_VERSION: str = "2.6"
    PIAPI_KLING_MODE: str = "std"  # "std" or "pro"

    # PiAPI Flux Settings (Image Generation)
    PIAPI_FLUX_MODEL: str = "Qubico/flux1-dev"  # or "Qubico/flux1-schnell"

    # BFL (Black Forest Labs) FLUX.2 API
    BFL_API_KEY: str = ""

    # HailuoAI (MiniMax)
    HAILUO_API_KEY: str = ""
    HAILUO_MODEL: str = "MiniMax-Hailuo-02"
    HAILUO_PROMPT_OPTIMIZER: bool = False

    # Video Provider Settings
    # "runway", "veo", "domoai", "piapi_kling", or "hailuo" - 動画生成に使用するプロバイダー
    VIDEO_PROVIDER: str = "runway"

    # Topaz Video API (for 60fps frame interpolation)
    TOPAZ_API_KEY: str = ""

    # Polar (Payment)
    POLAR_API_KEY: str = ""
    POLAR_WEBHOOK_SECRET: str = ""

    # Suno API (for BGM generation)
    # Use third-party provider like SunoAPI.org since official API is not public
    SUNO_API_KEY: str = ""
    SUNO_API_BASE_URL: str = "https://api.sunoapi.org"

    # Backend API URL (for webhook callbacks from external services)
    BACKEND_URL: str = "http://localhost:8000"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
