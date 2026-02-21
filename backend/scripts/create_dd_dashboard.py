#!/usr/bin/env python3
"""
OpusVoice — Datadog Dashboard Creation Script

Run AFTER setting DD_API_KEY and DD_APP_KEY in .env:
    docker exec aws-datadog-backend-1 python scripts/create_dd_dashboard.py

Creates a full "OpusVoice — Live Agent Metrics" dashboard in your Datadog org
and prints the URL. Open it in Datadog during the demo.
"""

import os
import sys
import httpx

DD_API_KEY = os.environ.get("DD_API_KEY", "")
DD_APP_KEY = os.environ.get("DD_APP_KEY", "")
DD_SITE    = os.environ.get("DD_SITE", "datadoghq.com")

GREEN = "\033[92m"; RED = "\033[91m"; YELLOW = "\033[93m"; BOLD = "\033[1m"; RESET = "\033[0m"

def bail(msg: str):
    print(f"\n{RED}{BOLD}ERROR: {msg}{RESET}\n")
    sys.exit(1)

if not DD_API_KEY or DD_API_KEY.startswith("your_"):
    bail(
        "DD_API_KEY is not set.\n"
        "  1. Go to https://app.datadoghq.com/organization-settings/api-keys\n"
        "  2. Create a new key named 'opusvoice-hackathon'\n"
        "  3. Add it to .env as  DD_API_KEY=<key>\n"
        "  4. Rebuild: docker compose up --build -d\n"
        "  5. Re-run this script."
    )

if not DD_APP_KEY or DD_APP_KEY.startswith("your_"):
    bail(
        "DD_APP_KEY is not set.\n"
        "  1. Go to https://app.datadoghq.com/organization-settings/application-keys\n"
        "  2. Create a new key named 'opusvoice-hackathon'\n"
        "  3. Add it to .env as  DD_APP_KEY=<key>"
    )

HEADERS = {
    "DD-API-KEY": DD_API_KEY,
    "DD-APPLICATION-KEY": DD_APP_KEY,
    "Content-Type": "application/json",
}
BASE = f"https://api.{DD_SITE}"

# ── Validate keys first ──────────────────────────────────────────────────────
print(f"\n{BOLD}Validating Datadog credentials…{RESET}")
r = httpx.get(f"{BASE}/api/v1/validate", headers={"DD-API-KEY": DD_API_KEY}, timeout=10)
if not r.json().get("valid"):
    bail(f"DD_API_KEY invalid — {r.text[:80]}")
print(f"  {GREEN}API key valid ✓{RESET}")

# ── Dashboard definition ─────────────────────────────────────────────────────
ML_APP = "opusvoice"

def ts_widget(title: str, query: str, display="line") -> dict:
    return {
        "definition": {
            "type": "timeseries",
            "title": title,
            "title_size": "13",
            "title_align": "left",
            "requests": [{"q": query, "display_type": display}],
            "show_legend": True,
            "legend_layout": "auto",
            "time": {"live_span": "30m"},
        }
    }

def qv_widget(title: str, query: str, unit: str = "", precision: int = 0, alert_val: float | None = None) -> dict:
    w: dict = {
        "definition": {
            "type": "query_value",
            "title": title,
            "title_size": "13",
            "title_align": "left",
            "requests": [{"q": query, "aggregator": "avg"}],
            "precision": precision,
            "time": {"live_span": "30m"},
        }
    }
    if unit:
        w["definition"]["unit"] = unit
    return w

def note_widget(content: str, bg: str = "yellow") -> dict:
    return {
        "definition": {
            "type": "note",
            "content": content,
            "background_color": bg,
            "font_size": "14",
            "text_align": "left",
            "show_tick": False,
        }
    }

def group_widget(title: str, widgets: list, layout: str = "ordered") -> dict:
    return {
        "definition": {
            "type": "group",
            "title": title,
            "layout_type": layout,
            "widgets": widgets,
        }
    }

