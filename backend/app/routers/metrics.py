import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ConversationRow, MessageRow, MetricsResponse

logger = logging.getLogger("opsvoice.metrics")
router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    """Aggregate LLM usage metrics from PostgreSQL."""

    total_messages = db.query(func.count(MessageRow.id)).scalar() or 0
    total_conversations = db.query(func.count(ConversationRow.id)).scalar() or 0

    token_row = db.query(
        func.sum(MessageRow.input_tokens),
        func.sum(MessageRow.output_tokens),
    ).first()
    total_input = int(token_row[0] or 0)
    total_output = int(token_row[1] or 0)

    avg_latency = (
        db.query(func.avg(MessageRow.latency_ms))
        .filter(MessageRow.role == "assistant")
        .scalar()
    )

    # p95 approximation: sort all latencies, pick 95th percentile row
    all_latencies = (
        db.query(MessageRow.latency_ms)
        .filter(MessageRow.role == "assistant", MessageRow.latency_ms.isnot(None))
        .order_by(MessageRow.latency_ms.asc())
        .all()
    )
    p95 = None
    if all_latencies:
        idx = max(0, int(len(all_latencies) * 0.95) - 1)
        p95 = all_latencies[idx][0]

    models = (
        db.query(MessageRow.model)
        .filter(MessageRow.model.isnot(None))
        .distinct()
        .all()
    )
    models_used = [m[0] for m in models if m[0]]

    return MetricsResponse(
        total_messages=total_messages,
        total_conversations=total_conversations,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        avg_latency_ms=round(avg_latency, 1) if avg_latency else None,
        p95_latency_ms=round(p95, 1) if p95 else None,
        models_used=models_used,
    )
