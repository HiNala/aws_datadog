"""
MiniMax M2.5 LLM service — Anthropic-SDK-compatible interface.

MiniMax exposes an Anthropic-compatible endpoint at:
  https://api.minimax.io/anthropic

Models (same capability, different throughput):
  MiniMax-M2.5-highspeed  — ~100 tps  — use for real-time voice
  MiniMax-M2.5            — ~60 tps   — use for complex reasoning

This acts as a drop-in fallback for BedrockService.invoke().
"""
import logging
from typing import Any

from app.config import Settings

logger = logging.getLogger("opsvoice.minimax_chat")

MINIMAX_BASE_URL = "https://api.minimax.io/anthropic"
MINIMAX_BASE_URL_UW = "https://api.minimax.io/anthropic"  # same endpoint for now

SYSTEM_PROMPT = (
    "You are OpsVoice, an expert AI assistant for cloud infrastructure operations. "
    "You help engineers monitor, diagnose, and resolve infrastructure issues. "
    "Keep responses concise and actionable — they may be spoken aloud via text-to-speech. "
    "Speak like a senior SRE briefing their team."
)

# Priority order — try fastest first
MODEL_CHAIN = [
    "MiniMax-M2.5-highspeed",  # 100 tps — fastest, same quality as M2.5
    "MiniMax-M2.5",            # 60 tps  — fallback
    "MiniMax-M2.1-highspeed",  # older, very reliable
]

MAX_TOKENS = 2048


class MiniMaxChat:
    """
    Calls MiniMax M2.5 via Anthropic SDK.
    Returns the same dict shape as BedrockService.invoke() for drop-in use.
    """

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.minimax_api_key
        if not self._api_key:
            logger.warning("MiniMaxChat: no API key configured")

    def is_available(self) -> bool:
        return bool(self._api_key)

    def invoke(self, messages: list[dict[str, str]], system: str | None = None) -> dict[str, Any]:
        """
        Invoke MiniMax M2.5 with the given messages.

        Args:
            messages: List of user/assistant messages (no system role).
            system: Optional system prompt override. Falls back to SYSTEM_PROMPT.

        Returns: {"content", "model", "input_tokens", "output_tokens", "stop_reason"}
        """
        if not self._api_key:
            raise RuntimeError("MiniMax API key not configured")

        try:
            import anthropic
        except ImportError as e:
            raise RuntimeError("anthropic package not installed") from e

        client = anthropic.Anthropic(
            base_url=MINIMAX_BASE_URL_UW,
            api_key=self._api_key,
        )

        anthropic_messages = []
        for m in messages:
            anthropic_messages.append({
                "role": m["role"],
                "content": [{"type": "text", "text": m["content"]}],
            })

        last_error: Exception = RuntimeError("No models tried")

        for model in MODEL_CHAIN:
            try:
                logger.info("MiniMaxChat: invoking %s (%d messages)", model, len(messages))
                response = client.messages.create(
                    model=model,
                    max_tokens=MAX_TOKENS,
                    system=system or SYSTEM_PROMPT,
                    messages=anthropic_messages,
                )

                content = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        content += block.text

                usage = response.usage
                result = {
                    "content": content,
                    "model": f"minimax/{model}",
                    "input_tokens": getattr(usage, "input_tokens", 0),
                    "output_tokens": getattr(usage, "output_tokens", 0),
                    "stop_reason": getattr(response, "stop_reason", "end_turn"),
                }

                logger.info(
                    "MiniMaxChat: %d/%d tokens, model=%s",
                    result["input_tokens"], result["output_tokens"], model,
                )
                return result

            except Exception as e:
                err = str(e)
                logger.warning("MiniMaxChat %s failed: %s", model, err[:100])
                last_error = e
                # If model not found, try next; otherwise propagate
                if "model_not_found" in err.lower() or "404" in err:
                    continue
                raise RuntimeError(f"MiniMax error ({model}): {err[:150]}") from e

        raise RuntimeError(f"All MiniMax models failed: {last_error}")
