# Arabic Source Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Arabic catalogue with the new 7-book, 83-section, 1,424-question source while leaving the 1,452-question English catalogue intact.

**Architecture:** Arabic gets dedicated `BookAr`/`ChapterAr` collections and independent question numbering. A Python sync step converts the source into two committed JSON datasets and downloads images. Public and admin APIs select English or Arabic models by language, and the UI treats the catalogues independently.

**Tech Stack:** Node.js/Express/Mongoose, vanilla browser JavaScript, Python 3, `node:test`, `unittest`, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-10-22-arabic-source-replacement-design.md`

## Global Constraints

- English remains exactly 1,452 questions and its 7-book/91-chapter structure.
- Arabic is exactly 7 books, 83 sections, 1,424 questions.
- Exclude source book `19`.
- Use `all_data.json` array order, never SQLite ID order.
- Preserve source text, titles, numbering, and markdown exactly.
- Do not add same-number English/Arabic pairing.
- No production MongoDB writes.
- Do not commit unless the user explicitly asks; the working tree already has uncommitted English-formatting work.
- Run `npm test` from `backend/` after each backend-facing task.
- Do not add comments to code unless they are necessary for a non-obvious constraint.

---

### Task 1: Arabic Source Sync and Datasets

**Files:**
- Create: `backend/src/seeds/syncArabicSource.py`
- Create: `backend/test/test_arabic_source.py`
- Create after sync: `backend/data/arabic_structure.json`
- Replace after sync: `backend/data/catechism_qa_ar.json`
- Create after sync: `backend/public/images/questions/*`

**Interfaces:**
- Produces: `load_source(path) -> list[dict]`
- Produces: `build_catalogue(books) -> tuple[dict, list[dict]]`
- Produces: `validate_catalogue(structure, questions, source_books) -> list[str]`
- Produces: `download_images(questions, public_dir) -> None`
- Produces JSON shape documented in the spec.

- [ ] **Step 1: Write failing tests**

```python
import json
import unittest
from pathlib import Path

from src.seeds.syncArabicSource import build_catalogue, load_source, validate_catalogue

SOURCE_DIR = Path('/home/gergo/Downloads/Youth-Catechism-QA')
SOURCE_FILE = SOURCE_DIR / 'all_data.json'


class ArabicSourceTests(unittest.TestCase):
    @unittest.skipUnless(SOURCE_FILE.exists(), 'Arabic source not present')
    def test_source_has_expected_counts_and_order(self):
        books = load_source(SOURCE_FILE)
        structure, questions = build_catalogue(books)
        self.assertEqual(len(structure['books']), 7)
        self.assertEqual(sum(len(b['sections']) for b in structure['books']), 83)
        self.assertEqual(len(questions), 1424)
        first_book = structure['books'][0]
        self.assertEqual(
            [section['sourceSectionId'] for section in first_book['sections']],
            [15, 16, 18, 17, 19, 20],
        )
        self.assertEqual(questions[0]['sourceQuestionId'], 1029)
        self.assertEqual(questions[-1]['sourceQuestionId'], 398)
        self.assertEqual(
            [row['questionNumber'] for row in questions],
            list(range(1, 1425)),
        )

    @unittest.skipUnless(SOURCE_FILE.exists(), 'Arabic source not present')
    def test_validation_reports_no_errors(self):
        books = load_source(SOURCE_FILE)
        structure, questions = build_catalogue(books)
        self.assertEqual(validate_catalogue(structure, questions, books), [])

    @unittest.skipUnless(SOURCE_FILE.exists(), 'Arabic source not present')
    def test_letter_book_is_excluded(self):
        books = load_source(SOURCE_FILE)
        structure, questions = build_catalogue(books)
        self.assertNotIn(19, [book['sourceBookId'] for book in structure['books']])
        self.assertFalse(any('Letter in english' in row['question'] for row in questions))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest backend/test/test_arabic_source.py -v`

Expected: import error because `syncArabicSource` does not exist.

- [ ] **Step 3: Implement sync module**

Implementation requirements:

```python
SOURCE_DEFAULT = Path(os.environ.get(
    'ARABIC_SOURCE_DIR', '/home/gergo/Downloads/Youth-Catechism-QA'
))
EXCLUDED_BOOK_IDS = {19}
STRUCTURE_FILE = DATA_DIR / 'arabic_structure.json'
QUESTION_FILE = DATA_DIR / 'catechism_qa_ar.json'
IMAGE_DIR = PUBLIC_DIR / 'images' / 'questions'
```

- `load_source` reads `all_data.json` and returns `payload['fetchNewData']`.
- `build_catalogue` iterates books, then sections, then questions in array
  order. It skips book ID 19, assigns `bookNumber` from source book ID,
  `chapterNumber` sequentially per book, and `questionNumber` sequentially
  across the whole catalogue.
- `question` is the source `title` unchanged.
- `answer` is the source `response` unchanged, or `''`.
- `imageUrl` is retained internally for downloading; the committed record gets
  `image` set to `null` until `download_images` assigns a local path.
- `validate_catalogue` returns a list of human-readable errors and must check
  counts, contiguous numbering, unique source IDs, exact text equality against
  the source, exclusion of book 19, and image references.
- `download_images` uses `urllib.request`, writes
  `IMAGE_DIR/<sourceQuestionId><extension>`, and sets
  `question['image'] = '/images/questions/<filename>'`.
- CLI:
  - `--source PATH`
  - `--check` validates without writing or downloading
  - `--skip-images`
  - default writes both JSON files and downloads images.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest backend/test/test_arabic_source.py -v`

Expected: PASS.

- [ ] **Step 5: Generate datasets and images**

Run:

```bash
python3 backend/src/seeds/syncArabicSource.py
python3 backend/src/seeds/syncArabicSource.py --check
```

Expected:
- `7 books, 83 sections, 1424 questions`
- `61 images`
- no validation errors.

- [ ] **Step 6: Verify generated data without Mongo**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path
q = json.loads(Path('backend/data/catechism_qa_ar.json').read_text())
s = json.loads(Path('backend/data/arabic_structure.json').read_text())
assert len(q) == 1424
assert q[0]['questionNumber'] == 1 and q[-1]['questionNumber'] == 1424
assert sum(len(b['sections']) for b in s['books']) == 83
assert all(not row['question'].startswith('\ufeff') for row in q)
print('datasets ok')
PY
```

---

### Task 2: Arabic Models, Seed, and Migration

**Files:**
- Create: `backend/src/models/BookAr.js`
- Create: `backend/src/models/ChapterAr.js`
- Modify: `backend/src/models/QuestionAr.js`
- Modify: `backend/src/models/index.js`
- Replace: `backend/src/seeds/seedArabic.js`
- Create: `backend/src/seeds/migrateArabicSource.js`

**Interfaces:**
- `BookAr` fields: `bookNumber`, `sourceBookId`, `title`, `slug`,
  `totalQuestions`.
- `ChapterAr` fields: `book`, `bookNumber`, `chapterNumber`,
  `sourceSectionId`, `title`, `slug`, `questionRange`, `totalQuestions`,
  `sortOrder`.
- `QuestionAr` adds `sourceQuestionId` and `image`; max number is 1424.
- `seedArabic.js` exports `seedArabicContent({ dryRun })`.

- [ ] **Step 1: Add models**

Use the existing schema style. Constraints:

```js
// BookAr
bookNumber: { type: Number, required: true, unique: true, min: 1, max: 7 }
sourceBookId: { type: Number, required: true, unique: true }
title: { type: String, required: true, trim: true }
slug: { type: String, trim: true }
totalQuestions: { type: Number, default: 0 }

// ChapterAr
book: { type: mongoose.Schema.Types.ObjectId, ref: 'BookAr', required: true }
bookNumber: { type: Number, required: true }
chapterNumber: { type: Number, required: true }
sourceSectionId: { type: Number, required: true, unique: true }
title: { type: String, required: true, trim: true }
questionRange: {
  start: { type: Number, required: true },
  end: { type: Number, required: true }
}
chapterSchema.index({ book: 1, chapterNumber: 1 }, { unique: true });
```

`QuestionAr` changes:

```js
questionNumber: { type: Number, required: true, unique: true, min: 1, max: 1424 }
book: { type: mongoose.Schema.Types.ObjectId, ref: 'BookAr', required: true }
chapter: { type: mongoose.Schema.Types.ObjectId, ref: 'ChapterAr', required: true }
sourceQuestionId: { type: Number, required: true, unique: true }
image: { type: String, trim: true, default: '' }
```

Keep `bookNumber`, `chapterTitle`, `footnotes`, `needsReview`, and existing
indexes. Export `BookAr` and `ChapterAr` from `models/index.js`.

- [ ] **Step 2: Write seed validation tests as pure helpers**

Add `validateArabicSeed(structure, questions)` to `seedArabic.js` and export it.
It returns an array of errors for wrong counts, non-contiguous numbering,
duplicate IDs, missing question/answer text, and missing image files.

Add `backend/test/services/arabicSeed.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateArabicSeed } = require('../../src/seeds/seedArabic');

test('validateArabicSeed accepts the generated datasets', () => {
  const structure = require('../../data/arabic_structure.json');
  const questions = require('../../data/catechism_qa_ar.json');
  assert.deepEqual(validateArabicSeed(structure, questions), []);
});
```

Run: `node --test backend/test/services/arabicSeed.test.js`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement seed and migration**

`seedArabic.js` must:

```js
async function seedArabicContent({ dryRun = false } = {}) {
  const structure = loadJson(STRUCTURE_FILE);
  const questions = loadJson(QUESTION_FILE);
  const errors = validateArabicSeed(structure, questions);
  if (errors.length) throw new Error(errors.join('\n'));
  if (dryRun) return { books: 7, sections: 83, questions: questions.length };
  await QuestionAr.deleteMany({});
  await ChapterAr.deleteMany({});
  await BookAr.deleteMany({});
  // create books, then sections, then questions
  return { books: 7, sections: 83, questions: questions.length };
}
```

Only call `connectDB()` and close the connection when run as a script.

`migrateArabicSource.js` calls `seedArabicContent({ dryRun: !args.apply })` and
prints current counts versus target counts. Default is dry-run; only `--apply`
writes.

- [ ] **Step 4: Run tests**

Run: `npm test` from `backend/`

Expected: all Python and Node tests pass.

---

### Task 3: Public API Controllers

**Files:**
- Create: `backend/src/services/catalogue.js`
- Modify: `backend/src/controllers/bookController.js`
- Modify: `backend/src/controllers/questionController.js`

**Interfaces:**
- `catalogueFor(lang) -> { Book, Chapter, Question, maxQuestionNumber }`
- `maxQuestionNumber(lang) -> number`
- English max is 1452; Arabic max is 1424.

- [ ] **Step 1: Add catalogue selector**

```js
const { Book, Chapter, Question, BookAr, ChapterAr, QuestionAr } = require('../models');

const MAX = { en: 1452, ar: 1424 };

function catalogueFor(lang) {
  return lang === 'ar'
    ? { Book: BookAr, Chapter: ChapterAr, Question: QuestionAr, maxQuestionNumber: MAX.ar }
    : { Book, Chapter, Question, maxQuestionNumber: MAX.en };
}

module.exports = { catalogueFor, maxQuestionNumber: (lang) => MAX[lang] || MAX.en };
```

- [ ] **Step 2: Rewrite book controller**

Use `catalogueFor(lang)` in every route. Remove `ARABIC_BOOK_TITLES` and the
`titleAr` swapping. Arabic responses should use `BookAr`/`ChapterAr` titles
directly. `getChapter` returns questions from the selected `Question` model.

- [ ] **Step 3: Rewrite question controller**

Remove `ARABIC_BOOK_TITLES`, `cleanArabicQuestion`, `localizeArabicRelations`,
and `addArabicFallback`.

Behavior:

- `getQuestion`: query the selected model, populate its book/chapter, and compute
  prev/next within the same model.
- `getQuestionRange`: query the selected model only. Do not overlay English
  rows. Return `{ success, count, total, maxQuestionNumber, data }`.
- `searchQuestions`: use regex for Arabic and `$text` for English. Filter by
  `bookNumber`. Do not add fallback content.
- `getBookQuiz` / `getChapterQuiz`: use `catalogueFor(lang)` for both structure
  and questions.
- `getStats`: return

```js
{
  books: englishBookCount,
  chapters: englishChapterCount,
  questions: englishQuestionCount + arabicQuestionCount,
  booksByLang: { en: englishBookCount, ar: arabicBookCount },
  chaptersByLang: { en: englishChapterCount, ar: arabicChapterCount },
  questionsByLang: { en: englishQuestionCount, ar: arabicQuestionCount },
  maxQuestionNumber: { en: 1452, ar: 1424 },
  questionsByBook: { en: bookStatsEn, ar: bookStatsAr }
}
```

- [ ] **Step 4: Run backend tests**

Run: `cd backend && npm test`

Expected: PASS.

---

### Task 4: Public Frontend Rendering

**Files:**
- Create: `backend/public/markdown.js`
- Modify: `backend/public/index.html`
- Modify: `backend/public/app.js`
- Modify: `backend/public/styles.css`
- Create: `backend/test/markdown.test.js`

**Interfaces:**
- `renderSafeMarkdown(text) -> string`
- Browser global: `window.CopticMarkdown.renderSafeMarkdown`

- [ ] **Step 1: Write failing renderer tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSafeMarkdown } = require('../public/markdown');

test('renders bold and escapes HTML', () => {
  const html = renderSafeMarkdown('**safe** <script>alert(1)</script>');
  assert.match(html, /<strong>safe<\/strong>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('renders quotes and lists', () => {
  const html = renderSafeMarkdown('> quote\n\n* one\n* two\n\n١- اول\n٢- ثاني');
  assert.match(html, /<blockquote>quote<\/blockquote>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>اول<\/li><li>ثاني<\/li><\/ol>/);
});

test('joins wrapped lines into one paragraph', () => {
  assert.equal(renderSafeMarkdown('first line\nsecond line'), '<p>first line second line</p>');
});
```

Run: `node --test backend/test/markdown.test.js`

Expected: FAIL because `markdown.js` does not exist.

- [ ] **Step 2: Implement UMD renderer**

`backend/public/markdown.js` exports with CommonJS and assigns
`window.CopticMarkdown` in the browser. The renderer:

- escapes `& < > " '` first,
- splits lines,
- treats blank lines as paragraph boundaries,
- joins consecutive plain lines with a space,
- renders consecutive `> ` lines as one blockquote,
- renders `* ` / `- ` as `<ul>`,
- renders ASCII or Arabic-Indic numbered prefixes as `<ol>`,
- applies `**...**` to `<strong>`.

- [ ] **Step 3: Update public page**

Add `<script src="/markdown.js" defer></script>` before `app.js`.

Update `app.js`:

- Remove hardcoded 1452 from status, footer, intro, and next cap.
- Keep `let maxQuestionNumber = { en: 1452, ar: 1424 }`.
- On range response, read `body.maxQuestionNumber` and `body.total`.
- Use `Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US')` for displayed
  totals.
- Language switch resets `start = 1`, `end = 20`, `searching = false`,
  `page = 1`, clears the search field, localizes, and loads.
- Render answers with `window.CopticMarkdown.renderSafeMarkdown(q.answer || '')`.
- Render images:

```js
const image = q.image
  ? `<img class="question-image" src="${esc(q.image)}" alt="" loading="lazy">`
  : '';
```

- [ ] **Step 4: Add styles**

Append rules:

```css
.answer { white-space: normal; }
.answer p { margin: 0 0 .8rem; }
.answer blockquote { margin: .8rem 0; padding: .6rem .9rem; border-inline-start: 3px solid var(--gold); background: #fff7e8; color: #5d452b; }
.answer ul, .answer ol { margin: .6rem 0 .9rem; padding-inline-start: 1.5rem; }
.answer li { margin: .25rem 0; }
.question-image { display: block; max-width: 100%; height: auto; margin: 1rem auto; border-radius: 12px; border: 1px solid var(--line); }
```

- [ ] **Step 5: Run tests**

Run: `node --test backend/test/markdown.test.js`

Expected: PASS.

---

### Task 5: Admin API and XLSX

**Files:**
- Rewrite: `backend/src/services/xlsxTemplate.js`
- Rewrite: `backend/src/services/questionDiff.js`
- Modify: `backend/src/controllers/adminQuestionController.js`
- Modify: `backend/src/controllers/adminExportController.js`
- Modify: `backend/src/controllers/adminImportController.js`
- Modify: `backend/test/services/questionDiff.test.js`
- Modify: `backend/test/services/xlsxTemplate.test.js`

**Interfaces:**
- `rowsToWorkbook(rows, lang)`
- `workbookToRows(buffer, lang)`
- `validateRow(row, { lang, maxQuestionNumber })`
- `normalizeRow(row, { lang })`
- `diffRow(existing, incoming, { lang })`

- [ ] **Step 1: Rewrite tests first**

`xlsxTemplate.test.js` must cover:

```js
test('English workbook has question/answer but no needsReview column', async () => {
  const buffer = await rowsToWorkbook([{ questionNumber: 1, bookNumber: 1, chapterTitle: 'Intro', question: 'Q', answer: 'A' }], 'en');
  const parsed = await workbookToRows(buffer, 'en');
  assert.equal(parsed[0].question, 'Q');
  assert.equal('needsReview' in parsed[0], false);
});

test('Arabic workbook round-trips needsReview', async () => {
  const buffer = await rowsToWorkbook([{ questionNumber: 1, bookNumber: 1, chapterTitle: 'مقدمة', question: 'س', answer: 'ج', needsReview: true }], 'ar');
  const parsed = await workbookToRows(buffer, 'ar');
  assert.equal(parsed[0].needsReview, 'TRUE');
});
```

`questionDiff.test.js` must cover `maxQuestionNumber` 1452 vs 1424 and generic
`question`/`answer` fields.

Run: `node --test backend/test/services/*.test.js`

Expected: FAIL.

- [ ] **Step 2: Implement xlsx template**

Columns:

```js
const COLUMNS = {
  en: ['questionNumber', 'book', 'chapter', 'question', 'answer'],
  ar: ['questionNumber', 'book', 'chapter', 'question', 'answer', 'needsReview']
};
```

- [ ] **Step 3: Implement language-specific diff**

`validateRow` uses `Number(row.questionNumber)` and the provided max. It
validates `question`, `answer`, and `needsReview` only when supplied.
`normalizeRow` trims text and coerces `needsReview` to boolean. `diffRow`
compares only fields present in the incoming row.

- [ ] **Step 4: Update admin controllers**

All admin endpoints accept `lang=en|ar` (default `en`). They use
`catalogueFor(lang)` from Task 3.

- `listQuestions`: query selected model, search selected text, filter by
  `bookNumber`/`chapterTitle`, paginate, return `{ questionNumber, bookNumber,
  chapterTitle, question, answer, needsReview, reviewedBy, reviewedAt }`.
- `getQuestion`: selected model only.
- `updateQuestion`: selected model only; reject numbers above that language's
  max; `needsReview` only for Arabic.
- `getStats`: selected language only, but include `lang` and `maxQuestionNumber`.
- `exportQuestions`: selected language only; pass `lang` to `rowsToWorkbook`.
- `importQuestions`: read `lang`; validate against that language's max; update
  only that language's model.

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test`

Expected: PASS.

---

### Task 6: Admin UI Language Mode

**Files:**
- Modify: `backend/public/admin/index.html`
- Modify: `backend/public/admin/js/api.js`
- Modify: `backend/public/admin/js/main.js`
- Modify: `backend/public/admin/js/browse.js`
- Modify: `backend/public/admin/js/edit.js`
- Modify: `backend/public/admin/js/importExport.js`

**Interfaces:**
- `LANG` exported from `api.js`, read from `?lang=en|ar`.
- Every admin API method includes `lang`.

- [ ] **Step 1: Add language links**

In the admin header:

```html
<div class="admin-lang">
  <a href="?lang=en" data-admin-lang="en">EN</a>
  <a href="?lang=ar" data-admin-lang="ar">AR</a>
</div>
```

- [ ] **Step 2: Update API client**

```js
export const LANG = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en';

export const api = {
  listQuestions: (params) => request(`/questions?${new URLSearchParams({ ...params, lang: LANG })}`),
  getQuestion: (n) => request(`/questions/${n}?lang=${LANG}`),
  updateQuestion: (n, fields) => request(`/questions/${n}?lang=${LANG}`, { method: 'PUT', body: fields }),
  stats: () => request(`/stats?lang=${LANG}`),
  exportUrl: (params) => `${BASE}/export?${new URLSearchParams({ ...params, lang: LANG })}`,
  importDryRun: (file) => { /* append lang via query string */ },
  importCommit: (file) => { /* append lang via query string */ }
};
```

- [ ] **Step 3: Simplify edit form**

Replace the two question/answer textarea pairs with generic `question` and
`answer` fields. Show `needsReview` only when `LANG === 'ar'`. Update
`edit.js` to send `{ question, answer, needsReview }`.

- [ ] **Step 4: Update browse table**

Show one text column for the active language. Header text is `English` or
`Arabic`. The status line includes the active language.

- [ ] **Step 5: Update main**

Mark the active language link using `LANG`. Stats display
`${data.needsReview} of ${data.total} need review` for Arabic, and
`${data.total} questions` for English.

- [ ] **Step 6: Manual verification**

Start the server if Mongo is available:

```bash
cd backend && node src/server.js
```

Open `/admin/index.html?lang=en` and `?lang=ar`. Verify:
- English browse shows 1,452 max.
- Arabic browse shows 1,424 max.
- Editing in one language does not change the other.
- Export downloads language-specific headers.

---

### Task 7: Formatting, Documentation, and Final Verification

**Files:**
- Modify: `backend/src/seeds/formatDatasets.py`
- Modify: `backend/src/seeds/refreshFormatting.js`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-22-arabic-source-replacement-design.md` if implementation details diverge

