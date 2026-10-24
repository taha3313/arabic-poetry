import asyncio
import math
import re

import httpx
from pydantic import ValidationError

from app.core import Settings
from app.schemas import Draft, GenerateRequest
from app.services.prompts import initial_messages, merge_revision, repair_messages
from app.services.prosody import analyze


class GenerationError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


async def complete(messages: list[dict], settings: Settings) -> str:
    if not settings.api_key:
        raise GenerationError("أضف مفتاح مزوّد اللغة إلى إعدادات الخادم لتفعيل التوليد.", 503)
    if settings.provider == "openrouter" and not (
        settings.model == "openrouter/free" or settings.model.endswith(":free")
    ):
        raise GenerationError("يجب اختيار نموذج مجاني من OpenRouter ينتهي بـ :free.", 503)
    if settings.provider == "gemini":
        return await complete_gemini(messages, settings)
    base = (
        "https://api.groq.com/openai/v1"
        if settings.provider == "groq"
        else "https://openrouter.ai/api/v1"
    )
    payload = {
        "model": settings.model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 3000,
    }
    if settings.provider == "groq":
        payload["response_format"] = {"type": "json_object"}
        if settings.model.startswith("openai/gpt-oss-"):
            payload["reasoning_effort"] = "low"
    try:
        async with httpx.AsyncClient(timeout=75) as client:
            response = await client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {settings.api_key}"},
                json=payload,
            )
        if response.status_code == 429:
            raise GenerationError("بلغ المزوّد حد الطلبات المجانية. حاول لاحقًا.", 429)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Empty provider response")
        return content
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
        raise GenerationError("تعذّر الاتصال بمزوّد اللغة أو قراءة استجابته. حاول لاحقًا.") from exc


def gemini_quota_error(response: httpx.Response) -> GenerationError:
    """Explain structured quota details without exposing upstream messages or keys."""
    try:
        body = response.json()
        details = body.get("error", {}).get("details", [])
        if not isinstance(details, list):
            details = []
    except (ValueError, AttributeError):
        details = []
    identifiers = []
    zero_quota = False
    retry_seconds = None
    for detail in details:
        if not isinstance(detail, dict):
            continue
        delay = detail.get("retryDelay")
        if isinstance(delay, str) and re.fullmatch(r"\d+(?:\.\d+)?s", delay):
            retry_seconds = min(86400, math.ceil(float(delay[:-1])))
        violations = detail.get("violations", [])
        if not isinstance(violations, list):
            continue
        for violation in violations:
            if not isinstance(violation, dict):
                continue
            identifiers.append(str(violation.get("quotaId", "")).lower())
            identifiers.append(str(violation.get("quotaMetric", "")).lower())
            zero_quota |= str(violation.get("quotaValue", "")) == "0"
    if zero_quota:
        message = (
            "حصة هذا النموذج تساوي صفرًا في مشروع Gemini الحالي. راجع إتاحته وحصته في AI Studio."
        )
    elif any("perday" in item or "per_day" in item for item in identifiers):
        message = "استُنفدت الحصة اليومية لهذا النموذج في مشروع Gemini. انتظر تجدد الحصة وراجع موعدها في AI Studio."
    elif (
        any("perminute" in item or "per_minute" in item for item in identifiers)
        or retry_seconds is not None
    ):
        message = "وصل Gemini إلى حد مؤقت للطلبات أو الرموز."
        message += (
            f" حاول بعد {retry_seconds} ثانية."
            if retry_seconds is not None
            else " انتظر قليلًا ثم حاول مجددًا."
        )
    else:
        message = "رفض Gemini الطلب بسبب حد الاستخدام. لم يحدد نوع الحد؛ قد يكون مؤقتًا أو يوميًا. راجع الحصة في AI Studio."
    return GenerationError(message, 429)


