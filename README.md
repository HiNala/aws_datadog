# OpsVoice — AI Operations Agent

> Voice-enabled conversational AI for cloud infrastructure operations.  
> Built for the **AWS x Anthropic x Datadog GenAI Hackathon** (Feb 20, 2026).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                     │
│              :3000 — TypeScript + Tailwind v4                │
│                                                             │
│   ┌──────────────────┐    ┌──────────────────────────────┐  │
│   │  / Dashboard     │    │  /chat — Claude-style UI     │  │
│   │  Service Health  │    │  Text input + Voice TTS      │  │
│   │  Metrics         │    │  Conversation history        │  │
│   └──────────────────┘    └──────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │  /api/* proxy
┌────────────────────────────▼────────────────────────────────┐
│                   Backend (FastAPI)                          │
│              :8000 — Python 3.12                             │
│                                                             │
│   /api/chat ──► BedrockService ──► AWS Bedrock (Claude)     │
│   /api/tts  ──► MiniMaxTTS ──► MiniMax speech-2.8-hd       │
│   /api/health ──► PostgreSQL + service checks               │
│                                                             │
│   ddtrace auto-instruments all LLM calls → Datadog          │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                   PostgreSQL 16                              │
│              :5432 — Chat history + conversations            │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16, TypeScript, Tailwind v4 | Glassmorphism UI, dashboard + chat |
| Backend | Python 3.12, FastAPI, SQLAlchemy | API server, service orchestration |
| LLM | Claude Sonnet via AWS Bedrock | Core reasoning engine |
| Voice | MiniMax speech-2.8-hd | Text-to-speech output |
| Observability | Datadog LLM Obs (ddtrace) | Full LLM trace visibility |
| Database | PostgreSQL 16 | Chat persistence |
| Orchestration | Docker Compose | Local dev environment |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Copy `.env.example` to `.env` and fill in your API keys

### Run with Docker

```bash
# Clone and start
git clone https://github.com/HiNala/aws_datadog.git
cd aws_datadog
cp .env.example .env
# Edit .env with your real API keys

docker compose up --build
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

### Run Manually (without Docker)

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**PostgreSQL:** run locally on port 5432, or use Docker:
```bash
docker run -d --name opsvoice-db \
  -e POSTGRES_USER=opsvoice \
  -e POSTGRES_PASSWORD=opsvoice_hack2026 \
  -e POSTGRES_DB=opsvoice \
  -p 5432:5432 postgres:16-alpine
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send message, get Claude response |
| `POST` | `/api/tts` | Convert text to speech (MP3) |
| `GET` | `/api/health` | Service health + uptime |

### POST /api/chat

```json
// Request
{ "message": "Is api-gateway healthy?", "conversation_id": null }

// Response
{
  "response": "API gateway is showing normal latency...",
  "conversation_id": "uuid",
  "model": "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "tokens": { "input": 150, "output": 89 },
  "latency_ms": 1240.5
}
```

### POST /api/tts

```json
// Request
{ "text": "All services are healthy.", "voice_id": "English_expressive_narrator" }

// Response: binary audio/mpeg (MP3)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_BEARER_TOKEN_BEDROCK` | Yes* | Hackathon temp bearer token (~12h) |
| `AWS_BEDROCK_API_KEY_BACKUP` | No | Backup ABSK key (expires Mar 21) |
| `AWS_DEFAULT_REGION` | Yes | `us-west-2` |
| `MINIMAX_API_KEY` | Yes | MiniMax API key for TTS |
| `DD_API_KEY` | For obs | Datadog API key |
| `DD_APP_KEY` | For obs | Datadog Application key |
| `DD_SITE` | For obs | `datadoghq.com` |
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_DB` | Yes | PostgreSQL database name |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |

\* Either `AWS_BEARER_TOKEN_BEDROCK` or `AWS_BEDROCK_API_KEY_BACKUP` must be set.

## Datadog Observability

Run the backend with `ddtrace-run` for auto-instrumented LLM traces:

```bash
DD_LLMOBS_ENABLED=1 \
DD_LLMOBS_ML_APP=opsvoice \
DD_LLMOBS_AGENTLESS_ENABLED=true \
ddtrace-run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Project Structure

```
aws-datadog/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + CORS + startup
│   │   ├── config.py        # Pydantic settings + key logging
│   │   ├── db.py            # PostgreSQL connection
│   │   ├── models.py        # ORM + Pydantic schemas
│   │   ├── routers/         # chat, tts, health endpoints
│   │   └── services/        # bedrock, minimax_tts, datadog_obs
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages (dashboard, chat)
│   │   ├── components/      # Navbar, ChatInput, GlassCard, etc.
│   │   └── lib/api.ts       # Typed API client
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── docs/guide.md            # Hackathon strategy guide
```

---

*Digital Studio Labs | Brian | AWS x Anthropic x Datadog GenAI Hackathon 2026*
