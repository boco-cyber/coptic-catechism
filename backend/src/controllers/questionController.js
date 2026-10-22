const { Question, QuestionAr, Book, Chapter, BookAr, ChapterAr } = require('../models');
const { catalogueFor, MAX_QUESTION_NUMBER } = require('../services/catalogue');

function language(req) {
  return req.query.lang === 'ar' ? 'ar' : 'en';
}

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/questions/:questionNumber - Get single question
exports.getQuestion = async (req, res) => {
  try {
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);
    const questionNumber = parseInt(req.params.questionNumber);

    const question = await Model.findOne({ questionNumber })
      .populate('book', 'bookNumber title')
      .populate('chapter', 'chapterNumber title')
      .lean();

    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const prev = await Model.findOne({
      questionNumber: { $lt: question.questionNumber }
    }).sort({ questionNumber: -1 }).select('questionNumber question').lean();

    const next = await Model.findOne({
      questionNumber: { $gt: question.questionNumber }
    }).sort({ questionNumber: 1 }).select('questionNumber question').lean();

    res.json({
      success: true,
      data: { ...question, prev, next, maxQuestionNumber }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/questions/range/:start/:end - Get questions in a range
exports.getQuestionRange = async (req, res) => {
  try {
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);

    const [questions, total] = await Promise.all([
      Model.find({
        questionNumber: {
          $gte: parseInt(req.params.start),
          $lte: parseInt(req.params.end)
        }
      })
        .sort({ questionNumber: 1 })
        .populate('book', 'bookNumber title')
        .populate('chapter', 'chapterNumber title')
        .lean(),
      Model.countDocuments()
    ]);

    res.json({
      success: true,
      count: questions.length,
      total,
      maxQuestionNumber,
      data: questions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/search?q=keyword&book=1&page=1&limit=20 - Full-text search
exports.searchQuestions = async (req, res) => {
  try {
    const { q, book, page = 1, limit = 20 } = req.query;
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const filter = lang === 'ar'
      ? { $or: [
          { question: { $regex: escapedRegex(q.trim()), $options: 'i' } },
          { answer: { $regex: escapedRegex(q.trim()), $options: 'i' } }
        ] }
      : { $text: { $search: q.trim() } };

    if (book) {
      filter.bookNumber = parseInt(book);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const projection = lang === 'ar' ? {} : { score: { $meta: 'textScore' } };
    const sort = lang === 'ar' ? { questionNumber: 1 } : { score: { $meta: 'textScore' } };
    const [questions, total] = await Promise.all([
      Model.find(filter, projection)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('book', 'bookNumber title')
        .populate('chapter', 'chapterNumber title')
        .lean(),
      Model.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: questions.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      maxQuestionNumber,
      data: questions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/quiz/:bookNumber?count=10 - Generate quiz from a book
exports.getBookQuiz = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const lang = language(req);
    const { Book: BookModel, Question: Model } = catalogueFor(lang);

    const book = await BookModel.findOne({ bookNumber: parseInt(req.params.bookNumber) });
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const questions = await Model.aggregate([
      { $match: { book: book._id } },
      { $sample: { size: Math.min(count, 50) } },
      {
        $project: {
          questionNumber: 1,
          question: 1,
          answer: 1,
          chapterTitle: 1,
          image: 1
        }
      }
    ]);

    res.json({
      success: true,
      quiz: {
        bookNumber: book.bookNumber,
        bookTitle: book.title,
        questionCount: questions.length,
        questions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/quiz/chapter/:bookNumber/:chapterNumber?count=10
exports.getChapterQuiz = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const lang = language(req);
    const { Book: BookModel, Chapter: ChapterModel, Question: Model } = catalogueFor(lang);

    const book = await BookModel.findOne({ bookNumber: parseInt(req.params.bookNumber) });
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapter = await ChapterModel.findOne({
      book: book._id,
      chapterNumber: parseInt(req.params.chapterNumber)
    });
    if (!chapter) {
      return res.status(404).json({ success: false, error: 'Chapter not found' });
    }

    const questions = await Model.aggregate([
      { $match: { chapter: chapter._id } },
      { $sample: { size: Math.min(count, 50) } },
      {
        $project: {
          questionNumber: 1,
          question: 1,
          answer: 1,
          image: 1
        }
      }
    ]);

    res.json({
      success: true,
      quiz: {
        bookNumber: book.bookNumber,
        bookTitle: book.title,
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        questionCount: questions.length,
        questions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/stats - General statistics
exports.getStats = async (req, res) => {
  try {
    const [
      bookCount,
      chapterCount,
      questionCount,
      bookArCount,
      chapterArCount,
      questionArCount
    ] = await Promise.all([
      Book.countDocuments(),
      Chapter.countDocuments(),
      Question.countDocuments(),
      BookAr.countDocuments(),
      ChapterAr.countDocuments(),
      QuestionAr.countDocuments()
    ]);

    const [bookStatsEn, bookStatsAr] = await Promise.all([
      Question.aggregate([
        { $group: { _id: '$bookNumber', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      QuestionAr.aggregate([
        { $group: { _id: '$bookNumber', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        books: bookCount,
        chapters: chapterCount,
        questions: questionCount + questionArCount,
        booksByLang: { en: bookCount, ar: bookArCount },
        chaptersByLang: { en: chapterCount, ar: chapterArCount },
        questionsByLang: { en: questionCount, ar: questionArCount },
        maxQuestionNumber: MAX_QUESTION_NUMBER,
        questionsByBook: { en: bookStatsEn, ar: bookStatsAr }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
