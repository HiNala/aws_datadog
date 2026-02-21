"""
Datadog LLM Observability helpers.

Auto-instrumentation happens via `ddtrace-run` at process start (set in docker-compose).
This module adds manual spans + rich annotations for judges to see in the Datadog UI.

Span hierarchy for a chat request:
  workflow("opusvoice-chat")
    task("db-resolve-conversation")
    task("db-load-history")
    llm("chat-llm")          ← actual LLM call with proper input/output/metrics
    task("db-persist-messages")

Span hierarchy for a debate turn:
  workflow("debate-turn-N")
    llm("debate-agent-a/b")  ← actual LLM call
  task("db-persist-debate-turn")

Required env vars:
    DD_API_KEY, DD_SITE, DD_LLMOBS_ENABLED=1,
    DD_LLMOBS_ML_APP=opusvoice, DD_LLMOBS_AGENTLESS_ENABLED=true
"""

import contextlib
import logging
import os
from typing import Any

logger = logging.getLogger("opusvoice.datadog")

_llmobs = None
_enabled: bool | None = None


def _get_llmobs():
    global _llmobs
    if _llmobs is not None:
        return _llmobs
    try:
        from ddtrace.llmobs import LLMObs
        _llmobs = LLMObs
        return _llmobs
    except ImportError:
        logger.debug("ddtrace not installed — Datadog LLM Obs spans disabled")
        return None


def is_enabled() -> bool:
    global _enabled
    if _enabled is None:
        key = os.environ.get("DD_API_KEY", "")
        _enabled = (
            os.environ.get("DD_LLMOBS_ENABLED") == "1"
            and bool(key)
            and not key.startswith("your_")
        )
        if _enabled:
            logger.info("Datadog LLM Observability: ENABLED (app=%s)",
                        os.environ.get("DD_LLMOBS_ML_APP", "opusvoice"))
        else:
            logger.info("Datadog LLM Observability: disabled (no DD_API_KEY set)")
    return _enabled


def setup_observability() -> None:
    """Initialize LLM Observability programmatically (agentless mode)."""
    if not is_enabled():
        return

    llmobs = _get_llmobs()
    if llmobs is None:
        return

    try:
        llmobs.enable(
            ml_app=os.environ.get("DD_LLMOBS_ML_APP", "opusvoice"),
            api_key=os.environ.get("DD_API_KEY"),
            site=os.environ.get("DD_SITE", "datadoghq.com"),
            agentless_enabled=True,
            env=os.environ.get("DD_ENV", "hackathon"),
            service=os.environ.get("DD_SERVICE", "opusvoice-backend"),
        )
        logger.info("Datadog LLM Observability programmatic enable: OK")
    except Exception as e:
        logger.warning("Datadog LLM Obs setup error (ddtrace-run handles it anyway): %s", e)


# ---------------------------------------------------------------------------
# Span context managers
# ---------------------------------------------------------------------------

def workflow_span(name: str, session_id: str | None = None):
    """Context manager: top-level workflow span (wraps an entire user request)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    kwargs: dict[str, Any] = {"name": name}
    if session_id:
        kwargs["session_id"] = session_id
    return llmobs.workflow(**kwargs)


def task_span(name: str, session_id: str | None = None):
    """Context manager: task span (DB query, API call, preprocessing step)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    kwargs: dict[str, Any] = {"name": name}
    if session_id:
        kwargs["session_id"] = session_id
    return llmobs.task(**kwargs)


def llm_span(
    name: str,
    model_name: str = "claude-sonnet-4",
    model_provider: str = "aws_bedrock",
    session_id: str | None = None,
):
    """
    Context manager: LLM span.

    Use this to wrap every LLM inference call. Datadog classifies it as an
    LLM call and tracks prompt_tokens / completion_tokens / total_tokens.

    Example:
        with llm_span("chat-llm", session_id=conv_id):
            annotate(input_data=[{"role": "user", "content": prompt}])
            result = call_llm(...)
            annotate(
                output_data=[{"role": "assistant", "content": result}],
                metrics={"prompt_tokens": n, "completion_tokens": m, "total_tokens": n+m},
            )
    """
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    kwargs: dict[str, Any] = {
        "name": name,
        "model_name": model_name,
        "model_provider": model_provider,
    }
    if session_id:
        kwargs["session_id"] = session_id
    return llmobs.llm(**kwargs)


def agent_span(name: str, session_id: str | None = None):
    """Context manager: agent span (autonomous multi-step orchestration)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    kwargs: dict[str, Any] = {"name": name}
    if session_id:
        kwargs["session_id"] = session_id
    return llmobs.agent(**kwargs)


def tool_span(name: str, session_id: str | None = None):
    """Context manager: tool span (external tool call e.g. TTS synthesis)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    kwargs: dict[str, Any] = {"name": name}
    if session_id:
        kwargs["session_id"] = session_id
    return llmobs.tool(**kwargs)


# ---------------------------------------------------------------------------
# Annotation helpers
# ---------------------------------------------------------------------------

def annotate(**kwargs) -> None:
    """Annotate the current active span with input/output/tags/metrics/metadata."""
    if not is_enabled():
        return
    llmobs = _get_llmobs()
    if llmobs is None:
        return
    try:
        llmobs.annotate(**kwargs)
    except Exception as e:
        logger.debug("LLMObs.annotate error: %s", e)


def annotate_llm_call(
    *,
    input_messages: list[dict] | None = None,
    output_text: str | None = None,
    model: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: float = 0,
    interface: str = "http",
    conversation_id: str = "",
) -> None:
    """
    Convenience: annotate the current LLM span with standard Datadog LLM metrics.

    Call this INSIDE a `llm_span(...)` context manager so the annotations go
    to the correct span type.

    Metric keys follow Datadog LLM Observability standard:
      prompt_tokens, completion_tokens, total_tokens
    """
    if not is_enabled():
        return

    tags: dict[str, Any] = {
        "interface": interface,
        "env": os.environ.get("DD_ENV", "hackathon"),
        "ml_app": os.environ.get("DD_LLMOBS_ML_APP", "opusvoice"),
    }
    if model:
        tags["model"] = model
    if conversation_id:
        tags["conversation_id"] = conversation_id[:8]

    # Use Datadog standard metric keys for LLM Observability
    metrics: dict[str, float] = {
        "prompt_tokens": float(input_tokens),
        "completion_tokens": float(output_tokens),
        "total_tokens": float(input_tokens + output_tokens),
        "latency_ms": latency_ms,
    }

    kwargs: dict = {"tags": tags, "metrics": metrics}

    if input_messages:
        # Ensure messages have role/content format for Datadog LLM spans
        kwargs["input_data"] = [
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in input_messages
        ]

    if output_text:
        # Datadog LLM spans expect output_data as a list of message dicts
        kwargs["output_data"] = [{"role": "assistant", "content": output_text}]

    annotate(**kwargs)


# ---------------------------------------------------------------------------
# Process lifecycle
# ---------------------------------------------------------------------------

def flush() -> None:
    """Flush all pending spans (call before process exit / shutdown)."""
    if not is_enabled():
        return
    llmobs = _get_llmobs()
    if llmobs is None:
        return
    try:
        llmobs.flush()
        logger.info("Datadog LLM Observability: spans flushed")
    except Exception:
        pass
