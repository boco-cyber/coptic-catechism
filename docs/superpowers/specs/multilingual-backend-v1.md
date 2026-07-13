# Multilingual Backend — Arabic Content Addition

**Status:** Draft  
**Date:** 2026-07-13  
**Scope:** Backend + Arabic data extraction only

---

## 1. Motivation

The app currently serves 1,450 English Q&A entries. The same content exists in Arabic
as selectable-text PDFs. Adding Arabic unlocks the app for Arabic-speaking users and
allows bilingual apps/websites to consume both languages from a single API.

---

## 2. Approach: Parallel Arabic Collection

A separate `QuestionAr` Mongoose collection mirrors the English `Question` schema.
Arabic book/chapter titles live as extra fields on the existing `Book` and `Chapter`
documents. The API uses an optional `?lang=ar` query parameter to switch languages.

Rationale for choosing this over embedded fields (Approach 1) or generic i18n
subdocuments (Approach 3):

- Clean separation — Arabic and English can evolve independently
- Different MongoDB text indexes per language (Arabic stemmer vs English)
- No schema bloat on the core Question model
- Straightforward to implement, test, and reason about
- Easy to extend to a third language later by adding another collection

---

## 3. Schema Changes

### Book (existing model — additive changes)

```
titleAr:       { type: String, trim: true }
descriptionAr: { type: String, trim: true }
```

### Chapter (existing model — additive changes)

```
titleAr: { type: String, trim: true }
```

### QuestionAr (new model)

Same schema as `Question` in `src/models/Question.js`:

| Field | Type | Notes |
|---|---|---|
| `questionNumber` | Number | 1–1452, unique, shared key with English Question |
| `question` | String | Arabic question text |
| `answer` | String | Arabic answer text |
| `book` | ObjectId → Book | Same Book document as English |
| `chapter` | ObjectId → Chapter | Same Chapter document as English |
| `bookNumber` | Number | 1–7 |
| `chapterTitle` | String | Arabic chapter title (denormalized) |
| `scriptureReferences` | [{ type: String }] | Arabic scripture references |
| `patristicQuotes` | [{ author, text, source }] | Arabic patristic quotes |
| `footnotes` | [{ type: String }] | Arabic footnotes |
| `relatedQuestions` | [Number] | Same questionNumber references |
| `tags` | [{ type: String }] | Arabic tags |

Indexes (same English schema structure; Arabic text index weights to be
tuned during extraction based on observed text quality):

```
// Arabic text search — uses Arabic stemmer
questionSchema.index({
  question: 'text',
  answer: 'text',
  tags: 'text'
}, {
  weights: { question: 10, tags: 5, answer: 1 },
  name: 'search_index_ar'
});

// Lookup indexes
questionSchema.index({ questionNumber: 1 });
questionSchema.index({ book: 1, questionNumber: 1 });
questionSchema.index({ chapter: 1, questionNumber: 1 });
questionSchema.index({ bookNumber: 1 });
```

---

## 4. API Changes

Every existing endpoint accepts an optional `?lang=ar` query parameter.

### Books & Chapters

| Endpoint | Default (`lang=en`) | `?lang=ar` |
|---|---|---|
| `GET /api/books` | Returns `title`, `description` | Returns `titleAr` as `title`, `descriptionAr` as `description` |
| `GET /api/books/:bookNumber` | Same | Same field swap |
| `GET /api/books/:bookNumber/chapters/:chapterNumber` | Returns `title` | Returns `titleAr` as `title` |

### Questions

| Endpoint | Default | `?lang=ar` |
|---|---|---|
| `GET /api/questions/:questionNumber` | Queries `Question` | Queries `QuestionAr` |
| `GET /api/questions/range/:start/:end` | Queries `Question` | Queries `QuestionAr` |
| `GET /api/search?q=keyword` | Searches `Question` text index | Searches `QuestionAr` text index |
| `GET /api/quiz/:bookNumber` | Samples from `Question` | Samples from `QuestionAr` |
| `GET /api/quiz/chapter/:bookNumber/:chapterNumber` | Samples from `Question` | Samples from `QuestionAr` |

