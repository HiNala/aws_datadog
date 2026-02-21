"""
AWS Bedrock inference service.

Auth priority:
  1. Hackathon bearer token (account 283845804869, WSParticipantRole)
     → Uses inference profile: global.anthropic.claude-sonnet-4-20250514-v1:0
     STATUS: WSParticipantRole currently lacks bedrock:InvokeModel / bedrock:CallWithBearerToken.
             Kept first so it auto-activates if the organisers grant the permission.

  2. Hackathon boto3 / IAM session (same account, same WSParticipantRole)
     → Same inference profile ARN via converse/invoke
     STATUS: Same IAM block — same account, same role.

  3. Personal ABSK key (account 655366068864, BedrockAPIKey-vuui-at-655366068864)
     → us.anthropic.claude-sonnet-4-6  (CONFIRMED WORKING ✅)
     STATUS: Expires March 21 2026.  CURRENTLY THE ONLY WORKING PATH.

All three paths are logged so you can see exactly which one fires in the container logs.
"""

import json
import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("opsvoice.bedrock")

# ── Model / profile IDs ───────────────────────────────────────────────────────

# Hackathon account (283845804869) — Global inference profile
HACKATHON_PROFILE_ARN = (
    "arn:aws:bedrock:us-west-2:283845804869"
    ":inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0"
)
HACKATHON_PROFILE_ID  = "global.anthropic.claude-sonnet-4-20250514-v1:0"

# Personal account (655366068864) — direct cross-region model IDs
MODEL_SONNET_46    = "us.anthropic.claude-sonnet-4-6"          # CONFIRMED ✅
MODEL_HAIKU_35     = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
MODEL_HAIKU_3      = "anthropic.claude-3-haiku-20240307-v1:0"

MAX_TOKENS = 2048

SYSTEM_PROMPT = (
    "You are OpsVoice, a versatile AI assistant powered by Claude. "
    "You can help with anything: coding, writing, brainstorming, analysis, storytelling, "
    "infrastructure ops, debugging, creative projects, and more. "
    "Keep responses clear and natural — they will be spoken aloud via text-to-speech. "
    "Use conversational language, vary your sentence length, and be engaging. "
    "Be helpful, knowledgeable, and adaptive to whatever the user needs."
)

# ── ABSK personal fallback chain (CURRENTLY THE ONLY WORKING PATH) ───────────
ABSK_FALLBACK_CHAIN = [
    ("us-west-2", MODEL_SONNET_46),   # CONFIRMED PASS ✅
    ("us-east-1", MODEL_SONNET_46),
    ("us-west-2", MODEL_HAIKU_35),
    ("us-east-1", MODEL_HAIKU_35),
    ("us-east-1", MODEL_HAIKU_3),
]

