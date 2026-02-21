# OpusVoice — AI Conversational Agent with Live Audio Debates

> **A voice-first AI assistant that talks back.** Chat with Claude, or watch two AI voices debate any topic live — complete with rap battles, roasts, and real-time text-to-speech.
>
> Built for the **AWS x Anthropic x Datadog GenAI Hackathon** (Feb 2026) — $35K+ in prizes.

---

## Hackathon Sponsor Technologies

| Sponsor | Technology Used | How We Use It |
|---------|----------------|---------------|
| **AWS** | **Amazon Bedrock** — Claude Sonnet 4 | Core LLM inference for all chat and debate generation. Multi-region failover with bearer token + ABSK authentication chains. |
| **Anthropic** | **Claude Sonnet 4** via Bedrock | Powers every conversation and debate turn. System prompts engineered for natural spoken delivery via TTS. |
| **Datadog** | **LLM Observability + APM** (`ddtrace`) | Full tracing of every LLM call — tokens, latency, model, conversation context. Custom spans for TTS, debate orchestration, and DB operations. Live dashboard with deep links. |

### Additional Technologies

| Technology | Purpose |
|------------|---------|
| **MiniMax Speech 2.8** (TTS) | Real-time text-to-speech with 18+ voices, adjustable speed/pitch for rap delivery |
| **Next.js + TypeScript + Tailwind** | Modern responsive frontend with dark/light themes |
| **FastAPI + Python 3.12** | High-performance async backend with auto-generated API docs |
| **PostgreSQL 16** | Persistent storage for conversations, debates, and metrics |
| **Docker Compose** | One-command orchestration of all 4 services |

---

## What It Does

### 1. AI Chat with Voice (Claude-powered)
Ask anything — coding help, creative writing, brainstorming, analysis, stories. Every response is automatically spoken aloud via MiniMax TTS. Use your microphone for voice input (Web Speech API) or type normally.

### 2. Live AI Debates with Dual Voices
Pick any topic, choose a style (Standard, Rap Battle, Blame Game, Roast), select voices for each agent, and watch two AI personas debate live. Each agent gets its own voice and column in a split-screen view. Rap battles use faster TTS cadence (1.18x speed, +2 pitch) with proper AABB rhyme scheme.

