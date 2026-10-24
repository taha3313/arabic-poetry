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
