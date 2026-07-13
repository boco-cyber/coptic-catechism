# Agent Handoff — Coptic Catechism

Date: 2026-07-13

## Current deployment

- Local repository: `/home/gergo/Seagate2/apps/coptic-catechism`
- GitHub: `boco-cyber/coptic-catechism`, branch `main`
- Last implementation head before this documentation: `803d242`
- Coolify application: `coptic-catechism-api`
  (`qpu7udejfw6bt6qba7209vo2`)
- Domain: `https://ccfm.copticfaith.org`
- Base directory: `/backend`; Dockerfile: `/Dockerfile`; port: `5000`

## Implemented

- Express serves the bilingual web UI from `backend/public/`.
- `/` is English; `/ar/` initializes Arabic RTL mode.
- English and Arabic API selection uses `?lang=ar`.
- English has 1,452 records; Arabic currently has 1,387 OCR-derived questions.
- Empty/missing Arabic answers and records explicitly fall back to English.
- Arabic search uses regex matching because the live Mongo text index was not
  available and `$text` returned an error.
- Arabic question display removes only duplicated leading question numbers and
  obvious numeric OCR tails.
- All seven book titles have Arabic runtime fallbacks.

## Verification

The following returned HTTP 200 after deployment:

- `/`, `/ar/`, `/health`
- `/api/questions/1`
- `/api/questions/1?lang=ar`
- `/api/questions/1452?lang=ar`
- `/api/search?q=إيمان&lang=ar`

Q1 live Arabic display: `ماذا تعني كلمة كاتيكيزم؟`.

## Preserve these files

The working tree intentionally contains two pre-existing untracked files:

- `backend/data/arabic_chapters.json`
- `backend/data/catechism_qa_ar.json`

They contain OCR extraction output and were not created, modified, or committed
by the bilingual UI work. Do not delete, overwrite, or commit them without
review. Sample answer mappings are visibly incorrect, so they must not be used
as production Arabic answers as-is.

The original Arabic PDFs are outside the repository at:

`/home/gergo/OneDrive/Documents/catechism fr malaty arabic`

Extraction scripts are in `backend/src/seeds/`. OCR is noisy. Preserve source
attribution and require theological/editorial review before seeding answers.

## Key commits

- `803d242` — clean Arabic question labels and localize book titles
- `96d0720` — bilingual web UI, Arabic search fix, English-answer fallback
- `b762eae` — skip missing Arabic questions in seed
- `c59ab75` — Arabic model/API/seed support
- `2218df1` — Coolify Dockerfile

## Local checks

```bash
node --check backend/src/server.js
node --check backend/src/controllers/questionController.js
node --check backend/src/controllers/bookController.js
node --check backend/public/app.js
PORT=5055 npm --prefix backend start
```

Then check `/`, `/ar/`, Arabic Q1, Arabic Q1452, range 1440–1452, and Arabic
search. Stop the local process afterward.

## Rollback

- Revert `803d242` for Arabic display cleanup/title changes.
- Revert `96d0720` for the web UI and runtime English fallback.
- Push `main` and deploy only Coolify application
  `qpu7udejfw6bt6qba7209vo2`.
- These commits do not mutate MongoDB collections.

## Related WordPress handoff

The complete cross-project record is:

`/home/gergo/Seagate2/apps/copticfaith website/WORD-PRESS-catechesis/main-site-arabic/docs/AGENT_HANDOFF_2026-07-13.md`
