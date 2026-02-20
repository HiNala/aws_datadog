#!/usr/bin/env python3
"""Quick test — all keys, all models that matter right now."""
import json, os, time, httpx, base64

ABSK   = os.environ.get("AWS_BEDROCK_API_KEY_BACKUP", "")
BEARER = os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "")
MM_KEY = os.environ.get("MINIMAX_API_KEY", "")
DD_KEY = os.environ.get("DD_API_KEY", "")

# All Sonnet 4.6 variant IDs to try
MODELS = [
    "anthropic.claude-sonnet-4-6",
    "us.anthropic.claude-sonnet-4-6",
    "anthropic.claude-sonnet-4-6-20250217-v1:0",
    "us.anthropic.claude-sonnet-4-6-20250217-v1:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    "us.anthropic.claude-sonnet-4-20250514-v1:0",
]

BODY = json.dumps({
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 15,
    "messages": [{"role": "user", "content": "Say: BEDROCK_OK"}],
})

def test_http(label, token, region, model):
    url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model}/invoke"
    hdrs = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    t0 = time.time()
    try:
        r = httpx.post(url, content=BODY, headers=hdrs, timeout=8)
        ms = round((time.time()-t0)*1000)
        if r.status_code == 200:
            txt = r.json().get("content",[{}])[0].get("text","")
            return f"PASS {ms}ms → {txt.strip()[:25]!r}"
        return f"FAIL {r.status_code}: {r.text[:60]}"
    except Exception as e:
        return f"ERR {str(e)[:50]}"

print("\n" + "="*60)
print("KEY TEST RESULTS")
print("="*60)

print("\n── ABSK (personal account) ──")
if ABSK:
    b64 = ABSK[4:] + "=="
    kid = base64.b64decode(b64).decode().split(":")[0]
    print(f"  Key: {kid}")
    for region in ["us-east-1", "us-west-2"]:
        for model in MODELS:
            r = test_http("absk", ABSK, region, model)
            status = "✅" if r.startswith("PASS") else "❌"
            print(f"  {status} {region} / {model.split('.')[-1][:35]} → {r}")
            if r.startswith("PASS"):
                break
        else:
            continue
        break
else:
    print("  ❌ Not set")

print("\n── Event Bearer Token ──")
if BEARER:
    for region in ["us-west-2", "us-east-1"]:
        for model in MODELS:
            r = test_http("bearer", BEARER, region, model)
            status = "✅" if r.startswith("PASS") else "❌"
            print(f"  {status} {region} / {model.split('.')[-1][:35]} → {r}")
            if r.startswith("PASS"):
                break
        else:
            continue
        break
else:
    print("  ❌ Not set")

print("\n── MiniMax LLM ──")
if MM_KEY:
    try:
        import anthropic
        client = anthropic.Anthropic(base_url="https://api.minimax.io/anthropic", api_key=MM_KEY)
        t0 = time.time()
        resp = client.messages.create(
            model="MiniMax-M2.5-highspeed", max_tokens=15,
            messages=[{"role":"user","content":[{"type":"text","text":"Say: MINIMAX_OK"}]}])
        ms = round((time.time()-t0)*1000)
        txt = "".join(b.text for b in resp.content if hasattr(b,"text"))
        print(f"  ✅ MiniMax-M2.5-highspeed {ms}ms → {txt.strip()[:25]!r}")
    except Exception as e:
        print(f"  ❌ {str(e)[:80]}")
else:
    print("  ❌ Not set")

print("\n── MiniMax TTS ──")
if MM_KEY:
    try:
        r = httpx.post(
            "https://api.minimax.io/v1/t2a_v2",
            headers={"Authorization": f"Bearer {MM_KEY}", "Content-Type": "application/json"},
            json={"model":"speech-2.8-hd","text":"Test.","voice_setting":{"voice_id":"male-qn-qingse"},"audio_setting":{"format":"mp3","sample_rate":32000}},
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json()
            audio_b64 = data.get("data",{}).get("audio","")
            print(f"  ✅ speech-2.8-hd  →  {len(audio_b64)} chars audio")
        else:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:60]}")
    except Exception as e:
        print(f"  ❌ {str(e)[:80]}")

print("\n── Datadog ──")
if DD_KEY:
    try:
        r = httpx.get(
            "https://api.us5.datadoghq.com/api/v1/validate",
            headers={"DD-API-KEY": DD_KEY},
            timeout=8,
        )
        if r.status_code == 200:
            print(f"  ✅ API key valid (us5.datadoghq.com)")
        else:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:60]}")
    except Exception as e:
        print(f"  ❌ {str(e)[:80]}")
else:
    print("  ❌ Not set")

print("\n" + "="*60 + "\n")
