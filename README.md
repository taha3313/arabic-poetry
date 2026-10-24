# قافية · Qafiya

Arabic Poetry Workshop · [qafiya.tahachelly.com](https://qafiya.tahachelly.com)

An Arabic poetry workshop: describe a theme, select a classical meter and rawi,
then generate an عمودي draft with two hemistichs per verse. PyArud scans the
result and feeds meter/rhyme problems back to the model for bounded revision.
Unresolved drafts stay visibly marked as needing review. Repairs target failing
hemistichs; the backend preserves sound text. See [prompt design and regression
evidence](docs/PROMPTS.md).

## Structure

Mirrors Quranic Shazam's split application layout:

- `backend/app`: FastAPI, settings, request schemas and service layer.
- `frontend/src`: React 19 + TypeScript + Vite, Arabic RTL interface.
- `backend/tests`: actual PyArud checks and mocked provider workflow tests.
- Docker Compose, Makefile, dependency locks and GitHub Actions CI.

Python **3.12+** is required by PyArud 1.0.0 package metadata (its README says
3.10+, but that is not the installed package constraint). Node 22.12+ or 24
and `uv` are recommended.

## Run locally

```bash
make setup
cp backend/.env.example backend/.env
# Terminal 1
make backend
# Terminal 2
make frontend
```

Open http://localhost:5173. With no API key, try the labelled Imru' al-Qais
example or paste verses in “فحص أبياتي”. Its default automatic tashkeel fills
missing marks locally with a bundled 4.8 MB ONNX model. Supplied vowels remain
authoritative; uncheck “إكمال التشكيل تلقائيًا” to scan the original text.
Analysis makes no LLM call. The 512 MiB constrained memory test peaked near
145 MiB process RSS; see [tashkeel evidence](docs/TASHKEEL.md).

To generate, edit `backend/.env`. Key/model changes are reloaded on the next
request; no backend restart is needed. Changes to startup settings such as CORS
still require a restart:

```dotenv
PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_THINKING_LEVEL=medium
```

The local live checks selected Gemini 3.5 Flash: two poems across الكامل and
الطويل passed the automatic checks. Newer 3.6/3.8 Flash endpoints were overloaded
or timed out during this session. See [live evidence](docs/GEMINI.md).

Gemini uses the native `generateContent` API with JSON Schema output. Gemini 3
models receive the configured reasoning level (`low`, `medium`, `high`). The
key is sent in the `x-goog-api-key` header. Blank environment values use defaults.

Google's free tier is **quota-limited**, not unlimited. Exact RPM, TPM and daily
allowances are project/model-specific; the model list does not establish free
quota or endpoint availability. Check [AI Studio](https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit),
[rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits) and
[pricing](https://ai.google.dev/gemini-api/docs/pricing). Free-tier prompts may be
used to improve Google's products. A billable project may charge for the same
model; this application does not change your billing plan or enable billing.
No automatic switch to a different model or provider is performed.

Alternatively choose `PROVIDER=openrouter`, set `OPENROUTER_API_KEY`, and use
`OPENROUTER_MODEL=openrouter/free` or a named `:free` model.
Choose `PROVIDER=groq`, set `GROQ_API_KEY`, and optionally override
`GROQ_MODEL` (default `openai/gpt-oss-120b`). Credentials are never sent to the
frontend. OpenRouter accepts only `openrouter/free` or a `:free` model here,
preventing accidental selection of its paid routes. Groq account quotas and
billing configuration remain provider-controlled. No silent provider fallback.
Free quotas, availability and supported models change; verify your dashboard.

Provider choices come from the requested
[awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis) list.
Official API references: [Gemini](https://ai.google.dev/gemini-api/docs), [Groq](https://console.groq.com/docs/overview),
[OpenRouter](https://openrouter.ai/developers).
Prompts and draft poetry are sent to the configured provider during generation.

## How validation works

1. Require JSON with title and the exact requested number of صدر/عجز pairs.
2. Scan each verse against the selected full meter using
   [PyArud](https://github.com/cnemri/pyarud) `analyze_poem`.
3. Compare every detected rawi to the requested letter.
4. Feed the report back for at most two revisions by default (API maximum 3).
5. Keep the draft with the most verses matching both constraints, then rhyme
   matches, then meter similarity. Stop early if all verses pass.

The UI displays actual feet, binary scansion and verse-level flags. The engine's
similarity score is not a probability of poetic correctness. Vocalization and
pronunciation matter; PyArud acceptance does not certify grammatical quality,
meaning, originality or all classical rhyme rules. Rawi matching alone is not
full qafiyah validation. Expert Arabic prosody review and a larger benchmark are
needed before claiming reliable موزون generation.

## API

- `GET /health`: process health.
- `GET /api/config`: meters, provider/model names and whether a key is configured.
- `POST /api/analyze`: `{verses:[{sadr,ajuz}],meter:"taweel",rawi:"ل",auto_tashkeel:true}`.
- `POST /api/generate`: `{topic,meter,rawi,verse_count,max_revisions}`.
- Interactive schema: http://localhost:8000/docs.

Inputs are bounded to 8 verses, 240 characters per hemistich, 500 per topic.
Generation uses 75-second provider timeouts per attempt; 429 errors are surfaced
without automatic quota retries. Gemini retries temporary 503/504 overload once
with a short delay. If a revision fails after a completed draft, the draft is
returned with a warning rather than lost. A configured key is not proof that the provider is live.

## Checks and containers

```bash
make test
make build
cd backend && uv run ruff check .
# From repository root, after creating backend/.env:
docker compose up --build
```

Compose serves the frontend on port 5173 and proxies `/api` to the backend.
For separate hosting, set `VITE_API_BASE_URL` at frontend build time and
`CORS_ORIGINS` as a JSON list on the backend. This is a local MVP; public hosting
still needs request quotas and abuse controls before exposing your shared key.
No deployment has been performed.

The frontend follows the requested
[UX/UI Agent Skills](https://github.com/plugin87/ux-ui-agent-skills) editorial,
RTL and accessibility guidance. See `docs/DESIGN.md` for design decisions and
`docs/VERIFICATION.md` for measured results and remaining checks.

### Al-Diwan input evaluation

The original [Al-Diwan QA](docs/ALDIWAN-QA.md) found 2/12 meter matches on
partially vocalized pasted text. Local automatic completion now improves that
to 10/12 on the same sample; fully bare input still only reaches 2/12. See
[the tashkeel report](docs/TASHKEEL.md) before treating a failed check as a broken
verse. Fixtures and browser replay scripts are included for regression work.

## Hosting preparation

See [deployment configuration and approval boundaries](docs/DEPLOYMENT.md) for
GitHub CI, Cloudflare Pages build settings, and the free-plan Render Blueprint.
The hosted configuration starts with generation disabled; local defaults remain
enabled when a provider key is configured. No remote publication or deployment
has been performed.
