import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    ConversationRow,
    DebateSessionRow,
    DebateTurnRow,
    MessageRow,
    MetricsResponse,
)

logger = logging.getLogger("opusvoice.metrics")
router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    """Aggregate LLM usage metrics from PostgreSQL — chat + debate combined."""

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

    # ── Debate metrics ──
    total_debates = db.query(func.count(DebateSessionRow.id)).scalar() or 0
    total_debate_turns = db.query(func.count(DebateTurnRow.id)).scalar() or 0

    debate_token_row = db.query(
        func.sum(DebateTurnRow.input_tokens),
        func.sum(DebateTurnRow.output_tokens),
    ).first()
    debate_input = int(debate_token_row[0] or 0) if debate_token_row else 0
    debate_output = int(debate_token_row[1] or 0) if debate_token_row else 0

    debate_avg = (
        db.query(func.avg(DebateTurnRow.latency_ms))
        .filter(DebateTurnRow.latency_ms.isnot(None))
        .scalar()
    )

    # TTS requests ≈ assistant messages + debate turns (each gets a TTS call)
    tts_count = (
        db.query(func.count(MessageRow.id)).filter(MessageRow.role == "assistant").scalar() or 0
    ) + total_debate_turns

    return MetricsResponse(
        total_messages=total_messages,
        total_conversations=total_conversations,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        avg_latency_ms=round(avg_latency, 1) if avg_latency else None,
        p95_latency_ms=round(p95, 1) if p95 else None,
        models_used=models_used,
        total_debates=total_debates,
        total_debate_turns=total_debate_turns,
        debate_input_tokens=debate_input,
        debate_output_tokens=debate_output,
        debate_avg_latency_ms=round(debate_avg, 1) if debate_avg else None,
        tts_requests=tts_count,
    )
