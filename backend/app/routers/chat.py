import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import (
    ChatRequest,
    ChatResponse,
    ConversationRow,
    MessageRow,
    TokenUsage,
)
from app.services.bedrock import BedrockService

logger = logging.getLogger("opsvoice.chat")
router = APIRouter(prefix="/api", tags=["chat"])

_bedrock: BedrockService | None = None


def _get_bedrock() -> BedrockService:
    global _bedrock
    if _bedrock is None:
        _bedrock = BedrockService(get_settings())
    return _bedrock


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    bedrock = _get_bedrock()

    # Resolve or create conversation
    conv_id = req.conversation_id or str(uuid.uuid4())
    existing = db.query(ConversationRow).filter_by(id=conv_id).first()
    if not existing:
        db.add(ConversationRow(id=conv_id, title=req.message[:80]))
        db.commit()

    # Load recent history for context
    history_rows = (
        db.query(MessageRow)
        .filter_by(conversation_id=conv_id)
        .order_by(MessageRow.created_at.desc())
        .limit(20)
        .all()
    )
    history_rows.reverse()

    messages = [{"role": r.role, "content": r.content} for r in history_rows]
    messages.append({"role": "user", "content": req.message})

    # Call Bedrock
    start = time.time()
    try:
        result = bedrock.invoke(messages)
    except Exception as e:
        logger.error("Bedrock invocation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    latency_ms = round((time.time() - start) * 1000, 1)

    response_text = result["content"]
    input_tokens = result.get("input_tokens", 0)
    output_tokens = result.get("output_tokens", 0)
    model_id = result.get("model", "unknown")

    # Persist user message + assistant response
    db.add(MessageRow(conversation_id=conv_id, role="user", content=req.message))
    db.add(
        MessageRow(
            conversation_id=conv_id,
            role="assistant",
            content=response_text,
            model=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
        )
    )
    db.commit()

    logger.info(
        "Chat response: %d input / %d output tokens, %.0fms, conv=%s",
        input_tokens,
        output_tokens,
        latency_ms,
        conv_id[:8],
    )

    return ChatResponse(
        response=response_text,
        conversation_id=conv_id,
        model=model_id,
        tokens=TokenUsage(input=input_tokens, output=output_tokens),
        latency_ms=latency_ms,
    )
