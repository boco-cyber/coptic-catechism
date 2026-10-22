# English Source Integration Design

**Date:** 2026-10-22

## Goal

Replace the legacy English extraction with the verified new English source at
`/mnt/66462D50462D21F3/apps/doc editor/catechism_extraction`, while preserving
the completed Arabic 1,424-question replacement and keeping English and Arabic
as independent catalogues.

The source provides 7 logical books, 84 chapters, 6 intermediate headings, and
1,452 questions across two PDF volumes. The existing `structureData.js` has the
right book and chapter counts but stale chapter ranges; the new source is
authoritative for hierarchy, text, and provenance.

## Decisions

- Adopt the source's 7 books, 84 chapters, and 1,452 questions.
- Derive every book and chapter question range from actual source question
  assignments. Do not preserve the existing `structureData.js` ranges.
- Keep one `Chapter` per source `chapter` node. Store the 4 question-bearing
  source `section` nodes as nested subsection metadata where they belong.
  - Book 1 introduction and conclusion have no questions and become content
    blocks.
  - `The Role of Women in Society and Church` (Q569-575) is a subsection of
    Book 3 chapter 8.
  - `On the Rites of Baptism` (Q682-687) and its child
    `The Rites of Holy Baptism` (Q688-712) are nested subsections of Book 3
    chapter 17.
  - `On the Main Features of the Coptic Liturgy` (Q790-807) is a subsection of
    Book 3 chapter 20.
- Keep canonical English question numbers 1-1452 unchanged.
- Preserve source question text exactly.
- Normalize whitespace only in answers, using the approved deterministic
  line-joining rules. Every non-whitespace character must remain unchanged.
  Do not run the legacy header, footnote, or embedded-question extraction.
- Store all 1,401 content blocks and 61 extraction issues with provenance.
- Attach the 1,011 footnotes that have `related_qa_id` to their questions. Keep
  all footnotes and the 256 unlinked footnotes in the content-block store.
- English and Arabic remain independent. No question-number crosswalk is added.
- All generation, tests, and migrations remain offline. No production MongoDB
  writes, commit, push, or deploy are part of this work.

## Source Authority

Source directory:

```text
/mnt/66462D50462D21F3/apps/doc editor/catechism_extraction
```

Primary file: `catechism_extraction.json`.

The importer accepts `ENGLISH_SOURCE_DIR` and falls back to the path above. It
reads the extracted JSON directly; SQLite is not required at runtime.

Source invariants:

- 2 PDF volumes (`book_001`, `book_002`)
- 7 book sections
- 84 chapter sections
- 6 intermediate sections
- 1,452 Q&A records numbered 1-1452
- 1,401 content blocks:
  - 10 front matter
  - 25 section introductions
  - 1,267 footnotes
  - 99 back matter
- 61 extraction issues
- 1,452 `verified` questions
- 2 question review notes
- 1,011 footnotes linked to questions

The importer verifies the SHA-256 hashes published in `verification_report.md`:

| Artifact | SHA-256 |
| --- | --- |
| `catechism_extraction.json` | `44bd24229d1d9c87f395e4d401bf464cb228264528a6fc50932f71796adbb30c` |
| `catechism.db` | `5b3ae7576dae4aa84eb8e98d7af4e4a7bed0f406563cf4ac625cd3081b3dec4a` |
| `page_manifest.csv` | `91dc82482f702ce6e1023e093f57bc2ed6b813940178070da88e04b586bea5aa` |

The JSON hash is mandatory. The database and manifest hashes are checked when
those files are present.

## Generated Artifacts

### `backend/data/english_structure.json`

Contains source metadata, the two volume records, 7 books, 84 chapters, nested
subsections, and computed ranges.

Example chapter:

