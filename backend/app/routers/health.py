import logging
import time

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import HealthResponse, MessageRow, ServiceStatus

logger = logging.getLogger("opusvoice.health")
router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    settings = get_settings()
    services = ServiceStatus()

    try:
        db.execute(text("SELECT 1"))
        services.database = "ok"
    except Exception:
        services.database = "error"

    # Credential presence check (fast — no actual API call)
    has_bearer = bool(settings.aws_bearer_token_bedrock)
    has_iam    = bool(settings.aws_access_key_id and settings.aws_secret_access_key)
    has_absk   = bool(settings.aws_bedrock_api_key_backup)
    services.bedrock = "ok" if (has_bearer or has_iam or has_absk) else "error"

    has_minimax = bool(settings.minimax_api_key)
    services.minimax = "ok" if has_minimax else "error"

    dd_key = settings.dd_api_key
    has_dd = bool(dd_key and not dd_key.startswith("your_"))
    services.datadog = "ok" if has_dd else "warning"

    overall = "ok" if all(
        v == "ok" for v in [services.database, services.bedrock]
    ) else "degraded"

    from app.main import get_uptime
    message_count = 0
    try:
        message_count = db.query(MessageRow).count()
    except Exception:
        pass

    return HealthResponse(
        status=overall,
        services=services,
        uptime_seconds=round(get_uptime(), 1),
        aws_key_source=settings.aws_key_source,
        recent_messages=message_count,
    )


# ---------------------------------------------------------------------------
# /api/health/keys — live API test (makes real calls, ~5-10s)
# ---------------------------------------------------------------------------

