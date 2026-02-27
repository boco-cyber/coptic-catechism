/**
 * Seed the MongoDB database with the Catechism structure.
 *
 * Usage:
 *   npm run seed
 *
 * This creates Books and Chapters from the known structure,
 * then creates placeholder Questions for every number 1–1452.
 *
 * To populate actual Q&A text from the PDFs, run:
 *   npm run seed:questions
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../../config/db');
const { Book, Chapter, Question } = require('../models');
const { BOOKS, CHAPTERS } = require('./structureData');

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB. Starting seed...\n');

  // ── Clear existing data ──────────────────────────────────────────
  await Book.deleteMany({});
  await Chapter.deleteMany({});
  await Question.deleteMany({});
  console.log('Cleared existing data.\n');

  // ── Seed Books ───────────────────────────────────────────────────
  const bookDocs = {};
  for (const bookData of BOOKS) {
    const book = await Book.create(bookData);
    bookDocs[bookData.bookNumber] = book;
    console.log(`  Book ${book.bookNumber}: ${book.title}`);
  }
  console.log(`\nCreated ${BOOKS.length} books.\n`);

  // ── Seed Chapters ────────────────────────────────────────────────
  const chapterDocs = {};
  for (const chapData of CHAPTERS) {
    const book = bookDocs[chapData.bookNumber];
    const chapter = await Chapter.create({
      ...chapData,
      book: book._id,
      totalQuestions: chapData.questionRange.end - chapData.questionRange.start + 1
    });
    // Key by "bookNumber-chapterNumber"
    chapterDocs[`${chapData.bookNumber}-${chapData.chapterNumber}`] = chapter;
    console.log(`  Book ${chapData.bookNumber}, Ch ${chapData.chapterNumber}: ${chapData.title} (Q${chapData.questionRange.start}–${chapData.questionRange.end})`);
  }
  console.log(`\nCreated ${CHAPTERS.length} chapters.\n`);

  // ── Seed Placeholder Questions ───────────────────────────────────
  // Map each question number to its book and chapter
  let questionCount = 0;
  const questionBulk = [];

  for (let qNum = 1; qNum <= 1452; qNum++) {
    // Find which book this question belongs to
    const bookData = BOOKS.find(
      b => qNum >= b.questionRange.start && qNum <= b.questionRange.end
    );
    if (!bookData) continue;

    // Find which chapter
    const chapData = CHAPTERS.find(
      c => c.bookNumber === bookData.bookNumber &&
           qNum >= c.questionRange.start &&
           qNum <= c.questionRange.end
    );
    if (!chapData) continue;

    const book = bookDocs[bookData.bookNumber];
    const chapter = chapterDocs[`${chapData.bookNumber}-${chapData.chapterNumber}`];

    questionBulk.push({
      questionNumber: qNum,
      question: `[Question ${qNum} — to be extracted from PDF]`,
      answer: `[Answer ${qNum} — to be extracted from PDF]`,
      book: book._id,
      chapter: chapter._id,
      bookNumber: bookData.bookNumber,
      chapterTitle: chapData.title,
      scriptureReferences: [],
      patristicQuotes: [],
      footnotes: [],
      tags: []
    });
    questionCount++;
  }

  // Bulk insert for performance
  await Question.insertMany(questionBulk);
  console.log(`Created ${questionCount} placeholder questions.\n`);

  // ── Update Book totalQuestions ────────────────────────────────────
  for (const bookData of BOOKS) {
    const count = await Question.countDocuments({
      book: bookDocs[bookData.bookNumber]._id
    });
    await Book.findByIdAndUpdate(bookDocs[bookData.bookNumber]._id, {
      totalQuestions: count
    });
  }

  console.log('Seed complete!');
  console.log('─────────────────────────────────────');
  console.log(`  Books:     ${BOOKS.length}`);
  console.log(`  Chapters:  ${CHAPTERS.length}`);
  console.log(`  Questions: ${questionCount}`);
  console.log('─────────────────────────────────────');
  console.log('\nNext step: Run "npm run seed:questions" to extract');
  console.log('actual Q&A text from the PDF files.\n');

  await mongoose.connection.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