### 3. Full Observability Dashboard
Real-time metrics: LLM token usage, latency (avg + P95), debate stats, TTS request counts, model breakdown. Direct deep links to Datadog LLM traces, APM, error tracking, and logs.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js + TypeScript)                     │
│                        localhost:3000                                  │
│                                                                       │
│  ┌─────────────┐  ┌──────────────────────────────────────────────┐   │
│  │  Dashboard   │  │  /chat — Unified Chat + Debate Interface     │   │
│  │  Health      │  │  • Text/voice input (Web Speech API)         │   │
│  │  Metrics     │  │  • Auto TTS playback on every response       │   │
│  │  DD Links    │  │  • Split-view debates with dual voices       │   │
│  └─────────────┘  │  • Rap battle / roast / blame game modes      │   │
│                    │  • Voice picker (18+ MiniMax voices)          │   │
│                    └──────────────────────────────────────────────┘   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ REST + SSE
┌───────────────────────────────▼───────────────────────────────────────┐
│                    Backend (FastAPI + Python 3.12)                     │
│                        localhost:8000                                  │
│                                                                       │
│  /api/chat ──────────► LLM Service ──────► AWS Bedrock (Claude 4)     │
│  /api/debate/* ──────► Debate Orchestrator ─► Bedrock / MiniMax LLM   │
│  /api/tts/stream ────► MiniMax TTS ──────► speech-2.8-turbo (SSE)     │
│  /api/health ────────► Service health checks                          │
│  /api/metrics ───────► Aggregated usage stats from PostgreSQL         │
│                                                                       │
│  ddtrace auto-instruments all calls ──────► Datadog LLM Observability │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  PostgreSQL 16   │ │  AWS Bedrock     │ │  Datadog Agent   │
│  Chat history    │ │  Claude Sonnet 4 │ │  APM + LLM Obs   │
│  Debate sessions │ │  Multi-region    │ │  Traces + Metrics │
│  Usage metrics   │ │  Failover chain  │ │  Error tracking   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- API keys (AWS Bedrock, MiniMax, optionally Datadog)

### 1. Clone and configure

```bash
git clone https://github.com/HiNala/aws_datadog.git
cd aws_datadog
cp .env.example backend/.env
# Edit backend/.env with your API keys
```

### 2. Start everything

```bash
docker compose up --build
```

### 3. Open the app

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend API** | http://localhost:8000 |
| **API Docs** | http://localhost:8000/docs |

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Universal AI Chat** | Ask anything — not limited to any domain. Claude responds with natural spoken delivery. |
| **Voice Input** | Hold or tap the mic button. Web Speech API transcribes, Claude responds, TTS speaks. |
| **Live Audio Debates** | Two AI agents with distinct voices debate any topic in real-time. |
| **4 Debate Styles** | Standard, Rap Battle (AABB rhyme scheme), Blame Game, Roast |
| **18+ TTS Voices** | Pick voices per debate agent. Rap mode uses faster speed + higher pitch. |
| **Conversation History** | All chats and debates persisted in PostgreSQL with sidebar navigation. |
| **Dark/Light Theme** | Toggle between themes, persisted in localStorage. |
| **Datadog Observability** | Every LLM call traced: tokens, latency, model, conversation context. |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Chat with Claude (text in, text + metadata out) |
| `POST` | `/api/tts/stream` | Streaming TTS (text → MP3 audio stream) |
| `POST` | `/api/tts` | Batch TTS (text → complete MP3) |
| `POST` | `/api/debate/start` | Start a debate session with topic + style + voices |
| `POST` | `/api/debate/{id}/turn` | Generate next debate turn (SSE stream) |
| `GET` | `/api/debate/voices` | List available TTS voices for debates |
| `GET` | `/api/debate/sessions/list` | List past debate sessions |
| `GET` | `/api/health` | Service health + uptime |
| `GET` | `/api/metrics` | Aggregated LLM + debate + TTS metrics |
| `GET` | `/api/conversations` | List chat conversations |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_BEARER_TOKEN_BEDROCK` | Yes* | Hackathon bearer token for Bedrock |
| `AWS_BEDROCK_API_KEY_BACKUP` | No | Personal ABSK backup key |
| `AWS_ACCESS_KEY_ID` | No | IAM session credentials |
| `AWS_SECRET_ACCESS_KEY` | No | IAM session credentials |
| `AWS_SESSION_TOKEN` | No | IAM session token |
| `AWS_DEFAULT_REGION` | Yes | `us-west-2` |
| `MINIMAX_API_KEY` | Yes | MiniMax API key for TTS + LLM fallback |
| `DD_API_KEY` | For obs | Datadog API key |
| `DD_SITE` | For obs | `us5.datadoghq.com` |
| `POSTGRES_*` | Yes | PostgreSQL credentials |

\* At least one AWS credential method must be configured.

---

## Project Structure

```
aws-datadog/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, startup, migrations
│   │   ├── config.py            # Pydantic settings, key status logging
│   │   ├── db.py                # SQLAlchemy + PostgreSQL
│   │   ├── models.py            # ORM models + Pydantic schemas
│   │   ├── migrations.py        # Auto-run schema migrations
│   │   ├── routers/
│   │   │   ├── chat.py          # /api/chat — Claude conversation
│   │   │   ├── debate.py        # /api/debate/* — dual-agent debates
│   │   │   ├── tts.py           # /api/tts — MiniMax text-to-speech
│   │   │   ├── health.py        # /api/health — service checks
│   │   │   ├── metrics.py       # /api/metrics — usage aggregation
│   │   │   └── conversations.py # /api/conversations — history
│   │   └── services/
│   │       ├── bedrock.py       # AWS Bedrock client (multi-auth chain)
│   │       ├── minimax_tts.py   # MiniMax Speech 2.8 TTS (stream + batch)
│   │       ├── minimax_chat.py  # MiniMax LLM fallback
│   │       ├── debate_orchestrator.py  # Dual-agent debate engine
│   │       └── datadog_obs.py   # Datadog LLM Observability helpers
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Dashboard — health, metrics, DD links
│   │   │   ├── chat/page.tsx    # Unified chat + debate interface
│   │   │   └── layout.tsx       # Root layout, fonts, theme
│   │   ├── components/          # Navbar, ChatMessage, Logo, WaveformBars
│   │   ├── hooks/               # useSpeechRecognition
│   │   ├── providers/           # ThemeProvider (dark/light)
│   │   └── lib/api.ts           # Typed API client
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml           # 4-service orchestration
├── .env.example                 # Template for API keys
└── README.md
```

---

## Datadog Observability

The backend runs under `ddtrace-run` for zero-code instrumentation:

- **LLM Observability**: Every Bedrock/MiniMax call traced with input/output tokens, latency, model ID
- **Custom Spans**: `workflow_span` for full pipelines, `task_span` for individual operations (LLM, DB, TTS)
- **APM Traces**: Distributed tracing across all HTTP endpoints
- **Metrics**: Token counts, latency percentiles, debate turn stats, TTS request volumes

Dashboard deep links are built into the frontend for instant access.

---

*Digital Studio Labs | Brian | AWS x Anthropic x Datadog GenAI Hackathon 2026*
