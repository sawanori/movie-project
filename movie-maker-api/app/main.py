from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.auth.router import router as auth_router
from app.videos.router import router as videos_router
from app.templates.router import router as templates_router

app = FastAPI(
    title="Movie Maker API",
    description="API for generating short videos from images using AI",
    version="0.1.0",
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録（API v1）
app.include_router(auth_router, prefix="/api/v1")
app.include_router(videos_router, prefix="/api/v1")
app.include_router(templates_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
