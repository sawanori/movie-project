import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

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


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/v1/config/video-provider")
async def get_video_provider():
    """現在の動画生成プロバイダーを返す"""
    provider = getattr(settings, 'VIDEO_PROVIDER', 'runway')
    return {"provider": provider}
