import asyncio
import json
from datetime import UTC

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


@pytest.fixture(autouse=True)
def reset_key_circuits():
    from app.services.generator import _key_cooldowns, _preferred_keys

    _key_cooldowns.clear()
    _preferred_keys.clear()


def sequence_client(monkeypatch, responses, calls):
    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, **kwargs):
            calls.append(kwargs["headers"]["x-goog-api-key"])
            return responses.pop(0)

    monkeypatch.setattr("app.services.generator.httpx.AsyncClient", Client)


def successful_response():
    return httpx.Response(
        200,
        request=httpx.Request("POST", "https://example.test"),
        json={"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "{}"}]}}]},
    )


def test_rotation_retains_working_key_and_skips_exhausted_keys(monkeypatch):
    calls = []
    sequence_client(
        monkeypatch, [httpx.Response(429), successful_response(), successful_response()], calls
    )
    settings = Settings(
        _env_file=None, gemini_api_key="first", gemini_api_key_2="second", gemini_api_key_3="third"
    )
    assert asyncio.run(complete([], settings)) == "{}"
    assert asyncio.run(complete([], settings)) == "{}"
    assert calls == ["first", "second", "second"]


def test_all_keys_exhausted_opens_circuit_and_recovers(monkeypatch):
    calls = []
    clock = [1000.0]
    monkeypatch.setattr("app.services.generator.time.monotonic", lambda: clock[0])
    sequence_client(
        monkeypatch,
        [httpx.Response(429, headers={"Retry-After": "120"}) for _ in range(3)]
        + [successful_response()],
        calls,
    )
    settings = Settings(
        _env_file=None, gemini_api_key="first", gemini_api_key_2="second", gemini_api_key_3="third"
    )
    for _ in range(2):
        with pytest.raises(GenerationError) as error:
            asyncio.run(complete([], settings))
        assert error.value.status == 429
        assert error.value.retry_after == 120
        assert all(key not in str(error.value) for key in settings.gemini_api_keys)
    assert calls == ["first", "second", "third"]
    clock[0] += 121
    assert asyncio.run(complete([], settings)) == "{}"


def test_duplicate_keys_do_not_multiply_requests(monkeypatch):
    calls = []
    sequence_client(monkeypatch, [httpx.Response(429)], calls)
    settings = Settings(_env_file=None, gemini_api_key="same", gemini_api_key_2="same")
    with pytest.raises(GenerationError):
        asyncio.run(complete([], settings))
    assert calls == ["same"]


def test_retry_after_date_and_daily_quota_are_respected():
    from datetime import datetime, timedelta
    from email.utils import format_datetime

    from app.services.generator import gemini_quota_error

    response = httpx.Response(
        429,
        headers={"Retry-After": format_datetime(datetime.now(UTC) + timedelta(seconds=300))},
    )
    assert 299 <= gemini_quota_error(response).retry_after <= 301
    response = httpx.Response(
        429, json={"error": {"details": [{"violations": [{"quotaId": "PerDayPerProject"}]}]}}
    )
    assert gemini_quota_error(response).retry_after == 86400


def test_known_shared_project_quota_skips_sibling_key(monkeypatch):
    calls = []
    quota = httpx.Response(
        429, json={"error": {"details": [{"violations": [{"quotaId": "PerDayPerProject"}]}]}}
    )
    sequence_client(monkeypatch, [quota, successful_response()], calls)
    settings = Settings(
        _env_file=None,
        gemini_api_key="first",
        gemini_api_key_2="sibling",
        gemini_api_key_3="other",
        gemini_key_projects={"1": "project-a", "2": "project-a", "3": "project-b"},
    )
    assert asyncio.run(complete([], settings)) == "{}"
    assert calls == ["first", "other"]


def test_overload_retry_after_prevents_immediate_retry(monkeypatch):
    calls = []
    sequence_client(monkeypatch, [httpx.Response(503, headers={"Retry-After": "120"})], calls)
    with pytest.raises(GenerationError) as error:
        asyncio.run(complete([], Settings(_env_file=None, gemini_api_key="first")))
    assert error.value.status == 503
    assert error.value.retry_after == 120
    assert calls == ["first"]
