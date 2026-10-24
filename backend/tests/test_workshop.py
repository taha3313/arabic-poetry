import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from app.core import Settings
from app.main import app
from app.schemas import GenerateRequest
from app.services import generator

client = TestClient(app)
VERSE = {"sadr": "قِفَا نَبْكِ مِنْ ذِكْرَى حَبِيبٍ وَمَنْزِلِ", "ajuz": "بِسِقْطِ اللِّوَى بَيْنَ الدَّخُولِ فَحَوْمَلِ"}


def test_real_scansion_and_rawi():
    response = client.post("/api/analyze", json={"verses": [VERSE], "meter": "taweel", "rawi": "ل"})
    assert response.status_code == 200
    result = response.json()
    assert result["accepted"]
    assert result["verses"][0]["sadr"]["feet"]
    wrong = client.post(
        "/api/analyze", json={"verses": [VERSE], "meter": "taweel", "rawi": "م"}
    ).json()
    assert not wrong["accepted"]
    assert not wrong["verses"][0]["rawi_matches"]


def test_bounds_and_unknown_meter():
    assert (
        client.post("/api/analyze", json={"verses": [VERSE], "meter": "invalid"}).status_code == 422
    )
    assert client.post("/api/analyze", json={"verses": []}).status_code == 422
    assert (
        client.post("/api/generate", json={"topic": "الحنين", "verse_count": 9}).status_code == 422
    )
    assert client.post("/api/analyze", json={"verses": [VERSE], "rawi": "ab"}).status_code == 422


def test_missing_key_and_config():
    app.dependency_overrides.clear()
    config = client.get("/api/config").json()
    assert len(config["meters"]) == 16
    assert "api_key" not in json.dumps(config)
    # Direct settings avoid depending on a developer's local credentials.
    try:
        asyncio.run(
            generator.complete(
                [],
                Settings(_env_file=None, gemini_api_key="", groq_api_key="", openrouter_api_key=""),
            )
        )
    except generator.GenerationError as exc:
        assert exc.status == 503
    else:
        raise AssertionError("Missing key must fail")


def test_revisions_use_feedback_and_keep_best(monkeypatch):
    answers = iter(
        [
            json.dumps({"title": "محاولة", "verses": [{"sadr": "أَنَا هُنَا", "ajuz": "هُنَا أَنَا"}]}),
            json.dumps({"title": "قصيدة", "verses": [VERSE]}),
        ]
    )
    history = []

    async def fake_complete(messages, settings):
        history.append(list(messages))
        return next(answers)

    monkeypatch.setattr(generator, "complete", fake_complete)
    result = asyncio.run(
        generator.generate(
            GenerateRequest(topic="ذكرى حبيب", meter="taweel", rawi="ل", verse_count=1),
            Settings(_env_file=None),
        )
    )
    assert result["analysis"]["accepted"]
    assert result["attempts"] == 2
    assert "PyArud" in history[1][-1]["content"]


def test_malformed_output_is_bounded(monkeypatch):
    calls = []

    async def fake_complete(messages, settings):
        calls.append(1)
        return "not json"

    monkeypatch.setattr(generator, "complete", fake_complete)
    try:
        asyncio.run(
            generator.generate(GenerateRequest(topic="الحنين", max_revisions=1), Settings())
        )
    except generator.GenerationError:
        pass
    else:
        raise AssertionError("Invalid output must fail")
    assert len(calls) == 2


def test_rate_limit_is_safe(monkeypatch):
    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, *args, **kwargs):
            return httpx.Response(429)

    monkeypatch.setattr(generator.httpx, "AsyncClient", FakeClient)
    try:
        asyncio.run(
            generator.complete(
                [], Settings(_env_file=None, provider="openrouter", openrouter_api_key="test")
            )
        )
    except generator.GenerationError as exc:
        assert exc.status == 429
        assert "test" not in str(exc)
    else:
        raise AssertionError("Rate limit must propagate")


def test_bad_fence_and_wrong_count():
    import pytest

    with pytest.raises(ValueError):
        generator.parse_draft("```", 1)
    with pytest.raises(ValueError):
        generator.parse_draft(json.dumps({"title": "بيت", "verses": [VERSE]}), 2)
    assert generator.parse_draft(
        "```json\n" + json.dumps({"title": "بيت", "verses": [VERSE]}) + "\n```", 1
    )


def test_later_revision_cannot_replace_a_stronger_draft(monkeypatch):
    answers = iter(
        [
            json.dumps({"title": "الأفضل", "verses": [VERSE]}),
            json.dumps({"title": "الأضعف", "verses": [{"sadr": "أَنَا هُنَا", "ajuz": "هُنَا أَنَا"}]}),
        ]
    )

    async def fake_complete(messages, settings):
        return next(answers)

    monkeypatch.setattr(generator, "complete", fake_complete)
    result = asyncio.run(
        generator.generate(
            GenerateRequest(
                topic="الحنين", meter="taweel", rawi="م", verse_count=1, max_revisions=1
            ),
            Settings(_env_file=None),
        )
    )
    assert result["title"] == "الأفضل"
    assert result["attempts"] == 2
    assert not result["analysis"]["accepted"]
