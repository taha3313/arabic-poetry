from fastapi.testclient import TestClient

from app.core import Settings
from app.main import app


def test_disabled_generation_cannot_use_configured_key(monkeypatch):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: Settings(_env_file=None, generation_enabled=False, gemini_api_key="test-only"),
    )
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/config").json()["generation_available"] is False
    response = client.post(
        "/api/generate",
        json={"topic": "الأمل", "meter": "taweel", "rawi": "م", "verse_count": 2},
    )
    assert response.status_code == 503


def test_render_false_string_disables_generation(monkeypatch):
    monkeypatch.setenv("GENERATION_ENABLED", "false")
    assert Settings(_env_file=None).generation_enabled is False


def test_quota_error_response_is_safe_and_includes_retry_after(monkeypatch):
    from app.services.generator import GenerationError

    async def exhausted(*args):
        raise GenerationError("حاول لاحقًا.", 429, 120)

    monkeypatch.setattr(
        "app.main.get_settings", lambda: Settings(_env_file=None, gemini_api_key_2="private-key")
    )
    monkeypatch.setattr("app.main.generate", exhausted)
    client = TestClient(app)
    assert client.get("/api/config").json()["generation_available"] is True
    response = client.post("/api/generate", json={"topic": "الأمل"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "120"
    assert "private-key" not in response.text


def test_concurrent_generation_is_rejected_without_provider_call(monkeypatch):
    import asyncio

    import pytest
    from fastapi import HTTPException

    from app.main import _generation_lock, generate_poem
    from app.schemas import GenerateRequest

    monkeypatch.setattr(
        "app.main.get_settings", lambda: Settings(_env_file=None, gemini_api_key="private-key")
    )

    async def check():
        async with _generation_lock:
            with pytest.raises(HTTPException) as error:
                await generate_poem(GenerateRequest(topic="الأمل"))
            assert error.value.status_code == 429
            assert error.value.headers["Retry-After"] == "15"

    asyncio.run(check())
