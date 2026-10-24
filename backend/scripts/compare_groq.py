"""Opt-in live Groq comparison; up to two requests per model and case."""

import asyncio
import json
import time
from pathlib import Path

from app.core import get_settings
from app.schemas import GenerateRequest
from app.services.generator import GenerationError, generate


async def main():
    settings = get_settings()
    cases = [
        GenerateRequest(
            topic="حب مكتوم لامرأة من حلب", meter="baseet", rawi="م", verse_count=2, max_revisions=1
        ),
        GenerateRequest(
            topic="الأمل بعد الشدائد", meter="kamel", rawi="م", verse_count=2, max_revisions=1
        ),
    ]
    results = []
    path = Path(__file__).resolve().parents[2] / "docs/evals/groq-comparison.json"
    for case in cases:
        for model in [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "allam-2-7b",
            "openai/gpt-oss-20b",
        ]:
            start = time.monotonic()
            row = {"model": model, "request": case.model_dump()}
            try:
                result = await generate(
                    case, settings.model_copy(update={"provider": "groq", "groq_model": model})
                )
                row["result"] = result
                report = result["analysis"]
                row["valid_verses"] = sum(
                    v["is_valid"] and v["rawi_matches"] for v in report["verses"]
                )
                print(
                    model,
                    case.meter,
                    "valid",
                    row["valid_verses"],
                    "/2",
                    "score",
                    round(report["average_score"], 3),
                    "warning",
                    result.get("revision_warning"),
                    flush=True,
                )
            except GenerationError as exc:
                row.update(error=str(exc), status=exc.status)
                print(model, case.meter, "error", exc.status, str(exc), flush=True)
            row["elapsed_seconds"] = round(time.monotonic() - start, 2)
            results.append(row)
            path.write_text(
                json.dumps(
                    {
                        "note": "Small live sample; not a general quality benchmark. Same production prompts and bounded repair for each model.",
                        "results": results,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )


if __name__ == "__main__":
    asyncio.run(main())
