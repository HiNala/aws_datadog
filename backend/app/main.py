import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import init_db
from app.migrations import run_migrations
from app.routers import chat, health, tts
from app.routers import conversations, metrics, debate
from app.services.datadog_obs import setup_observability

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-18s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("opsvoice")

START_TIME = time.time()

app = FastAPI(
    title="OpsVoice API",
    description="AI Operations Agent — AWS Bedrock + Datadog + MiniMax",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frontend:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(tts.router)
app.include_router(conversations.router)
app.include_router(metrics.router)
app.include_router(debate.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.on_event("startup")
async def startup():
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("OpsVoice Backend starting up")
    logger.info("=" * 60)
    settings.log_key_status()
    init_db()
    logger.info("Database initialized")
    run_migrations()
    setup_observability()
    logger.info("=" * 60)


def get_uptime() -> float:
    return time.time() - START_TIME