```json
{
  "chapterNumber": 17,
  "sourceSectionId": "section_001_043",
  "sourceHeadingExact": "17. The Sacrament of Baptism",
  "title": "The Sacrament of Baptism",
  "sortOrder": 17,
  "questionRange": { "start": 675, "end": 712 },
  "totalQuestions": 38,
  "printedPageStart": 527,
  "printedPageEnd": 534,
  "pdfPageStart": 539,
  "pdfPageEnd": 546,
  "subsections": [
    {
      "sourceSectionId": "section_001_044",
      "parentSourceSectionId": "section_001_043",
      "sourceHeadingExact": "On the Rites of Baptism",
      "title": "On the Rites of Baptism",
      "sequenceInBook": 44,
      "questionRange": { "start": 682, "end": 712 },
      "totalQuestions": 31,
      "printedPageStart": 535,
      "printedPageEnd": 560,
      "pdfPageStart": 547,
      "pdfPageEnd": 572,
      "children": [
        {
          "sourceSectionId": "section_001_045",
          "parentSourceSectionId": "section_001_044",
          "sourceHeadingExact": "The Rites of Holy Baptism",
          "title": "The Rites of Holy Baptism",
          "sequenceInBook": 45,
          "questionRange": { "start": 688, "end": 712 },
          "totalQuestions": 25,
          "printedPageStart": 541,
          "printedPageEnd": 560,
          "pdfPageStart": 553,
          "pdfPageEnd": 572,
          "children": []
        }
      ]
    }
  ]
}
```

Book titles are the source heading text after the printed
`Book N (Questions ...):` prefix. Chapter titles remove only the printed numeric
prefix (`1.`, `2. (a)`, etc.). Exact source headings remain available in
`sourceHeadingExact`.

Page ranges on a chapter or subsection are that source node's own ranges.
`questionRange` and `totalQuestions` include descendant questions, so a parent
chapter's question range covers its nested subsections.

### `backend/data/catechism_qa.json`

Flat array of 1,452 records:

```json
{
  "questionNumber": 1,
  "sourceQuestionId": "qa_001_00001",
  "bookNumber": 1,
  "chapterNumber": 1,
  "sourceSectionId": "section_001_003",
  "sourceSectionPath": [
    {
      "sourceSectionId": "section_001_003",
      "title": "Catechism"
    }
  ],
  "questionNumberExact": "1",
  "question": "What does the word catechism mean?",
  "answer": "The word catechism is a Greek word ...",
  "footnotes": [],
  "verificationStatus": "verified",
  "reviewNotes": null,
  "printedPageStart": "5",
  "printedPageEnd": "5",
  "pdfPageStart": 17,
  "pdfPageEnd": 17,
  "sourceSpans": [{ "pdf_page": 17, "printed_page": "5" }]
}
```

`sourceSectionPath` starts at the question's parent chapter and includes every
nested subsection heading. It excludes the book heading. It is used to preserve
subsection context.

### `backend/data/english_content_blocks.json`

All 1,401 source blocks with source IDs, volume, optional logical book, optional
source section, optional related source question, block type, exact text,
sequence, and page ranges.

### `backend/data/english_extraction_issues.json`

All 61 source issues with source IDs, volume, optional logical book, related
record, page, issue type, description, and normalization applied.

## Text Normalization

`normalize_english_body(answer)`:

1. Normalize line endings.
2. Rejoin PDF-wrapped lines using the existing `should_break` and `join_lines`
   rules.
3. Emit `\n\n` only for semantic paragraph/list boundaries.
4. Compare visible characters with the source. Visible characters are all
   characters after removing whitespace.
5. Fail generation if the character multiset differs.

This pass does not strip headers, extract footnotes, drop embedded questions, or
rewrite wording. Question text is stored unchanged.

## Models

### `Book`

Add:

- `sourceVolumeId` (`book_001` or `book_002`)
- `sourceHeadingExact`
- `publicationDetailsExact`
- `pdfPageCount`
- `sourcePageRange`

Keep `bookNumber` 1-7, `title`, `volume`, `questionRange`, `description`, and
`totalQuestions`.

### `Chapter`

Add:

- `sourceSectionId` (unique)
- `sourceHeadingExact`
- `printedPageStart`, `printedPageEnd`
- `pdfPageStart`, `pdfPageEnd`
- `subsections` nested schema with source ID, parent source ID, exact heading,
  title, sequence, range, totals, page ranges, and children

Keep `chapterNumber` 1-84, `book`, `bookNumber`, `title`, `questionRange`,
`totalQuestions`, and `sortOrder`.

### `Question`

Add:

- `sourceQuestionId` (unique)
- `sourceSectionId`
- `sourceSectionPath`
- `questionNumberExact`
- `verificationStatus` (`verified` or `needs_review`)
- `reviewNotes`
- `printedPageStart`, `printedPageEnd`
- `pdfPageStart`, `pdfPageEnd`
- `sourceSpans`

Keep `question`, `answer`, `book`, `chapter`, `bookNumber`, `chapterTitle`, and
`footnotes`.

### `EnglishContentBlock`

