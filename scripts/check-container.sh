#!/usr/bin/env bash
# Offline production-image checks. No provider keys or network access.
set -euo pipefail
image=${1:-bayt-api:local}
root=$(cd "$(dirname "$0")/.." && pwd)
name="bayt-check-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
# Exercise the installed production dependencies and bundled model under the cap.
docker run --name "$name" --memory=512m --memory-swap=512m --cpus=0.1 --network=none \
  -e GENERATION_ENABLED=false \
  -v "$root/backend/scripts:/app/scripts:ro" \
  -v "$root/backend/tests/fixtures:/app/tests/fixtures:ro" \
  "$image" python -m scripts.memory_smoke
[ "$(docker inspect -f '{{.State.OOMKilled}}' "$name")" = false ]
docker rm "$name" >/dev/null
# Verify the real server honors Render's PORT and exact-origin CORS.
docker run -d --name "$name" --memory=512m --memory-swap=512m --network=none \
  -e PORT=10000 -e GENERATION_ENABLED=false \
  -e 'CORS_ORIGINS=["https://bayt.example.com"]' "$image" >/dev/null
for attempt in {1..45}; do
  if docker exec "$name" python -c 'import urllib.request; assert urllib.request.urlopen("http://127.0.0.1:10000/health").status == 200' 2>/dev/null; then
    break
  fi
  sleep 1
done
docker exec -i "$name" python - <<'PY'
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
assert os.getuid() != 0, 'Production image must run as a non-root user'
assert not Path('/app/.env').exists(), 'Local .env must not enter the image'
base = 'http://127.0.0.1:10000'
assert json.load(urllib.request.urlopen(base + '/health')) == {'status': 'ok'}
assert json.load(urllib.request.urlopen(base + '/api/config'))['generation_available'] is False
for origin, allowed in [('https://bayt.example.com', True), ('https://other.example.com', False)]:
    request = urllib.request.Request(base + '/api/config', headers={'Origin': origin})
    with urllib.request.urlopen(request) as response:
        assert (response.headers.get('Access-Control-Allow-Origin') == origin) == allowed
# Exercise the browser's JSON preflight as well as a simple GET.
request = urllib.request.Request(base + '/api/analyze', method='OPTIONS', headers={
    'Origin': 'https://bayt.example.com',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
})
with urllib.request.urlopen(request) as response:
    assert response.headers['Access-Control-Allow-Origin'] == 'https://bayt.example.com'
for package in ['torch', 'transformers', 'tensorflow', 'onnxruntime-gpu']:
    try:
        metadata.version(package)
    except metadata.PackageNotFoundError:
        continue
    raise AssertionError(f'Unexpected dependency: {package}')
print('Production server: health, PORT, CORS, generation disabled, CPU dependencies passed')
PY
