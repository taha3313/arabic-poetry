"""Opt-in live repair of the user-reported draft; at most two model requests."""

import asyncio
import json
import time
from pathlib import Path

from app.core import get_settings
from app.schemas import Draft, GenerateRequest
from app.services.generator import GenerationError, complete, parse_draft
from app.services.prompts import merge_revision, repair_messages
from app.services.prosody import analyze


async def main():
    root = Path(__file__).resolve().parents[1]
    original = Draft.model_validate_json((root / "tests/fixtures/aleppo-draft.json").read_text())
    request = GenerateRequest(
        topic="حب مكتوم لامرأة من حلب، مع الحفاظ على صور القصيدة المرفقة",
        meter="baseet",
        rawi="م",
        verse_count=4,
    )
    best = original
    report = analyze(best.verses, request.meter, request.rawi)
    output = {
        "request_note": "Topic reconstructed from pasted draft; original topic unavailable.",
        "before": original.model_dump(),
        "before_analysis": report,
        "trials": [],
    }
    print(
        "Initial valid verses:",
        sum(v["is_valid"] and v["rawi_matches"] for v in report["verses"]),
        flush=True,
    )
    for attempt in range(2):
        started = time.monotonic()
        try:
            messages = repair_messages(request, best, report)
            content = await complete(messages, get_settings())
            candidate = merge_revision(best, parse_draft(content, 4), report)
            updated = analyze(candidate.verses, request.meter, request.rawi)
            trial = {
                "attempt": attempt + 1,
                "seconds": round(time.monotonic() - started, 2),
                "draft": candidate.model_dump(),
                "analysis": updated,
            }
            output["trials"].append(trial)
            print(
                json.dumps(
                    {
                        "attempt": attempt + 1,
                        "seconds": trial["seconds"],
                        "accepted": updated["accepted"],
                        "repaired_sadr": candidate.verses[1].sadr,
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            old_rank = (
                sum(v["is_valid"] and v["rawi_matches"] for v in report["verses"]),
                report["average_score"],
            )
            new_rank = (
                sum(v["is_valid"] and v["rawi_matches"] for v in updated["verses"]),
                updated["average_score"],
            )
            if new_rank > old_rank:
                best, report = candidate, updated
            if report["accepted"]:
                break
        except GenerationError as exc:
            output["trials"].append(
                {
                    "error": str(exc),
                    "status": exc.status,
                    "cause_type": type(exc.__cause__).__name__,
                    "upstream_status": getattr(
                        getattr(exc.__cause__, "response", None), "status_code", None
                    ),
                }
            )
            print("Provider failure:", str(exc), flush=True)
            break
    output["best"] = best.model_dump()
    output["best_analysis"] = report
    output["preserved_other_halves"] = all(
        getattr(original.verses[i], part) == getattr(best.verses[i], part)
        for i in range(4)
        for part in ["sadr", "ajuz"]
        if (i, part) != (1, "sadr")
    )
    path = root.parent / "docs/evals/aleppo-targeted-repair.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(
        "Final accepted:",
        report["accepted"],
        "preserved other halves:",
        output["preserved_other_halves"],
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
