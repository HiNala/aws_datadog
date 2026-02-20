import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("opsvoice.bedrock")

# Ordered list of (region, model_id) combos to try for ABSK keys.
# Some accounts have Claude Sonnet 4 only in us-east-1; fallback to 3.5 Sonnet in us-west-2.
ABSK_FALLBACK_CHAIN = [
    ("us-east-1",  "us.anthropic.claude-sonnet-4-20250514-v1:0"),   # preferred
    ("us-west-2",  "us.anthropic.claude-sonnet-4-20250514-v1:0"),   # try primary region
    ("us-west-2",  "anthropic.claude-3-5-sonnet-20241022-v2:0"),    # fallback model
    ("us-east-1",  "anthropic.claude-3-5-sonnet-20241022-v2:0"),    # last resort
]

BEARER_MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0"
MAX_TOKENS = 2048

SYSTEM_PROMPT = (
    "You are OpsVoice, an expert AI assistant for cloud infrastructure operations. "
    "You help engineers monitor, diagnose, and resolve infrastructure issues. "
    "Keep responses concise and actionable — they may be spoken aloud via text-to-speech. "
    "Speak like a senior SRE briefing their team."
)


def _bedrock_url(region: str, model_id: str) -> str:
    return f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"


class BedrockService:
    """Calls Claude on AWS Bedrock using bearer token (primary) or ABSK key (fallback)."""

    def __init__(self, settings: Settings) -> None:
        self._bearer_token = settings.aws_bearer_token_bedrock
        self._absk_key = settings.aws_bedrock_api_key_backup
        self._region = settings.aws_default_region

        if self._bearer_token:
            logger.info("BedrockService: initialized with PRIMARY bearer token")
        elif self._absk_key:
            logger.info("BedrockService: initialized with BACKUP ABSK key")
        else:
            logger.error("BedrockService: no credentials available")

    def invoke(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        """Send messages to Claude via Bedrock. Tries bearer first, ABSK chain second."""
        if self._bearer_token:
            try:
                return self._invoke_with(
                    token=self._bearer_token,
                    region=self._region,
                    model_id=BEARER_MODEL_ID,
                    label="bearer",
                    messages=messages,
                )
            except RuntimeError as e:
                if self._absk_key:
                    logger.warning("Bearer token failed (%s), falling back to ABSK key", e)
                else:
                    raise

        if self._absk_key:
            return self._invoke_absk_chain(messages)

        raise RuntimeError("No AWS Bedrock credentials configured")

    def _invoke_absk_chain(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        """Try each (region, model) pair in ABSK_FALLBACK_CHAIN until one succeeds."""
        last_err: Exception = RuntimeError("ABSK chain exhausted")
        for region, model_id in ABSK_FALLBACK_CHAIN:
            try:
                result = self._invoke_with(
                    token=self._absk_key,
                    region=region,
                    model_id=model_id,
                    label=f"ABSK/{region}/{model_id.split('.')[-1][:20]}",
                    messages=messages,
                )
                return result
            except RuntimeError as e:
                logger.debug("ABSK attempt failed (%s/%s): %s", region, model_id, e)
                last_err = e
        raise last_err

    def _invoke_with(
        self,
        *,
        token: str,
        region: str,
        model_id: str,
        label: str,
        messages: list[dict[str, str]],
    ) -> dict[str, Any]:
        url = _bedrock_url(region, model_id)
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        logger.info("Bedrock [%s]: invoking %s in %s", label, model_id, region)

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=body, headers=headers)

        if resp.status_code != 200:
            raise RuntimeError(f"Bedrock {resp.status_code} [{label}]: {resp.text[:200]}")

        return self._parse_response(resp.json())

    @staticmethod
    def _parse_response(data: dict) -> dict[str, Any]:
        content_blocks = data.get("content", [])
        text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
        content = "\n".join(text_parts) if text_parts else ""
        usage = data.get("usage", {})
        return {
            "content": content,
            "model": data.get("model", BEARER_MODEL_ID),
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "stop_reason": data.get("stop_reason", ""),
        }
