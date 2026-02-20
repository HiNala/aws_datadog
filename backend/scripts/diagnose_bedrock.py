#!/usr/bin/env python3
"""
Deep Bedrock diagnostic — tries every combination of auth method × model × region.
Run inside the backend container: python scripts/diagnose_bedrock.py
"""
import base64
import json
import os
import sys
import time
import urllib.parse

import boto3
import httpx

# ── ANSI colours ──────────────────────────────────────────────────────────────
R  = "\033[91m"; G = "\033[92m"; Y = "\033[93m"; B = "\033[96m"; W = "\033[0m"; BOLD = "\033[1m"
def ok(s):   print(f"  {G}[PASS]{W} {s}")
def fail(s): print(f"  {R}[FAIL]{W} {s}")
def warn(s): print(f"  {Y}[INFO]{W} {s}")
def hdr(s):  print(f"\n{B}{BOLD}{'─'*55}{W}\n{B}{BOLD} {s}{W}\n{B}{'─'*55}{W}")

# ── Load credentials ──────────────────────────────────────────────────────────
BEARER = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "")
ABSK   = os.getenv("AWS_BEDROCK_API_KEY_BACKUP", "")
IAM_KEY    = os.getenv("AWS_ACCESS_KEY_ID", "")
IAM_SECRET = os.getenv("AWS_SECRET_ACCESS_KEY", "")
IAM_TOKEN  = os.getenv("AWS_SESSION_TOKEN", "")

# ── Decode bearer token ────────────────────────────────────────────────────────
hdr("1 / 4 — Bearer Token Analysis")
if BEARER:
    b64 = BEARER.replace("bedrock-api-key-", "")
    # fix padding
    b64 += "=" * ((4 - len(b64) % 4) % 4)
    try:
        decoded = base64.b64decode(b64).decode("utf-8", errors="replace")
        # parse query string
        qs = dict(urllib.parse.parse_qsl(decoded.split("?", 1)[1] if "?" in decoded else decoded))
        cred = qs.get("X-Amz-Credential", "N/A")
        date = qs.get("X-Amz-Date", "N/A")
        exp  = qs.get("X-Amz-Expires", "N/A")
        warn(f"Token credential:  {cred}")
        warn(f"Token date:        {date}")
        warn(f"Token expires:     {exp}s ({int(exp)//3600}h) from {date}")
        # Extract account from credential
        if "%" in cred:
            cred = urllib.parse.unquote(cred)
        parts = cred.split("/")
        if len(parts) >= 2:
            warn(f"Signed region:     {parts[2] if len(parts)>2 else 'N/A'}")
            warn(f"Signed service:    {parts[3] if len(parts)>3 else 'N/A'}")
    except Exception as e:
        warn(f"Could not decode bearer: {e}")
else:
    fail("AWS_BEARER_TOKEN_BEDROCK not set")

# ── Decode ABSK ────────────────────────────────────────────────────────────────
hdr("2 / 4 — ABSK Key Analysis")
ABSK_KEY_ID = ""
ABSK_SECRET = ""
if ABSK:
    absk_b64 = ABSK[4:]  # strip "ABSK" prefix
    absk_b64 += "=" * ((4 - len(absk_b64) % 4) % 4)
    try:
        absk_decoded = base64.b64decode(absk_b64).decode("utf-8")
        parts = absk_decoded.split(":", 1)
        ABSK_KEY_ID = parts[0]
        ABSK_SECRET = parts[1] if len(parts) > 1 else ""
        warn(f"Key ID:  {ABSK_KEY_ID}")
        warn(f"Account: {ABSK_KEY_ID.split('-at-')[-1] if '-at-' in ABSK_KEY_ID else 'unknown'}")
        warn(f"Secret:  {ABSK_SECRET[:12]}...{ABSK_SECRET[-8:]}")
    except Exception as e:
        fail(f"Could not decode ABSK: {e}")
else:
    fail("AWS_BEDROCK_API_KEY_BACKUP not set")

# ── IAM credentials ────────────────────────────────────────────────────────────
hdr("3 / 4 — IAM Credentials Analysis")
if IAM_KEY:
    warn(f"Access Key ID:   {IAM_KEY}")
    warn(f"Has Session Token: {bool(IAM_TOKEN)}")
    # Determine account from session token if possible
    if IAM_TOKEN:
        try:
            sts = boto3.client(
                "sts", region_name="us-east-1",
                aws_access_key_id=IAM_KEY,
                aws_secret_access_key=IAM_SECRET,
                aws_session_token=IAM_TOKEN,
            )
            identity = sts.get_caller_identity()
            warn(f"Account:         {identity.get('Account', 'N/A')}")
            warn(f"ARN:             {identity.get('Arn', 'N/A')}")
            warn(f"User ID:         {identity.get('UserId', 'N/A')}")
            ok("STS GetCallerIdentity succeeded")
        except Exception as e:
            fail(f"STS failed: {e}")
else:
    fail("AWS_ACCESS_KEY_ID not set")

# ── Live invocation tests ──────────────────────────────────────────────────────
hdr("4 / 4 — Live Invocation Tests")

BODY = json.dumps({
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Say OK"}],
})

