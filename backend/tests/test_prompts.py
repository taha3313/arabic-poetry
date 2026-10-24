import json
from pathlib import Path

import pytest

from app.schemas import Draft, GenerateRequest
from app.services.prompts import (
    editable_parts,
    initial_messages,
    merge_revision,
    meter_reference,
    repair_messages,
)
from app.services.prosody import METER_KEYS, analyze, processor

ALEPPO = Draft.model_validate_json(
    (Path(__file__).parent / "fixtures/aleppo-draft.json").read_text()
)
REQUEST = GenerateRequest(topic="حب مكتوم في حلب", meter="baseet", rawi="م", verse_count=4)


def test_reported_draft_targets_only_second_sadr():
    report = analyze(ALEPPO.verses, "baseet", "م")
    assert sum(row["is_valid"] and row["rawi_matches"] for row in report["verses"]) == 3
    messages = repair_messages(REQUEST, ALEPPO, report)
    feedback = json.loads(messages[-1]["content"])
    assert len(feedback["issues"]) == 1
    issue = feedback["issues"][0]
    assert issue["verse_number"] == 2
    assert issue["editable_parts"] == ["sadr"]
    assert issue["scansion"]["sadr"]["actual_pattern"]
    assert any(foot["status"] != "ok" for foot in issue["scansion"]["sadr"]["feet"])
    assert "PyArud" in feedback["task"]


def test_model_cannot_rewrite_locked_halves_or_title():
    report = analyze(ALEPPO.verses, "baseet", "م")
    candidate = Draft(title="عنوان مختلف", verses=[{"sadr": "صَدْرٌ آخَرُ", "ajuz": "عَجُزٌ آخَرُ"}] * 4)
    merged = merge_revision(ALEPPO, candidate, report)
    assert merged.title == ALEPPO.title
    assert merged.verses[1].sadr == candidate.verses[1].sadr
    for i in range(4):
        assert merged.verses[i].ajuz == ALEPPO.verses[i].ajuz
        if i != 1:
            assert merged.verses[i].sadr == ALEPPO.verses[i].sadr


def test_wrong_rawi_does_not_unlock_sound_sadr():
    row = analyze([ALEPPO.verses[0]], "baseet", "ل")["verses"][0]
    assert row["is_valid"] and not row["rawi_matches"]
    assert editable_parts(row) == ["ajuz"]


def test_incompatible_pair_can_revise_both_individually_sound_halves():
    row = {
        "is_valid": False,
        "rawi_matches": True,
        "sadr": {"is_valid": True},
        "ajuz": {"is_valid": True},
    }
    assert editable_parts(row) == ["sadr", "ajuz"]


@pytest.mark.parametrize("meter", sorted(METER_KEYS))
def test_prompt_reference_uses_compatible_registered_meter_pair(meter):
    reference = meter_reference(meter)
    pair = (reference["reference_sadr"]["pattern"], reference["reference_ajuz"]["pattern"])
    assert pair in processor.precomputed_patterns[meter]["pairs"]
    assert reference["reference_sadr"]["feet"]
    assert reference["reference_ajuz"]["feet"]


def test_composition_prompt_has_prosody_and_meaning_constraints():
    messages = initial_messages(REQUEST)
    brief = json.loads(messages[-1]["content"])
    assert brief["verse_count"] == 4
    assert brief["rawi"] == "م"
    assert brief["meter"]["reference_sadr"]["feet"] == ["مستفعلن", "فاعلن", "مستفعلن", "فعلن"]
    assert "الإعراب" in messages[0]["content"]
    assert "لا تنقل أبياتًا محفوظة" in messages[0]["content"]
    assert "max_revisions" not in brief


def test_generation_repairs_one_half_and_rejects_unrequested_rewrites(monkeypatch):
    import asyncio

    from app.core import Settings
    from app.services import generator

    candidate = ALEPPO.model_copy(deep=True)
    candidate.title = "لا ينبغي تغيير العنوان"
    candidate.verses[0].sadr = "تَغْيِيرٌ غَيْرُ مَطْلُوبٍ"
    candidate.verses[1].sadr = "يَا ظَبْيَةً هَاجَنِي مِنْ طِيبِهَا أَرَجٌ"
    candidate.verses[1].ajuz = "تَغْيِيرٌ غَيْرُ مَطْلُوبٍ"
    outputs = iter([ALEPPO.model_dump_json(), candidate.model_dump_json()])
    calls = []

    async def complete(messages, settings):
        calls.append(messages)
        return next(outputs)

    monkeypatch.setattr(generator, "complete", complete)
    result = asyncio.run(generator.generate(REQUEST, Settings(_env_file=None)))
    assert result["analysis"]["accepted"]
    assert result["attempts"] == 2
    assert len(calls) == 2
    assert result["title"] == ALEPPO.title
    assert result["verses"][1]["sadr"] == candidate.verses[1].sadr
    for i in range(4):
        assert result["verses"][i]["ajuz"] == ALEPPO.verses[i].ajuz
        if i != 1:
            assert result["verses"][i]["sadr"] == ALEPPO.verses[i].sadr
