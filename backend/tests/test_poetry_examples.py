"""Exercise the actual excerpts shipped in the learner's example selector."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

EXAMPLES = json.loads(
    (Path(__file__).parents[2] / "frontend/src/data/poetry-examples.json").read_text()
)
client = TestClient(app)


@pytest.mark.parametrize("example", EXAMPLES, ids=[item["id"] for item in EXAMPLES])
def test_example_can_be_checked_and_detected(example):
    payload = {"verses": example["verses"], "auto_tashkeel": False}
    checked = client.post(
        "/api/analyze", json={**payload, "meter": example["meter"], "rawi": example["rawi"]}
    )
    detected = client.post("/api/detect", json=payload)
    assert checked.status_code == detected.status_code == 200
    assert detected.json()["meter"] == example["meter"]
    assert checked.json()["analyzed_verses"] == example["verses"]
    assert detected.json()["analyzed_verses"] == example["verses"]
    assert checked.json()["verses"][0]["sadr"]["feet"]
    # Known upstream limits are disclosed next to the two affected excerpts.
    if example["id"] not in {"labid", "harith"}:
        assert checked.json()["accepted"]
        assert detected.json()["detected_rawi"] == example["rawi"]
    else:
        assert example["note_ar"] and example["note_en"]


def test_default_example_analysis_matches_engine():
    """The instant example must stay consistent with the real analysis endpoint."""
    stored = json.loads(
        (Path(__file__).parents[2] / "frontend/src/data/default-analysis.json").read_text()
    )
    example = EXAMPLES[0]
    assert example["id"] == "mutanabbi-azm"
    actual = client.post(
        "/api/analyze",
        json={
            "verses": example["verses"],
            "meter": example["meter"],
            "rawi": example["rawi"],
            "auto_tashkeel": False,
        },
    )
    assert actual.status_code == 200
    assert actual.json() == stored
