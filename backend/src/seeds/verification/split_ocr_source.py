#!/usr/bin/env python3
"""Split the user-supplied full-book OCR text files into the per-page
transcript layout the existing verification pipeline (segment_transcripts.py,
compare_datasets.py, build_v2.py) already expects.

Source: /home/gergo/OneDrive/Documents/catechism fr malaty arabic/extracted arabic/
  intro.txt -> book0 (76-page questions & contents index, cross-check only)
  1.txt..7.txt -> book1..book7 (page counts verified: 99/260/344/242/67/140/115)

Each source file is a flat dump with "--- Page N ---" / "[Source - Page N]"
markers; this script strips those markers and writes one file per page to
backend/data/verification/transcripts/book{N}/page-{NNNN}.txt, overwriting any
partial output left over from the earlier Gemini vision-transcription attempt.
"""

import re
from pathlib import Path

SOURCE_DIR = Path("/home/gergo/OneDrive/Documents/catechism fr malaty arabic/extracted arabic")
WORK_DIR = Path(__file__).resolve().parents[3] / "data" / "verification"

FILES = {
    0: "intro.txt",
    1: "1.txt",
    2: "2.txt",
    3: "3.txt",
    4: "4.txt",
    5: "5.txt",
    6: "6.txt",
    7: "7.txt",
}

PAGE_SPLIT_RE = re.compile(r"^--- Page (\d+) ---\s*$", re.M)
SOURCE_TAG_RE = re.compile(r"^\[Source - Page \d+\]\s*\n?", re.M)


def split_file(path: Path) -> dict[int, str]:
    text = path.read_text(encoding="utf-8")
    parts = PAGE_SPLIT_RE.split(text)
    if parts[0].strip():
        raise SystemExit(f"{path}: unexpected content before first page marker")
    pages = {}
    for i in range(1, len(parts), 2):
        page_num = int(parts[i])
        body = SOURCE_TAG_RE.sub("", parts[i + 1], count=1).strip("\n")
        pages[page_num] = body
    return pages


def main() -> None:
    for book, filename in FILES.items():
        pages = split_file(SOURCE_DIR / filename)
        out_dir = WORK_DIR / "transcripts" / f"book{book}"
        out_dir.mkdir(parents=True, exist_ok=True)
        for existing in out_dir.glob("page-*.txt"):
            existing.unlink()
        for page_num, body in sorted(pages.items()):
            (out_dir / f"page-{page_num:04d}.txt").write_text(body + "\n", encoding="utf-8")
        print(f"book{book}: wrote {len(pages)} pages from {filename}")


if __name__ == "__main__":
    main()
