import logging
import time
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("opsvoice.bedrock")

BEDROCK_RUNTIME_URL = "https://bedrock-runtime.{region}.amazonaws.com"
MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0"
MAX_TOKENS = 2048
MAX_RETRIES = 3
RETRY_BACKOFF = (1.0, 2.0, 4.0)  # seconds

SYSTEM_PROMPT = (
    "You are OpsVoice, an expert AI assistant for cloud infrastructure operations. "
    "You help engineers monitor, diagnose, and resolve infrastructure issues. "
    "Keep responses concise and actionable — they may be spoken aloud via text-to-speech. "
    "Use plain language, short sentences. Speak like a senior SRE briefing their team."
)


class BedrockService:
    """Calls Claude on AWS Bedrock using bearer token (primary) or ABSK key (fallback)."""

    def __init__(self, settings: Settings) -> None:
        self._bearer_token = settings.aws_bearer_token_bedrock
        self._absk_key = settings.aws_bedrock_api_key_backup
        self._region = settings.aws_default_region
        self._base_url = BEDROCK_RUNTIME_URL.format(region=self._region)

        if self._bearer_token:
            logger.info("BedrockService: initialized with PRIMARY bearer token")
        elif self._absk_key:
            logger.info("BedrockService: initialized with BACKUP ABSK key")
        else:
            logger.error("BedrockService: no credentials available")

    def invoke(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        """Send messages to Claude via Bedrock and return parsed response."""
        if self._bearer_token:
            return self._invoke_with_retry(self._invoke_bearer, messages)
        elif self._absk_key:
            return self._invoke_with_retry(self._invoke_absk, messages)
        else:
            raise RuntimeError("No AWS Bedrock credentials configured")

    def _invoke_with_retry(self, fn, messages: list[dict]) -> dict[str, Any]:
        """Retry the given invocation function with exponential backoff."""
        last_exc: Exception | None = None
        for attempt, delay in enumerate(RETRY_BACKOFF, start=1):
            try:
                return fn(messages)
            except RuntimeError as exc:
                last_exc = exc
                if attempt < MAX_RETRIES:
                    logger.warning(
                        "Bedrock attempt %d/%d failed (%s), retrying in %.1fs…",
                        attempt, MAX_RETRIES, exc, delay,
                    )
                    time.sleep(delay)
                else:
                    logger.error("Bedrock failed after %d attempts: %s", MAX_RETRIES, exc)
        raise last_exc  # type: ignore[misc]

    def _build_body(self, messages: list[dict]) -> dict:
        return {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }

    def _invoke_bearer(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        url = f"{self._base_url}/model/{MODEL_ID}/invoke"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._bearer_token}",
        }
        logger.info("Bedrock [bearer]: invoking %s", MODEL_ID)
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(url, json=self._build_body(messages), headers=headers)
        if resp.status_code != 200:
            logger.error("Bedrock error %d: %s", resp.status_code, resp.text[:500])
            raise RuntimeError(f"Bedrock {resp.status_code}: {resp.text[:200]}")
        return self._parse_response(resp.json())

    def _invoke_absk(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        url = f"{self._base_url}/model/{MODEL_ID}/invoke"
        headers = {
            "Content-Type": "application/json",
            "X-Bedrock-Api-Key": self._absk_key,
        }
        logger.info("Bedrock [ABSK]: invoking %s", MODEL_ID)
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(url, json=self._build_body(messages), headers=headers)
        if resp.status_code != 200:
            logger.error("Bedrock error %d: %s", resp.status_code, resp.text[:500])
            raise RuntimeError(f"Bedrock {resp.status_code}: {resp.text[:200]}")
        return self._parse_response(resp.json())

    @staticmethod
    def _parse_response(data: dict) -> dict[str, Any]:
        content_blocks = data.get("content", [])
        text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
        content = "\n".join(text_parts) if text_parts else ""
        usage = data.get("usage", {})
        return {
            "content": content,
            "model": data.get("model", MODEL_ID),
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "stop_reason": data.get("stop_reason", ""),
        }
