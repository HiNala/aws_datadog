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
from app.services.minimax_chat import MiniMaxChat
from app.services.datadog_obs import (
    annotate,
    llm_span,
    task_span,
    workflow_span,
)

logger = logging.getLogger("opusvoice.chat")
router = APIRouter(prefix="/api", tags=["chat"])

_bedrock: BedrockService | None = None
_minimax: MiniMaxChat | None = None


def _get_bedrock() -> BedrockService:
    global _bedrock
    if _bedrock is None:
        _bedrock = BedrockService(get_settings())
    return _bedrock


def _get_minimax() -> MiniMaxChat:
    global _minimax
    if _minimax is None:
        _minimax = MiniMaxChat(get_settings())
    return _minimax


def _infer(messages: list[dict]) -> dict:
    """
    Try LLM providers in order:
      1. AWS Bedrock — Claude Sonnet 4 (primary, if creds work)
      2. MiniMax M2.5-highspeed — 100 tps, Anthropic-compatible (fallback)
    """
    settings = get_settings()
    errors: list[str] = []

    # 1. Bedrock (only attempt if credentials are actually configured)
    has_aws = (
        bool(settings.aws_bearer_token_bedrock)
        or bool(settings.aws_access_key_id and settings.aws_secret_access_key)
        or bool(settings.aws_bedrock_api_key_backup)
    )
    if has_aws:
        try:
            return _get_bedrock().invoke(messages)
        except Exception as e:
            logger.warning("Bedrock failed, trying MiniMax M2.5: %s", str(e)[:100])
            errors.append(f"bedrock: {str(e)[:80]}")

    # 2. MiniMax M2.5 fallback
    mm = _get_minimax()
    if mm.is_available():
        try:
            return mm.invoke(messages)
        except Exception as e:
            errors.append(f"minimax: {str(e)[:80]}")

    raise RuntimeError(
        f"All LLM providers failed. Ensure AWS Bedrock model access is enabled "
        f"OR MiniMax API key is configured. Details: {'; '.join(errors)}"
    )


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(message) > 32_000:
        raise HTTPException(status_code=400, detail="Message too long (max 32,000 chars)")

    conv_id = req.conversation_id or str(uuid.uuid4())

    with workflow_span("opusvoice-chat", session_id=conv_id):
        annotate(
            input_data=req.message,
            tags={"feature": "chat", "env": "hackathon", "ml_app": "opusvoice"},
        )

        # ── Resolve / create conversation ─────────────────────────────────
        with task_span("db-resolve-conversation", session_id=conv_id):
            conv = db.query(ConversationRow).filter_by(id=conv_id).first()
            if not conv:
                conv = ConversationRow(id=conv_id, title=req.message[:80])
                db.add(conv)
                db.commit()
                db.refresh(conv)

        # ── Load recent context ───────────────────────────────────────────
        with task_span("db-load-history", session_id=conv_id):
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

        # ── Invoke LLM inside a proper llm_span ───────────────────────────
        # Using llm_span so Datadog classifies this as an LLM call and tracks
        # prompt_tokens / completion_tokens in the LLM Observability view.
        t0 = time.time()
        try:
            with llm_span("chat-llm", model_name="claude-sonnet-4", model_provider="aws_bedrock", session_id=conv_id):
                # Annotate LLM input (list of role/content dicts — standard Datadog format)
                annotate(
                    input_data=[{"role": m["role"], "content": m["content"]} for m in messages],
                )

                result = _infer(messages)

                # Annotate LLM output with Datadog standard metric keys
                model_id = result.get("model", "unknown")
                in_tok = result.get("input_tokens", 0)
                out_tok = result.get("output_tokens", 0)
                annotate(
                    output_data=[{"role": "assistant", "content": result["content"]}],
                    metadata={"model": model_id},
                    metrics={
                        "prompt_tokens": float(in_tok),
                        "completion_tokens": float(out_tok),
                        "total_tokens": float(in_tok + out_tok),
                    },
                )

        except Exception as e:
            logger.error("LLM invocation failed: %s", e)
            annotate(tags={"error": "llm_invoke_failed", "error_message": str(e)[:100]})
            raise HTTPException(status_code=502, detail=f"LLM error: {e}")

        latency_ms = round((time.time() - t0) * 1000, 1)

        response_text = result["content"]
        input_tokens  = result.get("input_tokens", 0)
        output_tokens = result.get("output_tokens", 0)
        model_id      = result.get("model", "unknown")

        # Determine display provider
        if model_id.startswith("minimax/"):
            model_provider = "MiniMax"
            model_display = model_id.replace("minimax/", "")
        elif "claude" in model_id.lower():
            model_provider = "AWS Bedrock"
            model_display = model_id.split(".")[-1][:30] if "." in model_id else model_id
        else:
            model_provider = "unknown"
            model_display = model_id

        # ── Persist messages ──────────────────────────────────────────────
        with task_span("db-persist-messages", session_id=conv_id):
            now = datetime.now(timezone.utc)
            db.add(MessageRow(
                conversation_id=conv_id,
                role="user",
                content=req.message,
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
            conv.updated_at = now
            db.commit()

        # ── Annotate the overall workflow span ────────────────────────────
        annotate(
            output_data=response_text,
            tags={
                "model": model_id,
                "model_provider": model_provider,
                "conversation_id": conv_id[:8],
            },
            metrics={
                "latency_ms": latency_ms,
                "response_chars": float(len(response_text)),
            },
        )

    logger.info(
        "Chat: %d/%d tokens, %.0fms, model=%s, provider=%s, conv=%s",
        input_tokens, output_tokens, latency_ms, model_display, model_provider, conv_id[:8],
    )

    return ChatResponse(
        response=response_text,
        conversation_id=conv_id,
        model=model_display,
        model_provider=model_provider,
        tokens=TokenUsage(input=input_tokens, output=output_tokens),
        latency_ms=latency_ms,
    )
