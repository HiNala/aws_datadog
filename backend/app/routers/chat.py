import logging
import time
import uuid
from datetime import datetime, timezone

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
from app.services.datadog_obs import annotate, task_span, workflow_span

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
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(message) > 32_000:
        raise HTTPException(status_code=400, detail="Message too long (max 32,000 chars)")

    bedrock = _get_bedrock()

    with workflow_span("opsvoice-chat-request"):
        annotate(
            input_data=message,
            tags={"interface": "http", "env": "hackathon"},
        )

        # Resolve or create conversation
        conv_id = req.conversation_id or str(uuid.uuid4())

        with task_span("resolve-conversation"):
            conv = db.query(ConversationRow).filter_by(id=conv_id).first()
            if not conv:
                conv = ConversationRow(id=conv_id, title=message[:80])
                db.add(conv)
                db.commit()
                db.refresh(conv)

        # Load recent history for context (last 20 turns, newest-first then reversed)
        with task_span("load-history"):
            history_rows = (
                db.query(MessageRow)
                .filter_by(conversation_id=conv_id)
                .order_by(MessageRow.created_at.desc())
                .limit(20)
                .all()
            )
            history_rows.reverse()

        messages = [{"role": r.role, "content": r.content} for r in history_rows]
        messages.append({"role": "user", "content": message})

        # Call Bedrock
        start = time.time()
        try:
            with task_span("bedrock-invoke"):
                result = bedrock.invoke(messages)
        except Exception as e:
            logger.error("Bedrock invocation failed: %s", e)
            raise HTTPException(status_code=502, detail=f"LLM error: {e}")

        latency_ms = round((time.time() - start) * 1000, 1)

        response_text = result["content"]
        input_tokens = result.get("input_tokens", 0)
        output_tokens = result.get("output_tokens", 0)
        model_id = result.get("model", "unknown")

        # Persist user message + assistant response, bump conversation updated_at
        with task_span("persist-messages"):
            now = datetime.now(timezone.utc)
            db.add(MessageRow(
                conversation_id=conv_id,
                role="user",
                content=message,
                created_at=now,
            ))
            db.add(MessageRow(
                conversation_id=conv_id,
                role="assistant",
                content=response_text,
                model=model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
            ))
            # Touch updated_at so sidebar sorts correctly
            conv.updated_at = now
            db.commit()

        annotate(
            output_data=response_text,
            tags={
                "model": model_id,
                "input_tokens": str(input_tokens),
                "output_tokens": str(output_tokens),
                "latency_ms": str(latency_ms),
                "conversation_id": conv_id[:8],
            },
        )

    logger.info(
        "Chat response: %d in / %d out tokens, %.0fms, conv=%s",
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
