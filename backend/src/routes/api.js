const express = require('express');
const router = express.Router();
const bookController = require('../controllers/bookController');
const questionController = require('../controllers/questionController');

// ── Books & Chapters ──────────────────────────────────────────────
router.get('/books', bookController.getAllBooks);
router.get('/books/:bookNumber', bookController.getBook);
router.get('/books/:bookNumber/chapters/:chapterNumber', bookController.getChapter);

// ── Questions ─────────────────────────────────────────────────────
router.get('/questions/:questionNumber', questionController.getQuestion);
router.get('/questions/range/:start/:end', questionController.getQuestionRange);

// ── Search ────────────────────────────────────────────────────────
router.get('/search', questionController.searchQuestions);

// ── Quiz ──────────────────────────────────────────────────────────
router.get('/quiz/:bookNumber', questionController.getBookQuiz);
router.get('/quiz/chapter/:bookNumber/:chapterNumber', questionController.getChapterQuiz);

// ── Stats ─────────────────────────────────────────────────────────
router.get('/stats', questionController.getStats);

module.exports = router;
