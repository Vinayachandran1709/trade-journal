import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REQUIRED_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://indiacircle.in",
    "https://www.indiacircle.in",
]


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    CORS_ALLOW_ORIGINS: list[str] = REQUIRED_CORS_ORIGINS.copy()
    CORS_ALLOW_ORIGIN_REGEX: str = (
        r"^(chrome-extension://.*"
        r"|https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://(www\.)?indiacircle\.in)$"
    )
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    OPENAI_API_KEY: str = ""

    @field_validator("CORS_ALLOW_ORIGINS", mode="before")
    @classmethod
    def parse_cors_allow_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            origins = value
        elif not value:
            origins = []
        else:
            value = value.strip()
            if value.startswith("["):
                origins = json.loads(value)
            else:
                origins = [origin.strip() for origin in value.split(",") if origin.strip()]

        merged_origins: list[str] = []
        for origin in [*origins, *REQUIRED_CORS_ORIGINS]:
            if origin and origin not in merged_origins:
                merged_origins.append(origin)
        return merged_origins

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
