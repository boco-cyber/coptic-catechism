# Arabic Source Replacement Design

**Date:** 2026-10-22

## Goal

Replace the legacy 1,452-question Arabic catalogue with the new word-for-word
Arabic source in `/home/gergo/Downloads/Youth-Catechism-QA`, while keeping the
English catalogue and its completed formatting work unchanged.

## Decisions

- Adopt the new source's catechism structure: **7 books, 83 sections,
  1,424 questions**.
- Exclude source book `19`, the 2-question pastoral letter from Fr. Tadros Y.
  Malaty.
- English remains at 1,452 questions with its existing 7 books and 91 chapters.
- English and Arabic become **independent catalogues**. A question number no
  longer refers to the same content in both languages.
- Store Arabic books and sections in dedicated `BookAr` and `ChapterAr`
  collections. Do not modify the English `Book`/`Chapter` structure.
- Preserve question text, answer text, title numbering, and markdown exactly.
- Render markdown safely on the public site: bold, blockquotes, unordered
  lists, and ordered lists.
- Download the 61 source images locally and serve them from the app.
- Admin browse/edit/import/export becomes language-specific.
- No production MongoDB writes are performed as part of this work.

## Canonical Ordering and Numbering

The source's SQLite IDs are arbitrary and SQLite ID ordering does not match the
intended section order. The `all_data.json` array order is authoritative.

- Books: source IDs `1..7`, in array order.
- Sections: sequential `chapterNumber` within each book, preserving the source
  array order. Store the original `sourceSectionId`.
- Questions: sequential `questionNumber` `1..1424` across the whole Arabic
  catalogue, in book/section/question array order. Store the original
  `sourceQuestionId`.
- Preserve source section IDs, book IDs, question IDs, titles, and slugs for
  traceability.

Example: Book 1 sections remain in the source order `15, 16, 18, 17, 19, 20`,
not SQLite ID order `15, 16, 17, 18, 19, 20`.

## Dataset Files

### `backend/data/arabic_structure.json`

```json
{
  "source": "Youth-Catechism-QA/all_data.json",
  "books": [
    {
      "bookNumber": 1,
      "sourceBookId": 1,
      "title": "الجزء الأول: مقدمات في الكاتيكزم القبطي",
      "slug": "الجزء-الأول-مقدمات-في-الكاتيكزم-القبطي",
      "sections": [
        {
          "chapterNumber": 1,
          "sourceSectionId": 15,
          "title": "١) أ- الكاتيكيزم",
          "slug": "١-أ-الكاتيكيزم",
          "questionRange": { "start": 1, "end": 2 }
        }
      ]
    }
  ]
}
```

### `backend/data/catechism_qa_ar.json`

Flat array of 1,424 records:

```json
{
  "questionNumber": 1,
  "sourceQuestionId": 1029,
  "bookNumber": 1,
  "chapterNumber": 1,
  "question": "١- ماذا تعني كلمة كاتيكيزم Catechism؟",
  "answer": "هى كلمة يونانية تعنى **\"تعليم دينى مختصر\"** ...",
  "image": "/images/questions/1029.jpeg"
}
```

`image` is `null` when the source has no image. Text is stored exactly as in
the source; only surrounding JSON formatting is added.

## Models

- `BookAr`: `bookNumber` (unique, 1–7), `sourceBookId` (unique), `title`,
  `slug`, `totalQuestions`, virtual `sections`.
- `ChapterAr`: `book` (`BookAr` ref), `bookNumber`, `chapterNumber`,
  `sourceSectionId` (unique), `title`, `slug`, `questionRange`,
  `totalQuestions`, `sortOrder`, virtual `questions`.
- `QuestionAr`: max `questionNumber` becomes 1424; `book` refs `BookAr`;
  `chapter` refs `ChapterAr`; add unique `sourceQuestionId` and `image`.
- English `Book`, `Chapter`, and `Question` remain unchanged.
- Export all models from `backend/src/models/index.js`.

## Public API

- `/api/books`, `/api/books/:bookNumber`, and chapter routes select English or
  Arabic models by `lang`.
- Arabic question, range, search, and quiz routes use only Arabic data.
- Remove the old same-number English fallback and Arabic numbering-stripping.
- `GET /api/questions/range/:start/:end` returns `total` and
  `maxQuestionNumber` for the selected language.
- Stats report separate English and Arabic totals, book counts, chapter counts,
  maxima, and review counts.
- Arabic book/section names come only from `BookAr`/`ChapterAr`.

## Public UI

- English total is 1,452; Arabic total is 1,424.
- Language switch resets to the start of that language's catalogue.
- Previous/next and status use the selected language's actual maximum.
- Question cards show the canonical number in metadata and preserve the source
  title as the heading.
- Safe markdown renderer:
  - escape HTML first,
  - join wrapped lines into paragraphs,
  - render `> ` as blockquote,
  - render `* ` and `- ` as unordered lists,
  - render numbered prefixes (ASCII or Arabic-Indic) as ordered lists,
  - render `**text**` as `<strong>`.
- Render downloaded images in the answer area.

## Ingestion

New `backend/src/seeds/syncArabicSource.py`:

- Reads `all_data.json` from the source directory, defaulting to
  `/home/gergo/Downloads/Youth-Catechism-QA`.
- Skips source book `19`.
- Builds the structure and flat question catalogue in source array order.
- Downloads images into `backend/public/images/questions/` using stable
  source-question-ID filenames.
- Validates:
  - exactly 7 books, 83 sections, 1,424 questions,
  - contiguous canonical numbering,
  - unique book/section/question IDs,
  - every source question appears exactly once,
  - question and answer text are unchanged,
  - no book 19 content,
  - every referenced image exists.
- Supports `--check` for validation without writing and `--skip-images` for
  metadata-only validation.

New `backend/src/seeds/seedArabic.js`:

- Clears `QuestionAr`, `ChapterAr`, and `BookAr`.
- Creates 7 Arabic books, 83 sections, and 1,424 questions.
- Uses `arabic_structure.json` and `catechism_qa_ar.json`.
- Does not depend on the English seed.

Add a dry-run Arabic migration command. It reports current and target counts by
default and only replaces data with an explicit `--apply`.

## Admin and XLSX

- Admin panel gains EN/AR mode.
- Browse, edit, stats, import, and export operate on one catalogue at a time.
- Generic XLSX columns: `questionNumber`, `book`, `chapter`, `question`,
  `answer`, and `needsReview` (Arabic only).
- English workbook maximum is 1,452; Arabic workbook maximum is 1,424.
- No bilingual same-number pairing.
- Update `xlsxTemplate` and `questionDiff` plus their tests.

## Verification

- Python tests for source counts, ordering, exact text preservation, exclusion
  of the letter, and image references.
- Node tests for markdown rendering, language-specific XLSX round-trips, and
  validation bounds.
- `npm test` must pass.
- `npm run format:data:check` must continue to pass for English.
- Manual API checks for books, sections, ranges, search, quiz, and images in
  both languages.
- Seed scripts are not run against production.

## Rollback

- English data and models are untouched.
- The legacy Arabic catalogue remains available in Git history.
- No production database is modified by this implementation.
