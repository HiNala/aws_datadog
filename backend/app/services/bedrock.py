import json
import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("opsvoice.bedrock")

MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0"
MODEL_ID_FALLBACK = "anthropic.claude-3-5-sonnet-20241022-v2:0"

MAX_TOKENS = 2048

SYSTEM_PROMPT = (
    "You are OpsVoice, an expert AI assistant for cloud infrastructure operations. "
    "You help engineers monitor, diagnose, and resolve infrastructure issues. "
    "Keep responses concise and actionable — they may be spoken aloud via text-to-speech. "
    "Use plain language, short sentences. Speak like a senior SRE briefing their team."
)

BEARER_FALLBACK_CHAIN = [
    ("us-west-2", MODEL_ID),
    ("us-east-1", MODEL_ID),
    ("us-west-2", MODEL_ID_FALLBACK),
    ("us-east-1", MODEL_ID_FALLBACK),
]


def _bedrock_url(region: str, model_id: str) -> str:
    return f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/invoke"


class BedrockService:
    """
    Calls Claude on AWS Bedrock.
    Auth priority:
      1. Bearer token  (hackathon primary)
      2. boto3 SigV4   (IAM session creds)
      3. ABSK chain    (personal backup key)
    """

    def __init__(self, settings: Settings) -> None:
        self._bearer_token  = settings.aws_bearer_token_bedrock
        self._access_key    = settings.aws_access_key_id
        self._secret_key    = settings.aws_secret_access_key
        self._session_token = settings.aws_session_token
        self._absk_key      = settings.aws_bedrock_api_key_backup
        self._region        = settings.aws_default_region

        if self._bearer_token:
            logger.info("BedrockService: bearer token available")
        if self._access_key and self._secret_key:
            logger.info("BedrockService: IAM session creds available (boto3)")
        if self._absk_key:
            logger.info("BedrockService: ABSK backup key available")

    def invoke(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        errors: list[str] = []

        if self._bearer_token:
            try:
                return self._invoke_bearer_chain(messages)
            except RuntimeError as e:
                logger.warning("Bearer auth failed: %s", e)
                errors.append(f"bearer: {e}")

        if self._access_key and self._secret_key:
            try:
                return self._invoke_boto3(messages)
            except Exception as e:
                logger.warning("boto3 SigV4 failed: %s", e)
                errors.append(f"boto3: {e}")

        if self._absk_key:
            try:
                return self._invoke_absk_chain(messages)
            except RuntimeError as e:
                errors.append(f"absk: {e}")

        raise RuntimeError(f"All Bedrock auth methods failed. Errors: {"; ".join(errors)}")

    def _invoke_bearer_chain(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        last_err: Exception = RuntimeError("empty chain")
        for region, model_id in BEARER_FALLBACK_CHAIN:
            try:
                return self._http_invoke(token=self._bearer_token, region=region, model_id=model_id, label=f"bearer/{region}", messages=messages)
            except RuntimeError as e:
                last_err = e
        raise last_err

    def _invoke_boto3(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        import boto3
        body = self._build_body(messages)
        for region, model_id in [(self._region, MODEL_ID), ("us-east-1", MODEL_ID), (self._region, MODEL_ID_FALLBACK)]:
            try:
                client = boto3.client("bedrock-runtime", region_name=region, aws_access_key_id=self._access_key, aws_secret_access_key=self._secret_key, aws_session_token=self._session_token or None)
                logger.info("Bedrock [boto3/%s]: invoking %s", region, model_id)
                response = client.invoke_model(modelId=model_id, body=json.dumps(body), contentType="application/json", accept="application/json")
                data = json.loads(response["body"].read())
                return self._parse_response(data)
            except Exception as e:
                err_str = str(e)
                if any(k in err_str.lower() for k in ("not found", "access denied", "validation")):
                    logger.debug("boto3 attempt failed (%s/%s): %s", region, model_id, err_str[:100])
                    continue
                raise RuntimeError(f"boto3 Bedrock error: {err_str[:200]}") from e
        raise RuntimeError("boto3: no model/region combination succeeded")

    def _invoke_absk_chain(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        last_err: Exception = RuntimeError("empty ABSK chain")
        for region, model_id in BEARER_FALLBACK_CHAIN:
            try:
                return self._http_invoke(token=self._absk_key, region=region, model_id=model_id, label=f"absk/{region}", messages=messages)
            except RuntimeError as e:
                last_err = e
        raise last_err

    def _http_invoke(self, *, token: str, region: str, model_id: str, label: str, messages: list[dict[str, str]]) -> dict[str, Any]:
        url = _bedrock_url(region, model_id)
        body = self._build_body(messages)
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        logger.info("Bedrock [%s]: %s", label, model_id)
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=body, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"{resp.status_code} [{label}]: {resp.text[:180]}")
        return self._parse_response(resp.json())

    def _build_body(self, messages: list[dict]) -> dict:
        return {"anthropic_version": "bedrock-2023-05-31", "max_tokens": MAX_TOKENS, "system": SYSTEM_PROMPT, "messages": messages}

    @staticmethod
    def _parse_response(data: dict) -> dict[str, Any]:
        content_blocks = data.get("content", [])
        text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
        content = "
".join(text_parts) if text_parts else ""
        usage = data.get("usage", {})
        return {"content": content, "model": data.get("model", MODEL_ID), "input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0), "stop_reason": data.get("stop_reason", "")}
