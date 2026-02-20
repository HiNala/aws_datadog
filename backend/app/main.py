import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import chat, health, tts

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
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(tts.router)


@app.on_event("startup")
async def startup():
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("OpsVoice Backend starting up")
    logger.info("=" * 60)
    settings.log_key_status()
    init_db()
    logger.info("Database initialized")
    logger.info("=" * 60)


def get_uptime() -> float:
    return time.time() - START_TIME
