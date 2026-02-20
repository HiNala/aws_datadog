import json
import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("opsvoice.bedrock")

# ── Confirmed-working model IDs ────────────────────────────────────────────────
# ABSK (personal account 655366068864) — CONFIRMED PASS via live test:
#   us.anthropic.claude-sonnet-4-6    @us-east-1  → 1152ms ✅
#   us.anthropic.claude-3-5-haiku-20241022-v1:0  → fallback ✅
# Event bearer (account 283845804869 / WSParticipantRole):
#   ALL FAIL — WSParticipantRole lacks bedrock:InvokeModel (ask AWS booth)

MODEL_SONNET_46     = "us.anthropic.claude-sonnet-4-6"          # CONFIRMED PASS
MODEL_HAIKU_35      = "us.anthropic.claude-3-5-haiku-20241022-v1:0"  # confirmed pass
MODEL_HAIKU_3       = "anthropic.claude-3-haiku-20240307-v1:0"       # confirmed pass
MODEL_SONNET_4_OLD  = "us.anthropic.claude-sonnet-4-20250514-v1:0"   # event-account target

MAX_TOKENS = 2048

SYSTEM_PROMPT = (
    "You are OpsVoice, an expert AI assistant for cloud infrastructure operations. "
    "You help engineers monitor, diagnose, and resolve infrastructure issues. "
    "Keep responses concise and actionable — they may be spoken aloud via text-to-speech. "
    "Use plain language, short sentences. Speak like a senior SRE briefing their team."
)

# ── ABSK chain (personal account 655366068864) ─────────────────────────────────
# Lead with confirmed-working Sonnet 4.6 cross-region.
ABSK_FALLBACK_CHAIN = [
    ("us-west-2", MODEL_SONNET_46),   # CONFIRMED PASS 1180ms ✅
    ("us-east-1", MODEL_SONNET_46),   # also works (propagation varies)
    ("us-west-2", MODEL_HAIKU_35),    # fallback
    ("us-east-1", MODEL_HAIKU_35),    # fallback
    ("us-east-1", MODEL_HAIKU_3),     # last resort
]

# ── Event bearer token chain (account 283845804869 / WSParticipantRole) ────────
# Currently BLOCKED — role lacks bedrock:InvokeModel.
# us-west-2: 403 "not authorized"; us-east-1: 403 "auth failed" (wrong region).
BEARER_FALLBACK_CHAIN = [
    ("us-west-2", MODEL_SONNET_46),
    ("us-west-2", MODEL_SONNET_4_OLD),
    ("us-west-2", MODEL_HAIKU_35),
]


def _bedrock_url(region: str, model_id: str) -> str:
    return f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"


