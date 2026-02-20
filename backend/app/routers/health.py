import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import HealthResponse, MessageRow, ServiceStatus

logger = logging.getLogger("opsvoice.health")
router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    settings = get_settings()
    services = ServiceStatus()

    # Check PostgreSQL
    try:
        db.execute(text("SELECT 1"))
        services.database = "ok"
    except Exception:
        services.database = "error"

    # Check Bedrock credential availability
    if settings.aws_bearer_token_bedrock or settings.aws_bedrock_api_key_backup:
        services.bedrock = "ok"
    else:
        services.bedrock = "error"

    # Check MiniMax credential availability
    if settings.minimax_api_key:
        services.minimax = "ok"
    else:
        services.minimax = "error"

    overall = "ok" if all(
        v == "ok" for v in [services.database, services.bedrock]
    ) else "degraded"

    from app.main import get_uptime

    message_count = 0
    try:
        message_count = db.query(MessageRow).count()
    except Exception:
        pass

    return HealthResponse(
        status=overall,
        services=services,
        uptime_seconds=round(get_uptime(), 1),
        aws_key_source=settings.aws_key_source,
        recent_messages=message_count,
    )
