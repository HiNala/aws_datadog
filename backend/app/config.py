import logging
from functools import lru_cache
from pydantic_settings import BaseSettings

logger = logging.getLogger("opusvoice")


class Settings(BaseSettings):
    # AWS Bedrock — bearer token (hackathon primary)
    aws_bearer_token_bedrock: str = ""
    # AWS IAM session credentials (hackathon temp account, used by boto3)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_session_token: str = ""
    aws_default_region: str = "us-west-2"
    # Backup ABSK key
    aws_bedrock_api_key_backup: str = ""

    # MiniMax
    minimax_api_key: str = ""

    # Datadog
    dd_api_key: str = ""
    dd_app_key: str = ""
    dd_site: str = "us5.datadoghq.com"
    dd_llmobs_enabled: str = "1"
    dd_llmobs_ml_app: str = "opusvoice"
    dd_llmobs_agentless_enabled: str = "true"
    dd_service: str = "opusvoice-backend"
    dd_env: str = "hackathon"

    # PostgreSQL
    database_url: str = "postgresql://opusvoice:opusvoice_hack2026@postgres:5432/opusvoice"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def aws_key_source(self) -> str:
        """Returns the highest-priority key currently configured (not necessarily working)."""
        if self.aws_bearer_token_bedrock:
            return "hackathon_bearer_primary"
        if self.aws_access_key_id and self.aws_secret_access_key:
            return "hackathon_iam_session"
        if self.aws_bedrock_api_key_backup:
            return "personal_absk_fallback"
        return "none"

    def log_key_status(self) -> None:
        n = 0
        if self.aws_bearer_token_bedrock:
            n += 1
            logger.info(
                "AWS Auth [1]: Hackathon bearer token PRESENT "
                "(acct 283845804869 / WSParticipantRole — BLOCKED until IAM permission granted)"
            )
        if self.aws_access_key_id and self.aws_secret_access_key:
            n += 1
            logger.info(
                "AWS Auth [2]: Hackathon IAM session PRESENT "
                "(boto3 SigV4 — same WSParticipantRole block)"
            )
        if self.aws_bedrock_api_key_backup:
            n += 1
            logger.info(
                "AWS Auth [3]: Personal ABSK PRESENT "
                "(acct 655366068864 / BedrockAPIKey-vuui — CONFIRMED WORKING ✅, expires Mar 21 2026)"
            )
        if n == 0:
            logger.error("AWS Auth: NO credentials configured!")

        if self.minimax_api_key:
            logger.info("MiniMax: API key configured")
        else:
            logger.warning("MiniMax: No API key — TTS unavailable")

        dd_key = self.dd_api_key
        if dd_key and not dd_key.startswith("your_"):
            logger.info("Datadog: API key configured (site=%s)", self.dd_site)
        else:
            logger.warning("Datadog: No API key — observability disabled")


@lru_cache
def get_settings() -> Settings:
    return Settings()
