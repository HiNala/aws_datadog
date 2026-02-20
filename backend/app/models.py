import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


# ---------------------------------------------------------------------------
# SQLAlchemy ORM models (PostgreSQL)
# ---------------------------------------------------------------------------

class ConversationRow(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, default="New conversation")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    messages = relationship(
        "MessageRow",
        back_populates="conversation",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )


class MessageRow(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        String,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    model = Column(String, nullable=True)
    input_tokens = Column(Integer, nullable=True, default=0)
    output_tokens = Column(Integer, nullable=True, default=0)
    latency_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation = relationship("ConversationRow", back_populates="messages")


# ---------------------------------------------------------------------------
# Pydantic request/response schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class TokenUsage(BaseModel):
    input: int = 0
    output: int = 0


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    model: str
    model_provider: str = "unknown"
    tokens: TokenUsage
    latency_ms: float


class TTSRequest(BaseModel):
    text: str
    voice_id: str = "English_expressive_narrator"
    emotion: str | None = None


class ServiceStatus(BaseModel):
    database: str = "unknown"
    bedrock: str = "unknown"
    minimax: str = "unknown"
    datadog: str = "unknown"


class HealthResponse(BaseModel):
    status: str
    services: ServiceStatus
    uptime_seconds: float
    aws_key_source: str
    recent_messages: int = 0


# ---------------------------------------------------------------------------
# Conversations / activity feed
# ---------------------------------------------------------------------------

class ConversationSummary(BaseModel):
    id: str
    title: str
    message_count: int
    last_message: str | None = None
    created_at: str


class ConversationsResponse(BaseModel):
    conversations: list[ConversationSummary]
    total: int


class ConversationMessage(BaseModel):
    id: int
    role: str
    content: str
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: float | None = None
    created_at: str | None = None


class ConversationMessagesResponse(BaseModel):
    conversation_id: str
    messages: list[ConversationMessage]


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

class MetricsResponse(BaseModel):
    total_messages: int
    total_conversations: int
    total_input_tokens: int
    total_output_tokens: int
    avg_latency_ms: float | None
    p95_latency_ms: float | None
    models_used: list[str]


# ---------------------------------------------------------------------------
# Dual-Perspective Debate — ORM models
# ---------------------------------------------------------------------------

class DebateSessionRow(Base):
    __tablename__ = "debate_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    topic = Column(Text, nullable=False)
    agent_a_name = Column(String, nullable=False)
    agent_a_perspective = Column(Text, nullable=False)
    agent_a_voice = Column(String, default="English_expressive_narrator")
    agent_b_name = Column(String, nullable=False)
    agent_b_perspective = Column(Text, nullable=False)
    agent_b_voice = Column(String, default="Deep_Voice_Man")
    style = Column(String, default="standard")
    num_turns = Column(Integer, default=6)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    turns = relationship(
        "DebateTurnRow",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="DebateTurnRow.turn_number",
    )


class DebateTurnRow(Base):
    __tablename__ = "debate_turns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        String,
        ForeignKey("debate_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    turn_number = Column(Integer, nullable=False)
    agent = Column(String, nullable=False)  # "a" or "b"
    text = Column(Text, nullable=False)
    model = Column(String, nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    latency_ms = Column(Float, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("DebateSessionRow", back_populates="turns")


# ---------------------------------------------------------------------------
# Dual-Perspective Debate — Pydantic schemas
# ---------------------------------------------------------------------------

class DebateStartRequest(BaseModel):
    topic: str
    num_turns: int = 6
    voice_a: str | None = None   # override Agent A voice (defaults to English_expressive_narrator)
    voice_b: str | None = None   # override Agent B voice (defaults to Deep_Voice_Man)
    style: str = "standard"      # "standard", "rap_battle", "blame_game", "roast"


class AgentProfile(BaseModel):
    name: str
    perspective: str
    voice: str
    color: str  # "indigo" or "amber"


class DebateSessionResponse(BaseModel):
    session_id: str
    topic: str
    agent_a: AgentProfile
    agent_b: AgentProfile
    num_turns: int


class DebateTurnRequest(BaseModel):
    turn_number: int


class DebateTurnMeta(BaseModel):
    session_id: str
    turn_number: int
    agent: str
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    next_agent: str | None
    is_final: bool
