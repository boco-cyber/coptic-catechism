const { catalogueFor } = require('../services/catalogue');
const { Book, EnglishContentBlock, EnglishExtractionIssue } = require('../models');
const { groupBookContent } = require('../services/bookContent');

function language(req) {
  return req.query.lang === 'ar' ? 'ar' : 'en';
}

// GET /api/books - List all books with chapter counts
exports.getAllBooks = async (req, res) => {
  try {
    const lang = language(req);
    const { Book, Chapter } = catalogueFor(lang);
    const books = await Book.find()
      .sort({ bookNumber: 1 })
      .lean();

    const booksWithChapters = await Promise.all(
      books.map(async (book) => {
        const chapterCount = await Chapter.countDocuments({ book: book._id });
        return { ...book, chapterCount };
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
    const lang = language(req);
    const { Book, Chapter } = catalogueFor(lang);
    const book = await Book.findOne({ bookNumber: parseInt(req.params.bookNumber) }).lean();

    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapters = await Chapter.find({ book: book._id })
      .sort({ sortOrder: 1 })
      .lean();

    res.json({ success: true, data: { ...book, chapters } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/books/:bookNumber/chapters/:chapterNumber - Get chapter with questions
exports.getChapter = async (req, res) => {
  try {
    const lang = language(req);
    const { Book, Chapter, Question } = catalogueFor(lang);
    const book = await Book.findOne({ bookNumber: parseInt(req.params.bookNumber) });
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapter = await Chapter.findOne({
      book: book._id,
      chapterNumber: parseInt(req.params.chapterNumber)
    }).lean();

    if (!chapter) {
      return res.status(404).json({ success: false, error: 'Chapter not found' });
    }

    const questions = await Question.find({ chapter: chapter._id })
      .sort({ questionNumber: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        ...chapter,
        bookTitle: book.title,
        questions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/books/:bookNumber/content - Read-only English companion content
exports.getBookContent = async (req, res) => {
  try {
    const book = await Book.findOne({
      bookNumber: parseInt(req.params.bookNumber)
    }).lean();

    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const scope = {
      $or: [
        { bookNumber: book.bookNumber },
        { bookNumber: null, volumeNumber: book.volume }
      ]
    };

    const [blocks, issues] = await Promise.all([
      EnglishContentBlock.find(scope).sort({ sequenceInBook: 1 }).lean(),
      EnglishExtractionIssue.find(scope).sort({ pdfPage: 1 }).lean()
    ]);

    const grouped = groupBookContent({
      blocks,
      issues,
      bookNumber: book.bookNumber,
      volumeNumber: book.volume,
      type: req.query.type
    });

    res.json({
      success: true,
      data: {
        book: {
          bookNumber: book.bookNumber,
          title: book.title,
          volume: book.volume
        },
        ...grouped
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
