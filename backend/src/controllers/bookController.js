const { Book, Chapter, Question } = require('../models');

// GET /api/books - List all books with chapter counts
exports.getAllBooks = async (req, res) => {
  try {
    const books = await Book.find()
      .sort({ bookNumber: 1 })
      .lean();

    // Attach chapter count for each book
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
    const { bookNumber } = req.params;
    const book = await Book.findOne({ bookNumber: parseInt(bookNumber) }).lean();

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
    const { bookNumber, chapterNumber } = req.params;

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

    const questions = await Question.find({ chapter: chapter._id })
      .sort({ questionNumber: 1 })
      .lean();

    res.json({
      success: true,
      data: { ...chapter, bookTitle: book.title, questions }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
