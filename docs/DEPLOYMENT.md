# Deployment preparation

Prepared for GitHub, Cloudflare Pages (static frontend), and Render (Docker API).
Nothing has been published or deployed. The local repository has no commits or
remote yet. Names below are proposed; URLs containing `example.com` are placeholders.

## GitHub

Choose repository owner/name and visibility before creation or push. Keep `main`
as the production branch. Review all untracked application files before the first
commit. Commit both lockfiles and the bundled ONNX assets/license/provenance.
Do not commit `.env`, provider keys, `.dev.vars`, `.venv`, `node_modules` or build
outputs. `.env.example` contains placeholders only. No project-wide license has
been chosen; the bundled model's MIT license applies to that upstream asset.

CI runs backend tests/Ruff, a frontend production build with an external API
origin, and the actual production Docker image under a 512 MiB memory cap.
It requires no provider or deployment secrets and performs no publication.
GitHub branch protection and required checks must be configured after repository
creation. Hosted CI has not run yet.

## Render API

Review root `render.yaml`, then, only after publication/deployment approval,
connect the GitHub repository and create its Blueprint in the intended workspace.
Connected discovery found `My Workspace`; no workspace was selected or changed.
Confirm workspace and region at creation. No database, disk, GPU or worker service
is needed. The Blueprint uses free compute and disables automatic deploys; initial
Blueprint creation still deploys the service. Do not Apply during preparation.

- Docker context: `backend`; Dockerfile: `backend/Dockerfile`.
- Python 3.12, frozen uv lock, CPU-only ONNX, one Uvicorn process, one BLAS/OMP
  thread, bounded incoming concurrency. Native dependencies are built into the
  image; the 4.8 MB model is bundled, with no runtime model downloads.
- Start binds `0.0.0.0:${PORT:-8000}`. Render's assigned port is honored.
- Health path: `/health`. This checks process health, not provider quota or model
  readiness. Analysis loads ONNX lazily.
- Required initial input: `CORS_ORIGINS` as a JSON array of exact frontend origins,
  for example `["https://bayt.pages.dev"]`. Use the actual allocated Pages URL.
  Add a custom-domain origin only after it is chosen. No wildcard preview origins.
  Restart/redeploy the API after changing CORS.
- `GENERATION_ENABLED=false` is the hosted default. Analysis remains available.
  Keep it false until request quotas/authentication or equivalent abuse controls
  are implemented and reviewed. CORS does not stop direct API clients.
- If later approved, set `GEMINI_API_KEY` privately in Render and enable generation.
  The selected model remains `gemini-3.5-flash`, thinking level `medium`.
  Optional Groq uses `PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL`.
  Do not upload the local `.env` wholesale. No key rotation, quota evasion, billing
  activation or provider fallback is implemented. Environment changes on Render
  take effect after deployment; local `.env` reload behavior does not change that.

Free services may sleep and take time to resume. Generation can involve several
75-second provider calls; this preparation does not establish end-to-end hosting
request timeouts. Check live behavior after an approved deployment. The process
concurrency limit is a capacity guard, not per-user quotas. Public analysis can
still consume finite compute.

## Cloudflare Pages

Use Git integration after approving repository publication and deployment:

| Setting | Value |
| --- | --- |
| Project name | proposed `bayt` (availability unverified) |
| Production branch | `main` |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| `NODE_VERSION` | `24` (also in `.node-version`) |
| `SKIP_DEPENDENCY_INSTALL` | `1` (the build command performs the locked install) |
| `VITE_API_BASE_URL` | actual HTTPS Render origin, without `/api` |

`VITE_*` values are public and embedded at build time: never put provider keys
there. A URL update needs a frontend rebuild. Blank API base is for the local
Vite/nginx proxy only; Pages does not run that proxy. CI uses a reserved example
origin to verify the separate-host build, not as a deployment URL.

