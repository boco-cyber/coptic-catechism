# Implementation Plan: Multilingual Backend v1

Based on `docs/superpowers/specs/multilingual-backend-v1.md`

---

## Phase 1 — Arabic PDF Extraction

### Step 1.1 — Extract question index from الأسئلة-والمحتويات.pdf

**File to create:** `backend/src/seeds/extractArabicIndex.js`

- Use `pdftotext` (via `child_process.exec`) to convert the Questions & Contents PDF
- Parse the output to build a map: `{ [questionNumber]: "arabic question text" }`
- Also extract chapter boundaries and their Arabic titles
- Output: `backend/data/arabic_index.json`

**Verification:** Log the first 10 and last 5 entries. Confirm all 1,450 question
numbers are present, no gaps.

### Step 1.2 — Extract answers from each book PDF (جـ1 through جـ7)

**File to create:** `backend/src/seeds/extractArabicAnswers.js`

- For each book PDF, run `pdftotext` with layout mode
- Parse each PDF into a flat text blob, then split by question-number patterns
- Match each answer block to a question number from the index
- Handle multi-page answers by scanning for the next question number as boundary
- Strip headers, footers, page numbers common to each PDF
- Output: `backend/data/arabic_answers_raw.json` (array of `{ questionNumber, answer }`)

**Verification:** Spot-check 3 questions from each book — compare extracted answer
to the PDF visually.

### Step 1.3 — Merge & produce catechism_qa_ar.json

**File to create:** `backend/src/seeds/buildArabicQa.js`

- Reads `arabic_index.json` and `arabic_answers_raw.json`
- Merges by `questionNumber`
- Validates every English `questionNumber` (1–1452) has an Arabic match — **fails
  if any are missing**
- Outputs `backend/data/catechism_qa_ar.json` matching the shape of
  `catechism_qa.json`
- Also exports `arabic_titles.json` with book/chapter Arabic titles for manual
  finalization

**Verification:** `node src/seeds/buildArabicQa.js` exits code 0. File sizes
between English and Arabic JSON are within reasonable range (~3 MB).

### Step 1.4 — Extract Arabic book/chapter titles manually

**Manual task:** Open each of the 8 PDFs, find the table of contents, and copy
Arabic titles for all 7 books and ~87 chapters into `arabic_titles.json`.

---

## Phase 2 — Backend Model & API

### Step 2.1 — Create QuestionAr model

**File to create:** `backend/src/models/QuestionAr.js`

- Same schema as `Question.js` but with Arabic text index using
  `default_language: 'arabic'` (MongoDB will need an Arabic-aware build, which
  Atlas and self-hosted MongoDB provide; verify before proceeding)
- Same weight placeholder structure (10/5/1) — adjust later
- Same lookup indexes

**Verification:** `node -e "require('./src/models/QuestionAr'); console.log('ok')"`

### Step 2.2 — Update Book model

**File to edit:** `backend/src/models/Book.js`

- Add fields:
  ```js
  titleAr: { type: String, trim: true },
  descriptionAr: { type: String, trim: true }
  ```

### Step 2.3 — Update Chapter model

**File to edit:** `backend/src/models/Chapter.js`

- Add field:
  ```js
  titleAr: { type: String, trim: true }
  ```

### Step 2.4 — Update models/index.js

**File to edit:** `backend/src/models/index.js`

- Add: `QuestionAr: require('./QuestionAr')`

### Step 2.5 — Update bookController.js

**File to edit:** `backend/src/controllers/bookController.js`

- Import `QuestionAr`
- In `getAllBooks`: if `req.query.lang === 'ar'`, map `titleAr→title` and
  `descriptionAr→description` in the response
- In `getBook`: same field swap when `?lang=ar`
- In `getChapter`: same field swap + query `QuestionAr` instead of `Question`
  when `?lang=ar`

### Step 2.6 — Update questionController.js

**File to edit:** `backend/src/controllers/questionController.js`

- Import `QuestionAr`
- Every handler: determine model by `req.query.lang === 'ar' ? QuestionAr : Question`
- `getQuestion`: swap model for the main query; prev/next query the same model
- `getQuestionRange`: swap model
- `searchQuestions`: swap model (Arabic text index will be used automatically)
- `getBookQuiz`: swap model
- `getChapterQuiz`: swap model
- `getStats`: query both `Question` and `QuestionAr`, return backward-compatible
  shape with `questionsByLang`

### Step 2.7 — Create Arabic seed script

**File to create:** `backend/src/seeds/seedArabic.js`

- Reads `catechism_qa_ar.json` and `arabic_titles.json`
- For each entry: `QuestionAr.findOneAndUpdate({ questionNumber }, { ... }, { upsert: true })`
- Updates Book documents with `titleAr`/`descriptionAr`
- Updates Chapter documents with `titleAr`
- Package.json script: `"seed:arabic": "node src/seeds/seedArabic.js"`

**Verification:** `npm run seed:arabic` succeeds. MongoDB has exactly 1,450
`questionar` documents with Arabic content.

### Step 2.8 — Update routes (if needed)

**File to edit:** `backend/src/routes/api.js`

- Review: likely no route changes needed since `lang` is a query param, not a
  path param. Only verify all endpoints pass `req.query` through.

---

## Phase 3 — Deployment

### Step 3.1 — Point to Coolify MongoDB

**File to edit:** `backend/.env`

- Change `MONGODB_URI` from Atlas to the self-hosted MongoDB connection string
  on Coolify

### Step 3.2 — Docker build & deploy

```bash
docker build -t catechism-api .
docker push ... # to your Coolify registry
```

### Step 3.3 — Run seed scripts on Coolify

```bash
# One-off exec on the deployed container:
node src/seeds/seedDatabase.js    # English data
node src/seeds/seedArabic.js      # Arabic data
```

### Step 3.4 — Smoke test deployed API

```bash
# English
curl https://your-coolify-app/api/questions/1 | python3 -m json.tool

# Arabic
curl "https://your-coolify-app/api/questions/1?lang=ar" | python3 -m json.tool

# Stats (backward-compatible)
curl https://your-coolify-app/api/stats | python3 -m json.tool

# Search
curl "https://your-coolify-app/api/search?q=ثالوث"  # Arabic search
```

---

## Verification Checklist

| # | Check | Phase |
|---|---|---|
| 1 | `arabic_index.json` covers all 1,450 question numbers | 1 |
| 2 | `catechism_qa_ar.json` merges cleanly, no missing entries | 1 |
| 3 | Arabic text from `pdftotext` is legible (manual spot-check) | 1 |
| 4 | `QuestionAr` model loads without error | 2 |
| 5 | Book/Chapter Arabic titles persist after seed | 2 |
| 6 | `?lang=ar` returns Arabic content, `lang=en` (or no param) returns English | 2 |
| 7 | `/api/search?q=ثالوث` returns Arabic results | 2 |
| 8 | `/api/stats` includes `questionsByLang` and existing `questions` field | 2 |
| 9 | `npm run seed:arabic` fails if any questionNumber is missing alignment | 2 |
| 10 | Deployed endpoint responds on Coolify | 3 |
