# Arabic Q&A Realignment from Polished XLSX — Design

**Status:** Approved (design), pending spec review
**Date:** 2026-07-20
**Scope:** Replace `backend/data/catechism_qa_ar.json` content using a new, higher-quality
OCR source. No changes to backend models, API, or web UI.

---

## 1. Motivation

The current Arabic dataset (`backend/data/catechism_qa_ar.json`, 1,452 entries) was built by
the 2026-07-17 pass (`extractArabicDocxRaw.py`), extracting from a "polished docx" and
content-aligning it to the app's fixed English-derived question numbering. That pass left 243
entries flagged `needsReview` (heuristic merge/split guesses) and 3 questions with no Arabic
answer at all.

The user has produced a new, better-OCR'd source:
`كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-1452-سؤال-وجواب.xlsx` — a single sheet, already
structured one row per question (`الرقم` / `الجزء` / `عنوان الجزء` / `السؤال` / `الإجابة`),
exactly 1,452 rows, no gaps or duplicate numbers.

Decision (user-approved): treat this xlsx as the new source of truth and fully replace the
Arabic dataset, auto-resolving all alignment ambiguity with no manual review gate.

## 2. The alignment problem

The xlsx's own row numbering does **not** line up with the app's book/question boundaries —
confirmed by direct comparison: by row 8 the xlsx and current dataset are on unrelated
questions, and part-boundary counts differ from the app's fixed book ranges (e.g. xlsx part 1
has 97 rows vs. the app's Book 1 range of 92). This is the same numbering-drift problem the
July 17 docx rebuild solved for its source; it recurs here because the xlsx's `الرقم` column
reflects the source document's own internal numbering, not the app's.

Content itself matches closely in reading order once you look past the number column (e.g.
xlsx row 4's question appears as the app's Q6), so this is solvable with order-preserving
fuzzy text alignment — no need for the citation-fingerprint anchoring the docx rebuild used,
since that was compensating for unstructured paragraph parsing, not present here.

## 3. Pipeline

Three new scripts under `backend/src/seeds/` (Python, matching existing extraction scripts),
plus reuse of the existing seed step. Intermediate artifacts under
`backend/data/verification/` (already gitignored).

### Stage 1 — Extract (`extractArabicXlsx.py`)

Parse the xlsx (openpyxl) into an ordered list of `{number, part, partTitle, question,
answer}` in row order.

Validation (hard failure, matching the posture of `seedArabic.js`'s existing 1452-count
check): exactly 1,452 rows; question numbers 1..1452 with no gaps or duplicates; part values
1..7.

Output → `backend/data/verification/catechism_qa_ar_xlsx.json`.

### Stage 2 — Align (`align_xlsx.py`)

1. Segment both the xlsx list (via its `part` column) and the current
   `catechism_qa_ar.json` (via the app's fixed per-book ranges: B1 1–92, B2 93–448, B3
   449–877, B4 878–1112, B5 1113–1184, B6 1185–1356, B7 1357–1452) into 7 books.
2. For each book, build the xlsx candidate window as that book's slice plus a small overlap
   buffer borrowed from the adjacent books (to absorb boundary drift like the observed 97-vs-92
   split).
3. Run a monotonic (order-preserving) DP alignment — Needleman-Wunsch style — between the
   app's question sequence for that book and the candidate xlsx window, scored by fuzzy text
   similarity (rapidfuzz, diacritic-normalized) on the question text. This maximizes total
   similarity while keeping assignments in reading order, tolerating the xlsx having a few
   more or fewer rows per book than the app does.
4. Adoption rule per app question number: if the best-aligned xlsx row's similarity clears a
   floor threshold (0.70 token-set ratio, selected after review of the real score distribution),
   adopt the xlsx question+answer text. If nothing clears the
   floor (no confident match — expected to be rare), keep the current text unchanged. Either
   way the question always ends up with a value; nothing blocks on this and no manual gate
   exists.

Output → new `backend/data/catechism_qa_ar.json` (1,452 entries, same shape as today) written
directly, plus `backend/data/verification/xlsx_alignment_report.md`: per-book counts of
adopted vs. kept-as-fallback, and average similarity — for the user's own later spot-checking,
not a blocking gate.

No separate `.v1.json` backup is kept; git history is the safety net, consistent with how the
July 17 rebuild was done.

### Stage 3 — Reseed

Re-run the existing `npm run` Arabic seed (`seedArabic.js`) unchanged — it already validates
the 1,452 count and required fields before writing to MongoDB, and already tolerates
questions with no Arabic answer (falls back to English at runtime).

## 4. Error handling

- **Extraction:** hard-fail on any structural problem in the xlsx (wrong row count,
  duplicate/missing question numbers, out-of-range part values).
- **Alignment:** never fails — every app question number always resolves to either the new
  xlsx text or a fallback to current text. This is a deliberate consequence of the
  user's "auto-resolve everywhere, no manual review" decision.
- **Reseed:** existing `seedArabic.js` validation is unchanged and still a hard gate against
  writing corrupt data into MongoDB.

## 5. Verification

- The align stage prints the report summary (per-book adopted/kept counts, average
  similarity) at the end of its run.
- After reseeding, spot-check a handful of live `/api/questions/N?lang=ar` calls, including
  entries previously known to be broken (Q359, Q420, the 3 no-answer questions), to confirm
  they now carry real content pulled from the new source.
- No new automated test suite — consistent with how the prior one-off extraction/verification
  scripts in this project were handled (inspection + spot check, not unit tests).

## 6. Out of scope

- Backend API, web UI, English data — unchanged.
- Theological/editorial review of content.
- The 243-entry `needsReview` backlog from the prior pass is not specifically targeted; it
  will be overwritten wherever this pass finds a confident xlsx match, and left as-is
  otherwise. No new needsReview flags are added by this pass (per the user's "auto-resolve
  everywhere" decision).
