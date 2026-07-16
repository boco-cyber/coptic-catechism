#!/usr/bin/env python3
"""Rebuild the Arabic question-index reference from the fresh OCR of the
76-page questions-and-contents PDF (book0 transcripts), using the same
position-based numbering rule already established in extractArabicIndex.py:
printed numbers restart at 1 in every chapter, so a candidate line's ORDER in
the document (not its printed number) is the global questionNumber.

Chapter/section heading lines (no leading digit, no question mark, short) are
also collected per book so book/chapter Arabic titles can be reconstructed.

Output: backend/data/verification/arabic_index_v2.json (questionNumber -> text)
        backend/data/verification/arabic_index_v2_headings.json (ordered heading lines)
"""

import json
import re
import unicodedata
from pathlib import Path

WORK_DIR = Path(__file__).resolve().parents[3] / "data" / "verification"
BOOK0_DIR = WORK_DIR / "transcripts" / "book0"

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
SKIP_SUBSTRINGS = ("الأسئلة والمحتويات", "البابا", "طبع", "www.", "@", "http")


def is_arabic_digit(c: str) -> bool:
    return unicodedata.name(c, "").startswith("ARABIC-INDIC DIGIT")


def leading_number(text: str) -> tuple[str, str] | None:
    i = 0
    while i < len(text) and (text[i].isdigit() or is_arabic_digit(text[i])):
        i += 1
    if i == 0:
        return None
    return text[:i], text[i:]


def main() -> None:
    pages = sorted(BOOK0_DIR.glob("page-*.txt"), key=lambda p: int(p.stem.split("-")[1]))
    lines = []
    for page in pages:
        lines.extend(page.read_text(encoding="utf-8").splitlines())

    question_lines: list[tuple[int, str]] = []
    heading_lines: list[str] = []
    for raw in lines:
        line = raw.strip()
        if len(line) < 4:
            continue
        if any(s in line for s in SKIP_SUBSTRINGS):
            continue
        if re.match(r"^\d+$", line):
            continue
        cleaned = re.sub(r'^[\s.“”„‟"]+', "", line)
        result = leading_number(cleaned)
        if result:
            digits, rest = result
            qnum = int(digits.translate(ARABIC_DIGITS))
            qtext = rest.lstrip(". \t")
            qtext = re.sub(r"\s*\(\d+[/\d]*\)\s*$", "", qtext).strip()
            if qnum and len(qtext) > 5:
                question_lines.append((qnum, qtext))
                continue
        if len(line) < 60 and not line.endswith(("؟", ".")):
            heading_lines.append(line)

    print(f"Found {len(question_lines)} candidate question lines (need 1452)")
    print(f"Found {len(heading_lines)} candidate heading lines")

    index = {str(i): text for i, (_, text) in enumerate(question_lines, 1)}
    (WORK_DIR / "arabic_index_v2.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (WORK_DIR / "arabic_index_v2_headings.json").write_text(
        json.dumps(heading_lines, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Sample:")
    for i in list(range(1, 6)) + list(range(1448, 1453)):
        print(" ", i, index.get(str(i), "<missing>")[:80])


if __name__ == "__main__":
    main()
