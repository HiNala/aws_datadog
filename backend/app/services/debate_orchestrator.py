"""
Dual-Perspective Debate Orchestrator.

Given a topic, generates two distinct agent personas with contrasting perspectives,
then orchestrates a structured debate between them — each turn informed by the prior
conversation history. Designed for low-latency voice delivery via TTS streaming.
"""

import json
import logging
import time

from app.config import get_settings
from app.services.bedrock import BedrockService
from app.services.minimax_chat import MiniMaxChat

logger = logging.getLogger("opsvoice.debate")

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
    """LLM inference with Bedrock → MiniMax fallback (mirrors chat router logic)."""
    settings = get_settings()
    errors: list[str] = []

    has_aws = (
        bool(settings.aws_bearer_token_bedrock)
        or bool(settings.aws_access_key_id and settings.aws_secret_access_key)
        or bool(settings.aws_bedrock_api_key_backup)
    )
    if has_aws:
        try:
            return _get_bedrock().invoke(messages)
        except Exception as e:
            logger.warning("Bedrock failed for debate, trying MiniMax: %s", str(e)[:100])
            errors.append(f"bedrock: {str(e)[:60]}")

    mm = _get_minimax()
    if mm.is_available():
        try:
            return mm.invoke(messages)
        except Exception as e:
            errors.append(f"minimax: {str(e)[:60]}")

    raise RuntimeError(
        f"All LLM providers failed for debate generation. Details: {'; '.join(errors)}"
    )


# ---------------------------------------------------------------------------
# Perspective generation
# ---------------------------------------------------------------------------

_PERSPECTIVE_SYSTEM = """You are a debate format architect. Given a topic, craft two contrasting but intellectually legitimate perspectives for a structured dialogue.

Return ONLY valid JSON — no markdown, no explanation — with this exact shape:
{
  "agent_a": {
    "name": "The [evocative 1-2 word title]",
    "perspective": "One clear, compelling sentence stating their position."
  },
  "agent_b": {
    "name": "The [evocative 1-2 word title]",
    "perspective": "One clear, compelling sentence stating their contrasting position."
  }
}

Rules:
- Names must be evocative and distinct (e.g. "The Pragmatist", "The Visionary", "The Skeptic")
- Perspectives must be intellectually genuine — not strawmen
- The two positions should create productive tension, not just be opposites
- Keep perspective sentences under 20 words"""


def generate_perspectives(topic: str) -> dict:
    """
    Call LLM to produce two agent profiles for the given topic.
    Returns a dict with agent_a, agent_b keys (each with name + perspective)
    plus a _meta key with model/token/latency info.
    """
    messages = [
        {"role": "system", "content": _PERSPECTIVE_SYSTEM},
        {
            "role": "user",
            "content": f'Topic: "{topic}"\n\nGenerate two contrasting debate perspectives.',
        },
    ]

    t0 = time.time()
    result = _infer(messages)
    latency_ms = round((time.time() - t0) * 1000, 1)

    raw = result["content"].strip()
    # Robustly extract JSON even if model adds surrounding text
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        raw = raw[start:end]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Perspective JSON parse failed: %s | raw: %s", e, raw[:200])
        raise RuntimeError(f"Failed to parse perspective JSON: {e}")

    # Validate expected keys
    for key in ("agent_a", "agent_b"):
        if key not in data:
            raise RuntimeError(f"Perspective response missing key: {key}")
        for field in ("name", "perspective"):
            if field not in data[key]:
                raise RuntimeError(f"Perspective response missing {key}.{field}")

    data["_meta"] = {
        "model": result.get("model", "unknown"),
        "input_tokens": result.get("input_tokens", 0),
        "output_tokens": result.get("output_tokens", 0),
        "latency_ms": latency_ms,
    }

    logger.info(
        "Perspectives generated: A=%r, B=%r (%.0fms, model=%s)",
        data["agent_a"]["name"],
        data["agent_b"]["name"],
        latency_ms,
        result.get("model", "?"),
    )
    return data


# ---------------------------------------------------------------------------
# Turn generation
# ---------------------------------------------------------------------------

_TURN_SYSTEM_TEMPLATE = """You are {agent_name}, a thoughtful voice in a structured debate.

Your position: {agent_perspective}

Topic under discussion: {topic}

Delivery rules — follow precisely:
- Write 2–3 focused paragraphs, 100–150 words total
- Pure flowing prose — no bullets, headers, or markdown
- Respond directly to what the previous speaker said (when applicable)
- Use vivid language, concrete examples, or analogies to strengthen your point
- Speak naturally — your words will be converted to audio and played aloud
- Do not introduce yourself or state your name
- Do not start with "I" — vary your sentence openings"""


def generate_turn(
    *,
    topic: str,
    agent_name: str,
    agent_perspective: str,
    opponent_name: str,
    history: list[dict],  # [{"agent": "a"|"b", "name": str, "text": str}]
    turn_number: int,
) -> dict:
    """
    Generate the next debate turn for the specified agent.

    Args:
        topic: The debate topic.
        agent_name: Display name of the speaking agent.
        agent_perspective: One-sentence perspective of the speaking agent.
        opponent_name: Display name of the opponent (for attribution in history).
        history: List of previous turns in chronological order.
        turn_number: 1-indexed turn number.

    Returns:
        dict with text, model, input_tokens, output_tokens, latency_ms.
    """
    system = _TURN_SYSTEM_TEMPLATE.format(
        agent_name=agent_name,
        agent_perspective=agent_perspective,
        topic=topic,
    )

    # Build conversation history as a readable context block
    if not history:
        user_content = (
            f"This is Turn 1. Please give your opening statement on the topic: {topic}"
        )
    else:
        lines = []
        for h in history:
            speaker = h["name"]
            lines.append(f"{speaker}: {h['text']}")
        convo_block = "\n\n---\n\n".join(lines)
        user_content = (
            f"Debate so far:\n\n{convo_block}\n\n"
            f"---\n\nThis is Turn {turn_number}. Now make your argument."
        )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]

    t0 = time.time()
    result = _infer(messages)
    latency_ms = round((time.time() - t0) * 1000, 1)

    text = result["content"].strip()

    logger.info(
        "Debate turn %d (%s): %d tokens out, %.0fms, model=%s",
        turn_number,
        agent_name,
        result.get("output_tokens", 0),
        latency_ms,
        result.get("model", "?"),
    )

    return {
        "text": text,
        "model": result.get("model", "unknown"),
        "input_tokens": result.get("input_tokens", 0),
        "output_tokens": result.get("output_tokens", 0),
        "latency_ms": latency_ms,
    }
