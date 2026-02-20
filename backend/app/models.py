import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.db import Base


# ---------------------------------------------------------------------------
# SQLAlchemy ORM models (PostgreSQL)
# ---------------------------------------------------------------------------

class ConversationRow(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, default="New conversation")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MessageRow(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    model = Column(String, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    latency_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


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