**Interfaces:**
- `formatDatasets.py` formats English only.
- `refreshFormatting.js` applies to English only after the Arabic replacement.

- [ ] **Step 1: Stop applying the legacy Arabic formatter**

Change `formatDatasets.py` so the default and `--check` target only
`catechism_qa.json`. Keep `--english-only`; make `--arabic-only` print that
Arabic is source-controlled by `syncArabicSource.py` and exit 0 without
rewriting. This prevents markdown/source changes.

- [ ] **Step 2: Restrict Mongo refresh**

In `refreshFormatting.js`, default `lang` to `en`. If `lang` includes `ar`,
print: `Arabic formatting is source-controlled by syncArabicSource.py; no
changes applied.` and skip Arabic updates.

- [ ] **Step 3: Update README**

Document:

- Arabic source directory and `syncArabicSource.py`
- 7 books / 83 sections / 1,424 questions
- local image download location
- independent English/Arabic numbering
- language-specific admin and XLSX
- `seed:arabic`, `migrate:arabic`, and `format:data` behavior
- legacy Arabic extraction scripts are no longer authoritative

- [ ] **Step 4: Final verification**

Run:

```bash
cd backend
npm test
npm run format:data:check
python3 src/seeds/syncArabicSource.py --check
node --test test/markdown.test.js
```

Expected: all pass.

Inspect:

```bash
git status --short
git diff --stat
```

Expected: English dataset remains 1,452 records; Arabic dataset is 1,424;
images are present; no production database files changed.
