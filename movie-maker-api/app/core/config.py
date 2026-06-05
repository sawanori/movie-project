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
    # バージョンポリシー: 3.0 以上必須、それ未満は非推奨。2.x / 1.6 は production で使用禁止。
    # Elements / 音声生成 / reference_video は 3.0 Omni 経路のみ動作する。
    # 3.x 新版リリース時はここを更新すること (FU-8)。
    PIAPI_KLING_VERSION: str = "3.0"
    PIAPI_KLING_MODE: str = "std"  # "std" or "pro" (used for 2.6 rollback)
    PIAPI_KLING_RESOLUTION: str = "720p"  # "720p" or "1080p" (3.0 only)
    PIAPI_KLING_ENABLE_AUDIO: bool = False  # Enable audio generation (3.0 only)

    # PiAPI Seedance Settings
    PIAPI_SEEDANCE_TASK_TYPE: str = "seedance-2-preview-vip"  # or "seedance-2-preview"
    PIAPI_SEEDANCE_RESOLUTION: str = "720p"  # "720p" or "1080p" (VIP tier)

    # OpenAI Image Generation
    OPENAI_IMAGE_MODEL: str = "gpt-image-2"

    # PiAPI Flux Settings (Image Generation)
    PIAPI_FLUX_MODEL: str = "Qubico/flux1-dev"  # or "Qubico/flux1-schnell"

    # BFL (Black Forest Labs) FLUX.2 API
    BFL_API_KEY: str = ""

    # HailuoAI (MiniMax)
    HAILUO_API_KEY: str = ""
    HAILUO_MODEL: str = "MiniMax-Hailuo-02"
    HAILUO_PROMPT_OPTIMIZER: bool = False

    # Video Provider Settings
    # "runway", "veo", "domoai", "piapi_kling", "hailuo", or "seedance" - 動画生成に使用するプロバイダー
    VIDEO_PROVIDER: str = "runway"

    # Gateway Settings
    GATEWAY_ENABLED: bool = False
    GATEWAY_DEFAULT_PRIORITY: str = "quality"

    # Topaz Video API (for 60fps frame interpolation)
    TOPAZ_API_KEY: str = ""

    # Polar (Payment)
    POLAR_API_KEY: str = ""
    POLAR_WEBHOOK_SECRET: str = ""

    # Suno API (for BGM generation)
    # Use third-party provider like SunoAPI.org since official API is not public
    SUNO_API_KEY: str = ""
    SUNO_API_BASE_URL: str = "https://api.sunoapi.org"

    # ElevenLabs TTS
    ELEVENLABS_API_KEY: str = ""

    # Voicevox TTS (local Docker)
    VOICEVOX_API_URL: str = "http://localhost:50021"

    # Aivis Speech Engine (Voicevox 互換 API, local Docker)
    AIVIS_SPEECH_API_URL: str = "http://localhost:10101"

    # TTS Provider Settings
    # "elevenlabs", "openai_tts", or "voicevox" - TTS 生成に使用するプロバイダー
    TTS_PROVIDER: str = "elevenlabs"

    # TTS Audio Postprocessing (ffmpeg: highpass/lowpass/dynaudnorm/loudnorm + MP3 320kbps)
    # False にすると従来の WAV 出力に即時切替（障害切り戻し用）
    ENABLE_TTS_POSTPROCESSING: bool = True

    # Hedra API (for Lip Sync generation)
    HEDRA_API_KEY: str = ""

    # LipSync Provider Settings
    # "hedra" | "piapi_kling" - Lip Sync 生成に使用するプロバイダー
    LIP_SYNC_PROVIDER: str = "piapi_kling"

    # Backend API URL (for webhook callbacks from external services)
    BACKEND_URL: str = "http://localhost:8000"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
