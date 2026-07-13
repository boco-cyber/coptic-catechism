const { Book, Chapter, Question, QuestionAr } = require('../models');

const ARABIC_BOOK_TITLES = {
  1: 'مقدمة في الكاتيكيزم القبطي', 2: 'العقائد المسيحية',
  3: 'الكنيسة: ملكوت الله', 4: 'العبادة الكنسية رحلة إلى السماء',
  5: 'المؤمن والطغمات السمائية', 6: 'المفاهيم المسيحية والحياة اليومية',
  7: 'الأخرويات والحياة بعد الموت'
};

function swapTitles(doc, lang) {
  if (lang === 'ar' && doc) {
    doc.title = doc.titleAr || ARABIC_BOOK_TITLES[doc.bookNumber] || doc.title;
    if (doc.descriptionAr) doc.description = doc.descriptionAr;
    delete doc.titleAr;
    delete doc.descriptionAr;
  }
  return doc;
}

function swapChapterTitle(doc, lang) {
  if (lang === 'ar' && doc && doc.titleAr) {
    doc.title = doc.titleAr;
    delete doc.titleAr;
  }
  return doc;
}

// GET /api/books - List all books with chapter counts
exports.getAllBooks = async (req, res) => {
  try {
    const lang = req.query.lang;
    const books = await Book.find()
      .sort({ bookNumber: 1 })
      .lean();

    const booksWithChapters = await Promise.all(
      books.map(async (book) => {
        const chapterCount = await Chapter.countDocuments({ book: book._id });
        return { ...swapTitles(book, lang), chapterCount };
      })
    );

    res.json({ success: true, data: booksWithChapters });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/books/:bookNumber - Get book with its chapters
exports.getBook = async (req, res) => {
  try {
    const { bookNumber } = req.params;
    const lang = req.query.lang;
    const book = await Book.findOne({ bookNumber: parseInt(bookNumber) }).lean();

    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapters = await Chapter.find({ book: book._id })
      .sort({ sortOrder: 1 })
      .lean();

    const chaptersMapped = chapters.map(ch => swapChapterTitle(ch, lang));

    res.json({ success: true, data: { ...swapTitles(book, lang), chapters: chaptersMapped } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/books/:bookNumber/chapters/:chapterNumber - Get chapter with questions
exports.getChapter = async (req, res) => {
  try {
    const { bookNumber, chapterNumber } = req.params;
    const lang = req.query.lang;

    const book = await Book.findOne({ bookNumber: parseInt(bookNumber) });
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapter = await Chapter.findOne({
      book: book._id,
      chapterNumber: parseInt(chapterNumber)
    }).lean();

    if (!chapter) {
      return res.status(404).json({ success: false, error: 'Chapter not found' });
    }

    const QuestionModel = lang === 'ar' ? QuestionAr : Question;
    const questions = await QuestionModel.find({ chapter: chapter._id })
      .sort({ questionNumber: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        ...swapChapterTitle(chapter, lang),
        bookTitle: lang === 'ar' && book.titleAr ? book.titleAr : book.title,
        questions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
