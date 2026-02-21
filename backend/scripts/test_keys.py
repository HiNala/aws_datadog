#!/usr/bin/env python3
"""
OpusVoice — API Key Diagnostic Script
Run inside backend container:
    docker exec aws-datadog-backend-1 python scripts/test_keys.py

Tests: AWS Bedrock (bearer + ABSK), MiniMax TTS, Datadog API
"""

import os
import sys
import time

# ── ANSI colours ──────────────────────────────────────────────────────────────
GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW= "\033[93m"
CYAN  = "\033[96m"
BOLD  = "\033[1m"
RESET = "\033[0m"

def ok(label: str, detail: str = "") -> None:
    tag = f"{GREEN}[PASS]{RESET}"
    print(f"  {tag} {BOLD}{label}{RESET}" + (f"  — {detail}" if detail else ""))

def fail(label: str, detail: str = "") -> None:
    tag = f"{RED}[FAIL]{RESET}"
    print(f"  {tag} {BOLD}{label}{RESET}" + (f"  — {detail}" if detail else ""))

def warn(label: str, detail: str = "") -> None:
    tag = f"{YELLOW}[WARN]{RESET}"
    print(f"  {tag} {BOLD}{label}{RESET}" + (f"  — {detail}" if detail else ""))

def section(title: str) -> None:
    print(f"\n{CYAN}{BOLD}{'─'*50}{RESET}")
    print(f"{CYAN}{BOLD} {title}{RESET}")
    print(f"{CYAN}{'─'*50}{RESET}")


# ── 1. Environment presence ───────────────────────────────────────────────────
section("1 / 4  —  Environment Variables")

AWS_BEARER  = os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "")
AWS_ABSK    = os.environ.get("AWS_BEDROCK_API_KEY_BACKUP", "")
AWS_REGION  = os.environ.get("AWS_DEFAULT_REGION", "us-west-2")
MINIMAX_KEY = os.environ.get("MINIMAX_API_KEY", "")
DD_API_KEY  = os.environ.get("DD_API_KEY", "")
DD_APP_KEY  = os.environ.get("DD_APP_KEY", "")
DD_SITE     = os.environ.get("DD_SITE", "datadoghq.com")

if AWS_BEARER and not AWS_BEARER.startswith("your_"):
    ok("AWS_BEARER_TOKEN_BEDROCK", f"{AWS_BEARER[:30]}…")
else:
    warn("AWS_BEARER_TOKEN_BEDROCK", "not set or placeholder")

if AWS_ABSK and not AWS_ABSK.startswith("your_"):
    ok("AWS_BEDROCK_API_KEY_BACKUP", f"{AWS_ABSK[:20]}…")
else:
    warn("AWS_BEDROCK_API_KEY_BACKUP", "not set or placeholder")

if MINIMAX_KEY and not MINIMAX_KEY.startswith("your_"):
    ok("MINIMAX_API_KEY", f"{MINIMAX_KEY[:20]}…")
else:
    fail("MINIMAX_API_KEY", "not set or placeholder")

if DD_API_KEY and not DD_API_KEY.startswith("your_"):
    ok("DD_API_KEY", f"{DD_API_KEY[:12]}…")
else:
    warn("DD_API_KEY", "⚠  MISSING — get from Datadog booth or datadoghq.com → API Keys")

if DD_APP_KEY and not DD_APP_KEY.startswith("your_"):
    ok("DD_APP_KEY", f"{DD_APP_KEY[:12]}…")
else:
    warn("DD_APP_KEY", "⚠  MISSING — get from datadoghq.com → Application Keys")


# ── 2. AWS Bedrock ────────────────────────────────────────────────────────────
section("2 / 4  —  AWS Bedrock (Claude)")

import httpx

BODY = {
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 20,
    "messages": [{"role": "user", "content": "Reply with: BEDROCK_OK"}],
}

