# Admin Panel for Q&A Editing — Design

**Status:** Approved (design), pending spec review
**Date:** 2026-07-17
**Scope:** A password-protected admin panel, added to the existing Express backend, for browsing and manually editing English/Arabic question-and-answer text, plus bulk xlsx export/import. No changes to the public site or its API.

---

## 1. Motivation

The Arabic verification pipeline ([2026-07-14-arabic-verification-rebuild-design.md](2026-07-14-arabic-verification-rebuild-design.md)) left 614 of 1,452 Arabic entries either raw-OCR-garbled or machine-translated from English rather than sourced from the actual books (see `backend/data/verification/outstanding_614_review.md`/`.json`). Fixing these requires a human to read each one against the English reference and either retype the correct Arabic or accept/adjust a translation. There is currently no way to edit a question/answer except by rewriting the seed JSON and re-running `seedArabic.js`. This project adds a proper editing surface, usable by more than one reviewer, with a bulk spreadsheet workflow for offline review.

## 2. Accounts & authentication

- New `User` model (`backend/src/models/User.js`): `username` (unique), `passwordHash` (bcrypt, cost 12), `createdAt`.
- No public signup route. Admins are provisioned by the repo owner via a CLI script, `backend/src/seeds/createAdmin.js <username>`, which prompts for a password on stdin (never passed as an argv value, to keep it out of shell history) and upserts the user. Removing an admin is a manual DB operation (the same script gets a `--delete <username>` flag).
- Login: `POST /admin/api/login` verifies bcrypt hash, then establishes an `express-session`, backed by `connect-mongo` (sessions survive server restarts; forcing logout = deleting the session doc). Cookie flags: `httpOnly`, `sameSite: 'strict'`, `secure: true` when `NODE_ENV=production`.
- `POST /admin/api/logout` destroys the session. `GET /admin/api/me` returns `{ username }` or 401.
- Every `/admin/api/*` route except `POST /admin/api/login` requires an active session (Express middleware `requireAdminSession`).
- `POST /admin/api/login` is rate-limited via `express-rate-limit` (5 attempts / 15 min / IP) to blunt brute forcing.
- CSRF mitigation: all state-changing admin routes (`PUT`, `POST` other than login) require a custom header `X-Requested-With: admin-ui`, which cross-origin form submissions cannot set. Combined with `sameSite: 'strict'`, this is sufficient for a low-traffic internal tool and avoids a full CSRF-token implementation.
- Flat permission model: any authenticated admin can edit any entry. No roles, no approval queue — edits are live immediately (per the approved design conversation).

## 3. Data model change

`QuestionAr` gains three fields:

```js
needsReview: { type: Boolean, default: false },
reviewedBy: { type: String, trim: true },
reviewedAt: { type: Date }
```

`Question` (English) is unchanged — English is editable through the same admin UI but isn't the quality problem, so it carries no review-tracking fields.

A one-time migration script, `backend/src/seeds/verification/seedNeedsReview.js`, sets `needsReview: true` on the 614 questionNumbers in `backend/data/verification/outstanding_614_review.json`. Run once against MongoDB after this feature deploys; not part of the regular seed pipeline.

Saving an edit through `PUT /admin/api/questions/:questionNumber`:
- Clears `needsReview` to `false` and stamps `reviewedBy`/`reviewedAt` to the current admin/timestamp, **unless** the request body explicitly includes `needsReview: true` (an admin can flag an entry back for another reviewer instead of clearing it).

No edit-history/versioning is kept — a save overwrites the previous text with no built-in undo (approved trade-off; the import dry-run step in §5 is the safety net for the highest-blast-radius operation).

## 4. API endpoints

All under `/admin/api`, session-protected except `/login`. JSON in/out except `/export` (binary xlsx) and `/import` (multipart upload).

