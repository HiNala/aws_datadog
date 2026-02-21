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
    """LLM inference with Bedrock → MiniMax fallback (mirrors chat router logic).
    
    Automatically extracts any system-role messages and passes them as the
    separate `system` parameter required by the Anthropic Messages API.
    """
    system: str | None = None
    user_messages: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        else:
            user_messages.append(m)

    settings = get_settings()
    errors: list[str] = []

    has_aws = (
        bool(settings.aws_bearer_token_bedrock)
        or bool(settings.aws_access_key_id and settings.aws_secret_access_key)
        or bool(settings.aws_bedrock_api_key_backup)
    )
    if has_aws:
        try:
            return _get_bedrock().invoke(user_messages, system=system)
        except Exception as e:
            logger.warning("Bedrock failed for debate, trying MiniMax: %s", str(e)[:100])
            errors.append(f"bedrock: {str(e)[:60]}")

    mm = _get_minimax()
    if mm.is_available():
        try:
            return mm.invoke(user_messages, system=system)
        except Exception as e:
            errors.append(f"minimax: {str(e)[:60]}")

    raise RuntimeError(
        f"All LLM providers failed for debate generation. Details: {'; '.join(errors)}"
    )


# ---------------------------------------------------------------------------
# Perspective generation
# ---------------------------------------------------------------------------

_PERSPECTIVE_SYSTEM_STANDARD = """You are a debate format architect. Given ANY topic (technology, philosophy, culture, sports, science, politics, art, food, or anything else), craft two contrasting but intellectually legitimate perspectives for a structured dialogue.

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
- Names must be evocative and distinct (e.g. "The Pragmatist", "The Visionary", "The Skeptic", "The Purist")
- Perspectives must be intellectually genuine — not strawmen
- The two positions should create productive tension, not just be opposites
- Keep perspective sentences under 20 words
- Works for ANY subject — not just tech"""

_PERSPECTIVE_SYSTEM_RAP_BATTLE = """You are a legendary hip-hop battle MC organizer. Given a topic, create two rapper personas who will battle head-to-head with opposing stances.

Return ONLY valid JSON — no markdown, no explanation — with this exact shape:
{
  "agent_a": {
    "name": "MC [Creative Name]",
    "perspective": "I spit [their stance] and drop it like a beat, you can't compete"
  },
  "agent_b": {
    "name": "Lil [Creative Name]",
    "perspective": "I ride the wave of [their stance], leave you behind every time"
  }
}

Rules:
- Names MUST be creative rapper names with tech or topic puns (e.g. "MC Monolith", "Lil Lambda", "DJ Dockerfile", "Notorious B.U.G.")
- Perspectives must be a single rhyming bar that states their stance with swagger
- Make the personas feel like real battle rappers with attitude and confidence
- Keep it high energy — these are performers, not professors"""

_PERSPECTIVE_SYSTEM_BLAME_GAME = """You are a corporate HR mediator for a tech incident. Given an outage scenario, create two employees blaming each other.

Return ONLY valid JSON — no markdown, no explanation — with this exact shape:
{
  "agent_a": {
    "name": "[Job Title] [Name]",
    "perspective": "Defensive statement blaming the other person."
  },
  "agent_b": {
    "name": "[Job Title] [Name]",
    "perspective": "Aggressive statement blaming the first person."
  }
}

Rules:
- Names should be realistic roles (e.g. "DevOps Dave", "Product Paul", "Intern Ian")
- Perspectives must be passive-aggressive and finger-pointing
- Make it sound like a tense post-mortem"""

_PERSPECTIVE_SYSTEM_ROAST = """You are a comedy roast master. Given a tech topic, create two comedians who will roast the concept.

Return ONLY valid JSON — no markdown, no explanation — with this exact shape:
{
  "agent_a": {
    "name": "Roaster [Name]",
    "perspective": "A brutal one-liner about the topic."
  },
  "agent_b": {
    "name": "Comedian [Name]",
    "perspective": "A sarcastic observation about the topic."
  }
}
"""

