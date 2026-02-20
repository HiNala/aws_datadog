"""
Datadog LLM Observability helpers.

Auto-instrumentation happens via `ddtrace-run` at process start.
This module provides manual span helpers for richer traces.

Run the backend with:
    ddtrace-run uvicorn app.main:app --host 0.0.0.0 --port 8000

Required env vars (set in .env):
    DD_API_KEY, DD_SITE, DD_LLMOBS_ENABLED=1,
    DD_LLMOBS_ML_APP=opsvoice, DD_LLMOBS_AGENTLESS_ENABLED=true
"""

import logging
import os

logger = logging.getLogger("opsvoice.datadog")

_llmobs = None


def _get_llmobs():
    global _llmobs
    if _llmobs is not None:
        return _llmobs
    try:
        from ddtrace.llmobs import LLMObs
        _llmobs = LLMObs
        return _llmobs
    except ImportError:
        logger.warning("ddtrace not installed — Datadog LLM Obs spans disabled")
        return None


def setup_observability() -> None:
    """Initialize LLM Observability if ddtrace is available and configured."""
    if os.environ.get("DD_LLMOBS_ENABLED") != "1":
        logger.info("Datadog LLM Obs disabled (DD_LLMOBS_ENABLED != 1)")
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
        logger.info("Datadog LLM Observability enabled (app=opsvoice)")
    except Exception as e:
        logger.warning("Datadog LLM Obs setup failed: %s", e)


def workflow_span(name: str):
    """Context manager for a Datadog LLM Obs workflow span."""
    llmobs = _get_llmobs()
    if llmobs is None:
        import contextlib
        return contextlib.nullcontext()
    return llmobs.workflow(name=name)


def task_span(name: str):
    """Context manager for a Datadog LLM Obs task span."""
    llmobs = _get_llmobs()
    if llmobs is None:
        import contextlib
        return contextlib.nullcontext()
    return llmobs.task(name=name)


def annotate(**kwargs) -> None:
    """Annotate the current span with metadata."""
    llmobs = _get_llmobs()
    if llmobs is None:
        return
    try:
        llmobs.annotate(**kwargs)
    except Exception:
        pass
