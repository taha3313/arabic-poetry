# Gemini integration and live checks · 2026-10-24

Configured the existing local `GEMINI_API_KEY` in `backend/.env`, without
copying it into any tracked file or sending it to the browser. Current default:

```dotenv
PROVIDER=gemini
GEMINI_MODEL=gemini-3.5-flash
GEMINI_THINKING_LEVEL=medium
```

## Selection evidence

The live model-list endpoint accepted the key and listed all models below.
Listing a model is not proof that generation works, nor proof of free quota.

| Model | Live result in this session |
| --- | --- |
| Gemini 3.8 Flash | Poetry requests timed out at 75 seconds with high and medium reasoning. |
| Gemini 3.6 Flash | A minimal request succeeded; poetry requests returned HTTP 503, including after one retry. |
| Gemini 3.5 Flash | Two separate two-verse poems completed and passed the configured PyArud checks. |
| Gemini 2.5 Flash / Pro | Generation returned HTTP 404 despite appearing in model listing. |

Selected **3.5 Flash with medium reasoning** for demonstrated availability and
successful generation in this session. This is not a general comparative
quality ranking: the newer models did not produce completed poems to compare.
There is no automatic fallback or billing-plan change.

## Successful samples

1. Hope after hardship, الكامل, rawi م: 2/2 verses matched meter and rawi on
   attempt 1; 38.47 seconds for the generation-and-analysis call. Saved in
   `evals/gemini-3.5-flash-retry.json`.
2. Nostalgia for a city, الطويل, rawi م: generated through the actual browser
   form and `/api/generate`. 2/2 verses matched meter and rawi on attempt 1.
   Saved in `evals/gemini-ui-live.json`; screenshot `gemini-live.png`.

The engine's score was 0.999 on both samples. That is a matching score, not a
probability, and these four verses do not establish reliable generation across
all meters, themes or lengths. Human linguistic and prosodic review remains
necessary. No originality guarantee is made.

## Limits and free-tier status

There is **no unlimited Gemini API free tier**. Google applies RPM, TPM and
model/project daily limits. A dash in a community table is an unspecified limit,
not infinity. Google directs developers to AI Studio for their active quotas.
The API key/model-list response does not reveal this project's exact quotas or
billing tier; no 1,500-RPD entitlement is claimed or verified here.

References:

- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/pricing
- https://github.com/mnfst/awesome-free-llm-apis

Free-tier prompts may be used by Google to improve products. The application
uses the project's existing API tier and does not enable billing. A model can
be billable when used from a paid project; model selection alone cannot enforce
free-tier billing.

## Implementation and verification

- Native `generateContent` request with JSON Schema and Gemini 3 thinking level.
- API key in `x-goog-api-key`, never a URL/query string or API config response.
- Only completed, non-thought response text is parsed. Empty, blocked or
  truncated responses return controlled errors.
- Temporary 503/504 gets one retry after a one-second delay; quota 429 is not
  automatically retried.
- If a later revision fails, preserve the strongest completed draft and append
  a visible review warning.
- Blank settings such as `CORS_ORIGINS=` fall back to defaults.
- **18 backend tests passed**, plus Ruff. Added native request/role/schema,
  response, error, overload retry, empty-setting and draft-preservation tests.
- Restarted the local backend. `/api/config` reports `provider=gemini`,
  `model=gemini-3.5-flash`, `generation_available=true`.

Opt-in future comparison (consumes live quota):

```bash
cd backend
uv run python -m scripts.compare_gemini --models gemini-3.5-flash gemini-3.6-flash gemini-3.8-flash --thinking medium
```

Reports are saved to `docs/evals/gemini-comparison-latest.json`. The original
high-reasoning comparison failures remain in `evals/gemini-comparison.json`.

## Quota diagnosis follow-up · 2026-10-24

A tiny connectivity request returned HTTP 200, but the subsequent actual poem
request returned a structured daily-quota violation for Gemini 3.5 Flash. A
single real generation check on 3.6 Flash also returned a daily-quota violation.
The active configured model was not changed and billing was not enabled.

Updated error handling now distinguishes daily limits, short request/token
limits (including supplied RetryInfo delays), zero quota and unspecified 429s.
It never prints raw upstream error messages or credentials and does not retry
429 responses. Five additional tests cover these cases; 43 backend tests pass.
Analysis and local ONNX tashkeel remain available without Gemini quota.

Google documents daily reset at midnight Pacific time, which on 2026-10-25 is
08:00 in Africa/Tunis. This is the documented schedule, not a guarantee of this
project's next successful request. Active quotas remain visible in AI Studio.

## Key reload follow-up · 2026-10-24

The current file key passed Google access checks and a real request through the
running backend generated two accepted verses in 17.16 seconds (HTTP 200,
Gemini 3.5 Flash, one attempt). This establishes that the new key was working at
test time; a tiny connectivity success alone is not proof of available quota.

Settings previously cached the first loaded `.env` indefinitely, and Uvicorn's
Python-file watcher does not reliably reload `.env` changes. Settings now use
an absolute backend `.env` path and invalidate the one-entry cache when that
file's modification time/size changes. Future key/model edits apply on the next
request. CORS middleware is created at startup and still needs a restart for
CORS changes. Two regression tests cover key replacement and file creation.
