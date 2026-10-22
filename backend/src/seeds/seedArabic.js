require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../../config/db');
const { BookAr, ChapterAr, QuestionAr } = require('../models');

const DATA_DIR = path.join(__dirname, '../../data');
const PUBLIC_DIR = path.join(__dirname, '../../public');
const STRUCTURE_FILE = path.join(DATA_DIR, 'arabic_structure.json');
const QUESTION_FILE = path.join(DATA_DIR, 'catechism_qa_ar.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateArabicSeed(structure, questions) {
  const errors = [];
  const books = structure.books || [];
  const sections = books.flatMap((book) => book.sections || []);

  if (books.length !== 7) errors.push(`expected 7 books, found ${books.length}`);
  if (sections.length !== 83) errors.push(`expected 83 sections, found ${sections.length}`);
  if (questions.length !== 1424) errors.push(`expected 1424 questions, found ${questions.length}`);

  const numbers = questions.map((row) => row.questionNumber);
  if (numbers.some((number, index) => number !== index + 1)) {
    errors.push('question numbers are not contiguous from 1');
  }

  const sourceQuestionIds = questions.map((row) => row.sourceQuestionId);
  if (new Set(sourceQuestionIds).size !== sourceQuestionIds.length) {
    errors.push('duplicate sourceQuestionId values');
  }

  const sourceSectionIds = sections.map((section) => section.sourceSectionId);
  if (new Set(sourceSectionIds).size !== sourceSectionIds.length) {
    errors.push('duplicate sourceSectionId values');
  }

  const sourceBookIds = books.map((book) => book.sourceBookId);
  if (new Set(sourceBookIds).size !== sourceBookIds.length) {
    errors.push('duplicate sourceBookId values');
  }

  for (const row of questions) {
    if (!row.question || !row.question.trim()) {
      errors.push(`question ${row.questionNumber} has no text`);
    }
    if (!row.answer || !row.answer.trim()) {
      errors.push(`question ${row.questionNumber} has no answer`);
    }
    if (!row.image) continue;
    const imageFile = path.join(PUBLIC_DIR, row.image.replace(/^\//, ''));
    if (!fs.existsSync(imageFile)) {
      errors.push(`question ${row.questionNumber} image is missing: ${row.image}`);
    }
  }

  return errors;
}

async function seedArabicContent({ dryRun = false } = {}) {
  const structure = loadJson(STRUCTURE_FILE);
  const questions = loadJson(QUESTION_FILE);
  const errors = validateArabicSeed(structure, questions);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  const target = {
    books: structure.books.length,
    sections: structure.books.reduce((total, book) => total + book.sections.length, 0),
    questions: questions.length
  };

  if (dryRun) return target;

  await QuestionAr.deleteMany({});
  await ChapterAr.deleteMany({});
  await BookAr.deleteMany({});

  const bookDocs = new Map();
  for (const bookData of structure.books) {
    const book = await BookAr.create({
      bookNumber: bookData.bookNumber,
      sourceBookId: bookData.sourceBookId,
      title: bookData.title,
      slug: bookData.slug,
      questionRange: bookData.questionRange,
      totalQuestions: bookData.totalQuestions
    });
    bookDocs.set(bookData.bookNumber, book);
  }

  const chapterDocs = new Map();
  for (const bookData of structure.books) {
    const book = bookDocs.get(bookData.bookNumber);
    for (const sectionData of bookData.sections) {
      const chapter = await ChapterAr.create({
        book: book._id,
        bookNumber: bookData.bookNumber,
        chapterNumber: sectionData.chapterNumber,
        sourceSectionId: sectionData.sourceSectionId,
        title: sectionData.title,
        slug: sectionData.slug,
        questionRange: sectionData.questionRange,
        totalQuestions: sectionData.totalQuestions,
        sortOrder: sectionData.sortOrder
      });
      chapterDocs.set(`${bookData.bookNumber}-${sectionData.chapterNumber}`, chapter);
    }
  }

  const questionDocs = questions.map((row) => {
    const book = bookDocs.get(row.bookNumber);
    const chapter = chapterDocs.get(`${row.bookNumber}-${row.chapterNumber}`);
    if (!book || !chapter) {
      throw new Error(`question ${row.questionNumber} has no book or section`);
    }
    return {
      questionNumber: row.questionNumber,
      sourceQuestionId: row.sourceQuestionId,
      question: row.question,
      answer: row.answer,
      image: row.image || '',
      book: book._id,
      chapter: chapter._id,
      bookNumber: row.bookNumber,
      chapterTitle: chapter.title,
      scriptureReferences: [],
      patristicQuotes: [],
      footnotes: [],
      tags: []
    };
  });

  await QuestionAr.insertMany(questionDocs);
  return target;
}

async function main() {
  await connectDB();
  console.log('Connected to MongoDB. Seeding Arabic content...\n');
  const result = await seedArabicContent();
  console.log(`Created ${result.books} books, ${result.sections} sections, ${result.questions} questions.`);
  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Arabic seed failed:', error.message);
    process.exit(1);
  });
}

module.exports = { seedArabicContent, validateArabicSeed };
