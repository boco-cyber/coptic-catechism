# Arabic Catechism Verification & Rebuild — Design

**Status:** Approved (design), pending spec review
**Date:** 2026-07-14
**Scope:** Data-quality pass on the Arabic Q&A dataset only. No changes to backend models, API, or web UI.

---

## 1. Motivation

The current `backend/data/catechism_qa_ar.json` (1,452 entries) was extracted from
Tesseract OCR of the Arabic PDFs. Known quality problems:

- The PDFs' embedded text layer is corrupted (broken ToUnicode maps), so the data
  came from noisy OCR of page images.
- 35 entries have Arabic answers under 30% of the length of their English
  counterpart (misalignment symptom); 9 are suspiciously long.
- 8 entries (`arabic_translated_fallbacks.json`: Q359, Q420, …) are machine
  translations from English, not from the Arabic books at all.
- The 2026-07-13 handoff doc notes "sample answer mappings are visibly incorrect."

Decision (user-approved): re-transcribe **every page** of the 7 Arabic books with a
vision model, treat that transcription as the new ground truth, rebuild the dataset
from it, and use the diff against the current JSON as the verification report.

## 2. Provider

- **Primary: Google Gemini Flash** via its OpenAI-compatible endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai/`), key in
  `backend/.env` as `GEMINI_API_KEY`.
- **Fallback: NVIDIA NIM** (`https://integrate.api.nvidia.com/v1`, a
  vision-capable model such as a Qwen-VL or Llama-vision NIM), key as
  `NVIDIA_API_KEY`.
- Both are OpenAI-compatible, so a single transcription client is used; the
  provider is selected by `TRANSCRIBE_PROVIDER=gemini|nvidia` in `backend/.env`.
- Estimated cost with Gemini Flash: within free tier or a few dollars for
  ~1,342 pages.

Anthropic Batch API (Opus/Sonnet/Haiku) was considered and declined by the user
on cost grounds.

## 3. Source material

`/home/gergo/OneDrive/Documents/catechism fr malaty arabic/` — 7 book PDFs
(ج1–ج7, 1,266 pages total: 99/260/344/242/67/140/114) matching English books 1–7,
plus a 76-page "questions & contents" index PDF listing all question numbers per
chapter.

## 4. Pipeline

Five resumable stages, implemented as scripts in
`backend/src/seeds/verification/` (Python, matching the existing extraction
scripts). Intermediate artifacts live under `backend/data/verification/`
(gitignored — hundreds of MB).

### Stage 1 — Render pages (`render_pages.py`)

`pdftoppm` renders every page of the 7 books + index PDF to grayscale PNG at
~150 DPI → `backend/data/verification/pages/book{1-7}/page-NNNN.png` (index as
`book0`). Skips pages whose PNG already exists.

### Stage 2 — Transcribe (`transcribe_pages.py`)

For each page image, call the configured provider with a strict prompt:
transcribe the printed Arabic exactly; preserve question numbers, headings, and
paragraph breaks; tag footnotes; output only the page text (no commentary).
Output → `backend/data/verification/transcripts/book{N}/page-NNNN.txt`.

- **Resumable:** skips pages whose transcript exists and is non-empty.
- **Rate-limited:** configurable delay/concurrency to stay inside Gemini
  free-tier quotas.
- **Failure handling:** 3 retries with exponential backoff; persistent failures
  recorded in `failed_pages.json`. Stage 3 refuses to run while any failures
  remain (rerun stage 2, optionally with `TRANSCRIBE_PROVIDER=nvidia`, to fill
  gaps).

### Stage 3 — Segment (`segment_transcripts.py`)

Concatenate each book's transcripts in page order and split into
question/answer entries keyed by question number. Handles Arabic-Indic numerals
(١٢٣) and the numbering patterns already handled in `extractArabicAnswers.py`.

Validation frame = the English dataset: 1,452 question numbers with fixed
per-book ranges (B1: 1–92, B2: 93–448, B3: 449–877, B4: 878–1112, B5:
1113–1184, B6: 1185–1356, B7: 1357–1452). Every number must appear exactly
once, in ascending order, in the correct book. Gaps, duplicates, and
out-of-order numbers are **hard errors** written to the report — never silently
skipped (silent skipping caused the original misalignment bug). The index PDF
transcription is used as a cross-check for question wording and chapter
structure.

Output → `backend/data/verification/catechism_qa_ar_transcribed.json` (same
shape as `catechism_qa_ar.json`).

### Stage 4 — Compare & report (`compare_datasets.py`)

Per question, fuzzy similarity (rapidfuzz `token_sort_ratio` on
whitespace/diacritic-normalized text) between the transcribed entry and the
current JSON entry, for question text and answer text separately.

| Class | Rule | Action |
|---|---|---|
| match | similarity ≥ 0.85 | adopt new text (canonical source) |
| improved | 0.50–0.85 | adopt new text; listed in report |
| conflict | < 0.50 | adopt new text **only after manual review**; listed prominently with old/new side by side |
| fallback | one of the 8 machine-translated entries | always adopt new |

Outputs → `backend/data/verification/verification_report.json` (machine) and
`verification_report.md` (human: per-book stats, full conflict list).

### Stage 5 — Rebuild & seed (`build_v2.py` + existing `seedArabic.js`)

- Copy current file to `backend/data/catechism_qa_ar.v1.json` (kept, committed).
- Write new `backend/data/catechism_qa_ar.json` from the transcription
  (conflict entries only after user sign-off on the report).
- Re-run `npm run` seed for Arabic (`seedArabic.js`) against MongoDB.
- Spot-check live API: `/api/questions/N?lang=ar` for a sample including
  previously-broken entries (Q302, Q359, Q420, Q1452) and Arabic search.

## 5. Error handling summary

- Provider errors: retry ×3 with backoff → `failed_pages.json`; downstream
  stages hard-stop while failures exist.
- Segmentation anomalies: hard errors in the report, never silent skips.
- Nothing destructive: v1 dataset preserved; report records every change;
  MongoDB reseed is idempotent (upserts by questionNumber).

## 6. Security notes (done during this design session)

- `backend/.env` and `New Text Document.txt` (both containing live MongoDB
  Atlas credentials) were **tracked in git and pushed to GitHub**. They are now
  untracked and gitignored. **The credentials remain in git history — rotate
  the MongoDB Atlas password** and consider rewriting history before the repo
  is shared further.
- Provider API keys live only in `backend/.env` (now gitignored);
  `backend/.env.example` documents the variables with placeholders.

## 7. Out of scope

- Backend API changes, web UI changes, English data.
- Theological/editorial review of content (the report enables it; performing it
  is the user's manual step for conflict entries).
- MongoDB migration from Atlas to Coolify and third-party API hardening
  (separate future projects).
