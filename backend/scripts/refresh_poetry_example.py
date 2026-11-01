"""Rebuild the instant al-Mutanabbi example using the installed prosody engine."""

import json
import sys
from pathlib import Path


def main():
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend))
    from app.schemas import Verse
    from app.services.prosody import analyze_with_tashkeel

    data = backend.parent / "frontend/src/data"
    example = json.loads((data / "poetry-examples.json").read_text())[0]
    report = analyze_with_tashkeel(
        [Verse(**verse) for verse in example["verses"]],
        example["meter"],
        example["rawi"],
        False,
    )
    (data / "default-analysis.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
