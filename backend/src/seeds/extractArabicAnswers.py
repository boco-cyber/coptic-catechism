#!/usr/bin/env python3
"""Build the Arabic Q&A dataset from the cached text of the seven volumes.

The PDFs contain many unrelated numbers (pages, Bible verses and footnotes), so
question numbers are not reliable anchors.  Instead, this script aligns the
known Arabic question index with question-like lines in each volume while
preserving document order.  Low-confidence matches are left blank rather than
silently attaching the answer of a different question.
"""

import argparse
import json
import os
import re
import unicodedata
from difflib import SequenceMatcher

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
BOOK_RANGES = {
    1: (1, 92), 2: (93, 448), 3: (449, 877), 4: (878, 1112),
    5: (1113, 1184), 6: (1185, 1356), 7: (1357, 1452),
}
MIN_SCORE = 0.58
ARABIC_RE = re.compile(r"[\u0600-\u06ff]")
QUESTION_WORDS = ("ما ", "ماذا ", "هل ", "كيف ", "لماذا ", "من ", "أين ", "متى ", "أي ")


def clean_text(value):
    value = "".join(c for c in value if ord(c) not in (0x200e, 0x200f, 0x2028, 0x2029, 0xfeff))
    value = value.replace("|", "").replace("_", " ")
    return re.sub(r"\s+", " ", value).strip()


def normalize(value):
    value = clean_text(value)
    value = "".join(c for c in value if unicodedata.category(c)[0] not in "PN" and not c.isdigit())
    value = re.sub(r"[إأآٱ]", "ا", value)
    return re.sub(r"\s+", " ", value.translate(str.maketrans("ىةؤئ", "يهوي"))).strip()


def similarity(question, candidate):
    left, right = normalize(question), normalize(candidate)
    if not left or not right:
        return 0.0
    ratio = SequenceMatcher(None, left, right).ratio()
    left_words, right_words = set(left.split()), set(right.split())
    overlap = len(left_words & right_words) / max(1, len(left_words | right_words))
    containment = min(len(left), len(right)) / max(len(left), len(right)) if left in right or right in left else 0
    return max(ratio, 0.65 * ratio + 0.35 * overlap, containment)


def content_end(lines, first_question):
    """Exclude the repeated table of contents commonly appended to each PDF."""
    start = int(len(lines) * 0.70)
    for index in range(start, len(lines)):
        if normalize(lines[index]) == normalize("المحتويات"):
            return index
    # Volume 3 has no contents heading, but repeats its first question.
    target = normalize(first_question)
    for index in range(start, len(lines)):
        if similarity(target, lines[index]) >= 0.88:
            return index
    return len(lines)


def question_candidates(lines):
    candidates = []
    for index, line in enumerate(lines):
        text = clean_text(line)
        normalized = normalize(text)
        if not ARABIC_RE.search(text) or not 5 <= len(normalized) <= 180:
            continue
        without_number = re.sub(r"^[\s\d٠-٩.،؛:()\-]+", "", text)
        looks_like_question = "؟" in text or normalize(without_number).startswith(tuple(normalize(w) for w in QUESTION_WORDS))
        if looks_like_question:
            candidates.append((index, text))
    return candidates


def align_questions(questions, candidates):
    """Monotonic sequence alignment with optional candidates/questions."""
    rows, cols = len(questions), len(candidates)
    # Skipping a likely heading has a small cost; weak matches cost more than a skip.
    skip_q, skip_c = -0.32, -0.015
    # Only the previous score row is needed. Traceback actions use one byte
    # each instead of retaining several large Python object matrices.
    back = [bytearray(cols + 1) for _ in range(rows + 1)]
    previous = [j * skip_c for j in range(cols + 1)]
    for j in range(1, cols + 1):
        back[0][j] = 3  # candidate skip
    for i in range(1, rows + 1):
        current = [i * skip_q] + [0.0] * cols
        back[i][0] = 2  # question skip
        for j in range(1, cols + 1):
            score = similarity(questions[i - 1][1], candidates[j - 1][1])
            match_reward = (score - MIN_SCORE) * 2.4 + 0.42
            options = (
                (previous[j - 1] + match_reward, 1),
                (previous[j] + skip_q, 2),
                (current[j - 1] + skip_c, 3),
            )
            current[j], back[i][j] = max(options, key=lambda item: item[0])
        previous = current
    aligned = {}
    i, j = rows, cols
    while i or j:
        action = back[i][j]
        if action == 1:
            score = similarity(questions[i - 1][1], candidates[j - 1][1])
            if score >= MIN_SCORE:
                aligned[questions[i - 1][0]] = (candidates[j - 1][0], score)
            i, j = i - 1, j - 1
        elif action == 2:
            i -= 1
        else:
            j -= 1
    return aligned


