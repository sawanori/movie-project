import logging
import subprocess

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

logger = logging.getLogger(__name__)

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
from app.auth.router import router as auth_router
from app.videos.router import router as videos_router
from app.templates.router import router as templates_router
from app.webhooks.polar import router as webhooks_router
from app.webhooks.suno import router as suno_webhooks_router
from app.library.router import router as library_router
from app.workflows.router import router as workflows_router
from app.tts.router import router as tts_router
from app.lip_sync.router import router as lip_sync_router
from app.dialogue.router import router as dialogue_router

app = FastAPI(
    title="Movie Maker API",
    description="API for generating short videos from images using AI",
    version="0.1.0",
)

# CORS設定
# 開発時はすべてのオリジンを許可（http/httpsやポートの違いによるCORSエラーを防ぐ）
if settings.DEBUG:
    allow_origins = ["*"]
else:
    allow_origins = list(settings.CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録（API v1）
app.include_router(auth_router, prefix="/api/v1")
app.include_router(videos_router, prefix="/api/v1")
app.include_router(templates_router, prefix="/api/v1")
app.include_router(library_router, prefix="/api/v1")
app.include_router(workflows_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")
app.include_router(suno_webhooks_router, prefix="/api/v1")
app.include_router(tts_router, prefix="/api/v1")
app.include_router(lip_sync_router, prefix="/api/v1")
app.include_router(dialogue_router, prefix="/api/v1")


@app.on_event("startup")
async def _check_ffmpeg_on_startup():
    """起動時に ffmpeg バイナリの存在を確認し、未インストールなら postprocessing を自動 OFF"""
    if not getattr(settings, 'ENABLE_TTS_POSTPROCESSING', True):
        return  # postprocessing が無効なら確認不要

    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=5,
        )
        if result.returncode != 0:
            raise FileNotFoundError("ffmpeg -version returned non-zero")
        logger.info("ffmpeg detected at startup (TTS postprocessing enabled)")
    except (FileNotFoundError, OSError):
        logger.warning(
            "ffmpeg not found, TTS postprocessing disabled. "
            "Install ffmpeg or set ENABLE_TTS_POSTPROCESSING=False to suppress this warning."
        )
        settings._FFMPEG_AVAILABLE = False


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/v1/config/video-provider")
async def get_video_provider():
    """現在の動画生成プロバイダーを返す

    有効値: "runway", "veo", "domoai", "piapi_kling", "hailuo", "seedance"
    """
    provider = getattr(settings, 'VIDEO_PROVIDER', 'runway')
    return {"provider": provider}