Pages serves this client-only app with its default SPA fallback (no `404.html`).
`frontend/public/_headers` supplies basic browser response headers. No Pages
Functions, Cloudflare API token or Wrangler invocation is needed for Git builds.
Disable preview deployments or keep them analysis-only with explicit CORS origins;
never grant access to every `*.pages.dev` site. Git-connected production pushes
can automatically publish, so connect the repository only after approval.

## Local verification

```bash
cd backend
uv sync --frozen
uv run pytest
uv run ruff check .
uv run ruff format --check .
cd ../frontend
npm ci
VITE_API_BASE_URL=https://bayt-api.example.com npm run build
cd ..
docker build -t bayt-api:local backend
bash scripts/check-container.sh bayt-api:local
# Render CLI, when installed/authenticated (validation does not deploy):
render blueprints validate render.yaml
```

The container check runs the real production dependencies, model inference and
concurrent maximum-size analysis requests without network or credentials under
512 MiB / 0.1 CPU. It then checks the real Uvicorn server's health, custom port,
CORS, generation setting and absence of heavyweight ML dependencies. This is a
local workload test, not a guarantee for arbitrary traffic on Render.

After authorized deployment, check `/health`, `/api/config`, browser analysis,
allowed/disallowed CORS, cold start, request duration and memory metrics. Confirm
`generation_available=false` until the shared-key access policy is approved.
Only then consider a separately authorized live generation check, consuming quota.

## References checked during preparation

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages build image](https://developers.cloudflare.com/pages/configuration/build-image/)

## Decisions required before publication

Choose GitHub owner/repository name and public/private visibility; confirm Render
workspace/region and Cloudflare account/project. Choose whether to use platform
subdomains first or a specific custom domain. No DNS changes are prepared or
required for the platform-subdomain path. Explicit approval is still required
for remote publication and live deployment.

The existing private `backend/.env` is accepted by the app's dotenv reader but
is currently rejected by Docker Compose's env-file parser. It was preserved.
To validate Compose without secrets, use
`BAYT_ENV_FILE=./backend/.env.example docker compose config --quiet`.
For local Compose with generation, supply a separately formatted private dotenv
file via `BAYT_ENV_FILE`; keep it ignored. No local secrets are needed for hosting
preparation. The Render CLI is not installed here; public JSON-schema validation
was run instead, so authenticated platform-aware Blueprint validation remains.

Production-image validation completed successfully: 142.55 MiB peak process RSS
under 512 MiB / 0.1 CPU, no OOM, plus the real-server checks above. Raw evidence:
`evals/deployment-container-memory.json`. Local secret audits, 73 backend tests,
Ruff, frontend production build and public Blueprint schema validation pass.

## Authorized publication · 2026-10-24

The user approved public publication/deployment and selected Render's
`My Workspace`. The app is now named **قافية · Qafiya — Arabic Poetry Workshop**.
The chosen custom domain is **https://qafiya.tahachelly.com**.

- Public source: https://github.com/taha3313/arabic-poetry (`main`).
- Cloudflare Pages project: `arabic-poetry`, Git-connected, production branch
  `main`, preview deployments disabled. Actual build settings match the table
  above; API origin is `https://arabic-poetry-api.onrender.com`.
- Render service: `arabic-poetry-api`, ID `srv-dbedube7bikc7384ptf0`, free plan,
  Frankfurt, Docker context `backend`, Dockerfile `backend/Dockerfile`.
  Automatic deploys are disabled; trigger a deploy after updating the backend.
- Render's creation connector does not expose the HTTP health-check setting,
  and the dashboard requires login in the available browser. The created service
  therefore uses Render's default TCP health check. `/health` exists and is
  verified externally; set its HTTP health path to `/health` in Render Settings
  when dashboard access is available. `render.yaml` records the desired path,
  but is a reference rather than an applied Blueprint for this MCP-created service.
- Generation remains disabled and no provider key was copied to either platform.
- CORS permits the exact custom-domain and production Pages origins only.
- Initial GitHub CI passed all three jobs: backend, frontend, production container.

The earlier preparation-only notes are historical. No paid plan was selected.
