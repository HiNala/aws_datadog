import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    ConversationMessage,
    ConversationMessagesResponse,
    ConversationRow,
    ConversationSummary,
    ConversationsResponse,
    MessageRow,
)

logger = logging.getLogger("opsvoice.conversations")
router = APIRouter(prefix="/api", tags=["conversations"])


@router.get("/conversations", response_model=ConversationsResponse)
def list_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Return recent conversations with last-message preview and message count."""
    total = db.query(func.count(ConversationRow.id)).scalar() or 0

    rows = (
        db.query(ConversationRow)
        .order_by(ConversationRow.updated_at.desc())
        .limit(limit)
        .all()
    )

    summaries: list[ConversationSummary] = []
    for conv in rows:
        msg_count = (
            db.query(func.count(MessageRow.id))
            .filter(MessageRow.conversation_id == conv.id)
            .scalar()
            or 0
        )
        last = (
            db.query(MessageRow)
            .filter(MessageRow.conversation_id == conv.id, MessageRow.role == "assistant")
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


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=ConversationMessagesResponse,
)
def get_conversation_messages(
    conversation_id: str,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return messages for a conversation with pagination."""
    # Verify conversation exists
    conv = db.query(ConversationRow).filter(ConversationRow.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    rows = (
        db.query(MessageRow)
        .filter(MessageRow.conversation_id == conversation_id)
        .order_by(MessageRow.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    messages = [
        ConversationMessage(
            id=m.id,
            role=m.role,
            content=m.content,
            model=m.model,
            input_tokens=m.input_tokens,
            output_tokens=m.output_tokens,
            latency_ms=m.latency_ms,
            created_at=m.created_at.isoformat() if m.created_at else None,
        )
        for m in rows
    ]

    return ConversationMessagesResponse(
        conversation_id=conversation_id,
        messages=messages,
    )