| Method & path | Purpose |
|---|---|
| `POST /login` | `{ username, password }` → sets session cookie or 401. |
| `POST /logout` | Destroys session. |
| `GET /me` | `{ username }` or 401. |
| `GET /questions` | Paginated browse. Query: `book`, `chapter`, `needsReview` (`true`/`false`), `q` (free-text, matches question/answer in either language), `page`, `limit`. Returns rows joining `Question` + `QuestionAr` by `questionNumber`. |
| `GET /questions/:questionNumber` | Single entry, both languages, book/chapter titles, `needsReview`/`reviewedBy`/`reviewedAt`. 404 if the number doesn't exist in either collection. |
| `PUT /questions/:questionNumber` | Body: any subset of `{ question_en, answer_en, question_ar, answer_ar, needsReview }`. Each of the four text fields, if supplied, must be a non-empty string (empty string ⇒ 400, since blanking a live answer is never intentional here — clearing content should go through explicit deletion, which isn't a supported operation); `needsReview`, if supplied, must be boolean. Updates only the fields present. |
| `GET /export` | Streams `.xlsx`. Query mirrors the browse filters (`book`, `chapter`, `needsReview`, `q`) so a reviewer can export "just the 614," "just Book 3," or everything. Columns: `questionNumber`, `book`, `chapter`, `question_en`, `answer_en`, `question_ar`, `answer_ar`, `needsReview`. |
| `POST /import?dryRun=true` | Multipart `.xlsx` (same column shape as export). Parses rows, validates every `questionNumber` exists and is in 1–1452, diffs each row's `question_en/answer_en/question_ar/answer_ar/needsReview` against current DB values. Returns `{ changed: [{questionNumber, field, oldValue, newValue}], unchanged: <count>, errors: [{row, message}] }`. **No writes.** If `errors` is non-empty, the UI blocks confirming the import until the file is fixed and re-uploaded. |
| `POST /import?dryRun=false` | Same file, re-submitted after review. Applies exactly the diffed rows (rows unchanged from DB are skipped; rows with unresolved errors are rejected — the whole import is all-or-nothing: if any row fails validation, nothing is written). Updated Arabic rows get `reviewedBy`/`reviewedAt` stamped from the importing admin; `needsReview` is set from the sheet's `needsReview` column (so bulk-clearing/re-flagging is explicit, not automatic). |
| `GET /stats` | `{ total: 1452, needsReview: <n>, byBook: [{bookNumber, total, needsReview}] }`. |

## 5. Admin UI

`backend/public/admin/` — plain HTML/CSS/JS, no build step, no framework, matching the existing `public/app.js` style. The static files themselves carry no data and aren't route-protected; every data fetch goes through the session-protected API, and the JS redirects to the login view on any 401.

- **`login.html`** — username/password form → `POST /admin/api/login` → redirect to `index.html`.
- **`index.html`** — three tabs:
  - **Browse**: table (question #, book/chapter, EN question snippet, AR question snippet, needsReview badge), filters for book/chapter/needsReview, search box, pagination controls. Row click opens the edit panel for that question.
  - **Edit panel**: EN question/answer and AR question/answer as separate labeled textareas (AR ones `dir="rtl"`), a "needs review" checkbox, Save/Cancel. All fetched text is set via `.value`/`.textContent`, never `innerHTML`, so stored content (however garbled) can't execute as markup.
  - **Import/Export**: filter controls identical to Browse's, "Download template" button (calls `/export` with current filters), file-upload form for `.xlsx` → shows the dry-run diff table (old → new per field, plus any errors) → a separate "Confirm import" button fires the `dryRun=false` request against the same file.
- A header strip shows live counts from `/stats` ("614 of 1,452 need review"), so the backlog from the verification pass is visibly trackable as admins work through it.

## 6. Error handling

- Auth failures (bad credentials, missing/expired session, missing CSRF header): `401`, generic message (`"Invalid credentials"` / `"Not authenticated"`) — never reveal whether a username exists.
- Login rate-limit exceeded: `429` with a retry-after hint.
- `PUT` with an out-of-range or non-numeric `questionNumber`, or an empty string for a supplied field: `400` with a field-level message.
- `PUT`/`GET` for a `questionNumber` with no matching document in either collection: `404`.
- Import: malformed `.xlsx` (unreadable, missing required columns): `400`, whole request rejected before any diffing. Per-row validation errors (bad `questionNumber`, non-boolean `needsReview`) are collected and returned in the dry-run `errors` array rather than failing the whole request, so the UI can show all problems at once; the `dryRun=false` commit still refuses to write anything if `errors` is non-empty (checked server-side again, not just trusted from the client).
- All admin API errors return the existing `{ success: false, error: <message> }` shape used by the public API, for consistency.

## 7. Testing

- Unit-level: auth middleware (session present/absent/expired), password hashing round-trip, the CSV/xlsx diff function (row with no changes, row with a subset of fields changed, row with an out-of-range questionNumber, row with a blank required field).
- Integration: login → CRUD round trip against a test MongoDB (or `mongodb-memory-server` if introduced) — create session, `GET /questions`, `PUT` an entry, confirm `needsReview` clears and `reviewedBy` is stamped, confirm the public `/api/questions/:n?lang=ar` reflects the change immediately (no caching layer to invalidate).
- Import: dry-run against a fixture xlsx with one changed row, one unchanged row, one bad `questionNumber` → assert the returned diff/errors shape; commit the same fixture (errors fixed) → assert exactly the changed row was written and unchanged rows weren't touched.
- Manual: log in as a provisioned admin, edit one of the 614 flagged entries end-to-end, confirm it drops off the `needsReview` filter and the live public page shows the new text; export a filtered template, round-trip it through import unmodified and confirm the dry-run reports zero changes (sanity check that export/import column mapping is symmetric).

## 8. Out of scope

- Roles/permissions beyond a flat "any admin can edit anything."
- Draft/approval workflow before publishing (edits are live immediately, per approved design).
- Full edit history / revert-to-previous-version (only the current text is stored; import dry-run is the safety net for bulk changes).
- Public self-service signup or password-reset flow.
- Editing book/chapter titles, scripture references, tags, or other metadata fields — only `question`/`answer` text (English and Arabic) and the Arabic `needsReview` flag.
- Rate limiting or auth on the public read-only API — unchanged and unaffected by this work.
