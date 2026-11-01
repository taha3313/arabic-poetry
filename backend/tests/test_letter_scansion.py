import json
from pathlib import Path

from app.schemas import Verse
from app.services.letter_scansion import add_letter_scansion
from app.services.prosody import analyze, detect


def test_default_verse_letters_cover_every_foot_in_check_and_detection():
    example = json.loads(
        (Path(__file__).parents[2] / "frontend/src/data/poetry-examples.json").read_text()
    )[0]
    verses = [Verse(**verse) for verse in example["verses"]]
    for report in (analyze(verses, "taweel", "م"), detect(verses, False)):
        for part in ("sadr", "ajuz"):
            scan = report["verses"][0][part]
            assert scan["letter_alignment"]["available"]
            cells = [letter for foot in scan["feet"] for letter in foot["letters"]]
            assert "".join(cell["symbol"] for cell in cells) == scan["pattern"]
            assert [cell["position"] for cell in cells] == list(range(len(scan["pattern"])))
            assert "".join(cell["letter"] for cell in cells) == "".join(scan["arudi_text"].split())
            for foot in scan["feet"]:
                assert "".join(cell["symbol"] for cell in foot["letters"]) == foot["actual_segment"]


def test_ambiguous_letter_count_never_gets_a_guessed_alignment():
    row = {
        "sadr": {
            "arudi_text": "مهاا",
            "pattern": "110",
            "feet": [
                {"actual_segment": "110", "status": "ok"},
            ],
        }
    }
    scan = add_letter_scansion(row)["sadr"]
    assert not scan["letter_alignment"]["available"]
    assert scan["feet"][0]["letters"] == []
    assert scan["feet"][0]["pronounced_segment"] is None


def test_missing_and_extra_feet_preserve_letter_offsets():
    row = {
        "sadr": {
            "arudi_text": "ف عو",
            "pattern": "110",
            "feet": [
                {"actual_segment": "11", "status": "broken"},
                {"actual_segment": "MISSING", "status": "missing"},
                {"actual_segment": "0", "status": "extra_bits"},
            ],
        }
    }
    feet = add_letter_scansion(row)["sadr"]["feet"]
    assert feet[0]["pronounced_segment"] == "فع"
    assert feet[1]["letters"] == []
    assert feet[2]["letters"] == [{"letter": "و", "symbol": "0", "position": 2}]


def test_inconsistent_foot_boundaries_are_not_aligned():
    row = {
        "sadr": {
            "arudi_text": "ف عو",
            "pattern": "110",
            "feet": [
                {"actual_segment": "101", "status": "broken"},
            ],
        }
    }
    assert not add_letter_scansion(row)["sadr"]["letter_alignment"]["available"]


def test_shadda_and_tanween_expansions_are_preserved():
    examples = json.loads(
        (Path(__file__).parents[2] / "frontend/src/data/poetry-examples.json").read_text()
    )
    example = next(item for item in examples if item["id"] == "imru-alqais")
    report = analyze([Verse(**verse) for verse in example["verses"]], "taweel", "ل")
    for part, pronounced in (("sadr", "حبيبن"), ("ajuz", "دد")):
        scan = report["verses"][0][part]
        assert scan["letter_alignment"]["available"]
        letters = "".join(cell["letter"] for foot in scan["feet"] for cell in foot["letters"])
        assert pronounced in letters
