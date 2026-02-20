#!/usr/bin/env python3
"""Quick scan: which models work with the ABSK key right now?"""
import base64, json, os, httpx

ABSK = os.environ.get("AWS_BEDROCK_API_KEY_BACKUP", "")
BEARER = os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "")

print(f"ABSK present:   {bool(ABSK)}")
print(f"Bearer present: {bool(BEARER)}")

if ABSK:
    b64 = ABSK[4:] + "=="
    decoded = base64.b64decode(b64).decode("utf-8", errors="replace")
    print(f"ABSK key ID: {decoded.split(':')[0]}")

CLAUDE_MODELS = [
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    "us.anthropic.claude-3-haiku-20240307-v2:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "anthropic.claude-instant-v1",
]

TITAN_MODELS = [
    "amazon.titan-text-express-v1",
    "amazon.titan-text-lite-v1",
]

CLAUDE_BODY = json.dumps({
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 12,
    "messages": [{"role": "user", "content": "Say OK"}],
})

TITAN_BODY = json.dumps({
    "inputText": "Say OK",
    "textGenerationConfig": {"maxTokenCount": 10},
})

print()
for key_label, token in [("ABSK", ABSK), ("BEARER", BEARER)]:
    if not token:
        continue
    print(f"===== {key_label} =====")
    for region in ["us-east-1", "us-west-2"]:
        print(f"  -- {region} --")
        for model in CLAUDE_MODELS + TITAN_MODELS:
            body = TITAN_BODY if "titan" in model else CLAUDE_BODY
            url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model}/invoke"
            hdrs = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            try:
                r = httpx.post(url, content=body, headers=hdrs, timeout=7)
                if r.status_code == 200:
                    print(f"    PASS  {model}")
                else:
                    msg = r.text[:80]
                    print(f"    {r.status_code}   {model}  [{msg}]")
            except Exception as e:
                print(f"    ERR   {model}  [{str(e)[:50]}]")
print("\nDone.")