@router.get("/health/keys")
def test_keys_live():
    """
    Live-test every API key with a real network call.
    Returns per-service pass/fail + latency.
    Used by the frontend API Status panel.
    """
    settings = get_settings()
    results: dict = {}

    # ── AWS Bedrock ──────────────────────────────────────────────────────────
    def test_bedrock() -> dict:
        """Quick Bedrock test — 5s timeout, first-success wins."""
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 8,
            "messages": [{"role": "user", "content": "Say OK"}],
        }
        MODEL = "us.anthropic.claude-sonnet-4-6"                     # CONFIRMED PASS ✅
        MODEL_FB = "us.anthropic.claude-3-5-haiku-20241022-v1:0"   # fallback ✅
        errors: list[str] = []

        def _http_quick(token: str, region: str, model: str, label: str):
            url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model}/invoke"
            t0 = time.time()
            r = httpx.post(
                url, json=body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                timeout=5,
            )
            ms = round((time.time() - t0) * 1000)
            if r.status_code == 200:
                text_out = r.json().get("content", [{}])[0].get("text", "")
                return {"status": "ok", "method": label, "region": region,
                        "model": model.split(".")[-1][:25], "latency_ms": ms, "response": text_out.strip()[:30]}
            errors.append(f"{label}: HTTP {r.status_code}")
            return None

        # 1. Bearer — try just one region (us-west-2), it's fastest
        if settings.aws_bearer_token_bedrock:
            r = _http_quick(settings.aws_bearer_token_bedrock, "us-west-2", MODEL, "bearer")
            if r: return r
            # try fallback model
            r = _http_quick(settings.aws_bearer_token_bedrock, "us-west-2", MODEL_FB, "bearer")
            if r: return r

        # 2. boto3 SigV4 — try us-west-2 primary model only
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            import json as _json
            try:
                import boto3
                for region, model in [("us-west-2", MODEL), ("us-west-2", MODEL_FB)]:
                    try:
                        client = boto3.client(
                            "bedrock-runtime", region_name=region,
                            aws_access_key_id=settings.aws_access_key_id,
                            aws_secret_access_key=settings.aws_secret_access_key,
                            aws_session_token=settings.aws_session_token or None,
                        )
                        t0 = time.time()
                        resp = client.invoke_model(
                            modelId=model, body=_json.dumps(body),
                            contentType="application/json", accept="application/json",
                        )
                        ms = round((time.time() - t0) * 1000)
                        data = _json.loads(resp["body"].read())
                        text_out = data.get("content", [{}])[0].get("text", "")
                        return {"status": "ok", "method": "iam_boto3", "region": region,
                                "model": model.split(".")[-1][:25], "latency_ms": ms,
                                "response": text_out.strip()[:30]}
                    except Exception as e:
                        errors.append(f"boto3/{region}: {str(e)[:60]}")
            except ImportError:
                errors.append("boto3 not installed")

        # 3. ABSK — claude-sonnet-4-6 confirmed PASS, then haiku fallback
        if settings.aws_bedrock_api_key_backup:
            r = _http_quick(settings.aws_bedrock_api_key_backup, "us-east-1", MODEL, "absk")
            if r: return r
            r = _http_quick(settings.aws_bedrock_api_key_backup, "us-east-1", MODEL_FB, "absk")
            if r: return r

        return {"status": "error", "error": "All auth failed", "details": errors[:3]}

    # ── MiniMax TTS ──────────────────────────────────────────────────────────
    def test_minimax() -> dict:
        if not settings.minimax_api_key:
            return {"status": "error", "error": "No API key"}
        try:
            t0 = time.time()
            r = httpx.post(
                "https://api.minimax.io/v1/t2a_v2",
                headers={"Authorization": f"Bearer {settings.minimax_api_key}", "Content-Type": "application/json"},
                json={
                    "model": "speech-2.8-hd", "text": "OK.",
                    "stream": False, "output_format": "hex",
                    "voice_setting": {"voice_id": "English_expressive_narrator", "speed": 1.0, "vol": 1.0, "pitch": 0},
                    "audio_setting": {"format": "mp3", "sample_rate": 32000, "bitrate": 128000, "channel": 1},
                },
                timeout=15,
            )
            ms = round((time.time() - t0) * 1000)
            if r.status_code != 200:
                return {"status": "error", "error": f"HTTP {r.status_code}"}
            d = r.json()
            base = d.get("base_resp", {})
            if base.get("status_code", -1) != 0:
                return {"status": "error", "error": base.get("status_msg", "unknown")}
            audio_bytes = len(bytes.fromhex(d["data"]["audio"]))
            return {"status": "ok", "model": "speech-2.8-hd", "latency_ms": ms, "audio_bytes": audio_bytes}
        except Exception as e:
            return {"status": "error", "error": str(e)[:100]}

    # ── Datadog ───────────────────────────────────────────────────────────────
    def test_datadog() -> dict:
        dd_key = settings.dd_api_key
        if not dd_key or dd_key.startswith("your_"):
            return {"status": "warning", "error": "DD_API_KEY not set"}
        site = settings.dd_site or "us5.datadoghq.com"
        try:
            t0 = time.time()
            r = httpx.get(
                f"https://api.{site}/api/v1/validate",
                headers={"DD-API-KEY": dd_key},
                timeout=8,
            )
            ms = round((time.time() - t0) * 1000)
            if r.status_code == 200 and r.json().get("valid"):
                result: dict = {"status": "ok", "site": site, "latency_ms": ms}
                # Also check app key if available
                app_key = settings.dd_app_key
                if app_key and not app_key.startswith("your_"):
                    r2 = httpx.get(
                        f"https://api.{site}/api/v1/dashboard",
                        headers={"DD-API-KEY": dd_key, "DD-APPLICATION-KEY": app_key},
                        timeout=8,
                    )
                    result["app_key"] = "ok" if r2.status_code == 200 else f"HTTP {r2.status_code}"
                else:
                    result["app_key"] = "not_set"
                return result
            return {"status": "error", "error": f"HTTP {r.status_code}: {r.text[:80]}"}
        except Exception as e:
            return {"status": "error", "error": str(e)[:80]}

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    def test_postgres() -> dict:
        from app.db import get_db, init_db
        try:
            t0 = time.time()
            init_db()
            from app.db import _SessionLocal
            db = _SessionLocal()
            db.execute(text("SELECT 1"))
            db.close()
            return {"status": "ok", "latency_ms": round((time.time() - t0) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e)[:80]}

    # ── MiniMax M2.5 Chat ─────────────────────────────────────────────────────
    def test_minimax_chat() -> dict:
        if not settings.minimax_api_key:
            return {"status": "error", "error": "No API key"}
        try:
            import anthropic
            client = anthropic.Anthropic(
                base_url="https://api.minimax.io/anthropic",
                api_key=settings.minimax_api_key,
            )
            t0 = time.time()
            resp = client.messages.create(
                model="MiniMax-M2.5-highspeed",
                max_tokens=10,
                messages=[{"role": "user", "content": [{"type": "text", "text": "Say OK"}]}],
            )
            ms = round((time.time() - t0) * 1000)
            text_out = ""
            for b in resp.content:
                if hasattr(b, "text"):
                    text_out += b.text
            return {
                "status": "ok", "model": "MiniMax-M2.5-highspeed",
                "latency_ms": ms, "response": text_out.strip()[:25],
            }
        except Exception as e:
            return {"status": "error", "error": str(e)[:80]}

    results["bedrock"] = test_bedrock()
    results["minimax_tts"] = test_minimax()
    results["minimax_llm"] = test_minimax_chat()
    results["datadog"] = test_datadog()
    results["postgres"] = test_postgres()

    return {
        "results": results,
        "summary": {k: v["status"] for k, v in results.items()},
        "all_ok": all(v["status"] == "ok" for v in results.values()),
    }
