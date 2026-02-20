import logging
from functools import lru_cache
from pydantic_settings import BaseSettings

logger = logging.getLogger("opsvoice")


class Settings(BaseSettings):
    # AWS Bedrock
    aws_bearer_token_bedrock: str = ""
    aws_bedrock_api_key_backup: str = ""
    aws_default_region: str = "us-west-2"

    # MiniMax
    minimax_api_key: str = ""

    # Datadog
    dd_api_key: str = ""
    dd_app_key: str = ""
    dd_site: str = "datadoghq.com"
    dd_llmobs_enabled: str = "1"
    dd_llmobs_ml_app: str = "opsvoice"
    dd_llmobs_agentless_enabled: str = "true"
    dd_service: str = "opsvoice-backend"
    dd_env: str = "hackathon"

    # PostgreSQL
    database_url: str = "postgresql://opsvoice:opsvoice_hack2026@postgres:5432/opsvoice"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def aws_key_source(self) -> str:
        if self.aws_bearer_token_bedrock:
            return "primary_bearer"
        if self.aws_bedrock_api_key_backup:
            return "backup_absk"
        return "none"

    def log_key_status(self) -> None:
        if self.aws_bearer_token_bedrock:
            logger.info(
                "AWS Auth: Using PRIMARY hackathon bearer token (expires ~12h)"
            )
        elif self.aws_bedrock_api_key_backup:
            logger.warning(
                "AWS Auth: Using BACKUP ABSK API key (expires Mar 21 2026)"
            )
        else:
            logger.error("AWS Auth: NO AWS credentials configured!")

        if self.minimax_api_key:
            logger.info("MiniMax: API key configured")
        else:
            logger.warning("MiniMax: No API key — TTS will be unavailable")

        if self.dd_api_key and self.dd_api_key != "your_datadog_api_key_here":
            logger.info("Datadog: API key configured")
        else:
            logger.warning("Datadog: No API key — observability disabled")


@lru_cache
def get_settings() -> Settings:
    return Settings()
