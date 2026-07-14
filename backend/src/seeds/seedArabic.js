require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../../config/db');
const { Book, Chapter, QuestionAr } = require('../models');
const { BOOKS, CHAPTERS } = require('./structureData');

async function seedArabic() {
  await connectDB();
  console.log('Connected to MongoDB. Seeding Arabic content...\n');

  // Clear existing Arabic data
  await QuestionAr.deleteMany({});
  console.log('Cleared existing QuestionAr data.\n');

  // Load Arabic index (questions)
  const indexPath = path.join(__dirname, '../../data/arabic_index.json');
  let arabicQuestions = new Map();
  const hasIndex = fs.existsSync(indexPath);
  if (hasIndex) {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    arabicQuestions = new Map(
      Object.entries(parsed).map(([k, v]) => [parseInt(k), v])
    );
    console.log(`Loaded ${arabicQuestions.size} Arabic questions from index.\n`);
    if (arabicQuestions.size !== 1452) {
      console.warn(
        `WARNING: Arabic index is incomplete (${arabicQuestions.size}/1452). ` +
        'Missing questions will be skipped. Re-run extractArabicIndex.py to regenerate.'
      );
    }
  } else {
    console.log('WARNING: arabic_index.json not found. Question text will be empty.\n');
  }

  // Load Arabic book/chapter titles if available
  const titlesPath = path.join(__dirname, '../../data/arabic_titles.json');
  let arabicTitles = { books: {}, chapters: {} };
  if (fs.existsSync(titlesPath)) {
    arabicTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
    console.log(`Loaded Arabic titles for ${Object.keys(arabicTitles.books).length} books.\n`);
  }

  // Get existing Book and Chapter docs from the English seed
  const bookDocs = {};
  for (const bookData of BOOKS) {
    const book = await Book.findOne({ bookNumber: bookData.bookNumber });
    if (!book) {
      console.error(`Book ${bookData.bookNumber} not found. Run "npm run seed" first.`);
      process.exit(1);
    }
    bookDocs[bookData.bookNumber] = book;

    // Update Arabic titles if available
    if (arabicTitles.books[bookData.bookNumber]) {
      book.titleAr = arabicTitles.books[bookData.bookNumber].title;
      if (arabicTitles.books[bookData.bookNumber].description) {
        book.descriptionAr = arabicTitles.books[bookData.bookNumber].description;
      }
      await book.save();
    }
  }

  const chapterDocs = {};
  for (const chapData of CHAPTERS) {
    const chapter = await Chapter.findOne({
      book: bookDocs[chapData.bookNumber]._id,
      chapterNumber: chapData.chapterNumber
    });
    if (!chapter) {
      console.error(`Chapter ${chapData.bookNumber}-${chapData.chapterNumber} not found.`);
      continue;
    }
    chapterDocs[`${chapData.bookNumber}-${chapData.chapterNumber}`] = chapter;

    if (arabicTitles.chapters[`${chapData.bookNumber}-${chapData.chapterNumber}`]) {
      chapter.titleAr = arabicTitles.chapters[`${chapData.bookNumber}-${chapData.chapterNumber}`];
      await chapter.save();
    }
  }

  // Validate alignment: every Arabic questionNumber must have a matching English book/chapter
  let validationErrors = 0;
  for (const qNum of arabicQuestions.keys()) {
    const bookData = BOOKS.find(
      b => qNum >= b.questionRange.start && qNum <= b.questionRange.end
    );
    if (!bookData) {
      console.error(`VALIDATION FAIL: Question ${qNum} has no matching book.`);
      validationErrors++;
    }
  }

  if (validationErrors > 0) {
    console.error(`\n${validationErrors} alignment errors found. Aborting seed.`);
    await mongoose.connection.close();
    process.exit(1);
  }

  // Create QuestionAr documents
  let createdCount = 0;
  const bulk = [];

  for (let qNum = 1; qNum <= 1452; qNum++) {
    const bookData = BOOKS.find(
      b => qNum >= b.questionRange.start && qNum <= b.questionRange.end
    );
    if (!bookData) continue;

    const chapData = CHAPTERS.find(
      c => c.bookNumber === bookData.bookNumber &&
           qNum >= c.questionRange.start &&
           qNum <= c.questionRange.end
    );
    if (!chapData) continue;

    const book = bookDocs[bookData.bookNumber];
    const chapter = chapterDocs[`${chapData.bookNumber}-${chapData.chapterNumber}`];
    const arText = arabicQuestions.get(qNum);

    if (!arText) continue;

    bulk.push({
      questionNumber: qNum,
      question: arText,
      answer: '',
      book: book._id,
      chapter: chapter._id,
      bookNumber: bookData.bookNumber,
      chapterTitle: chapData.titleAr || chapData.title,
      scriptureReferences: [],
      patristicQuotes: [],
      footnotes: [],
      tags: []
    });
    createdCount++;
  }

  await QuestionAr.insertMany(bulk);
  console.log(`Created ${createdCount} Arabic QuestionAr documents.\n`);

  // Stats
  const filled = await QuestionAr.countDocuments({
    question: { $ne: '' }
  });
  const withAnswer = await QuestionAr.countDocuments({
    answer: { $ne: '' }
  });

  console.log('Arabic seed complete!');
  console.log('─────────────────────────────────────');
  console.log(`  QuestionAr docs: ${createdCount}`);
  console.log(`  With question text: ${filled}`);
  console.log(`  With answer text: ${withAnswer}`);
  console.log('─────────────────────────────────────');
  console.log('\nNext step: Extract Arabic answers from book PDFs.\n');

  await mongoose.connection.close();
}

seedArabic().catch(err => {
  console.error('Arabic seed failed:', err);
  process.exit(1);
});