def generate_perspectives(topic: str, style: str = "standard") -> dict:
    """
    Call LLM to produce two agent profiles for the given topic.
    Returns a dict with agent_a, agent_b keys (each with name + perspective)
    plus a _meta key with model/token/latency info.
    """
    if style == "rap_battle":
        system_prompt = _PERSPECTIVE_SYSTEM_RAP_BATTLE
    elif style == "blame_game":
        system_prompt = _PERSPECTIVE_SYSTEM_BLAME_GAME
    elif style == "roast":
        system_prompt = _PERSPECTIVE_SYSTEM_ROAST
    else:
        system_prompt = _PERSPECTIVE_SYSTEM_STANDARD

    messages = [
        {"role": "system", "content": system_prompt},
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

_TURN_SYSTEM_STANDARD = """You are {agent_name}, a thoughtful voice in a structured debate.

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

_TURN_SYSTEM_RAP_BATTLE = """You are {agent_name}, a battle rapper with FIRE delivery.

Your stance: {agent_perspective}
Topic: {topic}
Your opponent: {opponent_name}

You are in a LIVE RAP BATTLE. Your words will be spoken aloud by a text-to-speech voice, so write for SPOKEN RHYTHM, not reading.

STRICT FORMAT — ONE SHORT VERSE:
- Write EXACTLY 4-6 lines (bars). No more. This is ONE verse, not a full song.
- Each line is ONE bar. Keep bars SHORT (8-14 words max per line).
- Use AABB rhyme scheme (consecutive lines rhyme). Every. Single. Line. Must. Rhyme.
- Use INTERNAL RHYMES and MULTI-SYLLABIC rhymes for flow (e.g. "cloud formation / loud migration")
- Add PUNCH LINES — the last 1-2 bars should be a devastating closer

STYLE RULES:
- RAP, don't lecture. Short punchy phrases, not paragraphs.
- DISS your opponent directly by name. Call them out. Be savage.
- Reference specific tech (AWS, Bedrock, Lambda, Docker, K8s, APIs, etc.) as metaphors
- Use hip-hop slang naturally: bars, flow, spit, drop, fire, stack, clap back
- Vary your cadence — some lines fast, some with pauses for emphasis
- Add commas for rhythmic pauses where a rapper would breathe
- NO markdown, NO bullets, NO quotation marks, NO stage directions
- Do NOT introduce yourself or say your name
- Do NOT start with "Yo" on every verse — vary your openings

EXAMPLE of good 4-bar verse rhythm:
Lambda functions calling, my pipelines never lag,
Your deployment's so slow, it came with a price tag,
I got real-time streaming while you reading the docs,
Claude Sonnet on my team, and your model just talks.

NOW WRITE YOUR VERSE. Remember: 4-6 bars, rhyming, punchy, diss your opponent."""

_TURN_SYSTEM_BLAME_GAME = """You are {agent_name}, in a heated argument about an outage.

Your position: {agent_perspective}
Topic: {topic}

Delivery rules:
- Write 1 paragraph (50-80 words)
- Be defensive, interruptive, and blame the other person
- Use corporate buzzwords weaponized as insults
- Mention specific (fictional) logs, commits, or tickets
- NO MARKDOWN
- Act like you are trying to save your job"""

_TURN_SYSTEM_ROAST = """You are {agent_name}, a comedian roasting this topic.

Your position: {agent_perspective}
Topic: {topic}

Delivery rules:
- Write 3-4 punchy sentences
- Be savage but funny
- Use metaphors
- NO MARKDOWN"""

def generate_turn(
    *,
    topic: str,
    agent_name: str,
    agent_perspective: str,
    opponent_name: str,
    history: list[dict],  # [{"agent": "a"|"b", "name": str, "text": str}]
    turn_number: int,
    style: str = "standard",
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
        style: Debate style (standard, rap_battle, blame_game, roast).

    Returns:
        dict with text, model, input_tokens, output_tokens, latency_ms.
    """
    if style == "rap_battle":
        template = _TURN_SYSTEM_RAP_BATTLE
    elif style == "blame_game":
        template = _TURN_SYSTEM_BLAME_GAME
    elif style == "roast":
        template = _TURN_SYSTEM_ROAST
    else:
        template = _TURN_SYSTEM_STANDARD

    system = template.format(
        agent_name=agent_name,
        agent_perspective=agent_perspective,
        topic=topic,
        opponent_name=opponent_name,
    )

    # Build conversation history as a readable context block
    is_rap = style == "rap_battle"

    if not history:
        if is_rap:
            user_content = (
                f"The crowd is hyped. You're up first. Topic: {topic}\n"
                f"Drop your opening verse — 4-6 bars, make it HIT."
            )
        else:
            user_content = (
                f"This is Turn 1. Please give your opening statement on the topic: {topic}"
            )
    else:
        lines = []
        for h in history:
            speaker = h["name"]
            lines.append(f"{speaker}: {h['text']}")
        convo_block = "\n\n---\n\n".join(lines)
        if is_rap:
            last_speaker = history[-1]["name"]
            user_content = (
                f"Battle so far:\n\n{convo_block}\n\n"
                f"---\n\n{last_speaker} just dropped their verse. "
                f"CLAP BACK. Reference what they said, flip their lines, and go HARDER. "
                f"4-6 bars. Make the crowd lose it."
            )
        else:
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
