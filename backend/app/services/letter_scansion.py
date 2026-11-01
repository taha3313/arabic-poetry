"""Conservative alignment of PyArud's pronounced letters with its binary feet.

This maps prosodic spelling, not offsets in the original verse. PyArud expands
shadda/tanween and can omit wasl letters before producing this spelling.
"""

import unicodedata


def add_letter_scansion(row: dict) -> dict:
    for part in ("sadr", "ajuz"):
        scan = row.get(part)
        if not scan:
            continue
        feet = scan.get("feet", [])
        letters = [
            char
            for char in scan.get("arudi_text", "")
            if unicodedata.category(char).startswith("L")
        ]
        pattern = scan.get("pattern", "")
        segments = [
            foot.get("actual_segment", "") for foot in feet if foot.get("status") != "missing"
        ]
        available = (
            bool(pattern)
            and set(pattern) <= {"0", "1"}
            and len(letters) == len(pattern)
            and "".join(segments) == pattern
        )
        scan["letter_alignment"] = {
            "available": available,
            "basis": "arudi_text",
            "reason": None if available else "unaligned_pronunciation",
        }
        offset = 0
        for foot in feet:
            foot["letters"] = []
            foot["pronounced_segment"] = None
            if not available or foot.get("status") == "missing":
                continue
            segment = foot.get("actual_segment", "")
            foot_letters = letters[offset : offset + len(segment)]
            foot["pronounced_segment"] = "".join(foot_letters)
            foot["letters"] = [
                {"letter": letter, "symbol": symbol, "position": offset + index}
                for index, (letter, symbol) in enumerate(zip(foot_letters, segment, strict=True))
            ]
            offset += len(segment)
    return row
