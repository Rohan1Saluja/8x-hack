import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)
    app_env: str = "development"
    auth0_domain: str = ""
    auth0_audience: str = ""
    database_url: SecretStr = SecretStr("")
    blob_read_write_token: SecretStr = SecretStr("")
    playback_url_seconds: int = Field(default=300, ge=30, le=600)
    groq_api_key: SecretStr = SecretStr("")
    groq_transcription_model: str = "whisper-large-v3-turbo"
    groq_text_model: str = "openai/gpt-oss-20b"

    @property
    def issuer(self) -> str:
        domain = self.auth0_domain.removeprefix("https://").rstrip("/")
        if not domain or any(c in domain for c in "/:@?# "):
            raise ValueError("AUTH0_DOMAIN must be the Auth0 tenant hostname")
        return f"https://{domain}/"


@lru_cache
def settings() -> Settings:
    # Never load a file on Vercel or in production. Process values take precedence.
    local = not os.getenv("VERCEL") and os.getenv("APP_ENV", "development") == "development"
    env_file = Path(__file__).resolve().parents[1] / ".env.local" if local else None
    return Settings(_env_file=env_file)