MODELS = [
    ("us.anthropic.claude-sonnet-4-20250514-v1:0", "Claude Sonnet 4 (cross-region)"),
    ("us.anthropic.claude-3-5-sonnet-20241022-v2:0", "Claude 3.5 Sonnet (cross-region)"),
    ("anthropic.claude-3-5-sonnet-20241022-v2:0",   "Claude 3.5 Sonnet"),
    ("anthropic.claude-3-haiku-20240307-v1:0",       "Claude 3 Haiku (widely available)"),
    ("anthropic.claude-instant-v1",                  "Claude Instant (legacy)"),
]

REGIONS = ["us-west-2", "us-east-1"]

print("\n── A. Bearer token via HTTP ──")
if BEARER:
    for region in REGIONS:
        for model_id, model_name in MODELS[:3]:
            url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"
            headers = {"Authorization": f"Bearer {BEARER}", "Content-Type": "application/json"}
            try:
                t0 = time.time()
                r = httpx.post(url, content=BODY, headers=headers, timeout=8)
                ms = round((time.time()-t0)*1000)
                if r.status_code == 200:
                    text = r.json().get("content",[{}])[0].get("text","")
                    ok(f"BEARER {region} {model_name} → {ms}ms → {text.strip()[:20]!r}")
                    break
                else:
                    fail(f"BEARER {region} {model_name} → HTTP {r.status_code}: {r.text[:80]}")
            except Exception as e:
                fail(f"BEARER {region} {model_name} → {str(e)[:60]}")
else:
    warn("No bearer token — skipping")

print("\n── B. ABSK as Bearer via HTTP ──")
if ABSK:
    for region in REGIONS:
        for model_id, model_name in MODELS[:3]:
            url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"
            headers = {"Authorization": f"Bearer {ABSK}", "Content-Type": "application/json"}
            try:
                t0 = time.time()
                r = httpx.post(url, content=BODY, headers=headers, timeout=8)
                ms = round((time.time()-t0)*1000)
                if r.status_code == 200:
                    text = r.json().get("content",[{}])[0].get("text","")
                    ok(f"ABSK/HTTP {region} {model_name} → {ms}ms → {text.strip()[:20]!r}")
                    break
                else:
                    fail(f"ABSK/HTTP {region} {model_name} → HTTP {r.status_code}: {r.text[:80]}")
            except Exception as e:
                fail(f"ABSK/HTTP {region} {model_name} → {str(e)[:60]}")

print("\n── C. ABSK decoded as boto3 key:secret ──")
if ABSK_KEY_ID and ABSK_SECRET:
    for region in REGIONS:
        for model_id, model_name in MODELS:
            try:
                client = boto3.client(
                    "bedrock-runtime", region_name=region,
                    aws_access_key_id=ABSK_KEY_ID,
                    aws_secret_access_key=ABSK_SECRET,
                )
                t0 = time.time()
                resp = client.invoke_model(
                    modelId=model_id, body=BODY,
                    contentType="application/json", accept="application/json",
                )
                ms = round((time.time()-t0)*1000)
                data = json.loads(resp["body"].read())
                text = data.get("content",[{}])[0].get("text","")
                ok(f"ABSK/boto3 {region} {model_name} → {ms}ms → {text.strip()[:20]!r}")
                break
            except Exception as e:
                err = str(e)[:80]
                fail(f"ABSK/boto3 {region} {model_name} → {err}")
else:
    warn("ABSK key/secret not extracted — skipping boto3 test")

print("\n── D. IAM session credentials via boto3 ──")
if IAM_KEY and IAM_SECRET:
    for region in REGIONS:
        for model_id, model_name in MODELS:
            try:
                client = boto3.client(
                    "bedrock-runtime", region_name=region,
                    aws_access_key_id=IAM_KEY,
                    aws_secret_access_key=IAM_SECRET,
                    aws_session_token=IAM_TOKEN or None,
                )
                t0 = time.time()
                resp = client.invoke_model(
                    modelId=model_id, body=BODY,
                    contentType="application/json", accept="application/json",
                )
                ms = round((time.time()-t0)*1000)
                data = json.loads(resp["body"].read())
                text = data.get("content",[{}])[0].get("text","")
                ok(f"IAM/boto3 {region} {model_name} → {ms}ms → {text.strip()[:20]!r}")
                break
            except Exception as e:
                err = str(e)[:90]
                fail(f"IAM/boto3 {region} {model_name} → {err}")

print("\n── E. IAM — list enabled Bedrock models ──")
if IAM_KEY and IAM_SECRET:
    for region in REGIONS:
        try:
            bc = boto3.client(
                "bedrock", region_name=region,
                aws_access_key_id=IAM_KEY,
                aws_secret_access_key=IAM_SECRET,
                aws_session_token=IAM_TOKEN or None,
            )
            resp = bc.list_foundation_models(byOutputModality="TEXT")
            models = [m["modelId"] for m in resp.get("modelSummaries", []) if "claude" in m["modelId"].lower()]
            if models:
                ok(f"IAM {region} — available Claude models:")
                for m in models:
                    print(f"    {m}")
            else:
                warn(f"IAM {region} — no Claude models found (non-Claude may still be available)")
            break
        except Exception as e:
            fail(f"IAM {region} list models: {str(e)[:80]}")

print(f"\n{B}{BOLD}Done.{W}\n")
