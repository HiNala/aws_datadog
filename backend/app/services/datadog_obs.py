"""
Datadog LLM Observability helpers.

Auto-instrumentation happens via `ddtrace-run` at process start (set in docker-compose).
This module adds manual spans + rich annotations for judges to see in the Datadog UI.

Required env vars:
    DD_API_KEY, DD_SITE, DD_LLMOBS_ENABLED=1,
    DD_LLMOBS_ML_APP=opsvoice, DD_LLMOBS_AGENTLESS_ENABLED=true
"""

import contextlib
import logging
import os

logger = logging.getLogger("opsvoice.datadog")

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
                        os.environ.get("DD_LLMOBS_ML_APP", "opsvoice"))
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
            ml_app=os.environ.get("DD_LLMOBS_ML_APP", "opsvoice"),
            api_key=os.environ.get("DD_API_KEY"),
            site=os.environ.get("DD_SITE", "datadoghq.com"),
            agentless_enabled=True,
            env=os.environ.get("DD_ENV", "hackathon"),
        )
        logger.info("Datadog LLM Observability programmatic enable: OK")
    except Exception as e:
        logger.warning("Datadog LLM Obs setup error (ddtrace-run handles it anyway): %s", e)


def workflow_span(name: str):
    """Context manager: top-level workflow span (wraps an entire user request)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    return llmobs.workflow(name=name)


def task_span(name: str):
    """Context manager: task span (DB query, API call, preprocessing step)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    return llmobs.task(name=name)


def llm_span(name: str, model_name: str = "claude-sonnet-4", model_provider: str = "aws_bedrock"):
    """Context manager: explicit LLM span (useful if not auto-traced)."""
    if not is_enabled():
        return contextlib.nullcontext()
    llmobs = _get_llmobs()
    if llmobs is None:
        return contextlib.nullcontext()
    return llmobs.llm(name=name, model_name=model_name, model_provider=model_provider)


def annotate(**kwargs) -> None:
    """Annotate the current active span with input/output/tags/metrics."""
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
    """Convenience: annotate an LLM call with full token + latency metadata."""
    if not is_enabled():
        return
    tags: dict[str, str] = {
        "interface": interface,
        "env": os.environ.get("DD_ENV", "hackathon"),
        "ml_app": os.environ.get("DD_LLMOBS_ML_APP", "opsvoice"),
    }
    if model:
        tags["model"] = model
    if conversation_id:
        tags["conversation_id"] = conversation_id[:8]

    metrics: dict[str, float] = {
        "input_tokens": float(input_tokens),
        "output_tokens": float(output_tokens),
        "total_tokens": float(input_tokens + output_tokens),
        "latency_ms": latency_ms,
    }

    kwargs: dict = {"tags": tags, "metrics": metrics}
    if input_messages:
        kwargs["input_data"] = input_messages
    if output_text:
        kwargs["output_data"] = output_text

    annotate(**kwargs)


def flush() -> None:
    """Flush all pending spans (call before process exit / Lambda return)."""
    if not is_enabled():
        return
    llmobs = _get_llmobs()
    if llmobs is None:
        return
    try:
        llmobs.flush()
    except Exception:
        pass