class BedrockService:
    """
    Calls Claude on AWS Bedrock.

    Auth priority (ABSK first — it's the only one currently working):
      1. ABSK key   (personal account 655366068864 — CONFIRMED working)
      2. Bearer token  (event account 283845804869 — WSParticipantRole blocked)
      3. boto3 SigV4   (same event account — same IAM block)

    Key source logged at every invocation so you can see which one fired.
    """

    def __init__(self, settings: Settings) -> None:
        self._bearer_token  = settings.aws_bearer_token_bedrock
        self._access_key    = settings.aws_access_key_id
        self._secret_key    = settings.aws_secret_access_key
        self._session_token = settings.aws_session_token
        self._absk_key      = settings.aws_bedrock_api_key_backup
        self._region        = settings.aws_default_region

        logger.info("BedrockService credentials:")
        logger.info("  ABSK (personal):     %s", "PRESENT" if self._absk_key else "MISSING")
        logger.info("  Bearer (event):      %s", "PRESENT" if self._bearer_token else "MISSING")
        logger.info("  IAM session (boto3): %s", "PRESENT" if self._access_key else "MISSING")

    def invoke(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        """Try auth methods in order; log which key fires."""
        errors: list[str] = []

        # 1. ABSK — personal account, currently working ✅
        if self._absk_key:
            logger.info("[KEY] Trying ABSK (personal, account 655366068864) …")
            try:
                result = self._invoke_absk_chain(messages)
                logger.info("[KEY] SUCCESS via ABSK — model: %s", result.get("model", "?"))
                return result
            except RuntimeError as e:
                logger.warning("[KEY] ABSK failed: %s", str(e)[:100])
                errors.append(f"absk: {e}")

        # 2. Bearer token — event account (currently blocked by IAM)
        if self._bearer_token:
            logger.info("[KEY] Trying event bearer token (account 283845804869) …")
            try:
                result = self._invoke_bearer_chain(messages)
                logger.info("[KEY] SUCCESS via event bearer token")
                return result
            except RuntimeError as e:
                logger.warning("[KEY] Bearer failed: %s", str(e)[:100])
                errors.append(f"bearer: {e}")

        # 3. boto3 SigV4 — same event account, same IAM block
        if self._access_key and self._secret_key:
            logger.info("[KEY] Trying IAM boto3 (account 283845804869) …")
            try:
                result = self._invoke_boto3(messages)
                logger.info("[KEY] SUCCESS via IAM boto3")
                return result
            except Exception as e:
                logger.warning("[KEY] boto3 failed: %s", str(e)[:100])
                errors.append(f"boto3: {e}")

        raise RuntimeError(
            f"All Bedrock methods failed. "
            f"ABSK: enable model access at bedrock console for account 655366068864. "
            f"Event: WSParticipantRole needs bedrock:InvokeModel (ask AWS booth). "
            f"Details: {'; '.join(errors[:2])}"
        )

    # ── ABSK chain ─────────────────────────────────────────────────────────────

    def _invoke_absk_chain(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        """
        Use ABSK_FALLBACK_CHAIN.
        NOTE: 'use case details' errors may be region-specific due to cross-region inference
        propagation delays — keep trying all combos, don't fast-fail on that error.
        CONFIRMED PASS: us-west-2 + us.anthropic.claude-sonnet-4-6 (1180ms)
        """
        last_err: Exception = RuntimeError("empty ABSK chain")
        for region, model_id in ABSK_FALLBACK_CHAIN:
            try:
                result = self._http_invoke(
                    token=self._absk_key,
                    region=region,
                    model_id=model_id,
                    label=f"absk/{region}",
                    messages=messages,
                )
                logger.info("[KEY] ABSK ok: %s @%s", model_id.split(".")[-1][:35], region)
                return result
            except RuntimeError as e:
                err_str = str(e)
                logger.debug("ABSK %s/%s: %s", region, model_id[:35], err_str[:60])
                last_err = e
                # Only fast-fail on hard auth rejection (not use-case/propagation issues)
                if "authentication failed" in err_str.lower() and "bedrock-api-key" not in err_str.lower():
                    logger.info("[KEY] ABSK fast-fail: token rejected outright")
                    break
        raise last_err

    # ── Bearer token chain ─────────────────────────────────────────────────────

    def _invoke_bearer_chain(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        last_err: Exception = RuntimeError("empty bearer chain")
        seen_blocked: set[str] = set()
        for region, model_id in BEARER_FALLBACK_CHAIN:
            if region in seen_blocked:
                continue
            try:
                return self._http_invoke(
                    token=self._bearer_token,
                    region=region,
                    model_id=model_id,
                    label=f"bearer/{region}",
                    messages=messages,
                )
            except RuntimeError as e:
                err_str = str(e)
                last_err = e
                if "WSParticipantRole" in err_str and "not authorized" in err_str:
                    logger.debug("[KEY] Bearer: WSParticipantRole blocked in %s", region)
                    seen_blocked.add(region)
                elif "Authentication failed" in err_str:
                    logger.info("[KEY] Bearer fast-fail: token rejected (wrong region / expired)")
                    break
        if "WSParticipantRole" in str(last_err):
            logger.info(
                "[KEY] Bearer exhausted: WSParticipantRole lacks bedrock:InvokeModel — "
                "ask AWS booth to grant permission in account 283845804869"
            )
        raise last_err

    # ── boto3 SigV4 ────────────────────────────────────────────────────────────

    def _invoke_boto3(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        import boto3
        body = self._build_body(messages)
        chain = [
            ("us-west-2", MODEL_SONNET_46),
            ("us-east-1", MODEL_SONNET_46),
            ("us-west-2", MODEL_SONNET_4_OLD),
        ]
        last_err: Exception = RuntimeError("boto3: empty chain")
        for region, model_id in chain:
            try:
                client = boto3.client(
                    "bedrock-runtime", region_name=region,
                    aws_access_key_id=self._access_key,
                    aws_secret_access_key=self._secret_key,
                    aws_session_token=self._session_token or None,
                )
                logger.info("Bedrock [boto3/%s]: invoking %s", region, model_id)
                response = client.invoke_model(
                    modelId=model_id, body=json.dumps(body),
                    contentType="application/json", accept="application/json",
                )
                data = json.loads(response["body"].read())
                return self._parse_response(data)
            except Exception as e:
                err_str = str(e)
                last_err = e
                logger.debug("boto3 attempt failed (%s/%s): %s", region, model_id, err_str[:100])
                if "AccessDenied" in err_str or "not authorized" in err_str.lower():
                    # Same IAM block will apply to all regions/models
                    raise RuntimeError(f"boto3 Bedrock error: {err_str[:200]}") from e
        raise last_err

    # ── Shared helpers ─────────────────────────────────────────────────────────

    def _http_invoke(
        self,
        *,
        token: str,
        region: str,
        model_id: str,
        label: str,
        messages: list[dict[str, str]],
    ) -> dict[str, Any]:
        url = _bedrock_url(region, model_id)
        body = self._build_body(messages)
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        logger.info("Bedrock [%s]: %s", label, model_id)
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=body, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"{resp.status_code} [{label}]: {resp.text[:180]}")
        return self._parse_response(resp.json())

    def _build_body(self, messages: list[dict]) -> dict:
        return {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }

    @staticmethod
    def _parse_response(data: dict) -> dict[str, Any]:
        content_blocks = data.get("content", [])
        text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
        content = "\n".join(text_parts) if text_parts else ""
        usage = data.get("usage", {})
        return {
            "content": content,
            "model": data.get("model", MODEL_SONNET_46),
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "stop_reason": data.get("stop_reason", ""),
        }
