"""Offline controls tied to attributed Al-Diwan excerpts, not generated poems."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

POEMS = json.loads((Path(__file__).parent / "fixtures/aldiwan.json").read_text())
client = TestClient(app)


@pytest.mark.parametrize("poem", POEMS, ids=[poem["id"] for poem in POEMS])
def test_vocalized_aldiwan_opening_matches_meter_and_rawi(poem):
    response = client.post(
        "/api/analyze",
        json={
            "verses": poem["vocalized_control"],
            "meter": poem["meter"],
            "rawi": poem["rawi"],
        },
    )
    assert response.status_code == 200
    report = response.json()
    assert report["accepted"]
    assert all(v["is_valid"] and v["rawi_matches"] for v in report["verses"])
    assert report["verses"][0]["sadr"]["feet"]
    assert report["verses"][0]["ajuz"]["feet"]


@pytest.mark.parametrize("change", ["wrong_meter", "wrong_rawi", "extra_words"])
def test_aldiwan_negative_controls(change):
    poem = POEMS[0]
    verse = dict(poem["vocalized_control"][0])
    meter, rawi = poem["meter"], poem["rawi"]
    if change == "wrong_meter":
        meter = "kamel"
    elif change == "wrong_rawi":
        rawi = "م"
    else:
        verse["sadr"] += " وَهَذَا كَلَامٌ زَائِدٌ"
    report = client.post(
        "/api/analyze",
        json={
            "verses": [verse],
            "meter": meter,
            "rawi": rawi,
        },
    ).json()
    assert not report["accepted"]
    if change == "wrong_rawi":
        assert report["verses"][0]["is_valid"]
        assert not report["verses"][0]["rawi_matches"]
