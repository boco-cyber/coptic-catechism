#!/usr/bin/env python3
"""Hybrid per-chapter segmentation.

Combines two signals that were each insufficient alone:
  - Text similarity to the known Arabic question index (arabic_index.json,
    1387/1452 populated) -- robust to the chapter-local renumbering, but
    proved fool-able book-wide by footnote numbers/enumerated lists.
  - The chapter-local printed number (1..chapter size), from
    backend/data/verification/chapters_en.json -- exact and unambiguous, but
    brittle to individual OCR digit errors.

Doing DP alignment *per chapter* (not per book) keeps each subproblem small
(most chapters have well under 40 questions), so a wrong local match can't
drag the whole book out of sync, and a bonus score when the printed local
number agrees with the expected position disambiguates real headings from
similarity-only false positives.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from align_v2 import ARABIC_RE, MIN_SCORE, QUESTION_WORDS, clean_text, content_end, normalize, similarity  # noqa: E402

WORK_DIR = Path(__file__).resolve().parents[3] / "data" / "verification"
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
LEADING_NUM_RE = re.compile(r"^\s*[\[(（(]?\s*([0-9٠-٩]{1,3})\b")
CANDIDATE_WINDOW_MULT = 10
CANDIDATE_WINDOW_MIN = 40
NUMBER_BONUS = 0.15
ACCEPT_SIMILARITY_FLOOR = 0.35


def leading_number(text: str) -> int | None:
    m = LEADING_NUM_RE.match(text)
    if not m:
        return None
    return int(m.group(1).translate(ARABIC_DIGITS))


REPORTED_SPEECH_MARKERS = ("سأل", "أجاب", "يجيب", "أجابه", "سألته", "سألتهان", "فسألني")


def question_candidates_with_numbers(lines):
    candidates = []
    cleaned = [clean_text(line) for line in lines]
    for index, text in enumerate(cleaned):
        normalized = normalize(text)
        if not ARABIC_RE.search(text) or not 5 <= len(normalized) <= 180:
            continue
        # A real heading is a direct question; a line narrating that someone
        # asked/answered a question (patristic anecdotes, quoted dialogue in
        # an answer) contains "؟" just as often but is never the heading.
        if any(marker in text for marker in REPORTED_SPEECH_MARKERS):
            continue
        # A real heading is, by definition, a question -- it must contain a
        # question mark somewhere. Previously this also accepted any line
        # merely *starting* with an ambiguous question word (chiefly "من ",
        # which means both "who" and "from"), with no attempt at multi-line
        # reconstruction to justify it; that let plain declarative sentences
        # ("من مصر انطلقت كل النظم الرهبانية...") through as false headings.
        if "؟" in text:
            candidates.append((index, text, leading_number(text)))
            continue
        # A heading that wraps across an OCR line break (؟ falls on the next
        # line) still starts its own sentence with a question word or a
        # printed local number; join up to 2 more lines looking for the ؟
        # before giving up, rather than dropping the heading entirely.
        without_number = re.sub(r"^[\s\d٠-٩.،؛:()\-]+", "", text)
        starts_like_heading = leading_number(text) is not None or normalize(without_number).startswith(
            tuple(normalize(w) for w in QUESTION_WORDS)
        )
        if not starts_like_heading:
            continue
        joined = text
        for lookahead in range(index + 1, min(index + 3, len(cleaned))):
            joined = f"{joined} {cleaned[lookahead]}"
            if "؟" in cleaned[lookahead]:
                candidates.append((index, joined.split("؟", 1)[0].strip() + "؟", leading_number(text)))
                break
            if len(joined) > 300:
                break
    return candidates


def align_chapter(reference, candidates, expected_locals):
    """reference: list of (global_num, ref_text); candidates: list of (line_idx, text, local_num).
    expected_locals[i] is the chapter-local number for reference[i]."""
    rows, cols = len(reference), len(candidates)
    if rows == 0 or cols == 0:
        return {}
    skip_q, skip_c = -0.32, -0.015
    back = [bytearray(cols + 1) for _ in range(rows + 1)]
    previous = [j * skip_c for j in range(cols + 1)]
    for j in range(1, cols + 1):
        back[0][j] = 3
    for i in range(1, rows + 1):
        current = [i * skip_q] + [0.0] * cols
        back[i][0] = 2
        _gnum, ref_text = reference[i - 1]
        expected_local = expected_locals[i - 1]
        for j in range(1, cols + 1):
            _line_idx, cand_text, cand_local = candidates[j - 1]
            score = similarity(ref_text, cand_text) if ref_text else 0.0
            if cand_local is not None and cand_local == expected_local:
                score = min(1.0, score + NUMBER_BONUS)
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
            gnum, ref_text = reference[i - 1]
            _line_idx, cand_text, _cand_local = candidates[j - 1]
            raw_score = similarity(ref_text, cand_text) if ref_text else 0.0
            number_matches = candidates[j - 1][2] == expected_locals[i - 1]
            # A number match alone must not override weak/no textual similarity
            # (real prose is full of embedded rhetorical questions with
            # coincidentally-matching printed numbers); it only breaks ties
            # once genuine similarity is already present, or substitutes for it
            # when the reference text itself is missing.
            accepted = (
                raw_score >= ACCEPT_SIMILARITY_FLOOR
                or (number_matches and raw_score >= ACCEPT_SIMILARITY_FLOOR * 0.6)
                or (ref_text == "" and number_matches and "؟" in cand_text)
            )
            if accepted:
                aligned[gnum] = (candidates[j - 1][0], raw_score if ref_text else None)
            i, j = i - 1, j - 1
        elif action == 2:
            i -= 1
        else:
            j -= 1
    return aligned


OVERLAP_FRACTION = 1.5


def segment_book(book_number, chapters, index):
    path = WORK_DIR / "ocr_v2" / f"ocr_book{book_number}.txt"
    with open(path, encoding="utf-8") as source:
        lines = [clean_text(line) for line in source if clean_text(line)]
    first_question = index.get(str(chapters[0]["questionRange"]["start"]), "")
    end = content_end(lines, first_question, book_number) if first_question else len(lines)
    lines = lines[:end]
    candidates = question_candidates_with_numbers(lines)

    # A shared "consume candidates sequentially" pointer lets one chapter's
    # window starve every later chapter when candidate density is uneven
    # across the book. Instead, estimate each chapter's line span from its
    # share of the book's total question count, with generous overlap so a
    # chapter's real headings that fall slightly outside its proportional
    # slice are still visible to that chapter's alignment.
    total_questions = sum(c["questionRange"]["end"] - c["questionRange"]["start"] + 1 for c in chapters)
    total_lines = len(lines)
    cumulative = 0
    all_aligned = {}
    used_lines = set()
    for chapter in chapters:
        start_q, end_q = chapter["questionRange"]["start"], chapter["questionRange"]["end"]
        count = end_q - start_q + 1
        reference = [(g, index.get(str(g), "")) for g in range(start_q, end_q + 1)]
        expected_locals = list(range(1, count + 1))

        span_lines = total_lines * count / total_questions
        est_start = total_lines * cumulative / total_questions
        est_end = est_start + span_lines
        buffer = max(span_lines * OVERLAP_FRACTION, 60)
        lo, hi = max(0, est_start - buffer), min(total_lines, est_end + buffer)
        # A candidate line already claimed by an earlier chapter (overlap
        # windows can otherwise let two chapters both "match" the same real
        # heading when the true heading for one of them was lost to OCR noise)
        # must not be reused.
        window = [c for c in candidates if lo <= c[0] <= hi and c[0] not in used_lines]

        aligned = align_chapter(reference, window, expected_locals)
        used_lines.update(line for line, _score in aligned.values())
        all_aligned.update(aligned)
        cumulative += count
    return lines, candidates, all_aligned


def main():
    chapters_all = json.loads((WORK_DIR / "chapters_en.json").read_text(encoding="utf-8"))
    by_book = {}
    for c in chapters_all:
        by_book.setdefault(c["bookNumber"], []).append(c)
    for book in by_book:
        by_book[book].sort(key=lambda c: c["chapterNumber"])
    with open(Path(__file__).resolve().parents[3] / "data" / "arabic_index.json", encoding="utf-8") as f:
        index = json.load(f)

    dataset = {}
    report = {}
    for book in range(1, 8):
        lines, candidates, aligned = segment_book(book, by_book[book], index)
        ordered = sorted((line, gnum, score) for gnum, (line, score) in aligned.items())
        for pos, (line, gnum, score) in enumerate(ordered):
            next_line = ordered[pos + 1][0] if pos + 1 < len(ordered) else len(lines)
            answer = clean_text("\n".join(lines[line + 1:next_line]))
            question = lines[line]
            if 20 <= len(answer) <= 50000:
                dataset[gnum] = {
                    "questionNumber": gnum, "question": question, "answer": answer,
                    "confidence": ("number-only" if score is None else round(score, 3)),
                }
        expected = by_book[book][-1]["questionRange"]["end"] - by_book[book][0]["questionRange"]["start"] + 1
        report[book] = {"aligned": len(aligned), "expected": expected, "candidates": len(candidates)}
        print(f"Book {book}: {len(aligned)}/{expected} aligned ({len(candidates)} candidates)")

    output = [dataset[n] for n in sorted(dataset)]
    (WORK_DIR / "catechism_qa_ar_hybrid.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Total: {len(output)}/1452 complete records")


if __name__ == "__main__":
    main()