# Ordered fallback chain for ABSK keys (region, model pairs)
ABSK_CHAIN = [
    ("us-east-1", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
    ("us-west-2", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
    ("us-west-2", "anthropic.claude-3-5-sonnet-20241022-v2:0"),
    ("us-east-1", "anthropic.claude-3-5-sonnet-20241022-v2:0"),
]

def _invoke(token: str, region: str, model_id: str):
    url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"
    return httpx.post(url, json=BODY, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, timeout=15)

def test_bedrock_bearer() -> bool:
    if not AWS_BEARER or AWS_BEARER.startswith("your_"):
        warn("Bearer token", "skipped — not set")
        return False
    try:
        t0 = time.time()
        r = _invoke(AWS_BEARER, AWS_REGION, "us.anthropic.claude-sonnet-4-20250514-v1:0")
        ms = round((time.time() - t0) * 1000)
        if r.status_code == 200:
            text = r.json().get("content", [{}])[0].get("text", "")
            ok("Bedrock bearer token", f"{ms}ms  →  \"{text.strip()[:40]}\"")
            return True
        else:
            fail("Bedrock bearer token", f"HTTP {r.status_code}: {r.text[:120]}")
            return False
    except Exception as e:
        fail("Bedrock bearer token", str(e)[:120])
        return False

def test_bedrock_absk() -> bool:
    if not AWS_ABSK or AWS_ABSK.startswith("your_"):
        warn("ABSK backup key", "skipped — not set")
        return False

    for region, model_id in ABSK_CHAIN:
        try:
            t0 = time.time()
            r = _invoke(AWS_ABSK, region, model_id)
            ms = round((time.time() - t0) * 1000)
            if r.status_code == 200:
                text = r.json().get("content", [{}])[0].get("text", "")
                ok("Bedrock ABSK backup key",
                   f"{ms}ms  →  \"{text.strip()[:30]}\"  [{region}/{model_id.split('.')[-1][:20]}]")
                return True
            elif r.status_code in (403, 401):
                fail("Bedrock ABSK backup key", f"Auth failed HTTP {r.status_code}: {r.text[:80]}")
                return False
            # 404/400 = model not in this region, try next
        except Exception as e:
            pass  # network error, try next

    fail("Bedrock ABSK backup key", "No (region, model) combination worked — check account model access")
    return False

bearer_ok = test_bedrock_bearer()
absk_ok = test_bedrock_absk()

if not bearer_ok and not absk_ok:
    print(f"\n  {RED}{BOLD}WARNING: No working Bedrock credential found.{RESET}")
    print(f"  {YELLOW}→ The hackathon bearer token may have expired (12h limit).{RESET}")
    print(f"  {YELLOW}→ Get a fresh token at the AWS booth or use the ABSK key.{RESET}")


# ── 3. MiniMax TTS ────────────────────────────────────────────────────────────
section("3 / 4  —  MiniMax TTS")

def test_minimax() -> bool:
    if not MINIMAX_KEY or MINIMAX_KEY.startswith("your_"):
        fail("MiniMax TTS", "API key not set")
        return False
    try:
        t0 = time.time()
        r = httpx.post(
            "https://api.minimax.io/v1/t2a_v2",
            headers={"Authorization": f"Bearer {MINIMAX_KEY}", "Content-Type": "application/json"},
            json={
                "model": "speech-2.8-hd",
                "text": "OpusVoice is online.",
                "stream": False,
                "output_format": "hex",
                "voice_setting": {"voice_id": "English_expressive_narrator", "speed": 1.0, "vol": 1.0, "pitch": 0},
                "audio_setting": {"format": "mp3", "sample_rate": 32000, "bitrate": 128000, "channel": 1},
            },
            timeout=20,
        )
        ms = round((time.time() - t0) * 1000)
        if r.status_code != 200:
            fail("MiniMax TTS", f"HTTP {r.status_code}: {r.text[:120]}")
            return False
        data = r.json()
        base = data.get("base_resp", {})
        if base.get("status_code", -1) != 0:
            fail("MiniMax TTS", f"API error: {base.get('status_msg')}")
            return False
        hex_audio = data["data"]["audio"]
        audio_bytes = bytes.fromhex(hex_audio)
        extra = data.get("extra_info", {})
        ok("MiniMax TTS speech-2.8-hd",
           f"{ms}ms  →  {len(audio_bytes):,} bytes MP3  "
           f"({extra.get('usage_characters', '?')} chars, "
           f"{extra.get('audio_length', '?')}ms audio)")
        return True
    except Exception as e:
        fail("MiniMax TTS", str(e)[:120])
        return False

minimax_ok = test_minimax()


# ── 4. Datadog ────────────────────────────────────────────────────────────────
section("4 / 4  —  Datadog")

def test_datadog_api() -> bool:
    if not DD_API_KEY or DD_API_KEY.startswith("your_"):
        warn("Datadog API key", "⚠  NOT SET")
        print(f"\n  {YELLOW}How to get your Datadog keys:{RESET}")
        print(f"  1. Go to  https://app.datadoghq.com/organization-settings/api-keys")
        print(f"  2. Click  'New Key' → name it 'opusvoice-hackathon'")
        print(f"  3. Copy the key → paste into .env as DD_API_KEY=<key>")
        print(f"  4. For DD_APP_KEY: https://app.datadoghq.com/organization-settings/application-keys")
        print(f"  5. Rebuild: docker compose up --build -d")
        return False
    try:
        r = httpx.get(
            f"https://api.{DD_SITE}/api/v1/validate",
            headers={"DD-API-KEY": DD_API_KEY},
            timeout=10,
        )
        if r.status_code == 200 and r.json().get("valid"):
            ok("Datadog API key", "valid ✓")
        else:
            fail("Datadog API key", f"HTTP {r.status_code}  {r.text[:80]}")
            return False
    except Exception as e:
        fail("Datadog API key validate", str(e)[:80])
        return False

    if not DD_APP_KEY or DD_APP_KEY.startswith("your_"):
        warn("Datadog App key (DD_APP_KEY)", "not set — needed for dashboard creation")
        return True  # API key is fine

    try:
        r = httpx.get(
            f"https://api.{DD_SITE}/api/v1/dashboard",
            headers={"DD-API-KEY": DD_API_KEY, "DD-APPLICATION-KEY": DD_APP_KEY},
            timeout=10,
        )
        if r.status_code == 200:
            dashboards = r.json().get("dashboards", [])
            ok("Datadog App key", f"valid ✓  ({len(dashboards)} dashboards accessible)")
        else:
            fail("Datadog App key", f"HTTP {r.status_code}  {r.text[:80]}")
            return False
    except Exception as e:
        fail("Datadog App key", str(e)[:80])
        return False

    return True

dd_ok = test_datadog_api()


# ── Summary ───────────────────────────────────────────────────────────────────
section("Summary")

results = {
    "Bedrock": bearer_ok or absk_ok,
    "MiniMax TTS": minimax_ok,
    "Datadog": dd_ok,
}

all_pass = all(results.values())

for service, passed in results.items():
    if passed:
        ok(service)
    else:
        fail(service)

print()
if all_pass:
    print(f"  {GREEN}{BOLD}✓ All services operational — ready to demo!{RESET}\n")
else:
    failing = [k for k, v in results.items() if not v]
    print(f"  {YELLOW}{BOLD}⚠  Fix required: {', '.join(failing)}{RESET}\n")

sys.exit(0 if all_pass else 1)
