from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.auth.router import router as auth_router
from app.videos.router import router as videos_router
from app.templates.router import router as templates_router
from app.webhooks.polar import router as webhooks_router

app = FastAPI(
    title="Movie Maker API",
    description="API for generating short videos from images using AI",
    version="0.1.0",
)

# CORS設定
# 開発時(ポート競合によるNext.jsの自動フォールバック)に備え、3001も許可
allow_origins = list(settings.CORS_ORIGINS)
if settings.DEBUG and "http://localhost:3001" not in allow_origins:
    allow_origins.append("http://localhost:3001")

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
app.include_router(webhooks_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
