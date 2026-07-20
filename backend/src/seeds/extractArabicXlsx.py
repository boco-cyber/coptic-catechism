#!/usr/bin/env python3
"""Extract the polished xlsx's 1,452 Q&A rows in document order, tagged
with the "part" (book) each falls under per the xlsx's own part column.

Like extractArabicDocxRaw.py, this does NOT trust the xlsx's own row
numbering to match the app's book/question boundaries — align_xlsx.py
handles that separately by content alignment.

Usage:
    python3 extractArabicXlsx.py [path-to-xlsx] [output.json]

Defaults to ARABIC_XLSX_PATH env var or the user's Downloads copy, and to
backend/data/verification/catechism_qa_ar_xlsx.json.
"""

import json
import os
import sys
from pathlib import Path

import openpyxl

SHEET_NAME = "الأسئلة والأجوبة"
DATA_START_ROW = 5  # 1-indexed; rows 1-4 are title/subtitle/blank/header
EXPECTED_COUNT = 1452

DEFAULT_XLSX_PATH = Path(
    os.environ.get(
        "ARABIC_XLSX_PATH",
        str(Path.home() / "Downloads" / "كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-1452-سؤال-وجواب.xlsx"),
    )
)
DEFAULT_OUTPUT_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "verification" / "catechism_qa_ar_xlsx.json"
)


def parse_xlsx(path: Path) -> list[dict]:
    workbook = openpyxl.load_workbook(path, read_only=True)
    sheet = workbook[SHEET_NAME]
    rows = []
    for row in sheet.iter_rows(min_row=DATA_START_ROW, values_only=True):
        number = row[0]
        if number is None:
            continue
        rows.append({
            "questionNumber": int(number),
            "part": int(row[1]),
            "partTitle": (row[2] or "").strip(),
            "question": (row[3] or "").strip(),
            "answer": (row[4] or "").strip(),
        })
    return rows


def validate(rows: list[dict]) -> None:
    if len(rows) != EXPECTED_COUNT:
        raise SystemExit(f"Expected {EXPECTED_COUNT} rows, found {len(rows)}")
    numbers = [row["questionNumber"] for row in rows]
    if sorted(numbers) != list(range(1, EXPECTED_COUNT + 1)):
        seen = set(numbers)
        missing = sorted(set(range(1, EXPECTED_COUNT + 1)) - seen)
        duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
        raise SystemExit(
            f"Question numbers not 1..{EXPECTED_COUNT} exactly once. "
            f"Missing: {missing[:10]}, duplicated: {duplicates[:10]}"
        )
    for row in rows:
        if not 1 <= row["part"] <= 7:
            raise SystemExit(f"Row {row['questionNumber']} has out-of-range part: {row['part']}")
        if not row["question"]:
            raise SystemExit(f"Row {row['questionNumber']} has an empty question")
        if not row["answer"]:
            raise SystemExit(f"Row {row['questionNumber']} has an empty answer")


def main() -> None:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX_PATH
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT_PATH
    if not xlsx_path.exists():
        raise SystemExit(f"xlsx not found: {xlsx_path}")
    rows = parse_xlsx(xlsx_path)
    validate(rows)
    rows.sort(key=lambda row: row["questionNumber"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as target:
        json.dump(rows, target, ensure_ascii=False, indent=2)
    print(f"Parsed and validated {len(rows)} rows -> {output_path}")


if __name__ == "__main__":
    main()