# ── Bearer chain — hackathon (blocked until WSParticipantRole gets permission) ─
BEARER_FALLBACK_CHAIN = [
    ("us-west-2", HACKATHON_PROFILE_ID),
    ("us-west-2", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
    ("us-west-2", MODEL_HAIKU_35),
]


def _bedrock_url(region: str, model_id: str) -> str:
    return f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"


class BedrockService:
    """
    Calls Claude on AWS Bedrock with a three-level auth fallback.
    Logs which credential set succeeded so you can monitor switching in real-time.
    """

    def __init__(self, settings: Settings) -> None:
        self._bearer_token  = settings.aws_bearer_token_bedrock
        self._access_key    = settings.aws_access_key_id
        self._secret_key    = settings.aws_secret_access_key
        self._session_token = settings.aws_session_token
        self._absk_key      = settings.aws_bedrock_api_key_backup
        self._region        = settings.aws_default_region

        logger.info("BedrockService credentials:")
        logger.info(
            "  [1] Bearer token (hackathon, WSParticipantRole, acct 283845804869): %s",
            "PRESENT ⚠ (blocked — WSParticipantRole lacks bedrock:InvokeModel)" if self._bearer_token else "MISSING",
        )
        logger.info(
            "  [2] IAM session  (hackathon boto3, same acct):  %s",
            "PRESENT ⚠ (same IAM block)" if self._access_key else "MISSING",
        )
        logger.info(
            "  [3] ABSK         (personal, acct 655366068864, expires Mar 21 2026): %s",
            "PRESENT ✅ (CURRENTLY WORKING)" if self._absk_key else "MISSING ❌",
        )

    # ── Public entry point ────────────────────────────────────────────────────

    def invoke(self, messages: list[dict[str, str]], system: str | None = None) -> dict[str, Any]:
        """
        Try auth methods in priority order; log clearly which one fires.
        Args:
            messages: User/assistant messages (no system role entries).
            system:   Optional system prompt override. Defaults to SYSTEM_PROMPT.
        """
        errors: list[str] = []

        # 1. Hackathon bearer token (primary preference per event organisers)
        if self._bearer_token:
            logger.info("[KEY-1] Trying hackathon bearer token (acct 283845804869, WSParticipantRole)…")
            try:
                result = self._invoke_bearer_chain(messages, system=system)
                logger.info("[KEY-1] ✅ SUCCESS via hackathon bearer token — model: %s", result.get("model", "?"))
                return result
            except RuntimeError as e:
                logger.warning("[KEY-1] ❌ Bearer failed: %s", str(e)[:120])
                errors.append(f"bearer: {e}")

        # 2. Hackathon IAM session / boto3 (same account, same WSParticipantRole)
        if self._access_key and self._secret_key:
            logger.info("[KEY-2] Trying hackathon IAM session (boto3, acct 283845804869)…")
            try:
                result = self._invoke_boto3_hackathon(messages, system=system)
                logger.info("[KEY-2] ✅ SUCCESS via hackathon IAM session — model: %s", result.get("model", "?"))
                return result
            except Exception as e:
                logger.warning("[KEY-2] ❌ boto3 hackathon failed: %s", str(e)[:120])
                errors.append(f"boto3_event: {e}")

        # 3. Personal ABSK (account 655366068864) — currently the only working path
        if self._absk_key:
            logger.info("[KEY-3] Trying personal ABSK (acct 655366068864, expires Mar 21 2026)…")
            try:
                result = self._invoke_absk_chain(messages, system=system)
                logger.info("[KEY-3] ✅ SUCCESS via personal ABSK — model: %s", result.get("model", "?"))
                return result
            except RuntimeError as e:
                logger.warning("[KEY-3] ❌ ABSK failed: %s", str(e)[:120])
                errors.append(f"absk: {e}")

        raise RuntimeError(
            f"All Bedrock methods failed. "
            f"Hackathon: WSParticipantRole needs bedrock:InvokeModel (ask AWS booth). "
            f"Personal ABSK: ensure model access is enabled for account 655366068864. "
            f"Details: {'; '.join(errors[:3])}"
        )

    # ── Hackathon bearer chain ────────────────────────────────────────────────

    def _invoke_bearer_chain(self, messages: list[dict[str, str]], system: str | None = None) -> dict[str, Any]:
        """Bearer token against hackathon inference profile (us-west-2)."""
        last_err: Exception = RuntimeError("empty bearer chain")
        for region, model_id in BEARER_FALLBACK_CHAIN:
            try:
                return self._http_invoke(
                    token=self._bearer_token,
                    region=region,
                    model_id=model_id,
                    label=f"bearer_hackathon/{region}",
                    messages=messages,
                    system=system,
                )
            except RuntimeError as e:
                err_str = str(e)
                last_err = e
                # WSParticipantRole IAM block is account-wide — no point trying other models
                if "not authorized" in err_str.lower() and "WSParticipantRole" in err_str:
                    logger.debug("[KEY-1] WSParticipantRole blocked, skipping remaining bearer attempts")
                    break
                if "403" in err_str and ("AccessDenied" in err_str or "Forbidden" in err_str):
                    logger.debug("[KEY-1] Bearer 403 — token rejected or IAM block")
                    break
        raise last_err

    # ── Hackathon boto3 / IAM ─────────────────────────────────────────────────

    def _invoke_boto3_hackathon(self, messages: list[dict[str, str]], system: str | None = None) -> dict[str, Any]:
        """boto3 against hackathon inference profile ARN using IAM session credentials."""
        import boto3
        body = self._build_body(messages, system=system)
        # Try inference profile ARN first, then converse API, then regular model IDs
        attempts = [
            ("us-west-2", HACKATHON_PROFILE_ARN),
            ("us-west-2", HACKATHON_PROFILE_ID),
            ("us-west-2", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
        ]
        last_err: Exception = RuntimeError("boto3 hackathon: empty chain")
        for region, model_id in attempts:
            try:
                client = boto3.client(
                    "bedrock-runtime", region_name=region,
                    aws_access_key_id=self._access_key,
                    aws_secret_access_key=self._secret_key,
                    aws_session_token=self._session_token or None,
                )
                logger.info("[KEY-2] boto3 hackathon: invoking %s @%s", model_id[:60], region)
                response = client.invoke_model(
                    modelId=model_id, body=json.dumps(body),
                    contentType="application/json", accept="application/json",
                )
                data = json.loads(response["body"].read())
                return self._parse_response(data)
            except Exception as e:
                err_str = str(e)
                last_err = e
                logger.debug("[KEY-2] boto3 attempt failed (%s): %s", model_id[:40], err_str[:100])
                # IAM block applies to all regions/models for this role — fast fail
                if "not authorized" in err_str.lower() or "AccessDenied" in err_str:
                    raise RuntimeError(f"boto3 hackathon IAM block: {err_str[:200]}") from e
        raise last_err

    # ── Personal ABSK chain ───────────────────────────────────────────────────

    def _invoke_absk_chain(self, messages: list[dict[str, str]], system: str | None = None) -> dict[str, Any]:
        """ABSK fallback chain against personal account 655366068864 (CONFIRMED WORKING)."""
        last_err: Exception = RuntimeError("empty ABSK chain")
        for region, model_id in ABSK_FALLBACK_CHAIN:
            try:
                result = self._http_invoke(
                    token=self._absk_key,
                    region=region,
                    model_id=model_id,
                    label=f"absk_personal/{region}",
                    messages=messages,
                    system=system,
                )
                logger.info("[KEY-3] ABSK ok: %s @%s", model_id.split(".")[-1][:35], region)
                return result
            except RuntimeError as e:
                err_str = str(e)
                logger.debug("ABSK %s/%s: %s", region, model_id[:35], err_str[:60])
                last_err = e
                # Only fast-fail on hard token rejection (not use-case/propagation)
                if "authentication failed" in err_str.lower() and "bedrock-api-key" not in err_str.lower():
                    logger.info("[KEY-3] ABSK token rejected outright, stopping")
                    break
        raise last_err

    # ── Shared helpers ────────────────────────────────────────────────────────

    def _http_invoke(
        self,
        *,
        token: str,
        region: str,
        model_id: str,
        label: str,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> dict[str, Any]:
        url = _bedrock_url(region, model_id)
        body = self._build_body(messages, system=system)
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        logger.info("Bedrock [%s]: %s", label, model_id[:60])
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=body, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"{resp.status_code} [{label}]: {resp.text[:200]}")
        return self._parse_response(resp.json())

    def _build_body(self, messages: list[dict], system: str | None = None) -> dict:
        return {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "system": system or SYSTEM_PROMPT,
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
