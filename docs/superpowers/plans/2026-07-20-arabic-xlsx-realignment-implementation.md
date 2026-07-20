# Arabic XLSX Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `backend/data/catechism_qa_ar.json` with content from the new, better-OCR'd
xlsx source, using a fully automated book-segmented fuzzy alignment pass (no manual review
gate), then reseed MongoDB and spot-check.

**Architecture:** Two new standalone Python scripts. `extractArabicXlsx.py` (in
`backend/src/seeds/`, matching the existing `extractArabicDocxRaw.py` convention) parses the
xlsx into a validated JSON list. `align_xlsx.py` (in `backend/src/seeds/verification/`,
alongside the existing verification pipeline scripts it reuses) segments both the xlsx list
and the current dataset into the app's 7 fixed books, runs a monotonic dynamic-programming
fuzzy alignment per book (the same algorithm shape as the existing `align_v2.py`'s
`align_questions()`), and writes the rebuilt dataset directly plus a non-blocking report.
Existing `seedArabic.js` is reused unchanged for the DB write.

**Tech Stack:** Python 3 (openpyxl for xlsx parsing; rapidfuzz if available, else the
project's existing difflib fallback via `compare_datasets.similarity()`), Node/Mongoose
(existing `seedArabic.js`), MongoDB Atlas.

## Global Constraints

- Both datasets (current and xlsx) must contain each question number 1..1452 exactly once —
  hard-fail if not (spec §3 Stage 1, §4).
- No manual review gate anywhere in this pipeline — every question number always resolves to
  either the new xlsx text or the current text, automatically (spec §3 Stage 2 step 4, §6).
- No `.v1.json` backup file; git history is the safety net (spec §3 Stage 2).
- No new automated test suite (pytest etc.) — verify by running against real data and
  inspecting output/report, matching how the project's other one-off extraction scripts are
  verified (spec §5).
- Alignment floor threshold starts at 0.35 token-set similarity, tunable (spec §3 Stage 2
  step 4).

---

### Task 1: Extract the xlsx into a validated JSON file

**Files:**
- Create: `backend/src/seeds/extractArabicXlsx.py`

**Interfaces:**
- Produces: `backend/data/verification/catechism_qa_ar_xlsx.json` — a JSON array of `{questionNumber: int, part: int, partTitle: str, question: str, answer: str}`, exactly 1,452 entries, `questionNumber` covering 1..1452 exactly once. This is what Task 2/3's `align_xlsx.py` reads.

- [ ] **Step 1: Confirm openpyxl is importable**

Run: `python3 -c "import openpyxl; print(openpyxl.__version__)"`
Expected: prints a version number (e.g. `3.1.5`). If it fails with `ModuleNotFoundError`, run `python3 -m pip install --break-system-packages openpyxl` first (this environment's `python3` is a uv-managed interpreter that needs the override flag).

- [ ] **Step 2: Write the extraction script**

```python
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
```

- [ ] **Step 3: Run it against the real xlsx and verify**

Run: `python3 backend/src/seeds/extractArabicXlsx.py`
Expected: `Parsed and validated 1452 rows -> .../backend/data/verification/catechism_qa_ar_xlsx.json`

Then inspect the first entry:
Run: `python3 -c "import json; d=json.load(open('backend/data/verification/catechism_qa_ar_xlsx.json')); print(d[0])"`
Expected: a dict with `questionNumber: 1`, `part: 1`, and Arabic `question`/`answer` text.

- [ ] **Step 4: Commit**

```bash
git add backend/src/seeds/extractArabicXlsx.py
git commit -m "$(cat <<'EOF'
feat(arabic-xlsx): add xlsx extraction script

Parses the polished xlsx Arabic Q&A source (1,452 rows, one question
per row) into validated JSON. Does not trust the xlsx's own row
numbering against the app's book boundaries - align_xlsx.py handles
that separately by content alignment.
EOF
)"
```

(The generated `backend/data/verification/catechism_qa_ar_xlsx.json` is under the existing
gitignored `backend/data/verification/` directory and is not committed.)

---

### Task 2: Alignment core — book segmentation and fuzzy DP matching

**Files:**
- Create: `backend/src/seeds/verification/align_xlsx.py` (helpers only in this task; `main()` comes in Task 3)

**Interfaces:**
- Consumes: `backend/src/seeds/verification/common.py`'s `BOOK_RANGES` (dict `{book: (start, end)}`), and `compare_datasets.py`'s `similarity(left: str, right: str) -> float`.
- Produces: `candidate_window(xlsx_rows: list[dict], book: int) -> list[dict]` and `align_book(app_entries: list[tuple[int, str]], candidates: list[tuple[int, str]], floor: float = FLOOR) -> dict[int, tuple[int, float]]`, both consumed by Task 3's `main()`.

- [ ] **Step 1: Write the alignment helpers**

```python
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

from common import BOOK_RANGES
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
```

- [ ] **Step 2: Verify with a synthetic example before touching real data**

Run this from `backend/src/seeds/verification/` (so the sibling imports resolve):

```bash
cd backend/src/seeds/verification && python3 -c "
from align_xlsx import align_book

app_entries = [(101, 'ما هو الايمان'), (102, 'من هو المسيح'), (103, 'ما هي الكنيسة')]
candidates = [
    (501, 'سؤال غير مرتبط تماما عن موضوع اخر'),
    (502, 'ما هو الايمان'),
    (503, 'من هو المسيح'),
    (504, 'ما هي الكنيسه'),
]
result = align_book(app_entries, candidates)
print('shifted/near-duplicate match:', result)
assert result[101][0] == 502
assert result[102][0] == 503
assert result[103][0] == 504
assert 501 not in {v[0] for v in result.values()}

no_match = align_book([(1, 'ماذا تعني كلمة كاتيشيزم')], [(1, 'جدول الضرب للاعداد من واحد الى عشرة')])
print('unrelated text, no match:', no_match)
assert no_match == {}

print('OK')
"
```

Expected: prints the two result dicts, then `OK` with no assertion errors. This proves the
aligner (a) skips an unrelated inserted candidate and picks the right shifted match for each
app entry in order, and (b) returns no match at all when nothing clears the floor.

- [ ] **Step 3: Commit**

```bash
git add backend/src/seeds/verification/align_xlsx.py
git commit -m "$(cat <<'EOF'
feat(arabic-xlsx): add book-segmented fuzzy alignment core

candidate_window() slices the xlsx's ordered rows per app book with a
buffer to absorb boundary drift; align_book() is a monotonic DP fuzzy
match (same shape as align_v2.py's align_questions()) that finds each
app question's best xlsx match in order, rejecting anything below a
similarity floor.
EOF
)"
```

---

### Task 3: Wire the pipeline — rebuild the dataset and write the report

**Files:**
- Modify: `backend/src/seeds/verification/align_xlsx.py` (add `main()`)

**Interfaces:**
- Consumes: `common.py`'s `DATA_DIR`, `WORK_DIR`, `book_for_question`, `load_json`, `write_json`; Task 2's `candidate_window()` and `align_book()`.
- Produces: overwrites `backend/data/catechism_qa_ar.json`; writes `backend/data/verification/xlsx_alignment_report.md`.

- [ ] **Step 1: Add `main()` to `align_xlsx.py`**

Replace the `from common import BOOK_RANGES` line from Task 2 with:

```python
from collections import Counter, defaultdict

from common import BOOK_RANGES, DATA_DIR, WORK_DIR, book_for_question, load_json, write_json
```

Append this to the end of the file:

```python
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
```

- [ ] **Step 2: Run it against the real data**

Run: `cd backend/src/seeds/verification && python3 align_xlsx.py`

Expected: 7 lines like `Book N: X/Y questions matched`, followed by `Adopted .../1452; wrote
backend/data/catechism_qa_ar.json and xlsx_alignment_report.md`.

- [ ] **Step 3: Inspect the report and a sample diff**

Run: `cat backend/data/verification/xlsx_alignment_report.md`
Expected: a per-book adopted/kept-current table; adopted counts should be the large majority
of each book's total (based on the design's earlier drift analysis, expect adoption in the
high 90s% per book — investigate before proceeding if any book's adopted count is
unexpectedly low, e.g. under 80%).

Run: `git diff --stat backend/data/catechism_qa_ar.json`
Expected: shows the file changed with a large number of line changes (thousands), consistent
with a near-total content replacement.

Run: `python3 -c "import json; d=json.load(open('backend/data/catechism_qa_ar.json')); print(len(d)); print(d[0])"`
Expected: `1452`, followed by the Q1 entry with Arabic text.

- [ ] **Step 4: Commit**

```bash
git add backend/src/seeds/verification/align_xlsx.py backend/data/catechism_qa_ar.json
git commit -m "$(cat <<'EOF'
feat(arabic-xlsx): rebuild Arabic dataset from aligned xlsx content

Runs the book-segmented fuzzy alignment against the current dataset and
adopts the xlsx's question/answer text wherever a confident match was
found, keeping the current text unchanged elsewhere. No manual review
gate, per design. See backend/data/verification/xlsx_alignment_report.md
(gitignored) for the per-book adoption breakdown.
EOF
)"
```

---

### Task 4: Reseed MongoDB and spot-check

**Files:** none (operational task — runs existing scripts and the existing API)

- [ ] **Step 1: Reseed the Arabic collection**

Run: `cd backend && npm run seed:arabic`
Expected: exits 0; prints the existing `seedArabic.js` progress output ending in a success
line, with the same "N question(s) have no Arabic answer yet" style line if any remain (should
be 0 or very close to the 3 originally noted, since the new source's answers should fill most
gaps).

- [ ] **Step 2: Start the API and spot-check known-previously-broken entries**

Run: `cd backend && npm run dev &` (or `npm start &`), wait a couple seconds for
`Coptic Catechism API running on port 5000`, then:

```bash
curl -s http://localhost:5000/api/questions/1?lang=ar | head -c 300
curl -s http://localhost:5000/api/questions/185?lang=ar | head -c 300
curl -s http://localhost:5000/api/questions/1019?lang=ar | head -c 300
curl -s http://localhost:5000/api/questions/1102?lang=ar | head -c 300
curl -s http://localhost:5000/api/stats
```

Expected: each `/api/questions/N` call returns JSON with non-empty Arabic `question`/`answer`
fields. Q185, Q1019, and Q1102 are the 3 questions with no Arabic answer in the current
(pre-pass) dataset — check whether the new xlsx source filled them in, or whether they're
still empty (in which case the API's existing English-fallback behavior applies, same as
before). `/api/stats` returns the usual totals unchanged (still 1,452 questions, 7 books).

Then stop the server: `kill %1` (or the appropriate job/PID from the `npm run dev &` output).

- [ ] **Step 3: Report findings to the user**

Summarize: the adoption rate from the report, whether Q185/Q1019/Q1102 (the 3 previously
no-answer questions) now have content, and flag anything that looked wrong during the
spot-check (e.g. a question whose Arabic text obviously doesn't match its English
counterpart) for the user's own follow-up — this is informational, not a blocking gate per the
design.

No commit in this task (MongoDB is external state, not a git artifact).