Fields: `sourceBlockId` (unique), `sourceVolumeId`, `volumeNumber`,
`bookNumber` (nullable), `sourceSectionId`, `relatedSourceQuestionId`,
`relatedQuestionNumber`, `blockType`, `text`, `sequenceInBook`,
`pdfPageStart`, `pdfPageEnd`.

### `EnglishExtractionIssue`

Fields: `sourceIssueId` (unique), `sourceVolumeId`, `volumeNumber`,
`bookNumber` (nullable), `relatedRecordId`, `pdfPage`, `issueType`,
`description`, `normalizationApplied`.

Export the new models from `backend/src/models/index.js`.

## Ingestion

Add `backend/src/seeds/syncEnglishSource.py`:

```bash
python3 backend/src/seeds/syncEnglishSource.py
python3 backend/src/seeds/syncEnglishSource.py --check
```

`--check` regenerates in memory and compares against the committed artifacts
without writing.

Validation includes:

- Source hashes and source inventory.
- 7 books, 84 chapters, 6 intermediate sections, 1,452 questions.
- Contiguous, unique question numbers 1-1452.
- Every question has a non-empty exact question and answer.
- Every question belongs to a non-book source section.
- Chapter and subsection ranges are computed from descendants and are
  contiguous within each logical book.
- Book headings, printed question ranges, section ownership, and page spans are
  consistent.
- Chapter title cleanup is deterministic and non-empty.
- All content-block types and counts match.
- Linked footnote targets exist and are questions.
- Every source question appears exactly once.
- Normalized answers preserve visible characters.
- English and Arabic source IDs are not mixed.

Add `backend/src/seeds/migrateEnglishSource.js`:

- Dry run by default; `--apply` replaces the English catalogue.
- Reports current English counts and target counts.
- Validates all artifacts before deleting anything.
- Deletes and recreates only English `Book`, `Chapter`, `Question`,
  `EnglishContentBlock`, and `EnglishExtractionIssue` data.
- Never touches `BookAr`, `ChapterAr`, or `QuestionAr`.

Revise `seedDatabase.js` to use the generated artifacts and the same validated
seed function.

## API

Add a public read-only endpoint:

```text
GET /api/books/:bookNumber/content
```

Response groups content for the logical book:

```json
{
  "success": true,
  "data": {
    "book": { "bookNumber": 3, "title": "...", "volume": 1 },
    "frontMatter": [],
    "introductions": [],
    "footnotes": [],
    "backMatter": [],
    "issues": []
  }
}
```

- Section-linked blocks are selected when their logical `bookNumber` matches.
- Front matter and back matter are selected by the book's source volume and are
  volume-level data.
- Issues are selected for the book and its source volume.
- Blocks are ordered by `sequenceInBook`.
- An optional `type` query accepts `front_matter`, `section_introduction`,
  `footnote`, `back_matter`, or `issues`.

Existing book, chapter, question, search, quiz, and stats routes continue to
return corrected chapter ranges and titles. Existing question footnote display
continues to work from `Question.footnotes`.

## Legacy Paths

- `structureData.js` remains only as historical reference; no runtime seed,
  generator, or test may use it as English authority.
- English extraction and old formatting are removed from active npm scripts.
- `format:data` and `format:data:check` operate on Arabic only; English
  formatting is handled by `syncEnglishSource.py`.
- Old scripts remain in Git history. They must not be run against the new
  English artifacts.

## Verification

Python tests:

- Generated artifacts match source counts and IDs.
- Hierarchy, chapter ranges, subsections, and source paths are correct.
- Exact question text is unchanged.
- Answer normalization preserves every non-whitespace character.
- Footnotes link to the correct questions.
- Bad counts, duplicate IDs, missing sections, and character changes fail.
- Content-block and issue counts and types match the report.

Node tests:

- `validateEnglishSeed` accepts the committed artifacts.
- It rejects wrong counts, ranges, missing books/chapters, and footnote links.
- Dry-run returns target counts without MongoDB access.

Commands:

```bash
npm test
npm run sync:english:check
python3 backend/src/seeds/syncArabicSource.py --check
npm run format:data:check
```

The last two must continue to pass for Arabic. No database write is required for
verification.

## Rollback

- English data remains in Git history.
- Arabic collections and datasets are untouched.
- The migration script is dry-run by default.
- No production database is modified by this implementation.

## Non-Goals

- No new public reading UI for front matter, back matter, or section
  introductions in this change.
- No Arabic re-import or Arabic structure changes.
- No bilingual pairing or question crosswalk.
- No PDF re-extraction.
- No deployment or production migration.
