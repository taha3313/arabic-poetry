# Verification · 2026-10-24

## Application checks

- `cd backend && uv run pytest`: **18 passed**. Real PyArud sample scansion and
  rawi mismatch; input bounds; missing-key behavior; revision feedback and early
  success; malformed output/fences/count; rate limits; strongest-draft retention.
- `cd backend && uv run ruff check .`: passed.
- `cd frontend && npm run build`: TypeScript and Vite production build passed.
- `docker compose config --quiet`: passed. Container images were not built.
- Browser smoke checks against the running FastAPI/Vite app passed: labelled
  sample, expand scansion, change rawi and reanalyze, download action, malformed
  input feedback, mode switching, generation disabled without a key.
- No browser page errors during smoke checks. Document width matched viewport
  at 280, 320, 390, 414, 760 and 1280px with root font enlarged to 20px.

## Requested UX/UI kit

Applied https://github.com/plugin87/ux-ui-agent-skills editorial, mobile-first,
RTL, semantic theme and accessibility guidance. Used actual rendered HTML
snapshots of the app for the kit's individual checks. A temporary copy of its
scripts changed only the browser launch channel from system Chrome to the
already installed Playwright Chromium. No changes to the measurement logic.

Actual gate output:

```text
verify_responsive: OK — 2 file(s), no horizontal overflow at 280/320/414px @ 1.25x root font
Checked 29 element-state(s) in empty.html
OK: every interactive element passes WCAG AA in default, hover, and focus.
Checked 32 element-state(s) in result.html
OK: every interactive element passes WCAG AA in default, hover, and focus.
OK empty.html — no measurable taste slop (type 6.3x, 1 hues)
```

The slop heuristic reported one medium finding: a single shadow style. That
shadow is used only on the selected mode segment; the flat manuscript/layout
is intentional, with no overlays requiring elevation. The first taste check
flagged a long paragraph; the text measure was constrained and rechecked.

An independent critic reviewed desktop and phone screenshots and live controls.
Initial verdict: rework for result discoverability, small scansion target and
small explanatory labels. Fixed all three: mobile results scroll into view
with reduced-motion support, completion is announced, scansion control is
explicit and larger, foot labels are 12px and explanatory notes 13px. Focused
live recheck verdict: **ship**, with no remaining actionable findings.

The kit's full `accuracy_report.mjs` was **not run**: it verifies the upstream
kit's own tokens, templates and demo harnesses, not this application's React
UI. No aggregate N/N result, full WCAG certification, axe audit, dark theme or
full DTCG/token conformance is claimed. Individual snapshot contrast checks
cover measured text states, not all accessibility requirements.

Screenshots: `desktop.png`, `scansion.png`, `mobile.png`.

## Remaining limits

- Live Gemini generation is now verified on two two-verse samples using the
  existing key. All four verses passed meter and rawi checks. See `GEMINI.md`
  for model availability, evidence and limits. Unit provider tests remain mocked
  and the samples do not establish general poetic quality.
- PyArud package 1.0.0 accepts the supplied fully vocalized Imru' al-Qais sample
  on `taweel` and identifies rawi ل. A wrong requested rawi correctly fails.
- Meter acceptance and rawi equality are machine checks, not expert
  certification or complete classical qafiyah validation.
- One upstream TestClient deprecation warning about httpx/httpx2; tests pass.
- No remote repository, deployment, public endpoint quotas or authentication
  were configured. Docker runtime and CI execution on GitHub remain unverified.

The smoke script is saved at `frontend/scripts/smoke.mjs`. It requires both
servers running, no provider key, and a local `playwright` installation plus
Chromium (`npm install --no-save --package-lock=false playwright` then
`npx playwright install chromium`, from frontend). Run `node scripts/smoke.mjs`
from frontend. It refreshes the screenshots. `BAYT_URL` can override the URL.
Playwright is not a runtime dependency.

## Al-Diwan follow-up

The subsequent real-form QA used six source-linked poems across five meters:
22 browser cases, no page errors and no LLM calls. Partial source text matched
meter for 2/12 verses; editorially fully vocalized opening controls matched 6/6;
unvocalized text matched 0/12. The complete backend suite now has **27 passing
tests**. See `ALDIWAN-QA.md` for provenance, source links, limitations and results.

## Lightweight ONNX tashkeel follow-up

Automatic completion now uses libtashkeel's bundled 4.8 MB ONNX model through
a CPU-only adapter. 18 new browser cases show 10/12 meter matches on partial
source text (baseline 2/12), and 2/12 on fully bare text. A full-app, concurrent
workload passed under Docker's 512 MiB / 0.1 CPU cap, with 144.89 MiB peak process
RSS and no OOM. Entire backend suite: **38 passed**; production frontend build
and Ruff pass. See `TASHKEEL.md` for provenance, exact evidence and limitations.

## Targeted poetry repair follow-up

Backend: **67 tests passed**, Ruff check and format passed. Frontend production
build passed. Coverage includes the user's four-verse Aleppo regression, all
16 meter references, and enforced preservation of sound hemistichs. Live Gemini
repair remained at 3/4 accepted; a separately labelled manual control reaches
4/4. See `PROMPTS.md`; neither result establishes general generation quality.

## Deployment preparation · 2026-10-24

Backend suite: **73 passed**; Ruff lint and format checks pass. Frontend locked
install and production build pass with an external API origin embedded; Pages
headers are included in `dist`. Render Blueprint passes the current public JSON
schema. Render CLI/platform-aware validation and GitHub-hosted CI remain pending.
Private dotenv values were checked against publication candidates without printing
values; no matches. Compose validates with the secret-free example env file; the
existing private file is preserved despite Compose parser incompatibility.

See `DEPLOYMENT.md` for concrete build/runtime settings and unresolved publication
decisions. No provider requests, repository creation/push, cloud resource changes,
live deployment, billing activation or DNS changes were performed.

The actual production Docker image now builds successfully with uv 0.9.0 and
frozen Python 3.12 dependencies. `scripts/check-container.sh` passed: offline
full-ASGI model inference and concurrent stress under 512 MiB / 0.1 CPU peaked at
**142.55 MiB process RSS** (cgroup peak 109,764,608 bytes), with no OOM. A second
container verified real Uvicorn port binding, health, CORS and JSON preflight,
disabled generation, non-root execution, absence of `.env`, and absence of
heavyweight/GPU ML packages. Evidence: `evals/deployment-container-memory.json`.
This supersedes the earlier production-image verification gap, but does not
establish live Render behavior or safety under arbitrary public traffic.

## Qafiya public deployment · 2026-10-24

User-authorized deployment is live at https://qafiya.tahachelly.com, renamed
**قافية · Qafiya**. Cloudflare domain and TLS validation are active. Render's
free Frankfurt Docker service is live. All three GitHub CI jobs passed on both
application commits. Browser checks passed sample analysis, displayed meter and
rawi results, expandable scansion, and a real cross-origin CPU ONNX analysis
request with HTTP 200. The browser viewport/content widths were both 780px in
this check. No provider generation request was made; generation stays disabled.

See `DEPLOYMENT.md` for resource/deploy IDs, default TCP health-check limitation,
and operational settings. Live screenshot: `qafiya-live.png`.
