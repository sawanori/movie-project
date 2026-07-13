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
from app.background_removal.router import router as background_removal_router
from app.gateway.router import router as gateway_router

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
app.include_router(background_removal_router, prefix="/api/v1")
app.include_router(gateway_router, prefix="/api/v1")


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


@app.on_event("startup")
async def _resume_stuck_background_removals_on_startup():
    """起動時に 'pending' / 'processing' のまま取り残された背景削除ジョブを再開する

    uvicorn のリロードや Railway の再デプロイで実行中の asyncio ポーリングタスクが
    失われるため、起動時にバックグラウンドで再開スイープを行う。
    （asyncio.create_task で起動するため、アプリの起動はブロックしない）
    """
    try:
        from app.tasks.bg_removal_processor import (
            start_resume_stuck_background_removals,
        )

        await start_resume_stuck_background_removals()
        logger.info("Background removal resume sweep scheduled at startup")
    except Exception:
        # スイープの失敗でアプリ起動を止めない
        logger.exception(
            "背景削除の再開スイープ起動に失敗しました（アプリ起動は継続します）"
        )


@app.on_event("startup")
async def _resume_stuck_workflow_runs_on_startup():
    """起動時に 'processing' のまま取り残された workflow_run を逐次再開する

    uvicorn のリロードや Railway の再デプロイで実行中の asyncio タスクが失われるため、
    起動時にバックグラウンドで再開スイープを行う（逐次実行でサンダリングハードを防ぐ）。
    submitting のまま task_id 無しのステップは再送信せず failed 化する（二重課金回避）。
    """
    try:
        from app.tasks.workflow_run_processor import (
            start_resume_stuck_workflow_runs,
        )

        await start_resume_stuck_workflow_runs()
        logger.info("Workflow run resume sweep scheduled at startup")
    except Exception:
        # スイープの失敗でアプリ起動を止めない
        logger.exception(
            "workflow_run の再開スイープ起動に失敗しました（アプリ起動は継続します）"
        )


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
