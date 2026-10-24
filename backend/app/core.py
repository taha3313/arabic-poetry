from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore", env_ignore_empty=True)
    provider: Literal["gemini", "groq", "openrouter"] = "gemini"
    generation_enabled: bool = True
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    gemini_thinking_level: Literal["low", "medium", "high"] = "medium"
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    openrouter_model: str = "openrouter/free"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def api_key(self) -> str:
        if self.provider == "gemini":
            return self.gemini_api_key
        return self.groq_api_key if self.provider == "groq" else self.openrouter_api_key

    @property
    def model(self) -> str:
        if self.provider == "gemini":
            return self.gemini_model
        return self.groq_model if self.provider == "groq" else self.openrouter_model


@lru_cache(maxsize=1)
def _load_settings(path: str, signature: tuple[int, int]) -> Settings:
    return Settings(_env_file=path)


def get_settings() -> Settings:
    try:
        stat = ENV_FILE.stat()
        signature = (stat.st_mtime_ns, stat.st_size)
    except FileNotFoundError:
        signature = (0, 0)
    return _load_settings(str(ENV_FILE), signature)
