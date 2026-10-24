import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import Verse
from app.services.prosody import analyze_with_tashkeel
from app.services.tashkeel import (
    ASSETS,
    TashkeelUnavailable,
    complete_text,
    get_vocalizer,
    merge_marks,
    split_marks,
)


def base(text):
    return "".join(char for char, marks in split_marks(text))


def test_real_cpu_model_preserves_text_and_supplied_marks():
    text = "قِفا نبك من ذِكرى حبيب ومنزلِ ١٢٣ ABC، ـ"
    result = complete_text(text)
    assert base(result) == base(text)
    assert result != text
    for (original_char, marks), (new_char, new_marks) in zip(
        split_marks(text), split_marks(result), strict=True
    ):
        assert original_char == new_char
        assert set(marks) <= set(new_marks)
    assert get_vocalizer().session.get_providers() == ["CPUExecutionProvider"]


def test_existing_vowels_and_gemination_are_constraints():
    assert merge_marks("َ", "ُ") == "َ"
    assert merge_marks("ْ", "َّ") == "ْ"
    assert merge_marks("ّ", "ِ") == "ِّ"
    assert merge_marks("ُ", "ُّ") == "ُّ"
    assert merge_marks("ِّ", "َ") == "ِّ"


def test_diacritizer_never_rewrites_already_valid_poetry(monkeypatch):
    from test_workshop import VERSE

    def forbidden(text):
        raise AssertionError("Valid input must not call inference")

    monkeypatch.setattr("app.services.tashkeel.complete_text", forbidden)
    original = Verse(**VERSE)
    report = analyze_with_tashkeel([original], "taweel", "ل")
    assert report["accepted"]
    assert not report["tashkeel"]["changed"]
    assert report["analyzed_verses"] == [original.model_dump()]


def test_tashkeel_improves_partial_source_without_hiding_original():
    from test_aldiwan import POEMS

    poem = POEMS[0]
    client = TestClient(app)
    body = {"verses": poem["as_published"], "meter": poem["meter"], "rawi": poem["rawi"]}
    raw = client.post("/api/analyze", json={**body, "auto_tashkeel": False}).json()
    completed = client.post("/api/analyze", json={**body, "auto_tashkeel": True}).json()
    assert not raw["accepted"]
    assert completed["accepted"]
    assert completed["tashkeel"]["original_verses"] == body["verses"]
    assert completed["tashkeel"]["changed"]
    assert completed["analyzed_verses"] != body["verses"]
    for before, after in zip(body["verses"], completed["analyzed_verses"], strict=True):
        for part in ["sadr", "ajuz"]:
            assert base(before[part]) == base(after[part])


def test_disabled_tashkeel_does_not_load_model(monkeypatch):
    def forbidden():
        raise AssertionError("Disabled must not load model")

    monkeypatch.setattr("app.services.tashkeel.get_vocalizer", forbidden)
    verse = Verse(sadr="هذا كلام عربي", ajuz="هذا كلام آخر")
    report = analyze_with_tashkeel([verse], "taweel", "م", enabled=False)
    assert report["analyzed_verses"] == [verse.model_dump()]
    assert not report["tashkeel"]["enabled"]


def test_model_failure_returns_controlled_error(monkeypatch):
    def fail(text):
        raise TashkeelUnavailable("model unavailable")

    monkeypatch.setattr("app.services.tashkeel.complete_text", fail)
    client = TestClient(app)
    response = client.post(
        "/api/analyze", json={"verses": [{"sadr": "هذا كلام عربي", "ajuz": "هذا كلام آخر"}]}
    )
    assert response.status_code == 503


def test_concurrent_inference_is_consistent_and_bounded():
    inputs = ["اللغة العربية جميلة", "الشعر العربي جميل", "قفا نبك من ذكرى حبيب"]
    expected = [complete_text(text) for text in inputs]
    complete_text.cache_clear()
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert list(pool.map(complete_text, inputs)) == expected
    assert complete_text.cache_info().maxsize == 128


def test_bundled_model_matches_pinned_provenance():
    manifest = json.loads((ASSETS / "PROVENANCE.json").read_text())
    for name, expected in manifest["files"].items():
        data = (ASSETS / name).read_bytes()
        assert hashlib.sha256(data).hexdigest() == expected["sha256"]
    assert (ASSETS / "model.onnx").stat().st_size < 5_000_000


def test_overlength_direct_inference_is_rejected():
    with pytest.raises(TashkeelUnavailable):
        complete_text("ب" * 481)


def test_vocalized_output_may_exceed_input_character_limit():
    text = ("هذا كلام عربي طويل للاختبار فقط " * 10)[:230]
    response = TestClient(app).post(
        "/api/analyze",
        json={
            "verses": [{"sadr": text, "ajuz": text}],
            "auto_tashkeel": True,
        },
    )
    assert response.status_code == 200
    output = response.json()["analyzed_verses"][0]["sadr"]
    assert len(output) > 240
    assert base(output) == text.strip()


def test_padding_predictions_never_insert_model_meta_characters(monkeypatch):
    import numpy as np

    class PaddingSession:
        def run(self, outputs, feed):
            return [np.zeros_like(feed["char_inputs"], dtype=np.uint8)]

    vocalizer = get_vocalizer()
    monkeypatch.setattr(vocalizer, "session", PaddingSession())
    text = "لغة عربية"
    assert vocalizer.complete(text) == text
