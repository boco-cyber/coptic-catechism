#!/usr/bin/env python3
"""Segment the new full-book OCR transcripts using per-CHAPTER local question
numbering, not global numbering.

Investigation finding: the Arabic books restart question numbering at 1 in
every chapter (confirmed both in the fresh OCR and in extractArabicIndex.py's
existing comment: "the printed numbers restart at 1 in every chapter"). A
book-wide monotonic 1..N alignment (as tried first) is fooled by footnote
markers and in-answer enumerated lists that coincidentally look like question
headings. But the exact question COUNT of every chapter is already known from
the English structureData.js (backend/data/verification/chapters_en.json), so
each chapter can be validated strictly: expect local numbers 1..count in
order, where the first question of a chapter is often unnumbered in print.

For each chapter this walks forward from the current scan position looking
for the next expected local number (or, for position 1, either "no number +
starts with a question word" or an explicit "1"). If the expected heading
isn't found within a bounded window, the remaining questions in that chapter
are recorded as missing (for manual review) and the scan resyncs at the next
chapter's expected position-1 heading.
"""

import json
import re
import unicodedata
from pathlib import Path

WORK_DIR = Path(__file__).resolve().parents[3] / "data" / "verification"
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
QUESTION_WORDS = ("ما ", "ماذا", "هل ", "كيف", "لماذا", "من ", "أين", "متى", "أي ")
NUMBER_PREFIX_RE = re.compile(r"^\s*[\[(（(]?\s*(?P<num>[0-9٠-٩]{1,3})\s*[\])）.:\-–—ـ]*\s*(?P<rest>.*)$")
MAX_LOOKAHEAD_LINES = 400  # bounded resync window per missing question


def load_chapters():
    chapters = json.loads((WORK_DIR / "chapters_en.json").read_text(encoding="utf-8"))
    by_book = {}
    for c in chapters:
        by_book.setdefault(c["bookNumber"], []).append(c)
    for book in by_book:
        by_book[book].sort(key=lambda c: c["chapterNumber"])
    return by_book


def read_book_lines(book: int) -> list[tuple[int, str]]:
    paths = sorted(
        (WORK_DIR / "transcripts" / f"book{book}").glob("page-*.txt"),
        key=lambda p: int(p.stem.split("-")[1]),
    )
    lines = []
    for path in paths:
        page = int(path.stem.split("-")[1])
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped:
                lines.append((page, stripped))
    return lines


def starts_with_question_word(text: str) -> bool:
    return any(text.startswith(w) for w in QUESTION_WORDS)


def join_until_qmark(lines: list[tuple[int, str]], start: int, first_text: str) -> tuple[str, int]:
    """Join up to 3 lines to find a closing ؟, matching segment_transcripts.py's approach."""
    parts = [first_text]
    i = start + 1
    while "؟" not in " ".join(parts) and i < min(start + 4, len(lines)):
        parts.append(lines[i][1])
        i += 1
    joined = " ".join(parts)
    if "؟" in joined:
        joined = joined.split("؟", 1)[0].strip() + "؟"
        return joined, i - 1
    return "", start


def match_heading(line: str, expected_num: int) -> tuple[bool, str] | None:
    """Return (matched, question_text_without_number) if `line` could be local
    question `expected_num`, else None."""
    m = NUMBER_PREFIX_RE.match(line)
    if m and m.group("num"):
        num = int(m.group("num").translate(ARABIC_DIGITS))
        if num == expected_num and (expected_num > 1 or True):
            return True, m.group("rest").strip()
        return None
    if expected_num == 1 and starts_with_question_word(line):
        return True, line
    return None


def segment_chapter(lines, pos, chapter, book):
    start_q, end_q = chapter["questionRange"]["start"], chapter["questionRange"]["end"]
    count = end_q - start_q + 1
    records = []
    missing = []
    local = 1
    scan = pos
    while local <= count:
        found_at = None
        limit = min(scan + MAX_LOOKAHEAD_LINES, len(lines))
        for i in range(scan, limit):
            candidate = match_heading(lines[i][1], local)
            if not candidate:
                continue
            question, end_i = join_until_qmark(lines, i, candidate[1])
            if not question:
                continue
            found_at = (i, end_i, question)
            break
        if found_at is None:
            missing.append(start_q + local - 1)
            local += 1
            continue
        line_i, end_i, question = found_at
        records.append({
            "questionNumber": start_q + local - 1,
            "question": question,
            "startLine": end_i + 1,
            "page": lines[line_i][0],
        })
        scan = end_i + 1
        local += 1
    return records, missing, scan


def fill_answers(lines, records, chapter_end_line):
    for idx, rec in enumerate(records):
        end_line = records[idx + 1]["startLine"] - 1 if idx + 1 < len(records) else chapter_end_line
        # startLine may exceed end_line for adjacent headings on the same line group; guard.
        end_line = max(end_line, rec["startLine"])
        answer_lines = [lines[i][1] for i in range(rec["startLine"], min(end_line, len(lines)))]
        rec["answer"] = "\n".join(answer_lines).strip()
        del rec["startLine"]
        del rec["page"]


def segment_book(book, chapters):
    lines = read_book_lines(book)
    pos = 0
    all_records = []
    all_missing = []
    chapter_bounds = []
    for chapter in chapters:
        records, missing, new_pos = segment_chapter(lines, pos, chapter, book)
        chapter_bounds.append((records, new_pos))
        all_records.extend(records)
        all_missing.extend(missing)
        pos = new_pos
    # Fill answers using next record's start across chapter boundaries too.
    flat = all_records
    for idx, rec in enumerate(flat):
        end_line = flat[idx + 1]["startLine"] if idx + 1 < len(flat) else len(lines)
        end_line = max(end_line, rec["startLine"])
        rec["answer"] = "\n".join(l for _p, l in lines[rec["startLine"]:end_line]).strip()
    for rec in flat:
        del rec["startLine"]
        del rec["page"]
    return flat, all_missing


def main():
    by_book = load_chapters()
    report = {}
    dataset = {}
    for book in range(1, 8):
        records, missing = segment_book(book, by_book[book])
        for rec in records:
            dataset[rec["questionNumber"]] = rec
        expected = by_book[book][-1]["questionRange"]["end"] - by_book[book][0]["questionRange"]["start"] + 1
        report[book] = {"found": len(records), "expected": expected, "missing": missing}
        print(f"Book {book}: {len(records)}/{expected} questions segmented, {len(missing)} missing")
    output = [dataset[n] for n in sorted(dataset)]
    (WORK_DIR / "catechism_qa_ar_v3.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (WORK_DIR / "segment_by_chapter_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Total: {len(output)}/1452")


if __name__ == "__main__":
    main()
