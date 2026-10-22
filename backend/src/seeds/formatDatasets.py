#!/usr/bin/env python3
"""Apply the shared whitespace/footnote formatter to the JSON datasets.

Usage:
    python3 backend/src/seeds/formatDatasets.py --check
    python3 backend/src/seeds/formatDatasets.py

`--check` exits nonzero when the committed datasets are stale.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE.parents[1] / "data"
sys.path.insert(0, str(HERE))

from formatting import format_arabic_dataset, format_english_dataset  # noqa: E402

ENGLISH = DATA_DIR / "catechism_qa.json"
ARABIC = DATA_DIR / "catechism_qa_ar.json"


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def write(path: Path, rows: list[dict]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify datasets are current")
    parser.add_argument("--english-only", action="store_true")
    parser.add_argument("--arabic-only", action="store_true")
    args = parser.parse_args()

    targets = []
    if not args.arabic_only:
        targets.append(("English", ENGLISH, format_english_dataset))
    if not args.english_only:
        targets.append(("Arabic", ARABIC, format_arabic_dataset))

    stale = False
    for label, path, formatter in targets:
        current = load(path)
        formatted = formatter(current)
        if formatted == current:
            print(f"{label}: already formatted ({len(formatted)} records)")
            continue
        stale = True
        footnotes = sum(len(row.get("footnotes", [])) for row in formatted)
        paragraphs = sum(row["answer"].count("\n\n") + 1 for row in formatted if row["answer"])
        print(
            f"{label}: {len(formatted)} records, {paragraphs} paragraphs, "
            f"{footnotes} footnotes"
        )
        if not args.check:
            write(path, formatted)
            print(f"{label}: wrote {path}")
    if args.check and stale:
        raise SystemExit("Datasets are stale; run formatDatasets.py without --check")
    if args.check:
        print("Datasets are up to date")


if __name__ == "__main__":
    main()
