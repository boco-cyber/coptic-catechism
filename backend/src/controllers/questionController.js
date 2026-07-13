const { Question, QuestionAr, Book, Chapter } = require('../models');

function getModel(lang) {
  return lang === 'ar' ? QuestionAr : Question;
}

async function addArabicFallback(items) {
  const rows = Array.isArray(items) ? items : [items];
  const numbers = rows.filter(Boolean).map((item) => item.questionNumber);
  if (!numbers.length) return items;

  const englishRows = await Question.find({ questionNumber: { $in: numbers } })
    .select('questionNumber question answer')
    .lean();
  const english = new Map(englishRows.map((item) => [item.questionNumber, item]));

  for (const item of rows) {
    if (!item) continue;
    const fallback = english.get(item.questionNumber);
    if (!fallback) continue;
    if (!item.question) item.question = fallback.question;
    if (!item.answer) {
      item.answer = fallback.answer;
      item.answerLanguage = 'en';
      item.langFallback = true;
    } else {
      item.answerLanguage = 'ar';
      item.langFallback = false;
    }
  }
  return items;
}

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/questions/:questionNumber - Get single question
exports.getQuestion = async (req, res) => {
  try {
    const { questionNumber } = req.params;
    const lang = req.query.lang;
    const Model = getModel(lang);
    let usedEnglishFallback = false;

    let question = await Model.findOne({
      questionNumber: parseInt(questionNumber)
    })
      .populate('book', 'bookNumber title titleAr')
      .populate('chapter', 'chapterNumber title titleAr')
      .lean();

    if (!question && lang === 'ar') {
      question = await Question.findOne({ questionNumber: parseInt(questionNumber) })
        .populate('book', 'bookNumber title titleAr')
        .populate('chapter', 'chapterNumber title titleAr')
        .lean();
      if (question) {
        usedEnglishFallback = true;
        question.langFallback = true;
        question.questionLanguage = 'en';
        question.answerLanguage = 'en';
      }
    }

    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Swap titles in populated docs
    if (lang === 'ar') {
      if (question.book && question.book.titleAr) {
        question.book.title = question.book.titleAr;
      }
      if (!usedEnglishFallback) await addArabicFallback(question);
      if (question.chapter && question.chapter.titleAr) {
        question.chapter.title = question.chapter.titleAr;
      }
    }
    delete question.book?.titleAr;
    delete question.chapter?.titleAr;

    const prev = await Model.findOne({
      questionNumber: { $lt: question.questionNumber }
    }).sort({ questionNumber: -1 }).select('questionNumber question').lean();

    const next = await Model.findOne({
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
    const lang = req.query.lang;
    const Model = getModel(lang);

    let questions = await Model.find({
      questionNumber: {
        $gte: parseInt(start),
        $lte: parseInt(end)
      }
    })
      .sort({ questionNumber: 1 })
      .populate('book', 'bookNumber title titleAr')
      .populate('chapter', 'chapterNumber title titleAr')
      .lean();

    if (lang === 'ar') {
      for (const q of questions) {
        if (q.book?.titleAr) q.book.title = q.book.titleAr;
        if (q.chapter?.titleAr) q.chapter.title = q.chapter.titleAr;
        delete q.book?.titleAr;
        delete q.chapter?.titleAr;
      }
      await addArabicFallback(questions);

      const englishRows = await Question.find({
        questionNumber: { $gte: parseInt(start), $lte: parseInt(end) }
      })
        .sort({ questionNumber: 1 })
        .populate('book', 'bookNumber title titleAr')
        .populate('chapter', 'chapterNumber title titleAr')
        .lean();
      const arabicByNumber = new Map(questions.map((item) => [item.questionNumber, item]));
      questions = englishRows.map((english) => arabicByNumber.get(english.questionNumber) || {
        ...english,
        langFallback: true,
        questionLanguage: 'en',
        answerLanguage: 'en'
      });
    }

    res.json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/search?q=keyword&book=1&page=1&limit=20 - Full-text search
exports.searchQuestions = async (req, res) => {
  try {
    const { q, book, page = 1, limit = 20 } = req.query;
    const lang = req.query.lang;
    const Model = getModel(lang);

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
        .populate('book', 'bookNumber title titleAr')
        .populate('chapter', 'chapterNumber title titleAr')
        .lean(),
      Model.countDocuments(filter)
    ]);

    if (lang === 'ar') {
      for (const q of questions) {
        if (q.book?.titleAr) q.book.title = q.book.titleAr;
        if (q.chapter?.titleAr) q.chapter.title = q.chapter.titleAr;
        delete q.book?.titleAr;
        delete q.chapter?.titleAr;
      }
      await addArabicFallback(questions);
    }

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
    const lang = req.query.lang;
    const Model = getModel(lang);

    const book = await Book.findOne({ bookNumber: parseInt(bookNumber) });
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
          chapterTitle: 1
        }
      }
    ]);

    const bookTitle = lang === 'ar' && book.titleAr ? book.titleAr : book.title;

    res.json({
      success: true,
      quiz: {
        bookNumber: book.bookNumber,
        bookTitle,
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
    const lang = req.query.lang;
    const Model = getModel(lang);

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

    const questions = await Model.aggregate([
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

    const bookTitle = lang === 'ar' && book.titleAr ? book.titleAr : book.title;
    const chapterTitle = lang === 'ar' && chapter.titleAr ? chapter.titleAr : chapter.title;

    res.json({
      success: true,
      quiz: {
        bookNumber: book.bookNumber,
        bookTitle,
        chapterNumber: chapter.chapterNumber,
        chapterTitle,
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
    const [bookCount, chapterCount, questionCount, questionArCount] = await Promise.all([
      Book.countDocuments(),
      Chapter.countDocuments(),
      Question.countDocuments(),
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
        questionsByLang: { en: questionCount, ar: questionArCount },
        questionsByBook: { en: bookStatsEn, ar: bookStatsAr }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
