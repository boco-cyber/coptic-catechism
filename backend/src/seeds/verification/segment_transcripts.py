#!/usr/bin/env python3
"""Stage 3: segment page transcripts into strictly validated Q&A records."""

import argparse
import re
from collections import Counter
from pathlib import Path

from common import (
    ARABIC_DIGITS, BOOK_RANGES, WORK_DIR, ensure_no_failed_pages, normalize_arabic,
    page_number, write_json,
)

# A question heading must start with a number, allowing common book typography.
HEADING_RE = re.compile(
    r"^\s*(?:س(?:ؤال)?\s*)?[\[(（(]?(?P<number>[0-9٠-٩۰-۹]{1,4})[\])）).:\-–—ـ]*\s*(?P<text>.+?)\s*$"
)


def read_book(book: int) -> list[tuple[int, str]]:
    paths = sorted((WORK_DIR / "transcripts" / f"book{book}").glob("page-*.txt"), key=page_number)
    if not paths:
        raise SystemExit(f"No transcripts found for book{book}")
    lines = []
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            lines.append((page_number(path), line.rstrip()))
    return lines


def candidates(book: int, lines: list[tuple[int, str]]) -> list[dict]:
    start, end = BOOK_RANGES[book]
    found = []
    for line_index, (page, line) in enumerate(lines):
        match = HEADING_RE.match(line)
        if not match:
            continue
        number = int(match.group("number").translate(ARABIC_DIGITS))
        if not start <= number <= end:
            continue
        # Vision transcription may wrap a long question across lines. Join at
        # most three lines, stopping at its question mark, before accepting it.
        question_parts = [match.group("text").strip()]
        lookahead = line_index + 1
        while "؟" not in " ".join(question_parts) and lookahead < min(line_index + 4, len(lines)):
            continuation = lines[lookahead][1].strip()
            if HEADING_RE.match(continuation) or not continuation:
                break
            question_parts.append(continuation)
            lookahead += 1
        question = " ".join(question_parts)
        if "؟" in question:
            question = question.split("؟", 1)[0].strip() + "؟"
            found.append({
                "number": number, "question": question,
                "page": page, "line": line_index, "question_end": lookahead - 1,
            })
    return found


def segment_book(book: int) -> tuple[list[dict], dict]:
    lines = read_book(book)
    found = candidates(book, lines)
    start, end = BOOK_RANGES[book]
    expected = list(range(start, end + 1))
    numbers = [item["number"] for item in found]
    counts = Counter(numbers)
    errors = {
        "missing": [number for number in expected if counts[number] == 0],
        "duplicates": [number for number in expected if counts[number] > 1],
        "out_of_order": numbers != expected,
        "observed": numbers,
    }
    if errors["missing"] or errors["duplicates"] or errors["out_of_order"]:
        return [], errors
    records = []
    for position, heading in enumerate(found):
        end_line = found[position + 1]["line"] if position + 1 < len(found) else len(lines)
        answer = "\n".join(line for _page, line in lines[heading["question_end"] + 1:end_line]).strip()
        if not answer:
            errors.setdefault("empty_answers", []).append(heading["number"])
        records.append({
            "questionNumber": heading["number"],
            "question": heading["question"],
            "answer": answer,
            "source": {"book": book, "page": heading["page"]},
        })
    return records, errors


def index_cross_check(records: list[dict]) -> list[dict]:
    """Extract numbered index questions and report wording disagreements when available."""
    index_candidates = []
    for _page, line in read_book(0):
        match = HEADING_RE.match(line)
        if match and "؟" in match.group("text"):
            number = int(match.group("number").translate(ARABIC_DIGITS))
            if 1 <= number <= 1452:
                index_candidates.append((number, match.group("text").strip()))
    index = dict(index_candidates)
    return [
        {"questionNumber": row["questionNumber"], "bookText": row["question"], "indexText": index[row["questionNumber"]]}
        for row in records
        if row["questionNumber"] in index
        and normalize_arabic(row["question"]) != normalize_arabic(index[row["questionNumber"]])
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-index-cross-check", action="store_true")
    args = parser.parse_args()
    ensure_no_failed_pages()
    all_records, report = [], {"valid": True, "books": {}}
    for book in BOOK_RANGES:
        records, errors = segment_book(book)
        report["books"][str(book)] = errors
        if errors["missing"] or errors["duplicates"] or errors["out_of_order"] or errors.get("empty_answers"):
            report["valid"] = False
        all_records.extend(records)
    if report["valid"] and not args.skip_index_cross_check:
        report["indexWordingDifferences"] = index_cross_check(all_records)
    write_json(WORK_DIR / "segmentation_report.json", report)
    if not report["valid"]:
        raise SystemExit(f"Segmentation failed; see {WORK_DIR / 'segmentation_report.json'}")
    # Source metadata is useful in the report but the production-compatible artifact
    # intentionally retains the existing three-field shape.
    output = [{key: row[key] for key in ("questionNumber", "question", "answer")} for row in all_records]
    write_json(WORK_DIR / "catechism_qa_ar_transcribed.json", output)
    print(f"Wrote {len(output)} strictly validated Q&A records")


if __name__ == "__main__":
    main()
