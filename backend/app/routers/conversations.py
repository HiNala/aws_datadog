import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    ConversationRow,
    ConversationSummary,
    ConversationsResponse,
    MessageRow,
)

logger = logging.getLogger("opsvoice.conversations")
router = APIRouter(prefix="/api", tags=["conversations"])


@router.get("/conversations", response_model=ConversationsResponse)
def list_conversations(
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
):
    """Return recent conversations with last-message preview and count."""
    total = db.query(func.count(ConversationRow.id)).scalar() or 0

    rows = (
        db.query(ConversationRow)
        .order_by(ConversationRow.updated_at.desc())
        .limit(limit)
        .all()
    )

    summaries = []
    for conv in rows:
        # message count
        msg_count = (
            db.query(func.count(MessageRow.id))
            .filter_by(conversation_id=conv.id)
            .scalar()
            or 0
        )
        # last assistant message preview
        last = (
            db.query(MessageRow)
            .filter_by(conversation_id=conv.id, role="assistant")
            .order_by(MessageRow.created_at.desc())
            .first()
        )
        last_msg = last.content[:120] if last else None

        summaries.append(
            ConversationSummary(
                id=conv.id,
                title=conv.title,
                message_count=msg_count,
                last_message=last_msg,
                created_at=conv.created_at.isoformat() if conv.created_at else "",
            )
        )

    return ConversationsResponse(conversations=summaries, total=total)


@router.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
):
    """Return all messages for a specific conversation."""
    messages = (
        db.query(MessageRow)
        .filter_by(conversation_id=conversation_id)
        .order_by(MessageRow.created_at.asc())
        .all()
    )

    return {
        "conversation_id": conversation_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "model": m.model,
                "input_tokens": m.input_tokens,
                "output_tokens": m.output_tokens,
                "latency_ms": m.latency_ms,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }
