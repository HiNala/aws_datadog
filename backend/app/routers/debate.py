"""
Dual-Perspective Debate Router.

Endpoints:
  POST /api/debate/start          — Create session, generate agent perspectives
  POST /api/debate/{id}/turn      — Generate + stream next debate turn (SSE)
  GET  /api/debate/{id}           — Retrieve full session with all turns
  GET  /api/debate/sessions       — List recent debate sessions

DataDog Observability:
  - workflow_span wrapping the full session creation
  - task_span for perspective generation, DB ops
  - llm_span for each agent turn with full token + latency metadata
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    AgentProfile,
    DebateSessionResponse,
    DebateSessionRow,
    DebateStartRequest,
    DebateTurnRequest,
    DebateTurnRow,
)
from app.services import debate_orchestrator
from app.services.minimax_tts import DEBATE_VOICES
from app.services.datadog_obs import (
    annotate,
    annotate_llm_call,
    task_span,
    workflow_span,
)

logger = logging.getLogger("opsvoice.debate")
router = APIRouter(prefix="/api/debate", tags=["debate"])

_VOICE_A_DEFAULT = "English_expressive_narrator"
_VOICE_B_DEFAULT = "Deep_Voice_Man"
_COLOR_A = "indigo"
_COLOR_B = "amber"


# ---------------------------------------------------------------------------
# Helper: load session or 404
# ---------------------------------------------------------------------------

def _get_session(session_id: str, db: Session) -> DebateSessionRow:
    session = db.query(DebateSessionRow).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Debate session not found")
    return session


# ---------------------------------------------------------------------------
# GET /api/debate/voices  — static list of available voices (must come before /{session_id})
# ---------------------------------------------------------------------------

@router.get("/voices")
def get_voices():
    """Return all available debate voices with metadata."""
    return {"voices": DEBATE_VOICES}


# ---------------------------------------------------------------------------
# GET /api/debate/sessions/list — list recent sessions (must come before /{session_id})
# ---------------------------------------------------------------------------

@router.get("/sessions/list")
def list_sessions_inline(limit: int = 10, db: Session = Depends(get_db)):
    sessions = (
        db.query(DebateSessionRow)
        .order_by(DebateSessionRow.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "sessions": [
            {
                "session_id": s.id,
                "topic": s.topic,
                "agent_a_name": s.agent_a_name,
                "agent_b_name": s.agent_b_name,
                "num_turns": s.num_turns,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
        "total": len(sessions),
    }


# ---------------------------------------------------------------------------
# POST /api/debate/start
# ---------------------------------------------------------------------------

@router.post("/start", response_model=DebateSessionResponse)
def start_debate(req: DebateStartRequest, db: Session = Depends(get_db)):
    topic = req.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic cannot be empty")
    if len(topic) > 500:
        raise HTTPException(status_code=400, detail="Topic too long (max 500 chars)")

    num_turns = max(2, min(req.num_turns, 12))  # clamp to 2–12
    if num_turns % 2 != 0:
        num_turns += 1

    voice_a = (req.voice_a or _VOICE_A_DEFAULT).strip() or _VOICE_A_DEFAULT
    voice_b = (req.voice_b or _VOICE_B_DEFAULT).strip() or _VOICE_B_DEFAULT
    style = getattr(req, "style", "standard")

    session_id = str(uuid.uuid4())

    with workflow_span("debate-session-start"):
        annotate(
            input_data=topic,
            tags={"env": "hackathon", "ml_app": "opsvoice", "feature": "debate", "style": style},
        )

        # ── Generate perspectives ──────────────────────────────────────────
        with task_span("generate-perspectives"):
            t0 = time.time()
            try:
                perspectives = debate_orchestrator.generate_perspectives(topic, style=style)
            except Exception as e:
                logger.error("Perspective generation failed: %s", e)
                raise HTTPException(status_code=502, detail=f"Failed to generate perspectives: {e}")
            persp_latency = round((time.time() - t0) * 1000, 1)

        meta = perspectives.get("_meta", {})
        annotate_llm_call(
            input_messages=[{"role": "user", "content": f"Topic: {topic}"}],
            output_text=json.dumps(perspectives),
            model=meta.get("model", "unknown"),
            input_tokens=meta.get("input_tokens", 0),
            output_tokens=meta.get("output_tokens", 0),
            latency_ms=meta.get("latency_ms", persp_latency),
            conversation_id=session_id,
        )

        # ── Persist session ────────────────────────────────────────────────
        with task_span("db-create-debate-session"):
            row = DebateSessionRow(
                id=session_id,
                topic=topic,
                agent_a_name=perspectives["agent_a"]["name"],
                agent_a_perspective=perspectives["agent_a"]["perspective"],
                agent_a_voice=voice_a,
                agent_b_name=perspectives["agent_b"]["name"],
                agent_b_perspective=perspectives["agent_b"]["perspective"],
                agent_b_voice=voice_b,
                num_turns=num_turns,
                style=style,
                created_at=datetime.now(timezone.utc),
            )
            db.add(row)
            db.commit()
            db.refresh(row)

        annotate(
            output_data=f"A={perspectives['agent_a']['name']} | B={perspectives['agent_b']['name']}",
            tags={
                "session_id": session_id[:8],
                "num_turns": str(num_turns),
                "model": meta.get("model", "unknown"),
            },
            metrics={
                "perspective_latency_ms": persp_latency,
                "input_tokens": float(meta.get("input_tokens", 0)),
                "output_tokens": float(meta.get("output_tokens", 0)),
            },
        )

    logger.info(
        "Debate started: session=%s, topic=%r, A=%r, B=%r, turns=%d",
        session_id[:8],
        topic[:60],
        perspectives["agent_a"]["name"],
        perspectives["agent_b"]["name"],
        num_turns,
    )

    return DebateSessionResponse(
        session_id=session_id,
        topic=topic,
        agent_a=AgentProfile(
            name=perspectives["agent_a"]["name"],
            perspective=perspectives["agent_a"]["perspective"],
            voice=voice_a,
            color=_COLOR_A,
        ),
        agent_b=AgentProfile(
            name=perspectives["agent_b"]["name"],
            perspective=perspectives["agent_b"]["perspective"],
            voice=voice_b,
            color=_COLOR_B,
        ),
        num_turns=num_turns,
    )


# ---------------------------------------------------------------------------
# POST /api/debate/{session_id}/turn  — SSE stream
# ---------------------------------------------------------------------------

@router.post("/{session_id}/turn")
def generate_turn(
    session_id: str,
    req: DebateTurnRequest,
    db: Session = Depends(get_db),
):
    """
    Generate the next debate turn and stream the result via Server-Sent Events.

    SSE event types:
      {"type": "thinking"}                          — immediately on connect
      {"type": "text", ...metadata, "text": "..."}  — complete turn text
      {"type": "done"}                              — stream closed
      {"type": "error", "message": "..."}           — on failure
    """
    session = _get_session(session_id, db)
    turn_number = req.turn_number

    if turn_number < 1 or turn_number > session.num_turns:
        raise HTTPException(
            status_code=400,
            detail=f"turn_number must be between 1 and {session.num_turns}",
        )

    # Determine which agent speaks this turn (1-indexed: odd → A, even → B)
    agent_key = "a" if turn_number % 2 == 1 else "b"
    if agent_key == "a":
        agent_name = session.agent_a_name
        agent_perspective = session.agent_a_perspective
        opponent_name = session.agent_b_name
    else:
        agent_name = session.agent_b_name
        agent_perspective = session.agent_b_perspective
        opponent_name = session.agent_a_name

    # Load previous turns for context
    prev_turns = (
        db.query(DebateTurnRow)
        .filter_by(session_id=session_id)
        .order_by(DebateTurnRow.turn_number)
        .all()
    )
    history = [
        {
            "agent": t.agent,
            "name": session.agent_a_name if t.agent == "a" else session.agent_b_name,
            "text": t.text,
        }
        for t in prev_turns
    ]

    is_final = turn_number == session.num_turns
    next_agent = None if is_final else ("a" if agent_key == "b" else "b")

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    def event_stream():
        # Signal immediately so the client knows generation has started
        yield _sse({"type": "thinking", "agent": agent_key, "turn": turn_number})

        # Generate the turn text via LLM
        with workflow_span(f"debate-turn-{turn_number}"):
            annotate(
                input_data=f"Turn {turn_number}: {agent_name}",
                tags={
                    "session_id": session_id[:8],
                    "turn": str(turn_number),
                    "agent": agent_key,
                    "feature": "debate",
                },
            )

            try:
                t0 = time.time()
                with task_span(f"llm-debate-turn-{turn_number}"):
                    turn_result = debate_orchestrator.generate_turn(
                        topic=session.topic,
                        agent_name=agent_name,
                        agent_perspective=agent_perspective,
                        opponent_name=opponent_name,
                        history=history,
                        turn_number=turn_number,
                        style=getattr(session, "style", "standard"),
                    )
                latency_ms = round((time.time() - t0) * 1000, 1)

            except Exception as e:
                logger.error("Debate turn %d generation failed: %s", turn_number, e)
                annotate(tags={"error": "turn_generation_failed", "message": str(e)[:100]})
                yield _sse({"type": "error", "message": str(e)})
                return

            text = turn_result["text"]
            model = turn_result["model"]
            input_tokens = turn_result["input_tokens"]
            output_tokens = turn_result["output_tokens"]

            # DataDog LLM Observability annotation
            annotate_llm_call(
                input_messages=[{"role": "user", "content": history[-1]["text"] if history else session.topic}],
                output_text=text,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                conversation_id=session_id,
            )
            annotate(
                output_data=text[:200],
                tags={
                    "model": model,
                    "agent": agent_key,
                    "agent_name": agent_name,
                    "turn": str(turn_number),
                    "is_final": str(is_final),
                },
                metrics={
                    "input_tokens": float(input_tokens),
                    "output_tokens": float(output_tokens),
                    "latency_ms": float(latency_ms),
                    "turn_number": float(turn_number),
                },
            )

        # Persist the turn to DB
        with task_span("db-persist-debate-turn"):
            db.add(DebateTurnRow(
                session_id=session_id,
                turn_number=turn_number,
                agent=agent_key,
                text=text,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                created_at=datetime.now(timezone.utc),
            ))
            db.commit()

        # TTS settings vary by debate style
        debate_style = getattr(session, "style", "standard")
        voice = session.agent_a_voice if agent_key == "a" else session.agent_b_voice
        tts_speed = 1.05
        tts_pitch = 0
        if debate_style == "rap_battle":
            tts_speed = 1.18   # faster cadence for rap flow
            tts_pitch = 2      # slightly higher energy / brightness

        yield _sse({
            "type": "text",
            "agent": agent_key,
            "agent_name": agent_name,
            "turn": turn_number,
            "text": text,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
            "is_final": is_final,
            "next_agent": next_agent,
            "voice": voice,
            "tts_speed": tts_speed,
            "tts_pitch": tts_pitch,
        })
        yield _sse({"type": "done"})

        logger.info(
            "Debate turn %d/%d: agent=%s (%s), %d tokens, %.0fms, model=%s",
            turn_number, session.num_turns, agent_key, agent_name,
            output_tokens, latency_ms, model,
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/debate/{session_id}  — Full session with turns
# ---------------------------------------------------------------------------

@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = _get_session(session_id, db)
    turns = (
        db.query(DebateTurnRow)
        .filter_by(session_id=session_id)
        .order_by(DebateTurnRow.turn_number)
        .all()
    )
    return {
        "session_id": session.id,
        "topic": session.topic,
        "agent_a": {
            "name": session.agent_a_name,
            "perspective": session.agent_a_perspective,
            "voice": session.agent_a_voice,
            "color": _COLOR_A,
        },
        "agent_b": {
            "name": session.agent_b_name,
            "perspective": session.agent_b_perspective,
            "voice": session.agent_b_voice,
            "color": _COLOR_B,
        },
        "num_turns": session.num_turns,
        "completed_turns": len(turns),
        "turns": [
            {
                "turn_number": t.turn_number,
                "agent": t.agent,
                "text": t.text,
                "model": t.model,
                "input_tokens": t.input_tokens,
                "output_tokens": t.output_tokens,
                "latency_ms": t.latency_ms,
            }
            for t in turns
        ],
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


# ---------------------------------------------------------------------------
# (voices and sessions/list routes are defined above, before /{session_id})
