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

    # KlingAI
    KLING_ACCESS_KEY: str = ""
    KLING_SECRET_KEY: str = ""

    # Polar (Payment)
    POLAR_API_KEY: str = ""
    POLAR_WEBHOOK_SECRET: str = ""

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