dashboard = {
    "title": "OpusVoice — Live Agent Metrics",
    "description": "🎙 Real-time LLM Observability for the OpusVoice AI Operations Agent (Hackathon)",
    "layout_type": "ordered",
    "reflow_type": "fixed",
    "tags": ["team:opusvoice", "env:hackathon", "ml_app:opusvoice"],
    "widgets": [

        # ── Header note ───────────────────────────────────────────────────────
        note_widget(
            "## 🎙 OpusVoice — AI Operations Agent\n\n"
            "**Stack:** Claude on AWS Bedrock → MiniMax TTS → Voice Response\n"
            "**Observability:** Datadog LLM Observability (ddtrace agentless)\n\n"
            f"Filter all widgets to `ml_app:{ML_APP}` | Environment: `hackathon`",
            bg="blue",
        ),

        # ── Group 1: Health Overview ──────────────────────────────────────────
        group_widget("📊 Health Overview", [
            qv_widget(
                "Total LLM Requests (30m)",
                f"sum:dd.llmobs.request.count{{ml_app:{ML_APP}}}.as_count()",
            ),
            qv_widget(
                "P95 Latency (ms)",
                f"p95:dd.llmobs.request.duration{{ml_app:{ML_APP}}}",
                unit="ms",
                precision=0,
            ),
            qv_widget(
                "Error Rate",
                f"sum:dd.llmobs.request.error{{ml_app:{ML_APP}}}.as_count() / sum:dd.llmobs.request.count{{ml_app:{ML_APP}}}.as_count() * 100",
                unit="%",
                precision=1,
            ),
            ts_widget(
                "LLM Requests per Minute",
                f"sum:dd.llmobs.request.count{{ml_app:{ML_APP}}}.as_rate()",
                display="bars",
            ),
        ]),

        # ── Group 2: Token Economics ──────────────────────────────────────────
        group_widget("🪙 Token Economics", [
            ts_widget(
                "Input Tokens / min by Model",
                f"sum:dd.llmobs.tokens.input{{ml_app:{ML_APP}}} by {{model_name}}.as_rate()",
                display="area",
            ),
            ts_widget(
                "Output Tokens / min by Model",
                f"sum:dd.llmobs.tokens.output{{ml_app:{ML_APP}}} by {{model_name}}.as_rate()",
                display="area",
            ),
            qv_widget(
                "Total Input Tokens (30m)",
                f"sum:dd.llmobs.tokens.input{{ml_app:{ML_APP}}}.as_count()",
            ),
            qv_widget(
                "Total Output Tokens (30m)",
                f"sum:dd.llmobs.tokens.output{{ml_app:{ML_APP}}}.as_count()",
            ),
        ]),

        # ── Group 3: Latency Distribution ────────────────────────────────────
        group_widget("⚡ Latency", [
            ts_widget(
                "Request Duration — P50 / P95 / P99",
                f"p50:dd.llmobs.request.duration{{ml_app:{ML_APP}}}, "
                f"p95:dd.llmobs.request.duration{{ml_app:{ML_APP}}}, "
                f"p99:dd.llmobs.request.duration{{ml_app:{ML_APP}}}",
            ),
            ts_widget(
                "Avg Latency by Span Kind",
                f"avg:dd.llmobs.request.duration{{ml_app:{ML_APP}}} by {{span_kind}}",
            ),
        ]),

        # ── Group 4: Errors ───────────────────────────────────────────────────
        group_widget("🚨 Errors", [
            ts_widget(
                "LLM Errors over Time",
                f"sum:dd.llmobs.request.error{{ml_app:{ML_APP}}}.as_count()",
                display="bars",
            ),
            {
                "definition": {
                    "type": "log_stream",
                    "title": "Error Logs — opusvoice-backend",
                    "query": f"service:opusvoice-backend status:error",
                    "columns": ["host", "service", "message"],
                    "indexes": [],
                    "time": {"live_span": "30m"},
                    "message_display": "inline",
                    "sort": {"column": "time", "order": "desc"},
                }
            },
        ]),

        # ── Group 5: LLM Traces (APM) ─────────────────────────────────────────
        group_widget("🔍 Trace Explorer", [
            {
                "definition": {
                    "type": "trace_service",
                    "service": "opusvoice-backend",
                    "env": "hackathon",
                    "span_name": "opusvoice-chat-request",
                    "show_hits": True,
                    "show_errors": True,
                    "show_latency": True,
                    "show_breakdown": True,
                    "show_distribution": True,
                    "show_resource_list": True,
                    "size_format": "large",
                    "display_format": "three_column",
                    "time": {"live_span": "30m"},
                    "title": "opusvoice-backend Service Map",
                }
            }
        ]),

        # ── Footer note ───────────────────────────────────────────────────────
        note_widget(
            "**View full LLM traces:** [LLM Observability → Traces](https://app.datadoghq.com/llm/traces)\n\n"
            "**Managed Evaluations:** Datadog → LLM Observability → Settings → Integrations → Connect Anthropic",
            bg="green",
        ),
    ],
}

# ── Create dashboard ─────────────────────────────────────────────────────────
print(f"\n{BOLD}Creating dashboard in Datadog org…{RESET}")
resp = httpx.post(
    f"{BASE}/api/v1/dashboard",
    headers=HEADERS,
    json=dashboard,
    timeout=15,
)

if resp.status_code not in (200, 201):
    bail(f"Dashboard creation failed HTTP {resp.status_code}: {resp.text[:300]}")

data = resp.json()
dash_url = data.get("url", "")
dash_id  = data.get("id", "")

full_url = f"https://app.{DD_SITE}{dash_url}"

print(f"\n{GREEN}{BOLD}✓ Dashboard created successfully!{RESET}")
print(f"\n  {BOLD}Dashboard ID:{RESET}  {dash_id}")
print(f"  {BOLD}Dashboard URL:{RESET} {full_url}")
print(f"\n  {YELLOW}→ Open the URL above in your browser during the demo!{RESET}")
print(f"  {YELLOW}→ Add this URL to .env as:  DD_DASHBOARD_URL={full_url}{RESET}\n")

# ── Also save to a file ──────────────────────────────────────────────────────
with open("/tmp/dd_dashboard_url.txt", "w") as f:
    f.write(f"Dashboard ID: {dash_id}\n")
    f.write(f"Dashboard URL: {full_url}\n")

print(f"  URL also saved to /tmp/dd_dashboard_url.txt")
