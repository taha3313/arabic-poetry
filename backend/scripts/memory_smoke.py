"""Offline full-app workload; run inside a container with --memory=512m."""

import json
import resource
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import uvicorn  # noqa: F401 - include server import footprint
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
poems = json.loads(
    (Path(__file__).resolve().parents[1] / "tests/fixtures/aldiwan.json").read_text()
)
started = time.monotonic()
results = []
for poem in poems:
    body = {"verses": poem["as_published"], "meter": poem["meter"], "rawi": poem["rawi"]}
    response = client.post("/api/analyze", json=body)
    assert response.status_code == 200
    data = response.json()
    results.append(
        {
            "id": poem["id"],
            "valid": sum(v["is_valid"] for v in data["verses"]),
            "total": len(data["verses"]),
        }
    )


def stress(index):
    # Distinct near-maximum input lengths force inference, not a cache-only replay.
    words = ("هذا كلام عربي طويل للاختبار فقط " * 10)[:220] + " " + "ب" * (index + 1)
    response = client.post(
        "/api/analyze",
        json={
            "verses": [{"sadr": words, "ajuz": words}] * 8,
            "meter": "taweel",
            "rawi": "م",
        },
    )
    assert response.status_code == 200
    return response.json()["accepted"]


with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(stress, range(4)))

memory = {}
for name in ["memory.max", "memory.peak", "memory.current"]:
    path = Path("/sys/fs/cgroup") / name
    if path.exists():
        value = path.read_text().strip()
        memory[name] = value if value == "max" else int(value)
print(
    json.dumps(
        {
            "results": results,
            "seconds": round(time.monotonic() - started, 3),
            "process_peak_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2),
            "cgroup": memory,
        },
        ensure_ascii=False,
    ),
    flush=True,
)
