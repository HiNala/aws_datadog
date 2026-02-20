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
from app.services.datadog_obs import (
    annotate,
    annotate_llm_call,
    task_span,
    workflow_span,
)

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

    with workflow_span("opsvoice-voice-pipeline"):
        # Tag entire workflow at entry
        annotate(
            input_data=req.message,
            tags={
                "interface": req.metadata.get("interface", "http") if hasattr(req, "metadata") else "http",
                "env": "hackathon",
                "ml_app": "opsvoice",
            },
        )

        # ── Resolve / create conversation ─────────────────────────────────
        conv_id = req.conversation_id or str(uuid.uuid4())

        with task_span("db-resolve-conversation"):
            existing = db.query(ConversationRow).filter_by(id=conv_id).first()
            if not existing:
                db.add(ConversationRow(id=conv_id, title=req.message[:80]))
                db.commit()

        # ── Load recent context ───────────────────────────────────────────
        with task_span("db-load-history"):
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

        # ── Invoke Claude via Bedrock ─────────────────────────────────────
        start = time.time()
        try:
            with task_span("bedrock-claude-invoke"):
                result = bedrock.invoke(messages)
        except Exception as e:
            logger.error("Bedrock invocation failed: %s", e)
            annotate(
                tags={"error": "bedrock_invoke_failed", "error_message": str(e)[:100]},
            )
            raise HTTPException(status_code=502, detail=f"LLM error: {e}")

        latency_ms = round((time.time() - start) * 1000, 1)

        response_text = result["content"]
        input_tokens   = result.get("input_tokens", 0)
        output_tokens  = result.get("output_tokens", 0)
        model_id       = result.get("model", "unknown")

        # ── Rich LLM Obs annotation ───────────────────────────────────────
        annotate_llm_call(
            input_messages=messages,
            output_text=response_text,
            model=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            conversation_id=conv_id,
        )

        # ── Persist messages ──────────────────────────────────────────────
        with task_span("db-persist-messages"):
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

        # Final workflow annotation
        annotate(
            output_data=response_text,
            tags={
                "model": model_id,
                "conversation_id": conv_id[:8],
                "response_chars": str(len(response_text)),
            },
            metrics={
                "input_tokens": float(input_tokens),
                "output_tokens": float(output_tokens),
                "total_tokens": float(input_tokens + output_tokens),
                "latency_ms": latency_ms,
            },
        )

    logger.info(
        "Chat complete: %d/%d tokens, %.0fms, model=%s, conv=%s",
        input_tokens, output_tokens, latency_ms, model_id, conv_id[:8],
    )

    return ChatResponse(
        response=response_text,
        conversation_id=conv_id,
        model=model_id,
        tokens=TokenUsage(input=input_tokens, output=output_tokens),
        latency_ms=latency_ms,
    )
