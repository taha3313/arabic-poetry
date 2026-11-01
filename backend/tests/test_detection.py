from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
VERSE = {
    "sadr": "قِفَا نَبْكِ مِنْ ذِكْرَى حَبِيبٍ وَمَنْزِلِ",
    "ajuz": "بِسِقْطِ اللِّوَى بَيْنَ الدَّخُولِ فَحَوْمَلِ",
}


def test_detect_without_targets():
    response = client.post("/api/detect", json={"verses": [VERSE], "auto_tashkeel": False})
    assert response.status_code == 200
    report = response.json()
    assert report["meter"] == "taweel"
    assert report["detected_rawi"] == "ل"
    assert report["rhyme_consistent"]
    assert "requested_rawi" not in report
    assert "accepted" not in report


def test_check_keeps_user_targets():
    response = client.post(
        "/api/analyze",
        json={
            "verses": [VERSE],
            "auto_tashkeel": False,
            "meter": "kamel",
            "rawi": "م",
        },
    )
    report = response.json()
    assert response.status_code == 200
    assert report["meter"] == "kamel"
    assert report["requested_rawi"] == "م"
    assert not report["accepted"]


def test_detection_requires_verses():
    assert client.post("/api/detect", json={"verses": []}).status_code == 422