def extract_book(book_number, index):
    start_q, end_q = BOOK_RANGES[book_number]
    path = os.path.join(OUT_DIR, f"ocr_book{book_number}.txt")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Missing cached source text: {path}")
    with open(path, encoding="utf-8") as source:
        lines = [clean_text(line) for line in source if clean_text(line)]
    questions = [(q, index[str(q)]) for q in range(start_q, end_q + 1) if index.get(str(q))]
    end = content_end(lines, questions[0][1])
    lines = lines[:end]
    candidates = question_candidates(lines)
    aligned = align_questions(questions, candidates)

    ordered = sorted((line, q, score) for q, (line, score) in aligned.items())
    answers = {}
    for position, (line, qnum, score) in enumerate(ordered):
        next_line = ordered[position + 1][0] if position + 1 < len(ordered) else len(lines)
        # A missing heading would merge two answers. Cap pathological spans and
        # leave them for review instead of publishing a shifted answer.
        chunk = clean_text("\n".join(lines[line + 1:next_line]))
        if 20 <= len(chunk) <= 12000:
            answers[qnum] = chunk
    return answers, aligned, len(questions), len(candidates)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate only; do not rewrite output")
    args = parser.parse_args()
    with open(os.path.join(OUT_DIR, "arabic_index.json"), encoding="utf-8") as source:
        index = json.load(source)

    all_answers, total_aligned = {}, 0
    for book_number in BOOK_RANGES:
        answers, aligned, expected, candidate_count = extract_book(book_number, index)
        all_answers.update(answers)
        total_aligned += len(aligned)
        print(f"Book {book_number}: {len(aligned)}/{expected} headings aligned, "
              f"{len(answers)} answers ({candidate_count} candidates)")

    output = [
        {"questionNumber": q, "question": index.get(str(q), ""), "answer": all_answers.get(q, "")}
        for q in range(1, 1453)
    ]
    if len(index) != 1452:
        print(f"WARNING: Arabic index contains {len(index)}/1452 questions")
    if total_aligned < 1200:
        raise SystemExit(f"Refusing output: only {total_aligned}/1452 headings aligned")
    # Validate that all extracted answers have reasonable content
    bad_answers = 0
    for entry in output:
        if entry["answer"]:
            # Flag answers that contain embedded question numbers or are too short
            if re.search(r'\n\d{2,4}\s*\.\s', entry["answer"]) or len(entry["answer"]) < 30:
                print(f"WARNING: Q{entry['questionNumber']} answer looks corrupted, clearing it")
                entry["answer"] = ""
                bad_answers += 1
    if bad_answers:
        print(f"Cleared {bad_answers} corrupted answers")
    output_path = os.path.join(OUT_DIR, "catechism_qa_ar.json")
    if args.check:
        if not os.path.exists(output_path) or json.load(open(output_path, encoding="utf-8")) != output:
            raise SystemExit("Arabic dataset is stale; run extractor without --check")
    else:
        with open(output_path, "w", encoding="utf-8") as target:
            json.dump(output, target, ensure_ascii=False, indent=2)
    print(f"Validated {len(output)} records: {total_aligned} aligned, {len(all_answers)} with answers")


if __name__ == "__main__":
    main()
