from fastapi.testclient import TestClient

from app.main import app
from app.services.tashkeel import TashkeelUnavailable, split_marks

client = TestClient(app)


def test_suggestions_preserve_supplied_vowels_and_letters():
    original = {"sadr": "عَلَى قدر أهل العزم تأتي العزائم", "ajuz": "وتأتي على قدر الكرام المكارم"}
    response = client.post("/api/tashkeel", json={"verses": [original]})
    assert response.status_code == 200
    result = response.json()
    assert result["changed"]
    for part in ("sadr", "ajuz"):
        before, after = split_marks(original[part]), split_marks(result["verses"][0][part])
        assert [char for char, _ in before] == [char for char, _ in after]
        for (_, supplied), (_, suggested) in zip(before, after, strict=True):
            assert set(supplied) <= set(suggested)


def test_suggestion_limits_and_missing_halves():
    assert client.post("/api/tashkeel", json={"verses": []}).status_code == 422
    assert (
        client.post("/api/tashkeel", json={"verses": [{"sadr": "صدر", "ajuz": ""}]}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/tashkeel", json={"verses": [{"sadr": "ا" * 241, "ajuz": "عجز"}]}
        ).status_code
        == 422
    )


def test_suggestion_failure_is_recoverable(monkeypatch):
    def unavailable(_):
        raise TashkeelUnavailable("تعذّر تحميل نموذج التشكيل المحلي.")

    monkeypatch.setattr("app.main.complete_text", unavailable)
    response = client.post(
        "/api/tashkeel", json={"verses": [{"sadr": "صدر البيت", "ajuz": "عجز البيت"}]}
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "تعذّر تحميل نموذج التشكيل المحلي."


def test_reviewed_long_vocalized_text_is_not_rewritten(monkeypatch):
    def forbidden(_):
        raise AssertionError("Reviewed text must not be vocalized a second time")

    monkeypatch.setattr("app.services.tashkeel.complete_text", forbidden)
    verse = {"sadr": "بَ" * 121, "ajuz": "تُ" * 121}
    for endpoint, targets in (("analyze", {"meter": "taweel", "rawi": "م"}), ("detect", {})):
        response = client.post(
            f"/api/{endpoint}", json={"verses": [verse], "auto_tashkeel": False, **targets}
        )
        assert response.status_code == 200
        assert response.json()["analyzed_verses"] == [verse]
