# 🏆 AWS × Anthropic × Datadog GenAI Hackathon — Master Strategy Document
### Digital Studio Labs | February 20, 2026 | AWS Builder Loft, San Francisco
### **Submission Deadline: 5:00 PM SHARP**

---

## ⚡ FIRST THINGS TO DO RIGHT NOW (Before Reading Anything Else)

1. **Join the Discord:** https://discord.gg/aMG8tdKq
2. **Fill out the MiniMax free credits form:** https://forms.gle/Fazk8r87QmudNLNd6
3. **WiFi:** Network: `Guest` | Password: `BrokenWires@@2019`
4. **Main entrance:** Market Street entrance → elevator to 2nd floor

---

## 📋 Table of Contents

1. [Prize Pool & Winning Strategy](#prize-pool--winning-strategy)
2. [Recommended Build: "OpsVoice"](#recommended-build-opsvoice)
3. [Full Stack Architecture](#full-stack-architecture)
4. [AWS Bedrock + AgentCore Setup](#aws-bedrock--agentcore-setup)
5. [MiniMax API — Complete Reference](#minimax-api--complete-reference)
6. [Datadog Integration — Deep Dive](#datadog-integration--deep-dive)
7. [Neo4j Integration](#neo4j-integration)
8. [CopilotKit Frontend](#copilotkit-frontend)
9. [TestSprite Integration](#testsprite-integration)
10. [Hour-by-Hour Build Schedule](#hour-by-hour-build-schedule)
11. [90-Second Demo Script](#90-second-demo-script)
12. [Environment Variables Quick Reference](#environment-variables-quick-reference)
13. [Judge Profiles & What They Want](#judge-profiles--what-they-want)
14. [Common Pitfalls & Fixes](#common-pitfalls--fixes)
15. [All Essential URLs](#all-essential-urls)

---

## 🎯 Prize Pool & Winning Strategy

**Total available: $35K+ in cash, $15K in AWS credits, partner benefits**

| Prize Track | Sponsor | Amount/Award | Core Requirement |
|---|---|---|---|
| MiniMax Track | MiniMax | Part of $12K cash pool | Use MiniMax API (text, voice, or video) |
| TestSprite Track | TestSprite | Part of $12K cash pool | Integrate TestSprite AI testing |
| CopilotKit Track | CopilotKit | Part of $12K cash pool | Build with CopilotKit agentic UI |
| Datadog Observability Award | Datadog | **Meta Glasses** | Datadog MCP + Dashboards + LLM Obs |
| Neo4j Award | Neo4j | Neo4j credits + **Bose QuietComfort Ultra Headphones** | Use Neo4j graph database |
| AWS Credits | AWS | **$15,000 in credits** | Deploy on Amazon Bedrock/AgentCore |
| Overall Best | All sponsors | Top of cash pool | All of the above |

### ✅ MANDATORY FOR ANY PRIZE ELIGIBILITY
- **Must use Amazon Bedrock** (at minimum for inference)
- **Must integrate Datadog observability** (dashboard OR LLM Obs OR MCP)
- **Must deliver a live, working demo**

### 💡 Strategy: Hit Every Track Simultaneously

The key insight is to build a **single application** that satisfies all sponsors at once. Don't build separate integrations — weave them together into one coherent product that tells a compelling story.

**Target tracks in this priority order:**
1. AWS (required for eligibility — do this first)
2. Datadog (highest-profile judge, most visible award)
3. MiniMax (free credits, multimodal demo wow factor)
4. Neo4j (easy add-on, great visual, Bose headphones prize)
5. CopilotKit (quick to add, polishes the UI dramatically)
6. TestSprite (last 30 min, zero-effort big impression)

---

## 🚀 Recommended Build: "OpsVoice"

### Concept
**A voice-enabled conversational AI agent for cloud infrastructure operations.** Engineers ask questions about their infrastructure in plain English (or by voice), and the agent responds with spoken answers backed by real Datadog data, service relationship graphs from Neo4j, and reasoning powered by Claude on Amazon Bedrock.

### Why This Concept Wins

- **Judges are AWS/infrastructure people** — they understand ops pain immediately
- **Voice interface is the "wow" moment** — nobody expects it, everyone remembers it
- **MiniMax TTS is production-quality** — 40 languages, 7 emotions, sounds human
- **Datadog MCP is THE integration the Datadog judge specifically wants to see**
- **Neo4j blast-radius analysis is genuinely useful** — not just grafted on
- **Claude on Bedrock + Strands Agents** hits both Anthropic and AWS requirements
- **CopilotKit gives you a polished UI** in 20 minutes that looks like 3 weeks of work
- **TestSprite can auto-test your API endpoints** — shows production readiness

### Elevator Pitch (Memorize This)
> *"On-call engineers waste hours correlating Datadog metrics, logs, and service maps during incidents. OpsVoice gives you a single voice interface to your entire infrastructure. Ask a question, get a spoken answer. Claude reasons over Datadog context and Neo4j service graphs to tell you exactly what's broken and what's affected — before your customers notice."*

---

## 🏗️ Full Stack Architecture

```
User Voice/Text Input
        ↓
[Next.js + CopilotKit Frontend]
        ↓
[Next.js API Route / FastAPI]
        ↓
[Strands Agent on Amazon Bedrock AgentCore Runtime]
        ↓                    ↓                    ↓
[Claude 3.5 Sonnet]  [Datadog MCP Tools]  [Neo4j Graph Query]
[via Bedrock]         [logs/metrics/       [service deps/
                       incidents/traces]    blast radius]
        ↓
[Response Synthesized]
        ↓
[MiniMax TTS speech-2.8-hd] → [Audio Response Played]
        ↓
[ALL LLM calls traced by Datadog LLM Observability via ddtrace]
[Live Dashboard visible at http://datadoghq.com during demo]
```

### Technology Layer Map

| Layer | Technology | Purpose | Time to Integrate |
|---|---|---|---|
| Agent Framework | Strands Agents (Python) | Main orchestration on AWS | 30 min |
| LLM Inference | Claude Sonnet 4 via Amazon Bedrock | Core reasoning + tool use | 15 min |
| Deployment | Amazon Bedrock AgentCore Runtime | Serverless hosting | 20 min |
| Observability | Datadog LLM Observability (ddtrace) | Full trace + metrics | 10 min |
| Observability UI | Datadog Dashboard | Live metrics display | 20 min |
| Observability Query | Datadog MCP Server (community) | Agent queries Datadog | 15 min |
| Multimodal TTS | MiniMax speech-2.8-hd | Voice output (the wow) | 20 min |
| Multimodal Text | MiniMax-M2.5 (Anthropic compat) | Fast reasoning layer | 10 min |
| Graph Database | Neo4j Aura Free | Service dependency graph | 25 min |
| Frontend | Next.js + CopilotKit | AI copilot UI overlay | 20 min |
| Testing | TestSprite | Auto endpoint testing | 10 min |
| **TOTAL** | | | **~3 hours** |

---

## ☁️ AWS Bedrock + AgentCore Setup

### Step 1: Prerequisites

```bash
# Check Python version (need 3.10+)
python3 --version

# Configure AWS credentials
aws configure
# Enter: AWS Access Key ID, Secret, Region (us-west-2), Output format (json)

# Verify credentials
aws sts get-caller-identity
```

### Step 2: Enable Bedrock Model Access

1. Go to: https://console.aws.amazon.com/bedrock/
2. Left sidebar → **Model access**
3. Enable: **Anthropic Claude Sonnet 4** (model ID: `us.anthropic.claude-sonnet-4-20250514-v1:0`)
4. Also enable: **Claude Haiku 4.5** for fast/cheap tasks
5. Wait 1-2 minutes for activation

> ⚠️ **DO THIS FIRST. Everything else blocks on this step.**

### Step 3: Install AgentCore Starter Toolkit

```bash
# Create project directory
mkdir opsvoice-agent && cd opsvoice-agent
python3 -m venv .venv
source .venv/bin/activate

# Install all required packages
pip install "bedrock-agentcore-starter-toolkit>=0.1.21" \
    strands-agents \
    strands-agents-tools \
    boto3 \
    ddtrace \
    anthropic \
    neo4j \
    requests

# Install with OTEL for observability
pip install "strands-agents[otel]" aws-opentelemetry-distro
```

### Step 4: Create Your Agent

```python
# opsvoice_agent.py

from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp
import boto3
import json
import requests
import os

# --- Initialize AgentCore App ---
app = BedrockAgentCoreApp()

# --- Configure Claude via Bedrock ---
model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-20250514-v1:0",
    region_name="us-west-2"
)

# --- Datadog Tool ---
@tool
def query_datadog_logs(service: str, time_range: str = "1h") -> str:
    """Query Datadog for recent error logs for a given service.
    
    Args:
        service: The service name to query (e.g., 'api-gateway', 'payment-service')
        time_range: Time range to search (e.g., '1h', '6h', '24h')
    
    Returns:
        Summary of recent logs and errors for the service
    """
    DD_API_KEY = os.environ.get("DD_API_KEY")
    DD_APP_KEY = os.environ.get("DD_APP_KEY")
    
    headers = {
        "DD-API-KEY": DD_API_KEY,
        "DD-APPLICATION-KEY": DD_APP_KEY,
        "Content-Type": "application/json"
    }
    
    payload = {
        "filter": {
            "query": f"service:{service} status:error",
            "from": f"now-{time_range}",
            "to": "now"
        },
        "sort": "timestamp",
        "page": {"limit": 10}
    }
    
    response = requests.post(
        "https://api.datadoghq.com/api/v2/logs/events/search",
        headers=headers,
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        logs = data.get("data", [])
        if not logs:
            return f"No errors found for {service} in the last {time_range}"
        
        summaries = []
        for log in logs[:5]:
            attrs = log.get("attributes", {})
            summaries.append(f"- [{attrs.get('status')}] {attrs.get('message', 'No message')[:100]}")
        
        return f"Found {len(logs)} errors for {service}:\n" + "\n".join(summaries)
    
    return f"Could not fetch logs for {service}: HTTP {response.status_code}"


@tool
def check_service_monitors(service: str) -> str:
    """Check Datadog monitors for a service to see if any are alerting.
    
    Args:
        service: The service name to check monitors for
    
    Returns:
        List of monitors and their current status
    """
    DD_API_KEY = os.environ.get("DD_API_KEY")
    DD_APP_KEY = os.environ.get("DD_APP_KEY")
    
    headers = {
        "DD-API-KEY": DD_API_KEY,
        "DD-APPLICATION-KEY": DD_APP_KEY
    }
    
    params = {
        "tags": f"service:{service}",
        "with_downtimes": True
    }
    
    response = requests.get(
        "https://api.datadoghq.com/api/v1/monitor",
        headers=headers,
        params=params
    )
    
    if response.status_code == 200:
        monitors = response.json()
        if not monitors:
            return f"No monitors found for service:{service}"
        
        alerting = [m for m in monitors if m.get("overall_state") in ["Alert", "Warn"]]
        ok = [m for m in monitors if m.get("overall_state") == "OK"]
        
        result = f"Monitors for {service}: {len(alerting)} alerting, {len(ok)} OK\n"
        for m in alerting[:3]:
            result += f"  🚨 {m['name']}: {m['overall_state']}\n"
        
        return result
    
    return f"Could not check monitors: HTTP {response.status_code}"


@tool  
def get_service_blast_radius(service: str) -> str:
    """Query Neo4j to find all services that depend on a given service.
    
    Args:
        service: The service name to analyze for downstream impact
    
    Returns:
        List of dependent services that could be affected
    """
    from neo4j import GraphDatabase
    
    NEO4J_URI = os.environ.get("NEO4J_URI")
    NEO4J_USER = os.environ.get("NEO4J_USERNAME", "neo4j")
    NEO4J_PASS = os.environ.get("NEO4J_PASSWORD")
    
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
    
    with driver.session() as session:
        # Find services that depend on this service (upstream dependents)
        result = session.run("""
            MATCH (dependent:Service)-[:DEPENDS_ON*1..3]->(s:Service {name: $service})
            RETURN dependent.name AS name, 
                   dependent.team AS team, 
                   dependent.tier AS tier
            LIMIT 20
        """, service=service)
        
        affected = [record.data() for record in result]
        
        # Also find what this service depends on (downstream)
        deps_result = session.run("""
            MATCH (s:Service {name: $service})-[:DEPENDS_ON*1..2]->(dep:Service)
            RETURN dep.name AS name, dep.tier AS tier
            LIMIT 10
        """, service=service)
        
        dependencies = [record.data() for record in deps_result]
    
    driver.close()
    
    if not affected and not dependencies:
        return f"No relationships found for {service} in the graph"
    
    result_text = f"Blast radius analysis for {service}:\n"
    
    if affected:
        result_text += f"\n{len(affected)} upstream services AFFECTED if {service} goes down:\n"
        for svc in affected:
            tier_icon = "🔴" if svc.get("tier") == "critical" else "🟡"
            result_text += f"  {tier_icon} {svc['name']} (team: {svc.get('team', 'unknown')})\n"
    
    if dependencies:
        result_text += f"\n{service} depends on:\n"
        for dep in dependencies:
            result_text += f"  → {dep['name']} ({dep.get('tier', 'unknown')} tier)\n"
    
    return result_text


# --- Create the Agent ---
agent = Agent(
    model=model,
    tools=[query_datadog_logs, check_service_monitors, get_service_blast_radius],
    system_prompt="""You are OpsVoice, an expert AI assistant for cloud infrastructure operations.

You have access to:
1. Datadog logs and monitors for any service
2. Neo4j service dependency graphs showing blast radius

When asked about a service:
- Check its recent error logs
- Check if any monitors are alerting
- Analyze its blast radius (what else breaks if it fails)
- Give a clear, concise ops summary

Keep responses conversational and concise — they will be spoken aloud via text-to-speech.
Speak like a senior SRE briefing their team, not like a report generator.
"""
)


# --- AgentCore Entrypoint ---
@app.entrypoint
def handler(request):
    prompt = request.get("prompt", request.get("query", ""))
    response = agent(prompt)
    return {"response": str(response)}


if __name__ == "__main__":
    app.run()
```

### Step 5: Configure & Deploy with AgentCore

```bash
# Configure the deployment
agentcore configure -e opsvoice_agent.py
# Interactive prompts:
# 1. Execution Role: Press ENTER to auto-create (recommended)
# 2. ECR Repository: Press ENTER to auto-create
# 3. Requirements File: Confirm requirements.txt
# 4. Memory: Type 'yes' for persistent memory
# 5. Region: us-west-2 (default)

# This generates .bedrock_agentcore.yaml

# Deploy to AgentCore Runtime
agentcore deploy
# This will:
# - Build your container using AWS CodeBuild (no Docker needed locally)
# - Create ECR repository and push image
# - Create IAM execution role with required permissions
# - Deploy to AgentCore Runtime
# - Return an ARN for your agent

# Test your deployed agent
agentcore invoke --payload '{"prompt": "Is api-gateway healthy right now?"}'
```

### Step 6: AgentCore Memory (Persistent Context)

```python
# Add to opsvoice_agent.py for persistent user context

from bedrock_agentcore.memory import MemoryClient
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
from datetime import datetime

client = MemoryClient(region_name="us-west-2")

# Create memory (do once, store the memory_id)
memory = client.create_memory_and_wait(
    name="OpsVoiceMemory",
    description="User preferences, incident history, and service ownership context"
)

MEM_ID = memory.get("id")
SESSION_ID = f"session_{datetime.now().strftime('%Y%m%d%H%M%S')}"
ACTOR_ID = "opsvoice_user"

memory_config = AgentCoreMemoryConfig(
    memory_id=MEM_ID,
    session_id=SESSION_ID,
    actor_id=ACTOR_ID
)

session_manager = AgentCoreMemorySessionManager(
    config=memory_config,
    agent=agent
)

# Now the agent remembers across sessions:
# - Which services you own
# - Which incidents you've investigated
# - Your team's runbook preferences
```

### Available Bedrock Models

| Model | Model ID | Best For | Context |
|---|---|---|---|
| Claude Sonnet 4 | `us.anthropic.claude-sonnet-4-20250514-v1:0` | Main agent reasoning | 200K |
| Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Fast routing, classification | 200K |
| Amazon Nova Pro | `amazon.nova-pro-v1:0` | Multimodal fallback | 300K |
| Titan Embeddings v2 | `amazon.titan-embed-text-v2:0` | RAG, semantic search | 8K |

### AgentCore Services Summary

| Service | What It Does | Use In Your Project |
|---|---|---|
| **AgentCore Runtime** | Serverless container hosting for agents | Deploy your Strands agent |
| **AgentCore Memory** | Persistent semantic + episodic memory | Remember user context across sessions |
| **AgentCore Gateway** | Converts APIs/Lambdas into MCP tools | Expose Datadog API as MCP |
| **AgentCore Code Interpreter** | Secure Python execution sandbox | Run data analysis on metrics |
| **AgentCore Browser** | Cloud-based browser automation | Scrape monitoring dashboards |
| **AgentCore Observability** | X-Ray + CloudWatch tracing | Monitor agent behavior |

---

## 🎤 MiniMax API — Complete Reference

> **Get free credits NOW:** https://forms.gle/Fazk8r87QmudNLNd6
> **API Console:** https://platform.minimax.io/user-center/basic-information

### Setup: Anthropic-Compatible SDK (Recommended)

MiniMax supports the Anthropic SDK format directly. Just change two environment variables and your existing Anthropic code works with MiniMax models.

```bash
# Install
pip install anthropic requests

# Set environment variables
export ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic"
export ANTHROPIC_API_KEY="<YOUR_MINIMAX_API_KEY>"

# Alternative: Reduced latency endpoint
export ANTHROPIC_BASE_URL="https://api-uw.minimax.io/anthropic"
```

### Text Models — Full Reference

| Model | Context | Output Speed | Parameters | Best For |
|---|---|---|---|---|
| `MiniMax-M2.5` | 204,800 | ~60 tps | — | Complex reasoning, best quality |
| `MiniMax-M2.5-highspeed` | 204,800 | ~100 tps | — | Same quality, faster responses |
| `MiniMax-M2.1` | 204,800 | ~60 tps | 230B total / 10B active | Polyglot code, multilingual |
| `MiniMax-M2.1-highspeed` | 204,800 | ~100 tps | 230B total / 10B active | Fast code tasks |
| `MiniMax-M2` | 204,800 | — | — | Agentic workflows, deep CoT |
| `M2-her` | — | — | — | Role-play, multi-turn chat |

> Note: M2.5 and M2.5-highspeed offer the same performance — use highspeed unless you're doing very complex reasoning where 60 tps is fine.

### Text Generation — Basic Usage

```python
import anthropic

# Point to MiniMax backend
client = anthropic.Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key="<YOUR_MINIMAX_API_KEY>"
)

# Non-streaming
response = client.messages.create(
    model="MiniMax-M2.5",
    max_tokens=1024,
    system="You are an expert cloud infrastructure assistant.",
    messages=[
        {
            "role": "user",
            "content": [{"type": "text", "text": "Analyze this error: ConnectionTimeout to postgres-main"}]
        }
    ]
)
print(response.content[0].text)
```

### Text Generation — Streaming

```python
stream = client.messages.create(
    model="MiniMax-M2.5-highspeed",  # Use highspeed for real-time
    max_tokens=1000,
    stream=True,
    messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}]
)

for chunk in stream:
    if hasattr(chunk, "delta") and hasattr(chunk.delta, "text"):
        print(chunk.delta.text, end="", flush=True)
```

### Text Generation — With Thinking (Chain of Thought)

```python
response = client.messages.create(
    model="MiniMax-M2.5",
    max_tokens=2000,
    thinking={"type": "enabled", "budget_tokens": 500},
    messages=[{"role": "user", "content": [{"type": "text", "text": "Should I restart this pod?"}]}]
)

for block in response.content:
    if block.type == "thinking":
        print(f"[Reasoning]: {block.thinking}")
    elif block.type == "text":
        print(f"[Answer]: {block.text}")
```

### Text Generation — Tool Use (Function Calling)

```python
response = client.messages.create(
    model="MiniMax-M2.5",
    max_tokens=1024,
    tools=[
        {
            "name": "check_datadog",
            "description": "Check Datadog for service health metrics",
            "input_schema": {
                "type": "object",
                "properties": {
                    "service_name": {"type": "string", "description": "Service to check"},
                    "metric": {"type": "string", "description": "Metric to query"}
                },
                "required": ["service_name"]
            }
        }
    ],
    messages=[{"role": "user", "content": [{"type": "text", "text": "Is payment-service healthy?"}]}]
)
```

### Supported Parameters (Anthropic SDK with MiniMax)

| Parameter | Support | Notes |
|---|---|---|
| `model` | ✅ Full | M2.5, M2.5-highspeed, M2.1, M2.1-highspeed, M2 |
| `messages` | ✅ Partial | Text + tool calls; NO image/document input yet |
| `max_tokens` | ✅ Full | — |
| `stream` | ✅ Full | — |
| `system` | ✅ Full | — |
| `temperature` | ✅ Full | Range (0.0, 1.0] only — NOT [0,2] like Claude |
| `tool_choice` | ✅ Full | — |
| `tools` | ✅ Full | — |
| `top_p` | ✅ Full | — |
| `thinking` | ✅ Full | Extended thinking / CoT |
| `top_k` | ❌ Ignored | — |
| `stop_sequences` | ❌ Ignored | — |

---

### MiniMax Text-to-Speech (TTS) — Your Competitive Edge

The TTS integration is what makes your demo **unforgettable**. Voice-enabled ops agents sound like science fiction. Use `speech-2.8-hd` for the best quality.

#### TTS Models

| Model | Quality | Latency | Languages | Emotions |
|---|---|---|---|---|
| `speech-2.8-hd` | ⭐⭐⭐⭐⭐ | Medium | 40 | 7 |
| `speech-2.8-turbo` | ⭐⭐⭐⭐ | Low | 40 | 7 |
| `speech-2.6-hd` | ⭐⭐⭐⭐⭐ | Medium | 40 | 7 |
| `speech-2.6-turbo` | ⭐⭐⭐⭐ | Low | 40 | 7 |
| `speech-02-hd` | ⭐⭐⭐⭐ | Medium | 24 | 7 |
| `speech-02-turbo` | ⭐⭐⭐ | Very Low | 24 | 7 |

**Recommendation:** Use `speech-2.8-hd` for demo (best voice quality) and `speech-2.8-turbo` for real-time interactions.

#### TTS API Endpoint

```
POST https://api.minimax.io/v1/t2a_v2
Authorization: Bearer <YOUR_MINIMAX_API_KEY>
Content-Type: application/json
```

**Alternative (lower latency):** `https://api-uw.minimax.io/v1/t2a_v2`

#### Complete TTS Request — Python

```python
import requests
import os

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY")

def text_to_speech(text: str, voice_id: str = "English_expressive_narrator", 
                   emotion: str = None) -> bytes:
    """
    Convert text to speech using MiniMax speech-2.8-hd.
    Returns MP3 audio as bytes.
    
    Available voice IDs (selection):
    - English_expressive_narrator (professional, clear)
    - English_calmness_narrator (calm, authoritative)
    - male-qn-qingse (Chinese male)
    - And 300+ more at platform.minimax.io
    """
    
    url = "https://api.minimax.io/v1/t2a_v2"
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "speech-2.8-hd",
        "text": text,
        "stream": False,
        "language_boost": "English",  # Or "auto" for multilingual
        "output_format": "hex",       # Returns hex-encoded audio
        
        "voice_setting": {
            "voice_id": voice_id,
            "speed": 1.0,     # 0.5 - 2.0
            "vol": 1.0,       # 0.1 - 10.0
            "pitch": 0        # -12 to +12 semitones
        },
        
        "audio_setting": {
            "format": "mp3",
            "sample_rate": 32000,
            "bitrate": 128000,
            "channel": 1
        }
    }
    
    # Add emotion if specified (speech-2.8-hd/turbo only)
    # Valid emotions: "happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"
    if emotion:
        payload["voice_setting"]["emotion"] = emotion
    
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    
    data = response.json()
    
    # Audio returned as hex-encoded string, convert to bytes
    hex_audio = data["data"]["audio"]
    audio_bytes = bytes.fromhex(hex_audio)
    
    return audio_bytes


def save_and_play_audio(text: str, output_file: str = "response.mp3"):
    """Full pipeline: text → TTS → save MP3 file"""
    audio_bytes = text_to_speech(text)
    
    with open(output_file, "wb") as f:
        f.write(audio_bytes)
    
    # Play in terminal (Linux/Mac)
    os.system(f"mpg123 {output_file}")  # or: afplay, vlc, etc.
    
    return output_file


# Example usage
audio = text_to_speech(
    "api-gateway is showing 47 errors in the last hour. "
    "The primary issue is connection timeouts to postgres-main. "
    "3 downstream services are affected: checkout, order-service, and payment-processor.",
    voice_id="English_expressive_narrator"
)
```

#### TTS with Pause Control and Interjections

```python
# Custom pauses using <#x#> syntax (x = seconds)
text_with_pauses = "Checking Datadog now... <#1.5#> Found critical alerts. <#0.5#> Here is the summary."

# Interjections (speech-2.8-hd/turbo only)
text_with_emotion = "Oh no, (gasps) api-gateway is down! (sighs) We have 3 services affected."
# Supported: (laughs), (chuckle), (coughs), (clear-throat), (groans), (breath),
#            (pant), (inhale), (exhale), (gasps), (sniffs), (sighs), (snorts),
#            (burps), (lip-smacking), (humming), (hissing), (emm), (sneezes)
```

#### TTS Streaming (for lower latency)

```python
import requests

def text_to_speech_streaming(text: str):
    """Stream audio chunks for lower time-to-first-audio."""
    url = "https://api.minimax.io/v1/t2a_v2"
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "speech-2.8-turbo",  # Use turbo for streaming
        "text": text,
        "stream": True,
        "stream_options": {"chunk_size": 100},  # Buffer 100 chars before streaming
        "voice_setting": {
            "voice_id": "English_expressive_narrator",
            "speed": 1.0
        },
        "audio_setting": {
            "format": "mp3",  # Only mp3 supported in streaming
            "sample_rate": 32000,
            "bitrate": 128000,
            "channel": 1
        }
    }
    
    with requests.post(url, headers=headers, json=payload, stream=True) as response:
        for chunk in response.iter_content(chunk_size=1024):
            if chunk:
                yield chunk  # Stream to audio player in real-time


# Usage with audio player
import io
from pydub import AudioSegment
from pydub.playback import play

def stream_and_play(text: str):
    audio_buffer = io.BytesIO()
    for chunk in text_to_speech_streaming(text):
        audio_buffer.write(chunk)
    
    audio_buffer.seek(0)
    audio = AudioSegment.from_mp3(audio_buffer)
    play(audio)
```

#### TTS API Response Structure

```json
{
  "data": {
    "audio": "<hex encoded audio bytes>",
    "status": 2
  },
  "extra_info": {
    "audio_length": 11124,
    "audio_sample_rate": 32000,
    "audio_size": 179926,
    "bitrate": 128000,
    "word_count": 163,
    "invisible_character_ratio": 0,
    "usage_characters": 163,
    "audio_format": "mp3",
    "audio_channel": 1
  },
  "trace_id": "01b8bf9bb7433cc75c18eee6cfa8fe21",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

> **Key note:** Audio is returned as **hex** (not base64). Use `bytes.fromhex(data["data"]["audio"])`.
> The `output_format` field can also be `"url"` to get a direct download URL (valid 24 hours).

---

### Asynchronous Long-Text TTS (T2A Async)

For converting long documents or logs to audio (up to 1 million characters).

```python
import time
import requests

def async_tts_pipeline(long_text: str) -> str:
    """
    Full async TTS pipeline for texts up to 1M chars.
    Returns: URL to download the generated audio file.
    """
    
    # Step 1: Create async task
    create_response = requests.post(
        "https://api.minimax.io/v1/t2a_async",
        headers={
            "Authorization": f"Bearer {MINIMAX_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "speech-2.8-hd",
            "text": long_text,
            "voice_setting": {
                "voice_id": "English_expressive_narrator",
                "speed": 1.0
            },
            "audio_setting": {
                "format": "mp3",
                "sample_rate": 32000
            }
        }
    )
    
    task_id = create_response.json()["task_id"]
    print(f"Async TTS task created: {task_id}")
    
    # Step 2: Poll for completion
    while True:
        status_response = requests.get(
            f"https://api.minimax.io/v1/t2a_async/{task_id}",
            headers={"Authorization": f"Bearer {MINIMAX_API_KEY}"}
        )
        
        status_data = status_response.json()
        status = status_data.get("status")
        
        if status == "Success":
            file_id = status_data["file_id"]
            break
        elif status == "Failed":
            raise Exception(f"Async TTS failed: {status_data}")
        
        print(f"Status: {status}, waiting...")
        time.sleep(5)
    
    # Step 3: Get download URL from File API
    file_response = requests.get(
        f"https://api.minimax.io/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {MINIMAX_API_KEY}"}
    )
    
    # URL valid for 9 hours (32,400 seconds)
    download_url = file_response.json()["file"]["download_url"]
    return download_url
```

---

### MiniMax Video Generation

```python
import requests
import time

def generate_video(prompt: str, resolution: str = "1080P", duration: int = 6) -> str:
    """
    Generate a video from a text prompt.
    Returns download URL for the generated video.
    
    Camera commands supported in prompt:
    [Pan left], [Pan right], [Push in], [Pull out], [Pedestal up], [Pedestal down]
    [Tilt up], [Tilt down], [Zoom in], [Zoom out], [Shake], [Tracking shot], [Static shot]
    
    Example prompts:
    - "A cloud infrastructure dashboard with metrics [Static shot], then explodes with alerts [Shake]"
    - "A robot engineer analyzing server logs [Push in], then celebrates [Pan right]"
    """
    
    # Step 1: Create video task
    create_response = requests.post(
        "https://api.minimax.io/v1/video_generation",
        headers={
            "Authorization": f"Bearer {MINIMAX_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "MiniMax-Hailuo-2.3",
            "prompt": prompt,
            "duration": duration,        # 6 or 10 seconds
            "resolution": resolution,    # "1080P" or "768P"
            "prompt_optimizer": True     # Auto-improve your prompt
        }
    )
    
    task_id = create_response.json()["task_id"]
    
    # Step 2: Poll for completion (typically 3-8 minutes)
    while True:
        status_response = requests.get(
            f"https://api.minimax.io/v1/query/video_generation?task_id={task_id}",
            headers={"Authorization": f"Bearer {MINIMAX_API_KEY}"}
        )
        
        data = status_response.json()
        if data.get("status") == "Success":
            file_id = data["file_id"]
            break
        elif data.get("status") == "Fail":
            raise Exception("Video generation failed")
        
        print(f"Video status: {data.get('status')}, waiting...")
        time.sleep(15)
    
    # Step 3: Get download URL
    file_response = requests.get(
        f"https://api.minimax.io/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {MINIMAX_API_KEY}"}
    )
    
    return file_response.json()["file"]["download_url"]


# For your demo presentation video:
# video_url = generate_video(
#     "An AI agent analyzing cloud infrastructure metrics [Push in], "
#     "data flowing through neural networks [Tracking shot]",
#     resolution="1080P",
#     duration=6
# )
```

#### Video Models

| Model | Resolutions | Duration | Special Features |
|---|---|---|---|
| `MiniMax-Hailuo-2.3` | 1080P (6s), 768P (6s/10s) | 6 or 10s | Best quality, camera control |
| `MiniMax-Hailuo-2.3-Fast` | 1080P (6s), 768P (6s/10s) | 6 or 10s | Image-to-video, faster |
| `MiniMax-Hailuo-02` | 1080P/768P/512P (6s/10s) | 6 or 10s | Stable, production-grade |

---

### MiniMax Image Generation

```python
def generate_image(prompt: str) -> str:
    """Generate an image. Returns URL to generated image."""
    response = requests.post(
        "https://api.minimax.io/v1/image_generation",
        headers={
            "Authorization": f"Bearer {MINIMAX_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "image-01",
            "prompt": prompt,
            "aspect_ratio": "16:9",  # or "1:1", "4:3", "9:16"
            "n": 1
        }
    )
    return response.json()["data"][0]["url"]
```

---

### MiniMax Music Generation

```python
def generate_background_music(style_prompt: str, lyrics: str = "") -> str:
    """Generate themed background music. Returns download URL."""
    response = requests.post(
        "https://api.minimax.io/v1/music_generation",
        headers={
            "Authorization": f"Bearer {MINIMAX_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "music-2.5",
            "prompt": style_prompt,  # e.g. "Epic cinematic orchestral tech theme"
            "lyrics": lyrics         # Optional: provide lyrics for vocal music
        }
    )
    
    # Async like video — returns task_id, poll for completion
    task_id = response.json()["task_id"]
    # ... (same polling pattern as video)
```

---

### MiniMax Official MCP Server

MiniMax provides official MCP servers in both Python and JavaScript for speech synthesis, voice cloning, video, and music.

```bash
# Python version
pip install minimax-mcp
minimax-mcp  # Starts MCP server

# JavaScript version
npx @minimax-ai/mcp
```

Add to your MCP client config:
```json
{
  "mcpServers": {
    "minimax": {
      "command": "minimax-mcp",
      "env": {
        "MINIMAX_API_KEY": "<YOUR_KEY>"
      }
    }
  }
}
```

---

## 📊 Datadog Integration — Deep Dive

> **Bharadwaj Tanikella (Datadog's AI Product Leader) is a judge.** He built LLM Observability. Show him production-grade tracing with custom spans, a live dashboard, and MCP integration. This is the highest-signal judge encounter of the day.

### Integration Priority Order
1. **LLM Observability SDK** (ddtrace) — 10 minutes, auto-instruments everything
2. **Live Dashboard** — 20 minutes, visible during demo judging
3. **Datadog MCP Server** — 15 minutes, your agent queries Datadog directly
4. **Managed Evaluations** — 5 minutes, AI-powered response quality scoring

---

### Option 1: Datadog LLM Observability SDK (DO THIS FIRST)

The `ddtrace` library auto-instruments all LLM calls — Anthropic SDK, Bedrock, LangChain, Strands — without any code changes. Just set env vars and run with `ddtrace-run`.

#### Install

```bash
pip install ddtrace
```

#### Environment Variables (All Required)

```bash
export DD_API_KEY="<YOUR_DATADOG_API_KEY>"          # From Datadog → Org Settings → API Keys
export DD_SITE="datadoghq.com"                        # US1 site
export DD_LLMOBS_ENABLED="1"                          # Enable LLM Observability
export DD_LLMOBS_ML_APP="opsvoice"                    # Your app name in Datadog UI
export DD_LLMOBS_AGENTLESS_ENABLED="true"             # Skip Datadog Agent (critical for hackathon)
export DD_SERVICE="opsvoice-backend"                  # Service name for APM
export DD_ENV="hackathon"                             # Environment tag
```

#### Run Your App with Auto-Instrumentation

```bash
# This single command enables tracing for ALL supported integrations:
# - Anthropic SDK calls
# - AWS Bedrock boto3 calls
# - LangChain
# - Strands Agents
# - OpenAI
# NO code changes required.

DD_SITE=datadoghq.com \
DD_API_KEY=$DD_API_KEY \
DD_LLMOBS_ENABLED=1 \
DD_LLMOBS_ML_APP=opsvoice \
DD_LLMOBS_AGENTLESS_ENABLED=true \
ddtrace-run python opsvoice_agent.py
```

#### What Gets Traced Automatically

When you run with `ddtrace-run`, ALL of these are captured without code changes:

- ✅ Every Anthropic `client.messages.create()` call
- ✅ Every `boto3` call to Amazon Bedrock Runtime (`InvokeModel`, `InvokeModelWithResponseStream`)
- ✅ Every Strands Agent execution (tool calls, reasoning steps)
- ✅ Every LangChain LLM call
- ✅ Input prompts + output responses
- ✅ Token usage (input, output, total)
- ✅ Latency (time to first token, total time)
- ✅ Model name and version
- ✅ Errors and exceptions

#### Add Custom Manual Spans (Makes Your Traces More Impressive)

```python
from ddtrace.llmobs import LLMObs
from ddtrace.llmobs.decorators import workflow, task, llm

# Option 1: Decorator pattern (cleanest)
@workflow(name="ops-query-pipeline")
def handle_ops_query(user_query: str) -> str:
    """Full pipeline: classify → fetch context → synthesize → speak"""
    
    # Task span for Datadog context fetching
    with LLMObs.task(name="fetch-datadog-context") as dd_span:
        dd_context = query_datadog_logs(user_query)
        LLMObs.annotate(
            output_data=dd_context,
            tags={"tool": "datadog-logs", "query": user_query[:50]}
        )
    
    # Task span for Neo4j graph query
    with LLMObs.task(name="fetch-graph-context") as graph_span:
        service_name = extract_service_name(user_query)
        graph_context = get_service_blast_radius(service_name)
        LLMObs.annotate(
            output_data=graph_context,
            tags={"tool": "neo4j", "service": service_name}
        )
    
    # The Claude call is automatically traced by ddtrace
    response = agent(f"""
Context from Datadog: {dd_context}
Context from Graph: {graph_context}
User query: {user_query}
""")
    
    return str(response)


# Option 2: Context manager (for more control)
def handle_voice_query(audio_transcript: str):
    with LLMObs.workflow(name="voice-ops-workflow"):
        
        # Tag the entire workflow
        LLMObs.annotate(
            input_data=audio_transcript,
            tags={
                "interface": "voice",
                "env": "hackathon",
                "user_intent": classify_intent(audio_transcript)
            }
        )
        
        result = handle_ops_query(audio_transcript)
        
        LLMObs.annotate(
            output_data=result,
            tags={"tts_enabled": "true"}
        )
        
        return result


# Option 3: Enable agentlessly in code (alternative to env vars)
from ddtrace.llmobs import LLMObs

LLMObs.enable(
    ml_app="opsvoice",
    api_key=os.environ.get("DD_API_KEY"),
    site="datadoghq.com",
    agentless_enabled=True,
    env="hackathon"
)
```

#### Span Types Reference

| Span Kind | When to Use | Example |
|---|---|---|
| `workflow` | Top-level operation containing multiple steps | Full request handling |
| `task` | Non-LLM step: API call, DB query, preprocessing | Fetching Datadog logs |
| `llm` | Direct LLM call (auto-traced, but can override) | Claude message creation |
| `agent` | Autonomous reasoning loop | Strands agent execution |
| `tool` | Tool/function call by an agent | check_datadog() |
| `embedding` | Vector embedding generation | RAG embed query |
| `retrieval` | Fetching documents from vector store | Neo4j query |

#### AWS Lambda with LLM Observability

```bash
# If deploying to Lambda (not AgentCore), instrument this way:
datadog-ci lambda instrument \
  -f opsvoice-function \
  -r us-west-2 \
  -v 122 \
  -e 92 \
  --llmobs opsvoice
```

```python
# In your Lambda handler, flush before returning:
from ddtrace.llmobs import LLMObs

def handler(event, context):
    result = process_query(event["query"])
    LLMObs.flush()  # Flush before Lambda terminates
    return {"response": result}
```

---

### Option 2: Live Datadog Dashboard

Build a dashboard before the demo and keep it open on your screen during judging. This makes your project look production-ready from the moment a judge walks up.

#### What to Display

```
Dashboard: "OpsVoice — Live Agent Metrics"

Row 1: Health Overview
├── Total LLM Requests (timeseries, last 30 min)
├── P95 Response Latency (gauge)
├── Error Rate % (big number, red if >5%)
└── Active Sessions (big number, green)

Row 2: Token Economics
├── Input Tokens/min (timeseries by model)
├── Output Tokens/min (timeseries by model)
├── Estimated Cost/hour (calculated metric)
└── Token Usage by Provider (bar chart: Claude vs MiniMax)

Row 3: Tool Performance
├── Tool Call Success Rate (pie: Datadog MCP, Neo4j, MiniMax TTS)
├── Tool Latency P95 (bar chart by tool name)
├── Tool Errors (log stream, filtered to errors)
└── MCP Query Volume (timeseries)

Row 4: Agent Quality
├── Evaluation Scores (when managed evals configured)
├── Trace Timeline (scatter plot, latency over time)
└── Top Errors (table: error message, count, last seen)
```

#### Create Dashboard via API

```python
import requests

DD_API_KEY = os.environ.get("DD_API_KEY")
DD_APP_KEY = os.environ.get("DD_APP_KEY")

dashboard_payload = {
    "title": "OpsVoice — Live Agent Metrics",
    "description": "Real-time observability for the OpsVoice AI Operations Agent",
    "layout_type": "ordered",
    "widgets": [
        {
            "definition": {
                "type": "timeseries",
                "requests": [{
                    "q": "sum:dd.llmobs.request.count{ml_app:opsvoice}.as_count()",
                    "display_type": "bars"
                }],
                "title": "LLM Requests per Minute"
            }
        },
        {
            "definition": {
                "type": "query_value",
                "requests": [{
                    "q": "p95:dd.llmobs.request.duration{ml_app:opsvoice}",
                    "aggregator": "avg"
                }],
                "title": "P95 Latency (ms)",
                "precision": 0
            }
        },
        {
            "definition": {
                "type": "timeseries",
                "requests": [{
                    "q": "sum:dd.llmobs.tokens.input{ml_app:opsvoice} by {model_name}.as_count()",
                    "display_type": "area"
                }],
                "title": "Input Tokens by Model"
            }
        }
    ]
}

response = requests.post(
    "https://api.datadoghq.com/api/v1/dashboard",
    headers={"DD-API-KEY": DD_API_KEY, "DD-APPLICATION-KEY": DD_APP_KEY},
    json=dashboard_payload
)

dashboard_url = response.json()["url"]
print(f"Dashboard: https://datadoghq.com{dashboard_url}")
```

---

### Option 3: Datadog MCP Server

This is the integration Bharadwaj specifically highlighted in his Datadog MCP blog post. Your agent using MCP to query Datadog is the cleanest demo of the Datadog + AI integration story.

#### Official Datadog MCP (Preview — Allowlisted)

The official Datadog MCP server is in Preview and requires allowlist access. Request access at `docs.datadoghq.com/bits_ai/mcp_server`. You may have access through the hackathon.

**Remote MCP URL:** Provided after allowlist approval

#### Community MCP Server (Works Right Now — Use This)

```bash
# Method 1: Auto-install for Claude Desktop
npx -y @smithery/cli install @winor30/mcp-server-datadog --client claude

# Method 2: Manual npm config
# Add to ~/.claude/claude_desktop_config.json or equivalent:
```

```json
{
  "mcpServers": {
    "datadog": {
      "command": "npx",
      "args": ["-y", "@winor30/mcp-server-datadog"],
      "env": {
        "DATADOG_API_KEY": "<YOUR_DD_API_KEY>",
        "DATADOG_APP_KEY": "<YOUR_DD_APP_KEY>",
        "DATADOG_SITE": "datadoghq.com",
        "DATADOG_STORAGE_TIER": "indexes"
      }
    }
  }
}
```

#### Full List of MCP Tools Available

| Tool | Description | Example Query |
|---|---|---|
| `list_incidents` | Get active Datadog incidents | "Are there any P1 incidents right now?" |
| `get_incident_details` | Full incident info, timeline, responders | "What's the timeline for INC-001?" |
| `get_monitors` | Monitor status, alerting state | "Which monitors are in Alert state?" |
| `search_logs` | Full-text log search with filters | "Find timeout errors in api-gateway last hour" |
| `list_dashboards` | Get all dashboard names + URLs | "What dashboards do we have?" |
| `get_metrics` | Query time-series metrics | "Show me api-gateway error rate last 24h" |
| `search_traces` | APM distributed traces | "Find slow traces for payment-service" |
| `get_hosts` | Infrastructure host list + status | "Which hosts are down?" |
| `list_downtimes` | Scheduled maintenance windows | "Any scheduled downtimes today?" |
| `get_host_details` | Detailed info on a specific host | "What's running on host web-prod-01?" |
| `mute_host` | Silence alerts for a host | "Mute web-prod-02 during maintenance" |

#### Integrate MCP into Your Strands Agent

```python
# In your agent, add Datadog querying as a tool that calls MCP
import subprocess
import json

def call_datadog_mcp(tool_name: str, params: dict) -> str:
    """Call Datadog MCP server tool"""
    # This calls the local MCP server via subprocess
    # In production, use the MCP Python SDK
    result = subprocess.run(
        ["npx", "@winor30/mcp-server-datadog", tool_name],
        input=json.dumps(params),
        capture_output=True,
        text=True,
        env={**os.environ, "DATADOG_API_KEY": DD_API_KEY, "DATADOG_APP_KEY": DD_APP_KEY}
    )
    return result.stdout


@tool
def intelligent_health_check(service: str) -> str:
    """Comprehensive health check using Datadog MCP tools.
    
    Queries logs, monitors, and recent incidents for a given service.
    """
    
    # Check active incidents
    incidents = call_datadog_mcp("list_incidents", {"filter": service, "limit": 5})
    
    # Get monitor states
    monitors = call_datadog_mcp("get_monitors", {"tags": [f"service:{service}"]})
    
    # Search recent error logs
    logs = call_datadog_mcp("search_logs", {
        "query": f"service:{service} status:error",
        "from_time": "now-1h",
        "limit": 10
    })
    
    return f"""
Datadog Health Check for {service}:

INCIDENTS: {incidents}

MONITORS: {monitors}

RECENT ERRORS: {logs}
"""
```

---

### Option 4: Managed Evaluations (AI-Powered Quality Scoring)

```
Navigate to: Datadog → LLM Observability → Settings → Integrations
Click: "Connect" on the Anthropic tile
Enter: Your Anthropic API key
Enable: "Use this API key to evaluate your LLM applications"

# Datadog will now automatically score every response for:
# - Sentiment (positive/negative/neutral)
# - Topic relevancy (is the response on-topic?)
# - Toxicity (safety check)
# - Failure to answer (did the LLM dodge the question?)
# - Hallucination detection
```

---

## 🕸️ Neo4j Integration

**Prize:** Neo4j cloud credits + Bose QuietComfort Ultra Bluetooth Headphones

### Setup: Neo4j Aura Free

```
1. Go to: https://neo4j.com/cloud/aura-free
2. Create account → Create Free instance
3. Download credentials file (has URI, username, password)
4. Free tier: 50K nodes, 175K relationships — plenty for demo
```

```bash
pip install neo4j
```

### Schema Design for Ops Demo

```cypher
// Create service nodes
CREATE (api:Service {
    name: 'api-gateway',
    team: 'platform',
    tier: 'critical',
    language: 'Go',
    owner: 'platform-team@company.com'
})

CREATE (auth:Service {
    name: 'auth-service',
    team: 'identity',
    tier: 'critical',
    language: 'Python',
    owner: 'identity-team@company.com'
})

CREATE (db:Service {
    name: 'postgres-main',
    team: 'data',
    tier: 'critical',
    language: 'SQL',
    owner: 'data-team@company.com'
})

CREATE (cache:Service {
    name: 'redis-cache',
    team: 'platform',
    tier: 'standard',
    language: 'Redis',
    owner: 'platform-team@company.com'
})

CREATE (payment:Service {
    name: 'payment-service',
    team: 'payments',
    tier: 'critical',
    language: 'Java',
    owner: 'payments-team@company.com'
})

CREATE (notify:Service {
    name: 'notification-service',
    team: 'comms',
    tier: 'standard',
    language: 'Node.js',
    owner: 'comms-team@company.com'
})

// Create dependency relationships
CREATE (api)-[:DEPENDS_ON {type: 'auth', latency_p99: 15, calls_per_min: 1200}]->(auth)
CREATE (api)-[:DEPENDS_ON {type: 'database', latency_p99: 45, calls_per_min: 800}]->(db)
CREATE (api)-[:DEPENDS_ON {type: 'cache', latency_p99: 2, calls_per_min: 5000}]->(cache)
CREATE (auth)-[:DEPENDS_ON {type: 'database', latency_p99: 30, calls_per_min: 400}]->(db)
CREATE (auth)-[:DEPENDS_ON {type: 'cache', latency_p99: 2, calls_per_min: 2000}]->(cache)
CREATE (payment)-[:DEPENDS_ON {type: 'database', latency_p99: 60, calls_per_min: 300}]->(db)
CREATE (payment)-[:DEPENDS_ON {type: 'auth', latency_p99: 15, calls_per_min: 300}]->(auth)
CREATE (notify)-[:DEPENDS_ON {type: 'cache', latency_p99: 3, calls_per_min: 500}]->(cache)

// Link incidents
CREATE (inc1:Incident {
    id: 'INC-001',
    severity: 'P1',
    title: 'Postgres connection pool exhausted',
    status: 'active',
    started_at: '2026-02-20T14:30:00Z'
})
CREATE (db)-[:HAS_INCIDENT]->(inc1)
```

### Python Integration

```python
from neo4j import GraphDatabase
import os

NEO4J_URI = os.environ.get("NEO4J_URI")           # bolt+ssc://xxx.databases.neo4j.io:7687
NEO4J_USERNAME = os.environ.get("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))


def get_blast_radius(service_name: str) -> dict:
    """Find all services impacted if a given service fails."""
    with driver.session() as session:
        result = session.run("""
            MATCH (impacted:Service)-[:DEPENDS_ON*1..3]->(s:Service {name: $service})
            RETURN DISTINCT
                impacted.name AS service,
                impacted.team AS team,
                impacted.tier AS tier,
                impacted.owner AS owner
            ORDER BY CASE impacted.tier WHEN 'critical' THEN 1 ELSE 2 END
        """, service=service_name)
        
        return {
            "affected_services": [r.data() for r in result]
        }


def get_dependency_chain(service_name: str) -> dict:
    """Find everything a service depends on (upstream)."""
    with driver.session() as session:
        result = session.run("""
            MATCH (s:Service {name: $service})-[:DEPENDS_ON*1..4]->(dep:Service)
            RETURN DISTINCT
                dep.name AS dependency,
                dep.tier AS tier,
                dep.team AS team
        """, service=service_name)
        
        return {"dependencies": [r.data() for r in result]}


def find_common_dependencies(service_a: str, service_b: str) -> dict:
    """Find shared dependencies between two services (good for root cause analysis)."""
    with driver.session() as session:
        result = session.run("""
            MATCH (a:Service {name: $a})-[:DEPENDS_ON*1..3]->(shared:Service)
            MATCH (b:Service {name: $b})-[:DEPENDS_ON*1..3]->(shared)
            RETURN DISTINCT shared.name AS shared_service, shared.tier AS tier
        """, a=service_a, b=service_b)
        
        return {"shared_dependencies": [r.data() for r in result]}


def get_active_incidents() -> list:
    """Get all services with active incidents and their blast radius."""
    with driver.session() as session:
        result = session.run("""
            MATCH (s:Service)-[:HAS_INCIDENT]->(i:Incident {status: 'active'})
            MATCH (impacted:Service)-[:DEPENDS_ON*1..3]->(s)
            RETURN 
                s.name AS failing_service,
                i.severity AS severity,
                i.title AS incident_title,
                collect(DISTINCT impacted.name) AS affected_services
            ORDER BY CASE i.severity WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END
        """)
        
        return [r.data() for r in result]
```

### LangChain-Neo4j Integration (GraphCypherQAChain)

```python
# Optional: let the LLM generate Cypher queries automatically
from langchain_community.graphs import Neo4jGraph
from langchain_community.chains import GraphCypherQAChain
from langchain_aws import ChatBedrock

graph = Neo4jGraph(
    url=NEO4J_URI,
    username=NEO4J_USERNAME,
    password=NEO4J_PASSWORD
)

llm = ChatBedrock(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0")

chain = GraphCypherQAChain.from_llm(
    llm,
    graph=graph,
    verbose=True,
    allow_dangerous_requests=True
)

# Now you can ask natural language questions that auto-generate Cypher:
result = chain.invoke("What services are most at risk if postgres-main fails?")
```

---

## 🤖 CopilotKit Frontend

**~20 minutes to add a full AI copilot sidebar to any React app.**

### Install

```bash
npm install @copilotkit/react-core @copilotkit/react-ui @copilotkit/runtime
```

### Backend Setup (Next.js API Route)

```typescript
// app/api/copilotkit/route.ts

import {
  CopilotRuntime,
  AnthropicAdapter,
  copilotRuntimeNextJSAppRouterHandler
} from "@copilotkit/runtime";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL  // For MiniMax: https://api.minimax.io/anthropic
});

const runtime = new CopilotRuntime({
  actions: [
    {
      name: "query_infrastructure",
      description: "Query AWS infrastructure, Datadog metrics, or service health",
      parameters: [
        {
          name: "query",
          type: "string",
          description: "The infrastructure query to execute",
          required: true
        }
      ],
      handler: async ({ query }) => {
        // Call your Strands/AgentCore backend
        const response = await fetch(process.env.AGENTCORE_ENDPOINT!, {
          method: "POST",
          body: JSON.stringify({ prompt: query })
        });
        const data = await response.json();
        return data.response;
      }
    }
  ]
});

const serviceAdapter = new AnthropicAdapter({ 
  anthropic: client,
  model: "MiniMax-M2.5-highspeed"  // Use MiniMax via Anthropic compat!
});

export const POST = copilotRuntimeNextJSAppRouterHandler({
  runtime,
  serviceAdapter,
  endpoint: "/api/copilotkit"
});
```

### Frontend Setup

```tsx
// app/layout.tsx
import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CopilotKit runtimeUrl="/api/copilotkit">
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}


// app/dashboard/page.tsx
"use client";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { useCopilotAction } from "@copilotkit/react-core";
import { useState } from "react";

export default function Dashboard() {
  const [audioPlaying, setAudioPlaying] = useState(false);
  
  // Register frontend state that the copilot can read/modify
  useCopilotAction({
    name: "play_voice_response",
    description: "Play the AI response through voice (MiniMax TTS)",
    parameters: [{
      name: "text",
      type: "string",
      description: "Text to speak aloud"
    }],
    handler: async ({ text }) => {
      const response = await fetch("/api/tts", {
        method: "POST",
        body: JSON.stringify({ text })
      });
      const audioBuffer = await response.arrayBuffer();
      const audioContext = new AudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = await audioContext.decodeAudioData(audioBuffer);
      source.connect(audioContext.destination);
      source.start(0);
      return "Playing voice response";
    }
  });
  
  return (
    <CopilotSidebar
      defaultOpen={true}
      clickOutsideToClose={false}
      labels={{
        title: "OpsVoice Agent",
        initial: "👋 I'm your AI operations assistant. Ask me about any service in your infrastructure.",
        placeholder: "Ask about service health, incidents, or blast radius..."
      }}
    >
      <MainDashboard />
    </CopilotSidebar>
  );
}
```

### Next.js API Route for TTS

```typescript
// app/api/tts/route.ts
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  
  const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "speech-2.8-hd",
      text,
      stream: false,
      output_format: "hex",  // Get hex-encoded audio
      voice_setting: {
        voice_id: "English_expressive_narrator",
        speed: 1.0
      },
      audio_setting: {
        format: "mp3",
        sample_rate: 32000,
        bitrate: 128000
      }
    })
  });
  
  const data = await response.json();
  const audioBytes = Buffer.from(data.data.audio, "hex");
  
  return new Response(audioBytes, {
    headers: { "Content-Type": "audio/mpeg" }
  });
}
```

---

## 🧪 TestSprite Integration

**CEO Yunhao Jiao is a judge.** Even 10 minutes of TestSprite adds serious credibility.

### Quick Integration

```bash
# Install TestSprite CLI
npm install -g @testsprite/cli

# Point at your deployed AgentCore endpoint
testsprite init --endpoint "<YOUR_AGENTCORE_ENDPOINT>"

# Auto-generate test cases from your API
testsprite generate --api-schema ./openapi.yaml

# Run tests
testsprite run --report html
```

### What TestSprite Does

- **Auto-generates test cases** from your API schema or by crawling your endpoint
- **AI-powered test assertions** — verifies LLM responses are coherent and on-topic
- **Load testing** — tests your agent under concurrent requests
- **Quality scoring** — rates response consistency across similar queries
- **Integration testing** — verifies Datadog, Neo4j, MiniMax all return proper responses

### Quick Manual Test (If CLI Doesn't Work)

```python
# Quick integration test to show TestSprite-style coverage
import requests
import time

ENDPOINT = os.environ.get("AGENTCORE_ENDPOINT")

test_cases = [
    {
        "query": "Is api-gateway healthy?",
        "expected_keywords": ["api-gateway", "error", "monitor"],
        "max_latency_ms": 5000
    },
    {
        "query": "What services depend on postgres-main?",
        "expected_keywords": ["service", "depend", "postgres"],
        "max_latency_ms": 8000
    },
    {
        "query": "Are there any P1 incidents right now?",
        "expected_keywords": ["incident", "P1", "status"],
        "max_latency_ms": 5000
    }
]

results = []
for test in test_cases:
    start = time.time()
    response = requests.post(ENDPOINT, json={"prompt": test["query"]})
    latency = (time.time() - start) * 1000
    
    resp_text = response.json().get("response", "")
    keywords_found = sum(1 for kw in test["expected_keywords"] if kw.lower() in resp_text.lower())
    
    results.append({
        "query": test["query"],
        "passed": keywords_found >= 2 and latency < test["max_latency_ms"],
        "latency_ms": round(latency),
        "keywords_matched": f"{keywords_found}/{len(test['expected_keywords'])}"
    })

print("Test Results:")
for r in results:
    icon = "✅" if r["passed"] else "❌"
    print(f"{icon} {r['query'][:50]} — {r['latency_ms']}ms, {r['keywords_matched']} keywords")
```

---

## ⏰ Hour-by-Hour Build Schedule

| Time | Task | Tools | Priority |
|---|---|---|---|
| **9:00 - 9:30 AM** | Check in. Join Discord. Fill MiniMax credits form. WiFi setup. | — | 🔴 NOW |
| **9:30 - 11:00 AM** | Attend partner talks. Note each sponsor's key talking points. Network. | Notebook | 🟡 |
| **11:00 - 11:20 AM** | Enable Bedrock model access. Set up Datadog account. Get API keys for all services. | AWS Console, Datadog | 🔴 CRITICAL |
| **11:20 - 11:50 AM** | Install packages. Deploy minimal "hello world" Strands agent to AgentCore. | `agentcore create + deploy` | 🔴 CRITICAL |
| **11:50 AM - 12:10 PM** | Add `ddtrace` env vars. Run with `ddtrace-run`. Verify traces appear in Datadog LLM Obs. | Datadog UI | 🔴 CRITICAL |
| **12:00 - 12:30 PM** | 🍽️ Lunch (MongoDB sponsored) | — | — |
| **12:30 - 1:00 PM** | Add Datadog logs + monitors tools to your Strands agent. Test queries. | Python, DD API | 🔴 |
| **1:00 - 1:30 PM** | Seed Neo4j with service graph. Add blast radius tool to agent. | Neo4j, Cypher | 🟡 |
| **1:30 - 2:00 PM** | Integrate MiniMax TTS. Test voice output. Full pipeline works. | MiniMax API | 🟡 |
| **2:00 - 2:30 PM** | Set up community Datadog MCP server. Add as agent tool. | npx, winor30 MCP | 🟡 |
| **2:30 - 3:00 PM** | Scaffold Next.js frontend. Add CopilotKit. Connect to backend. | Next.js, CopilotKit | 🟢 |
| **3:00 - 3:30 PM** | Build Datadog dashboard. Add widgets. Get dashboard URL for demo. | Datadog UI | 🟡 |
| **3:30 - 4:00 PM** | Add TestSprite. Run integration tests. Record key metrics. | TestSprite | 🟢 |
| **4:00 - 4:30 PM** | Write README. Create architecture diagram. Polish demo script. | Markdown, draw.io | 🔴 |
| **4:30 - 4:50 PM** | Full end-to-end demo run. Fix any blockers. Pre-warm AgentCore. | — | 🔴 |
| **4:50 - 5:00 PM** | **SUBMIT. Check submission form twice.** | — | 🚨 SUBMIT NOW |
| **5:00 - 7:00 PM** | Science fair judging. Be at your station. Run demo every 5-10 min. | — | 🔴 |
| **7:00 - 7:30 PM** | If selected: 5-7 minute presentation to full audience. Know your metrics. | Slides | 🔴 |
| **7:45 - 8:00 PM** | Award ceremony. 🏆 | — | 🏆 |

### If Things Go Wrong (Triage Priority)

1. **Agent not responding?** → Check AgentCore was deployed (`agentcore invoke` test)
2. **No Datadog traces?** → Check `DD_LLMOBS_AGENTLESS_ENABLED=true` and `DD_API_KEY` are set
3. **MiniMax TTS silent?** → Audio is hex-encoded, use `bytes.fromhex()` not `base64.decode()`
4. **Neo4j connection refused?** → Use bolt+ssc:// URI from Aura console (not http://)
5. **Bedrock model access denied?** → Go to Bedrock console → Model access → Enable Claude Sonnet 4

---

## 🎬 90-Second Demo Script

**Practice this 5 times before judging starts at 5 PM. You will repeat it every 5-10 minutes for 2 hours.**

### [0:00 - 0:15] Opening Hook

> "On-call engineers waste 2-4 hours per incident manually correlating Datadog logs, metrics, and service maps. OpsVoice gives you a single conversational interface to your entire infrastructure. Let me show you."

### [0:15 - 1:15] Live Demo

**Step 1 — Voice/text input visible on screen:**
> "Is api-gateway healthy right now?"

**Step 2 — Narrate what's happening:**
> "The agent just called three Datadog MCP tools simultaneously — logs, monitors, and recent incidents — all traceable in real time on this Datadog dashboard."

*(Point to Datadog dashboard showing live LLM traces, latency, token counts)*

**Step 3 — Agent response comes back:**
> "Watch the blast radius analysis — it hit Neo4j to show which services downstream would be affected if api-gateway degrades."

**Step 4 — MiniMax TTS speaks the response:**
> "And here's the moment — the response is synthesized by MiniMax speech-2.8-hd and spoken aloud. Your on-call engineer gets an audio briefing hands-free."

*(Audio plays — people will stop and stare)*

**Step 5 — Show the Datadog dashboard:**
> "Every LLM call, every tool invocation, every token used — fully traced. You can see the P95 latency, the model costs, and quality evaluations all in one place."

### [1:15 - 1:30] Close

> "Built in 6 hours with Strands Agents on Amazon Bedrock AgentCore, Datadog LLM Observability, MiniMax multimodal AI, and Neo4j for service graph context. Deployed, observable, and ready for production."

### Key Metrics to Know Cold (Judges Will Ask)

- How many Datadog MCP tool calls does a typical query make?
- What's your P95 response latency? (Should be < 3 seconds)
- How many tokens per query? (Shows you understand economics)
- How many nodes in your Neo4j graph?
- What percentage of TestSprite tests pass?

---

## 🔑 Environment Variables Quick Reference

```bash
# === AWS ===
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="xxx"
export AWS_DEFAULT_REGION="us-west-2"

# === Datadog ===
export DD_API_KEY="xxx"                    # From: Datadog → Org Settings → API Keys
export DD_APP_KEY="xxx"                    # From: Datadog → Org Settings → App Keys
export DD_SITE="datadoghq.com"
export DD_LLMOBS_ENABLED="1"
export DD_LLMOBS_ML_APP="opsvoice"
export DD_LLMOBS_AGENTLESS_ENABLED="true"
export DD_SERVICE="opsvoice-backend"
export DD_ENV="hackathon"

# === MiniMax (for direct HTTP API) ===
export MINIMAX_API_KEY="xxx"               # From: platform.minimax.io → API Keys

# === MiniMax (for Anthropic SDK compat) ===
export ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic"
export ANTHROPIC_API_KEY="xxx"             # Same as MINIMAX_API_KEY

# === Neo4j ===
export NEO4J_URI="bolt+ssc://xxx.databases.neo4j.io:7687"
export NEO4J_USERNAME="neo4j"
export NEO4J_PASSWORD="xxx"

# === Your Agent ===
export AGENTCORE_ENDPOINT="https://bedrock-agentcore.us-west-2.amazonaws.com/..."
```

### Quick requirements.txt

```text
bedrock-agentcore-starter-toolkit>=0.1.21
strands-agents
strands-agents[otel]
strands-agents-tools
boto3
ddtrace
anthropic
neo4j
requests
langchain-neo4j
aws-opentelemetry-distro
opentelemetry-instrumentation-langchain
fastapi
uvicorn
python-dotenv
```

---

## 🧑‍⚖️ Judge Profiles & What They Want

### Datadog Judges

**Bharadwaj Tanikella — AI Product Leader @ Datadog**
- **Built** LLM Observability product
- **Wants to see:** Custom spans with decorators, live dashboard with meaningful widgets, MCP integration where your agent actually queries Datadog
- **Talk about:** Trace hierarchy, token economics, quality evaluations, agentic observability
- **Say:** "We structured our spans as workflow → task → LLM to mirror the actual reasoning pipeline, so we can see exactly where latency comes from at each step."

### AWS Judges

**Nick Simha / Mickey Iqbal / Saptarshi Banerjee — AWS Solutions Architects**
- **Want to see:** Real deployment on AgentCore (not localhost), proper IAM, multi-service usage
- **Talk about:** AgentCore Runtime for serverless deployment, Memory for persistence, Gateway for tool management
- **Say:** "We used AgentCore Runtime for zero-infrastructure deployment, Memory for cross-session context, and the OTEL integration feeds traces to both CloudWatch and Datadog simultaneously."

### Anthropic Judges

**Marius Buleandra — Technical Staff @ Anthropic**
- **Wants to see:** Thoughtful use of Claude's capabilities, tool use patterns, safety-aware prompting
- **Talk about:** How you structured system prompts, why you chose tool use over fine-tuning, extended thinking for complex reasoning
- **Say:** "We used extended thinking for the blast radius analysis because the dependency graph traversal benefits from step-by-step reasoning, but switched to Claude Haiku for intent classification to manage costs."

### MiniMax Judges

**Victor Su-Ortiz — Developer Relations @ MiniMax**
- **Wants to see:** Actual use of MiniMax APIs (not just one API call), multimodal usage is a plus
- **Talk about:** Why speech-2.8-hd vs other voices, voice customization, how TTS changes the UX
- **Say:** "We use MiniMax-M2.5-highspeed for real-time responses where latency matters, and speech-2.8-hd for voice output because the tonal quality makes ops briefings feel natural rather than robotic."

### Neo4j Judges

**William Lyon (AI Innovation) / Jeremy Adams (Sr. Dev Advocate) @ Neo4j**
- **Want to see:** A real schema, meaningful Cypher queries, graph thinking applied to the problem
- **Talk about:** Why a graph is better than a table for service dependencies, path traversal for blast radius
- **Say:** "Relational databases require expensive JOINs to traverse multi-hop service dependencies. Neo4j's native graph traversal finds the full blast radius in a single Cypher query in milliseconds."

### TestSprite Judges

**Yunhao Jiao — CEO & Co-Founder @ TestSprite**
- **Wants to see:** Integration of TestSprite, discussion of AI testing challenges
- **Talk about:** How LLM responses are non-deterministic and why traditional unit tests fail, how TestSprite handles this
- **Say:** "LLM agents are inherently non-deterministic, so TestSprite's semantic assertion approach is the right answer — it evaluates whether the response is *correct* rather than whether it matches an exact string."

### VC Judges (Section 32, Musa Capital, Sierra Ventures, Spacefund)

**Wesley Tillu (Section 32) / Allen Smith (Musa Capital) / Vignesh Ravikumar (Sierra Ventures)**
- **Want to hear:** Market size, unique angle, path to revenue
- **Talk about:** Enterprise DevOps market is $10B+, voice interface is a UX breakthrough, existing customers would pay $5K-$50K/year
- **Say:** "On-call engineers at enterprise companies cost $200K+ per year in salary. If OpsVoice reduces MTTR by 30%, that's $60K in recovered engineer time per senior engineer per year. The ROI case writes itself."

---

## ⚠️ Common Pitfalls & Fixes

### AWS

**Bedrock model access denied**
- Fix: Console → Bedrock → Model Access → Enable Claude Sonnet 4 in us-west-2
- Takes 1-2 minutes after clicking enable

**AgentCore deploy fails with permission error**
- Fix: Your IAM user needs `AmazonBedrockAgentCoreFullAccess` policy
- Run: `aws iam attach-user-policy --user-name <you> --policy-arn arn:aws:iam::aws:policy/AmazonBedrockAgentCoreFullAccess`

**AgentCore cold start (30 second first request)**
- Fix: Pre-warm by sending a test request 2 minutes before demo
- Keep a browser tab with the agent active

**agentcore command not found after pip install**
- Fix: `export PATH="$(pwd)/.venv/bin:$PATH"` then reinstall in venv

### Datadog

**No traces in LLM Observability**
- Fix 1: Make sure `DD_LLMOBS_AGENTLESS_ENABLED=true` is set
- Fix 2: Make sure you're running with `ddtrace-run python app.py` not just `python app.py`
- Fix 3: Wait 30-60 seconds — traces have a brief delay
- Fix 4: Check `DD_SITE=datadoghq.com` matches your account's region

**Application key vs API key confusion**
- API key: Authenticates requests. Use for `DD_API_KEY` in ddtrace.
- Application key: Authorizes specific operations. Use for `DD_APP_KEY` when calling Datadog REST API directly.
- Both are required for the Datadog REST API; only API key needed for ddtrace/LLM Obs.

### MiniMax

**Audio silent / no output**
- Fix: Audio is hex-encoded. Use `bytes.fromhex(data["data"]["audio"])` NOT `base64.b64decode()`

**Temperature out of range error**
- Fix: MiniMax accepts temperature range `(0.0, 1.0]` — NOT the Claude range of `[0, 1]`
- If you pass 0, you'll get an error. Use 0.01 minimum.

**Anthropic SDK compatibility — images not supported**
- Fix: MiniMax's Anthropic compat layer doesn't support image or document inputs yet
- Work around: Use OpenAI-compatible endpoint if you need vision

### Neo4j

**Connection refused / SSL error**
- Fix: Use `bolt+ssc://` URI from the Aura console, not `bolt://` or `http://`
- The Aura Free URI looks like: `bolt+ssc://xxxxxxxx.databases.neo4j.io:7687`

**Session not closed properly**
- Fix: Always use `with driver.session() as session:` context manager
- Aura Free has connection limits — leaked connections will cause failures

### CopilotKit

**CORS error from frontend to backend**
- Fix: Add CORS headers to your FastAPI or Next.js API routes
- Or: Use Next.js API routes as a proxy to your backend

**Type error: Cannot read properties of undefined (reading 'type')**
- Fix: Use `"use client"` directive on any component using CopilotKit hooks

---

## 🔗 All Essential URLs

### Credentials & Setup
| Service | URL |
|---|---|
| MiniMax Console (API Keys) | https://platform.minimax.io/user-center/basic-information |
| **MiniMax Free Credits Form** | **https://forms.gle/Fazk8r87QmudNLNd6** |
| AWS Console | https://console.aws.amazon.com |
| AWS Bedrock Model Access | https://console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess |
| Datadog Free Trial | https://www.datadoghq.com/free-datadog-trial/ |
| Datadog LLM Obs | https://app.datadoghq.com/llm/traces |
| Neo4j Aura Free | https://neo4j.com/cloud/aura-free |

### Documentation
| Resource | URL |
|---|---|
| MiniMax API Overview | https://platform.minimax.io/docs/api-reference/api-overview |
| MiniMax Models | https://platform.minimax.io/docs/guides/models-intro |
| MiniMax Anthropic Compat | https://platform.minimax.io/docs/api-reference/text-anthropic-api |
| MiniMax TTS HTTP | https://platform.minimax.io/docs/api-reference/speech-t2a-http |
| MiniMax Video Gen | https://platform.minimax.io/docs/api-reference/video-generation-t2v |
| AgentCore Quickstart | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-get-started-toolkit.html |
| AgentCore Starter Toolkit | https://github.com/aws/bedrock-agentcore-starter-toolkit |
| Strands Agents Docs | https://strandsagents.com/latest/documentation |
| Datadog LLM Obs Docs | https://docs.datadoghq.com/llm_observability/ |
| Datadog LLM Auto-Instrumentation | https://docs.datadoghq.com/llm_observability/instrumentation/auto_instrumentation/ |
| Datadog SDK Reference | https://docs.datadoghq.com/llm_observability/instrumentation/sdk/ |
| Datadog MCP Server | https://docs.datadoghq.com/bits_ai/mcp_server |
| Community DD MCP (winor30) | https://github.com/winor30/mcp-server-datadog |
| CopilotKit Docs | https://docs.copilotkit.ai |
| CopilotKit GitHub | https://github.com/CopilotKit/CopilotKit |
| TestSprite | https://testsprite.com |
| Neo4j Cypher Manual | https://neo4j.com/docs/cypher-manual/current/ |

### Event Links
| Resource | URL |
|---|---|
| Event Discord | https://discord.gg/aMG8tdKq |
| Event Page | (Luma event page) |
| AWS Builder Loft Address | 525 Market St, San Francisco, CA 94105 |

---

## 🏆 Final Checklist Before 5 PM Submission

**Technical Requirements:**
- [ ] Agent deployed and responding on AgentCore Runtime (not localhost)
- [ ] `ddtrace-run` wrapping the app, traces visible in Datadog LLM Obs
- [ ] At least one Datadog tool integrated (MCP, direct API, or dashboard)
- [ ] MiniMax API called (text, TTS, or video)
- [ ] README with architecture diagram and setup instructions
- [ ] Demo works end-to-end without errors

**Prize Track Checkboxes:**
- [ ] 🔴 **AWS:** Amazon Bedrock used for at least one LLM call
- [ ] 🔴 **Datadog:** LLM Observability traces visible + dashboard open
- [ ] 🟡 **MiniMax:** Filled credits form + TTS integrated
- [ ] 🟡 **Neo4j:** Service graph seeded, blast radius tool working
- [ ] 🟢 **CopilotKit:** Sidebar visible in frontend
- [ ] 🟢 **TestSprite:** At least one test report generated

**Demo Prep:**
- [ ] AgentCore pre-warmed (sent test request in last 5 minutes)
- [ ] Datadog dashboard tab open and refreshed
- [ ] Voice/audio output tested and working
- [ ] Demo script practiced at least 3 times
- [ ] Key metrics memorized (latency, token count, test pass rate)

---

*Digital Studio Labs | Brian | February 20, 2026 | AWS Builder Loft, San Francisco*
*Build fast. Win big. Good luck.*