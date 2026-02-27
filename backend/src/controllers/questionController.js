const { Question, Book, Chapter } = require('../models');

// GET /api/questions/:questionNumber - Get single question
exports.getQuestion = async (req, res) => {
  try {
    const { questionNumber } = req.params;
    const question = await Question.findOne({
      questionNumber: parseInt(questionNumber)
    })
      .populate('book', 'bookNumber title')
      .populate('chapter', 'chapterNumber title')
      .lean();

    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Get prev/next for navigation
    const prev = await Question.findOne({
      questionNumber: { $lt: question.questionNumber }
    }).sort({ questionNumber: -1 }).select('questionNumber question').lean();

    const next = await Question.findOne({
      questionNumber: { $gt: question.questionNumber }
    }).sort({ questionNumber: 1 }).select('questionNumber question').lean();

    res.json({
      success: true,
      data: { ...question, prev, next }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/questions/range/:start/:end - Get questions in a range
exports.getQuestionRange = async (req, res) => {
  try {
    const { start, end } = req.params;
    const questions = await Question.find({
      questionNumber: {
        $gte: parseInt(start),
        $lte: parseInt(end)
      }
    })
      .sort({ questionNumber: 1 })
      .populate('book', 'bookNumber title')
      .populate('chapter', 'chapterNumber title')
      .lean();

    res.json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/search?q=keyword&book=1&page=1&limit=20 - Full-text search
exports.searchQuestions = async (req, res) => {
  try {
    const { q, book, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const filter = {
      $text: { $search: q.trim() }
    };

    // Optional: filter by book number
    if (book) {
      filter.bookNumber = parseInt(book);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [questions, total] = await Promise.all([
      Question.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('book', 'bookNumber title')
        .populate('chapter', 'chapterNumber title')
        .lean(),
      Question.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: questions.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: questions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/quiz/:bookNumber?count=10 - Generate quiz from a book
exports.getBookQuiz = async (req, res) => {
  try {
    const { bookNumber } = req.params;
    const count = parseInt(req.query.count) || 10;

    const book = await Book.findOne({ bookNumber: parseInt(bookNumber) });
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Get random questions from this book
    const questions = await Question.aggregate([
      { $match: { book: book._id } },
      { $sample: { size: Math.min(count, 50) } },
      {
        $project: {
          questionNumber: 1,
          question: 1,
          answer: 1,
          chapterTitle: 1
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
    const { bookNumber, chapterNumber } = req.params;
    const count = parseInt(req.query.count) || 10;

    const book = await Book.findOne({ bookNumber: parseInt(bookNumber) });
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapter = await Chapter.findOne({
      book: book._id,
      chapterNumber: parseInt(chapterNumber)
    });
    if (!chapter) {
      return res.status(404).json({ success: false, error: 'Chapter not found' });
    }

    const questions = await Question.aggregate([
      { $match: { chapter: chapter._id } },
      { $sample: { size: Math.min(count, 50) } },
      {
        $project: {
          questionNumber: 1,
          question: 1,
          answer: 1
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
    const [bookCount, chapterCount, questionCount] = await Promise.all([
      Book.countDocuments(),
      Chapter.countDocuments(),
      Question.countDocuments()
    ]);

    const bookStats = await Question.aggregate([
      {
        $group: {
          _id: '$bookNumber',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        books: bookCount,
        chapters: chapterCount,
        questions: questionCount,
        questionsByBook: bookStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
