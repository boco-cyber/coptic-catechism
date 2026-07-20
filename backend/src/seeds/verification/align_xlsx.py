#!/usr/bin/env python3
"""Stage 2: align the polished xlsx source to the app's question numbering
and rebuild the Arabic dataset.

The xlsx's own numbering doesn't match the app's book boundaries (confirmed
during design: xlsx part 1 has 97 rows vs. the app's Book 1 range of 92).
This aligns each book's xlsx candidates against the app's existing
(correctly-numbered) questions using a monotonic fuzzy sequence alignment -
the same dynamic-programming shape as align_v2.py's align_questions(),
adapted for xlsx-row candidates (which already carry full question+answer
text) instead of raw OCR lines. Every app question number always resolves
to a value: the matched xlsx text if a confident match was found,
otherwise the current text unchanged. No manual review gate.

Usage:
    python3 align_xlsx.py
"""

from collections import Counter, defaultdict

from common import BOOK_RANGES, DATA_DIR, WORK_DIR, book_for_question, load_json, write_json
from compare_datasets import similarity

FLOOR = 0.35
BUFFER = 15


def candidate_window(xlsx_rows: list[dict], book: int) -> list[dict]:
    """Positional slice of xlsx_rows (already sorted by their own number)
    covering `book`'s rows plus a buffer borrowed from the neighboring
    books, to absorb boundary drift."""
    positions = [i for i, row in enumerate(xlsx_rows) if row["part"] == book]
    if not positions:
        return []
    start = max(0, positions[0] - BUFFER)
    end = min(len(xlsx_rows), positions[-1] + 1 + BUFFER)
    return xlsx_rows[start:end]


def align_book(app_entries, candidates, floor: float = FLOOR) -> dict:
    """Monotonic fuzzy sequence alignment. app_entries/candidates: list of
    (key, question_text). Returns {app_key: (candidate_key, score)} for
    matches scoring >= floor, in a single order-preserving pass."""
    rows, cols = len(app_entries), len(candidates)
    skip_a, skip_c = -0.25, -0.02
    back = [bytearray(cols + 1) for _ in range(rows + 1)]
    previous = [j * skip_c for j in range(cols + 1)]
    for j in range(1, cols + 1):
        back[0][j] = 3  # candidate skip
    for i in range(1, rows + 1):
        current = [i * skip_a] + [0.0] * cols
        back[i][0] = 2  # app-entry skip
        for j in range(1, cols + 1):
            score = similarity(app_entries[i - 1][1], candidates[j - 1][1])
            match_reward = (score - floor) * 2.4 + 0.42
            options = (
                (previous[j - 1] + match_reward, 1),
                (previous[j] + skip_a, 2),
                (current[j - 1] + skip_c, 3),
            )
            current[j], back[i][j] = max(options, key=lambda item: item[0])
        previous = current
    aligned = {}
    i, j = rows, cols
    while i or j:
        action = back[i][j]
        if action == 1:
            score = similarity(app_entries[i - 1][1], candidates[j - 1][1])
            if score >= floor:
                aligned[app_entries[i - 1][0]] = (candidates[j - 1][0], score)
            i, j = i - 1, j - 1
        elif action == 2:
            i -= 1
        else:
            j -= 1
    return aligned


def main() -> None:
    current = load_json(DATA_DIR / "catechism_qa_ar.json")
    xlsx_rows = load_json(WORK_DIR / "catechism_qa_ar_xlsx.json")
    current_by_number = {row["questionNumber"]: row for row in current}
    xlsx_rows.sort(key=lambda row: row["questionNumber"])
    if set(current_by_number) != set(range(1, 1453)):
        raise SystemExit("Current Arabic dataset must contain each question number 1..1452 exactly once")
    if {row["questionNumber"] for row in xlsx_rows} != set(range(1, 1453)):
        raise SystemExit("xlsx dataset must contain each question number 1..1452 exactly once")
    xlsx_by_number = {row["questionNumber"]: row for row in xlsx_rows}

    all_aligned = {}
    for book, (start, end) in BOOK_RANGES.items():
        app_entries = [(n, current_by_number[n]["question"]) for n in range(start, end + 1)]
        candidates = [(row["questionNumber"], row["question"]) for row in candidate_window(xlsx_rows, book)]
        aligned = align_book(app_entries, candidates)
        all_aligned.update(aligned)
        print(f"Book {book}: {len(aligned)}/{len(app_entries)} questions matched")

    output = []
    adopted_count = 0
    by_book = defaultdict(Counter)
    for number in range(1, 1453):
        book = book_for_question(number)
        if number in all_aligned:
            xlsx_number, _score = all_aligned[number]
            source = xlsx_by_number[xlsx_number]
            output.append({"questionNumber": number, "question": source["question"], "answer": source["answer"]})
            adopted_count += 1
            by_book[book]["adopted"] += 1
        else:
            fallback = current_by_number[number]
            output.append({"questionNumber": number, "question": fallback["question"], "answer": fallback["answer"]})
            by_book[book]["fallback"] += 1

    write_json(DATA_DIR / "catechism_qa_ar.json", output)

    lines = [
        "# Arabic xlsx alignment report", "",
        f"Adopted: {adopted_count}/1452",
        f"Kept current (no confident match): {1452 - adopted_count}/1452", "",
        "| Book | Adopted | Kept current |", "|---:|---:|---:|",
    ]
    for book in range(1, 8):
        counts = by_book[book]
        lines.append(f"| {book} | {counts['adopted']} | {counts['fallback']} |")
    (WORK_DIR / "xlsx_alignment_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Adopted {adopted_count}/1452; wrote backend/data/catechism_qa_ar.json and xlsx_alignment_report.md")


if __name__ == "__main__":
    main()
