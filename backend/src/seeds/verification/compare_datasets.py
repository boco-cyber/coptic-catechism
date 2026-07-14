#!/usr/bin/env python3
"""Stage 4: compare the canonical transcription with the current Arabic dataset."""

import argparse
from collections import Counter, defaultdict
from difflib import SequenceMatcher

from common import DATA_DIR, WORK_DIR, book_for_question, load_json, normalize_arabic, write_json


def similarity(left: str, right: str) -> float:
    left_tokens = sorted(normalize_arabic(left).split())
    right_tokens = sorted(normalize_arabic(right).split())
    try:
        from rapidfuzz.fuzz import token_sort_ratio
        return token_sort_ratio(" ".join(left_tokens), " ".join(right_tokens)) / 100.0
    except ImportError:
        return SequenceMatcher(None, " ".join(left_tokens), " ".join(right_tokens)).ratio()


def classify(question_score: float, answer_score: float, fallback: bool) -> str:
    if fallback:
        return "fallback"
    score = min(question_score, answer_score)
    if score >= 0.85:
        return "match"
    if score >= 0.50:
        return "improved"
    return "conflict"


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    current = load_json(DATA_DIR / "catechism_qa_ar.json")
    new = load_json(WORK_DIR / "catechism_qa_ar_transcribed.json")
    fallback_numbers = {int(number) for number in load_json(DATA_DIR / "arabic_translated_fallbacks.json")}
    old_by_number = {row["questionNumber"]: row for row in current}
    new_by_number = {row["questionNumber"]: row for row in new}
    if set(old_by_number) != set(range(1, 1453)) or set(new_by_number) != set(range(1, 1453)):
        raise SystemExit("Both datasets must contain each question number 1..1452 exactly once")
    rows = []
    for number in range(1, 1453):
        old, transcribed = old_by_number[number], new_by_number[number]
        question_score = similarity(old["question"], transcribed["question"])
        answer_score = similarity(old["answer"], transcribed["answer"])
        category = classify(question_score, answer_score, number in fallback_numbers)
        rows.append({
            "questionNumber": number, "book": book_for_question(number), "classification": category,
            "questionSimilarity": round(question_score, 4), "answerSimilarity": round(answer_score, 4),
            "old": {"question": old["question"], "answer": old["answer"]},
            "new": {"question": transcribed["question"], "answer": transcribed["answer"]},
        })
    by_book = defaultdict(Counter)
    for row in rows:
        by_book[row["book"]][row["classification"]] += 1
    report = {
        "summary": dict(Counter(row["classification"] for row in rows)),
        "byBook": {str(book): dict(counts) for book, counts in sorted(by_book.items())},
        "requiresManualReview": [row["questionNumber"] for row in rows if row["classification"] == "conflict"],
        "entries": rows,
    }
    write_json(WORK_DIR / "verification_report.json", report)
    md = ["# Arabic transcription verification report", "", "## Summary", ""]
    for category in ("match", "improved", "conflict", "fallback"):
        md.append(f"- {category}: {report['summary'].get(category, 0)}")
    md.extend(["", "## Per book", "", "| Book | Match | Improved | Conflict | Fallback |", "|---:|---:|---:|---:|---:|"])
    for book in range(1, 8):
        counts = by_book[book]
        md.append(f"| {book} | {counts['match']} | {counts['improved']} | {counts['conflict']} | {counts['fallback']} |")
    md.extend(["", "## Conflicts requiring manual review", ""])
    for row in rows:
        if row["classification"] != "conflict":
            continue
        md.extend([
            f"### Q{row['questionNumber']} (book {row['book']})", "",
            f"Question similarity: {row['questionSimilarity']:.1%}; answer similarity: {row['answerSimilarity']:.1%}", "",
            "**Old question**", "", row["old"]["question"], "", "**New question**", "", row["new"]["question"], "",
            "**Old answer**", "", row["old"]["answer"], "", "**New answer**", "", row["new"]["answer"], "",
        ])
    (WORK_DIR / "verification_report.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"Compared 1452 entries: {report['summary']}")


if __name__ == "__main__":
    main()
