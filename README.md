# Coptic Catechism App

A public catechesis educational platform based on **"Catechism of the Coptic Orthodox Church"** by Fr. Tadros Yacoub Malaty (Volumes 1 & 2, 2023 Edition).

## Content Structure

The app serves **1,452 questions & answers** organized across **7 books**:

| Book | Title | Questions | Volume |
|------|-------|-----------|--------|
| 1 | Introduction to the Coptic Catechism | Q1 – Q92 | 1 |
| 2 | Christian Dogma | Q93 – Q448 | 1 |
| 3 | The Church: The Kingdom of God | Q449 – Q877 | 1 |
| 4 | Church Worship as a Journey to Heaven | Q878 – Q1112 | 2 |
| 5 | The Believer and the Heavenly Hosts | Q1113 – Q1184 | 2 |
| 6 | Christian Concepts and Everyday Life | Q1185 – Q1356 | 2 |
| 7 | Eschatology and the After Life | Q1357 – Q1452 | 2 |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   React Web App │────▶│  Express.js API  │────▶│   MongoDB    │
│ (Oracle Cloud)  │     │ (Oracle Cloud)   │     │   (Atlas)    │
└─────────────────┘     └─────────────────┘     └──────────────┘
┌─────────────────┐            ▲
│ React Native /  │────────────┘
│   Expo (Mobile) │
└─────────────────┘
```

### Tech Stack
- **Database**: MongoDB Atlas (free tier) or self-hosted on Oracle Cloud
- **Backend**: Node.js + Express.js REST API
- **Web Frontend**: React + Tailwind CSS
- **Mobile**: React Native (Expo)
- **Hosting**: Oracle Cloud Infrastructure (OCI) free tier

### Key Features
- Browse books → chapters → questions/answers
- Full-text search across all 1,452 Q&A entries
- Quiz mode (test yourself per chapter or book)
- Local bookmarks & progress tracking (no login required)
- Responsive web + native mobile apps

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (Atlas free tier or local)
- npm or yarn

### Backend Setup
```bash
cd backend
cp .env.example .env    # Edit with your MongoDB URI
npm install
npm run seed            # Populate database with catechism content
npm run dev             # Start development server on :5000
```

### Web Frontend Setup
```bash
cd frontend
npm install
npm start               # Start React dev server on :3000
```

### Mobile Setup
```bash
cd mobile
npm install
npx expo start          # Start Expo dev server
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books` | List all 7 books |
| GET | `/api/books/:bookId` | Get book with chapters |
| GET | `/api/books/:bookId/chapters/:chapterId` | Get chapter with questions |
| GET | `/api/questions/:questionNumber` | Get single Q&A by number |
| GET | `/api/questions/range/:start/:end` | Get Q&A range |
| GET | `/api/search?q=keyword` | Full-text search |
| GET | `/api/quiz/:bookId` | Get random quiz for a book |
| GET | `/api/quiz/chapter/:chapterId` | Get random quiz for a chapter |
| GET | `/api/stats` | General statistics |

### Arabic Language (`?lang=ar`)

Append `?lang=ar` to any endpoint to get translated content:

```
GET /api/books?lang=ar
GET /api/books/1?lang=ar
GET /api/books/1/chapters/1?lang=ar
GET /api/questions/42?lang=ar
GET /api/questions/range/1/92?lang=ar
GET /api/search?q=إيمان&lang=ar
GET /api/quiz/1?lang=ar
```

- Book/chapter titles: swapped with Arabic equivalents (when populated)
- Questions: served from the parallel `QuestionAr` collection
- Answers: empty until extracted from Arabic PDFs (see `docs/superpowers/plans/multilingual-backend-v1.md`)

## Seeding the Database

```bash
cd backend

# Seed English content (books, chapters, questions)
npm run seed

# Seed Arabic content (requires English seed to have run first)
npm run seed:arabic

# Extract questions from PDFs and seed
npm run seed:questions
```

## Deployment

- **Oracle Cloud**: See `docs/oracle-deployment.md` for step-by-step OCI setup
- **Coolify / Docker**: Use the `Dockerfile` in `backend/` for containerized deployment

## License

Content © 2023 Fr. Tadros Yacoub Malaty. App code MIT licensed.