async def complete_gemini(messages: list[dict], settings: Settings) -> str:
    """Native Gemini JSON generation; keys go in a header, never the URL."""
    config = {
        "temperature": 1.0,
        "maxOutputTokens": 8192,
        "responseMimeType": "application/json",
        "responseJsonSchema": Draft.model_json_schema(),
    }
    if settings.model.startswith("gemini-3"):
        config["thinkingConfig"] = {"thinkingLevel": settings.gemini_thinking_level}
    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
        if m["role"] != "system"
    ]
    try:
        async with httpx.AsyncClient(timeout=75) as client:
            for retry in range(2):
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{settings.model}:generateContent",
                    headers={"x-goog-api-key": settings.api_key},
                    json={
                        "systemInstruction": {"parts": [{"text": system}]},
                        "contents": contents,
                        "generationConfig": config,
                    },
                )
                if response.status_code not in (503, 504) or retry == 1:
                    break
                await asyncio.sleep(1)
        if response.status_code == 429:
            raise gemini_quota_error(response)
        if response.status_code in (401, 403):
            raise GenerationError("تعذّر استخدام مفتاح Gemini. راجع صلاحيته وأذونات المشروع.", 503)
        response.raise_for_status()
        candidate = response.json().get("candidates", [{}])[0]
        if candidate.get("finishReason") != "STOP":
            raise GenerationError("لم يُكمل Gemini القصيدة. حاول بعدد أقل من الأبيات أو حاول مجددًا.")
        content = "".join(
            p.get("text", "")
            for p in candidate.get("content", {}).get("parts", [])
            if not p.get("thought")
        )
        if not content.strip():
            raise ValueError("Empty Gemini response")
        return content
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
        raise GenerationError("تعذّر الاتصال بـ Gemini أو قراءة استجابته. حاول لاحقًا.") from exc


def parse_draft(content: str, count: int) -> Draft:
    content = content.strip()
    if content.startswith("```"):
        match = re.fullmatch(r"```(?:json)?\s*\n(.*?)\n?```", content, re.DOTALL)
        if not match:
            raise ValueError("Malformed JSON fence")
        content = match.group(1)
    draft = Draft.model_validate_json(content)
    if len(draft.verses) != count:
        raise ValueError("Wrong verse count")
    return draft


async def generate(request: GenerateRequest, settings: Settings) -> dict:
    messages = initial_messages(request)
    best = None
    best_rank = (-1, -1, -1.0)
    best_draft = None
    best_report = None
    for attempt in range(request.max_revisions + 1):
        try:
            content = await complete(messages, settings)
        except GenerationError as exc:
            if best is None:
                raise
            best["revision_warning"] = str(exc)
            best["analysis"]["note"] += " تعذّرت متابعة المراجعة؛ نعرض أفضل مسوّدة مكتملة."
            break
        messages.append({"role": "assistant", "content": content})
        try:
            draft = parse_draft(content, request.verse_count)
        except (ValueError, ValidationError):
            messages.append(
                {"role": "user", "content": "أعد JSON صالحًا فقط بالعدد المطلوب من الأبيات."}
            )
            continue
        if best_draft is not None:
            draft = merge_revision(best_draft, draft, best_report)
        report = analyze(draft.verses, request.meter, request.rawi)
        rank = (
            sum(v["is_valid"] and v["rawi_matches"] for v in report["verses"]),
            sum(v["rawi_matches"] for v in report["verses"]),
            report["average_score"],
        )
        if rank > best_rank:
            best_rank = rank
            best_draft, best_report = draft, report
            best = {
                **draft.model_dump(),
                "analysis": report,
                "provider": settings.provider,
                "model": settings.model,
            }
        if report["accepted"]:
            break
        # Repair the strongest draft, with compact feedback and no growing history.
        messages = repair_messages(request, best_draft, best_report)
    if best is None:
        raise GenerationError("لم يُرجع المزوّد قصيدة بالصيغة المطلوبة. حاول مجددًا.")
    best["attempts"] = attempt + 1
    return best
