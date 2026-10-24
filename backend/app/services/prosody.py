from pyarud import ArudhProcessor

from app.schemas import Verse, VocalizedVerse

processor = ArudhProcessor()
# Expose full classical meters only; PyArud also registers shortened variants.
METERS = [
    {"key": key, "name": meter.name_ar}
    for key, meter in processor.meter_classes.items()
    if "_" not in key
]
METER_KEYS = {item["key"] for item in METERS}


def analyze(verses: list[Verse], meter: str, rawi: str) -> dict:
    report = processor.analyze_poem([(v.sadr, v.ajuz) for v in verses], meter_name=meter)
    rows = []
    for verse in report.verses:
        row = verse.to_dict()
        row["rawi_matches"] = bool(verse.qafiyah and verse.qafiyah.rawi == rawi)
        rows.append(row)
    return {
        "meter": meter,
        "requested_rawi": rawi,
        "meter_name": report.meter_name_ar,
        "average_score": report.average_score,
        "verses": rows,
        "accepted": bool(rows) and all(v["is_valid"] and v["rawi_matches"] for v in rows),
        "note": "فحص آلي يعتمد على التشكيل والنطق؛ لا يغني عن مراجعة عَروضية بشرية.",
    }


def analyze_with_tashkeel(verses: list[Verse], meter: str, rawi: str, enabled: bool = True) -> dict:
    original = analyze(verses, meter, rawi)
    completed = []
    changed = False
    if enabled:
        from app.services.tashkeel import complete_text

        for verse, scan in zip(verses, original["verses"], strict=True):
            # Already meter-valid supplied text is authoritative and is not rewritten.
            if scan["is_valid"]:
                completed.append(verse)
                continue
            updated = VocalizedVerse(sadr=complete_text(verse.sadr), ajuz=complete_text(verse.ajuz))
            completed.append(updated)
            changed = changed or updated != verse
    else:
        completed = verses
    report = analyze(completed, meter, rawi) if changed else original
    report["analyzed_verses"] = [verse.model_dump() for verse in completed]
    report["tashkeel"] = {
        "enabled": enabled,
        "engine": "libtashkeel-onnx-cpu" if enabled else None,
        "changed": changed,
        "original_verses": [verse.model_dump() for verse in verses],
    }
    if changed:
        report["note"] += " أُكمل التشكيل آليًا مع إبقاء حركاتك؛ قد يخطئ النموذج في قراءة الشعر."
    return report
