# Coptic Catechism

A bilingual educational platform based on *Catechism of the Coptic Orthodox
Church* by Fr. Tadros Yacoub Malaty (Volumes 1 & 2, 2023 edition).

## Current application

This repository contains one Node.js application in [`backend/`](backend/):

- Express serves the English and Arabic web interface and the admin panel from
  `backend/public/`.
- The REST API and admin API run in the same Express process.
- MongoDB stores books, chapters, questions, Arabic translations, admin users,
  and admin sessions.
- The web client is plain HTML, CSS, and JavaScript. There is no separate
  frontend build or mobile/Expo application in this repository.

The public site is available at `/` (English) and `/ar/` (Arabic). Arabic mode
uses right-to-left layout. Add `?lang=ar` to public API requests for Arabic
content.

## Repository layout

```text
.
├── backend/
│   ├── config/              MongoDB connection
│   ├── data/                Seed data and source workbooks
│   ├── public/              Public site and admin-panel assets
│   ├── src/
│   │   ├── controllers/     Public and admin request handlers
│   │   ├── middleware/      Admin authentication and login rate limiting
│   │   ├── models/          Mongoose models
│   │   ├── routes/          Public API and admin API routes
│   │   ├── seeds/           Database and content-import scripts
│   │   ├── services/        Shared business logic
│   │   ├── utils/           Shared utilities
│   │   └── server.js        Express application entry point
│   └── test/                Node.js tests
└── docs/                    Setup, deployment, handoffs, and design records
```

For a fuller documentation index, see [`docs/README.md`](docs/README.md).

## Content

The English catalog contains 1,452 questions and answers in seven books:

| Book | Title | Question range | Volume |
|------|-------|----------------|--------|
| 1 | Introduction to the Coptic Catechism | 1–92 | 1 |
| 2 | Christian Dogma | 93–448 | 1 |
| 3 | The Church: The Kingdom of God | 449–877 | 1 |
| 4 | Church Worship as a Journey to Heaven | 878–1112 | 2 |
| 5 | The Believer and the Heavenly Hosts | 1113–1184 | 2 |
| 6 | Christian Concepts and Everyday Life | 1185–1356 | 2 |
| 7 | Eschatology and the After Life | 1357–1452 | 2 |

Arabic text is maintained separately. Arabic question/answer coverage and
review status may differ from the English catalog; do not treat the seed files
as proof that every translation has been editorially reviewed.

## English source

The English catalogue is generated from the verified extraction source:

```bash
export ENGLISH_SOURCE_DIR="/path/to/catechism_extraction"
npm --prefix backend run sync:english
npm --prefix backend run sync:english:check
```

The generator writes `backend/data/english_structure.json`,
`backend/data/catechism_qa.json`,
`backend/data/english_content_blocks.json`, and
`backend/data/english_extraction_issues.json`. It validates source hashes,
hierarchy, counts, exact question text, and whitespace-only answer
normalization. Do not run the legacy English extraction scripts against these
artifacts.

Seed or migrate English only:

```bash
npm --prefix backend run seed
npm --prefix backend run seed:english:migrate          # dry run
npm --prefix backend run seed:english:migrate -- --apply
```

The migration is dry-run by default and never touches Arabic collections.

## Requirements

- Node.js 20 (the version used by the Docker image)
- npm
- A reachable MongoDB instance

## Local development

```bash
cd backend
npm ci
cp .env.example .env
```

Set `MONGODB_URI` in `backend/.env` to a development database before starting
the server. Then run:

```bash
npm run dev
```

The application listens on port `5000` by default. Open `http://localhost:5000`
for the English site, `http://localhost:5000/ar/` for Arabic, or
`http://localhost:5000/admin/login.html` for the admin sign-in page.
`PORT` and `CORS_ORIGINS` can be set in `backend/.env`. Production deployments
must also set a unique `SESSION_SECRET`.

## Database and admin scripts

Run commands from `backend/`:

```bash
npm run seed            # Seed the English books, chapters, and questions
npm run seed:arabic     # Seed Arabic content after the English seed
npm run format:data     # Verify the Arabic dataset is source-controlled (read-only)
npm run format:data:check  # Verify the Arabic dataset is source-controlled (read-only)
npm run format:mongo    # Dry-run MongoDB formatting refresh
npm run format:mongo -- --apply  # Apply the formatting refresh
node src/seeds/createAdmin.js <username>
```

The Arabic dataset is source-controlled by `syncArabicSource.py`. The
`format:data` commands only verify that every row carries `sourceQuestionId`;
they never rewrite the file. Use
`python3 src/seeds/syncArabicSource.py --check` for the real Arabic source
validation, and `python3 src/seeds/syncArabicSource.py` to regenerate the
dataset from the source.

The admin creation command prompts for a password. To remove an admin account:

```bash
node src/seeds/createAdmin.js --delete <username>
```

Seed scripts write to the MongoDB database configured by `MONGODB_URI`. Review
the relevant script and data inputs before running them against production.

## Tests

Run the Node.js and Python formatter test suites from `backend/`:

```bash
npm test
```

## Public API

All public endpoints are prefixed with `/api`. Append `?lang=ar` for Arabic
content where available.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books` | List books |
| GET | `/api/books/:bookNumber` | Get a book and its chapters |
| GET | `/api/books/:bookNumber/chapters/:chapterNumber` | Get a chapter and its questions |
| GET | `/api/questions/:questionNumber` | Get a question and answer |
| GET | `/api/questions/range/:start/:end` | Get a range of questions |
| GET | `/api/search?q=keyword` | Search questions |
| GET | `/api/quiz/:bookNumber` | Get a book quiz |
| GET | `/api/quiz/chapter/:bookNumber/:chapterNumber` | Get a chapter quiz |
| GET | `/api/stats` | Get content statistics |

The admin panel is served at `/admin/login.html`; its authenticated endpoints
are under `/admin/api` and support question editing, statistics, and XLSX
import/export.

## Deployment

The application can be deployed as a single Node service or with the supplied
[`backend/Dockerfile`](backend/Dockerfile). See
[`docs/oracle-deployment.md`](docs/oracle-deployment.md) for an OCI deployment
guide.

The currently documented public deployment is `https://ccfm.copticfaith.org`.
Deployment settings and credentials are environment-specific and are not
required for local development.

## License and attribution

Catechism content © 2023 Fr. Tadros Yacoub Malaty. Application code is MIT
licensed.
