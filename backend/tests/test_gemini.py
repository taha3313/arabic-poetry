import asyncio
import json

import httpx
import pytest

from app.core import Settings
from app.services.generator import GenerationError, complete


def stub_client(monkeypatch, response, captured):
    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, **kwargs):
            captured["calls"] = captured.get("calls", 0) + 1
            captured.update(url=url, **kwargs)
            return response

    monkeypatch.setattr("app.services.generator.httpx.AsyncClient", Client)


def test_gemini_native_request_and_text_parts(monkeypatch):
    captured = {}
    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://example.test"),
        json={
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {
                        "parts": [
                            {"thought": True, "text": "private reasoning"},
                            {"text": '{"title":'},
                            {"text": '"بيت"}'},
                        ]
                    },
                }
            ],
        },
    )
    stub_client(monkeypatch, response, captured)
    result = asyncio.run(
        complete(
            [
                {"role": "system", "content": "اكتب الشعر"},
                {"role": "user", "content": "موضوع"},
                {"role": "assistant", "content": "مسودة"},
                {"role": "user", "content": "راجع"},
            ],
            Settings(_env_file=None, provider="gemini", gemini_api_key="secret-test"),
        )
    )
    assert json.loads(result)["title"] == "بيت"
    assert "secret-test" not in captured["url"]
    assert captured["headers"]["x-goog-api-key"] == "secret-test"
    body = captured["json"]
    assert [m["role"] for m in body["contents"]] == ["user", "model", "user"]
    assert body["systemInstruction"]["parts"][0]["text"] == "اكتب الشعر"
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["responseJsonSchema"]["required"] == ["title", "verses"]
    assert body["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "medium"


@pytest.mark.parametrize(
    ("http_status", "body", "expected_status"),
    [
        (429, {"error": {"message": "secret-test"}}, 429),
        (403, {"error": {"message": "secret-test"}}, 503),
        (500, {"error": {"message": "secret-test"}}, 502),
        (200, {"candidates": []}, 502),
        (200, {"candidates": [{"finishReason": "MAX_TOKENS"}]}, 502),
        (200, {"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]}, 502),
    ],
)
def test_gemini_errors_are_controlled(monkeypatch, http_status, body, expected_status):
    response = httpx.Response(
        http_status, request=httpx.Request("POST", "https://example.test"), json=body
    )
    stub_client(monkeypatch, response, {})
    with pytest.raises(GenerationError) as error:
        asyncio.run(
            complete([], Settings(_env_file=None, provider="gemini", gemini_api_key="secret-test"))
        )
    assert error.value.status == expected_status
    assert "secret-test" not in str(error.value)


def test_empty_environment_values_use_defaults(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "")
    settings = Settings(_env_file=None)
    assert "http://localhost:5173" in settings.cors_origins


def test_revision_failure_keeps_completed_draft(monkeypatch):
    from app.schemas import GenerateRequest
    from app.services.generator import generate

    calls = []

    async def fake_complete(messages, settings):
        calls.append(1)
        if len(calls) == 2:
            raise GenerationError("Temporary quota failure", 429)
        return json.dumps({"title": "مسودة", "verses": [{"sadr": "أَنَا هُنَا", "ajuz": "هُنَا أَنَا"}]})

    monkeypatch.setattr("app.services.generator.complete", fake_complete)
    result = asyncio.run(
        generate(GenerateRequest(topic="الأمل", verse_count=1), Settings(_env_file=None))
    )
    assert result["title"] == "مسودة"
    assert result["revision_warning"] == "Temporary quota failure"
    assert not result["analysis"]["accepted"]
    assert result["attempts"] == 2


def test_temporary_overload_retries_once(monkeypatch):
    captured = {}
    response = httpx.Response(503, request=httpx.Request("POST", "https://example.test"), json={})
    stub_client(monkeypatch, response, captured)

    async def no_wait(seconds):
        assert seconds == 1

    monkeypatch.setattr("app.services.generator.asyncio.sleep", no_wait)
    with pytest.raises(GenerationError):
        asyncio.run(complete([], Settings(_env_file=None, gemini_api_key="secret-test")))
    assert captured["calls"] == 2


@pytest.mark.parametrize(
    ("details", "expected"),
    [
        (
            [
                {"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
                {"retryDelay": "30s"},
            ],
            "اليومية",
        ),
        (
            [
                {
                    "violations": [
                        {"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}
                    ]
                },
                {"retryDelay": "12.3s"},
            ],
            "13 ثانية",
        ),
        (
            [
                {
                    "violations": [
                        {
                            "quotaMetric": "generate_content_free_tier_input_token_count",
                            "quotaValue": "0",
                        }
                    ]
                }
            ],
            "تساوي صفرًا",
        ),
        ([], "لم يحدد نوع الحد"),
    ],
)
def test_quota_messages_distinguish_daily_and_temporary_limits(details, expected):
    from app.services.generator import gemini_quota_error

    error = gemini_quota_error(
        httpx.Response(429, json={"error": {"message": "secret-test", "details": details}})
    )
    assert error.status == 429
    assert expected in str(error)
    assert "secret-test" not in str(error)


def test_gemini_quota_rejection_is_not_retried(monkeypatch):
    captured = {}
    response = httpx.Response(429, json={"error": {"details": [{"retryDelay": "20s"}]}})
    stub_client(monkeypatch, response, captured)
    with pytest.raises(GenerationError, match="20 ثانية"):
        asyncio.run(complete([], Settings(_env_file=None, gemini_api_key="test")))
    assert captured["calls"] == 1


@pytest.mark.parametrize(
    "model", ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "allam-2-7b"]
)
def test_groq_json_and_reasoning_budget(monkeypatch, model):
    captured = {}
    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://example.test"),
        json={"choices": [{"message": {"content": '{"title":"أمل"}'}}]},
    )
    stub_client(monkeypatch, response, captured)
    result = asyncio.run(
        complete(
            [{"role": "user", "content": "JSON"}],
            Settings(_env_file=None, provider="groq", groq_api_key="test-key", groq_model=model),
        )
    )
    assert json.loads(result)["title"] == "أمل"
    assert captured["json"]["response_format"] == {"type": "json_object"}
    if model.startswith("openai/gpt-oss-"):
        assert captured["json"]["reasoning_effort"] == "low"
    else:
        assert "reasoning_effort" not in captured["json"]