### Stats

```
GET /api/stats
```

Backward-compatible: the existing `questions` field remains the total, and
`questionsByLang` is added.

```json
{
  "success": true,
  "data": {
    "books": 7,
    "chapters": 87,
    "questions": 2900,
    "questionsByLang": { "en": 1450, "ar": 1450 },
    "questionsByBook": {
      "en": [{ "_id": 1, "count": 92 }, ...],
      "ar": [{ "_id": 1, "count": 92 }, ...]
    }
  }
}
```

### Response consistency

All question responses keep the same field names (`question`, `answer`, etc.)
regardless of language — the consumer never sees `questionAr`. The only change
is which collection is queried.

---

## 5. Arabic PDF Extraction Pipeline

### Source files

```
/home/gergo/OneDrive/Documents/catechism fr malaty arabic/
├── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-الأسئلة-والمحتويات.pdf    (question index)
├── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-جـ1-–-مقدمات-في-الكاتيشيزم-القبطي.pdf
├── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-جـ2-–-العقائد-المسيحية.pdf
├── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-جـ3-لكنيسة-ملكوت-الله-على-الأرض.pdf
├── كتاب-كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-جـ4.pdf
├── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-جـ5.pdf
├── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-جـ6-–-المفاهيم-المسيحية-و-الحياة-اليومية.pdf
└── كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-جـ7-–-الأخرويات-و-الحياة-بعد-الموت.pdf
```

### Process

1. **Extract question index** from the Questions & Contents PDF to build the
   question-number → Arabic-question mapping + chapter structure
2. **Extract answers** from each book PDF (جـ1 through جـ7), keyed by question number
3. **Parse & clean** using `pdftotext` + a Node.js script that:
   - Strips headers/footers/page numbers
   - Reassembles multi-page answers
   - Handles Arabic-specific whitespace normalization
4. **Output** `backend/data/catechism_qa_ar.json` — same shape as the English file
5. **Manual QA** — spot-check ~20 entries across books for extraction quality
6. **Generate** Book/Chapter Arabic titles manually by opening each book PDF's
   table of contents and copying the title text

### New seed script

```bash
npm run seed:arabic
```

This reads `catechism_qa_ar.json`, upserts `QuestionAr` documents, and updates
Book/Chapter Arabic title fields.

---

## 6. Implementation Plan

### Phase 1 — Arabic extraction tooling (estimated: 2 sessions)
- Write PDF parser for the Questions & Contents index PDF
- Write PDF parser for book PDFs
- Verify question-number alignment between Arabic and English
- Output `catechism_qa_ar.json`
- Determine Arabic titles for all books and chapters

### Phase 2 — Backend model & API (estimated: 1 session)
- Create `QuestionAr` model with Arabic text index
- Create model index file update (`src/models/index.js`)
- Add `titleAr`/`descriptionAr` to `Book` and `titleAr` to `Chapter`
- Implement `?lang=ar` routing in controllers
- Write seed script
- Update tests if they exist

### Phase 3 — Deployment (estimated: 1 session)
- Move `MONGODB_URI` from Atlas to self-hosted Coolify MongoDB
- Run seed scripts on the new DB
- Verify API responses on the deployed instance
- Update README with Arabic API usage docs

---

## 7. Open Questions

- [ ] Some Arabic PDFs may not have clean question-number alignment — need to
      confirm mapping for all 1,450 entries
- [x] **Alignment validation**: seed script will fail if Arabic questionNumber
      has no matching English entry (decided)
- [ ] Arabic patristic quotes / scripture references — do the PDFs contain these
      in the same structured way as the English data?
- [ ] Arabic text index weights — to be tuned during extraction once the quality
      of extracted text is visible (decided)

---

## 8. Future Considerations (out of scope)

- Arabic full-text search quality — MongoDB's Arabic stemmer may need custom
  stop-word lists or alternate indexing
- RTL layout hints in API responses — frontend concern, no backend change needed
- Language negotiation via `Accept-Language` header instead of `?lang=` param
- Third language (e.g., French) — would add another parallel collection
