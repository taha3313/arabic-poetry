"""Small opt-in live comparison; consumes the configured Gemini project quota."""

import argparse
import asyncio
import json
import time
from pathlib import Path

from app.core import Settings
from app.schemas import GenerateRequest
from app.services.generator import GenerationError, generate


async def evaluate(model: str, thinking: str):
    settings = Settings(provider="gemini", gemini_model=model, gemini_thinking_level=thinking)
    request = GenerateRequest(
        topic="الأمل بعد الشدائد",
        meter="kamel",
        rawi="م",
        verse_count=2,
        max_revisions=1,
    )
    started = time.monotonic()
    try:
        result = await generate(request, settings)
        row = {
            "model": model,
            "seconds": round(time.monotonic() - started, 2),
            "request": request.model_dump(),
            "result": result,
        }
        a = result["analysis"]
        print(
            json.dumps(
                {
                    "model": model,
                    "seconds": row["seconds"],
                    "attempts": result["attempts"],
                    "accepted": a["accepted"],
                    "score": a["average_score"],
                    "valid_verses": sum(v["is_valid"] for v in a["verses"]),
                    "rawi_matches": sum(v["rawi_matches"] for v in a["verses"]),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
    except GenerationError as exc:
        row = {
            "model": model,
            "seconds": round(time.monotonic() - started, 2),
            "error_status": exc.status,
            "error": str(exc),
        }
        print(json.dumps(row, ensure_ascii=False), flush=True)
    return row


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--models", nargs="+", default=["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.8-flash"]
    )
    parser.add_argument("--thinking", choices=["low", "medium", "high"], default="medium")
    args = parser.parse_args()
    rows = await asyncio.gather(*(evaluate(m, args.thinking) for m in args.models))
    output = Path(__file__).resolve().parents[2] / "docs/evals/gemini-comparison-latest.json"
    output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
