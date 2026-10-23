require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../../config/db');
const {
  Book,
  Chapter,
  Question,
  EnglishContentBlock,
  EnglishExtractionIssue
} = require('../models');

const DATA_DIR = path.join(__dirname, '../../data');
const STRUCTURE_FILE = path.join(DATA_DIR, 'english_structure.json');
const QUESTION_FILE = path.join(DATA_DIR, 'catechism_qa.json');
const BLOCK_FILE = path.join(DATA_DIR, 'english_content_blocks.json');
const ISSUE_FILE = path.join(DATA_DIR, 'english_extraction_issues.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function rangeFor(rows) {
  if (!rows.length) return null;
  const numbers = rows.map((row) => row.questionNumber);
  return {
    start: Math.min(...numbers),
    end: Math.max(...numbers),
    total: rows.length
  };
}

function compareRange(errors, label, node, rows) {
  const derived = rangeFor(rows);
  if (!derived) {
    errors.push(`${label} has no questions`);
    return;
  }

  const range = node.questionRange || {};
  if (range.start !== derived.start || range.end !== derived.end) {
    errors.push(
      `${label} questionRange ${range.start}-${range.end} ` +
      `does not match derived ${derived.start}-${derived.end}`
    );
  }
  if (node.totalQuestions !== derived.total) {
    errors.push(
      `${label} totalQuestions ${node.totalQuestions} ` +
      `does not match derived ${derived.total}`
    );
  }
}

function childSubsections(node) {
  return node.subsections || node.children || [];
}

function descendantSectionIds(node) {
  const ids = new Set([node.sourceSectionId]);
  for (const child of childSubsections(node)) {
    for (const id of descendantSectionIds(child)) ids.add(id);
  }
  return ids;
}

function compareSubsections(errors, questions, parent, parentSectionId) {
  for (const subsection of childSubsections(parent)) {
    if (subsection.parentSourceSectionId !== parentSectionId) {
      errors.push(
        `subsection ${subsection.sourceSectionId} has parent ` +
        `${subsection.parentSourceSectionId}, expected ${parentSectionId}`
      );
    }
    const sectionIds = descendantSectionIds(subsection);
    const rows = questions.filter((row) => sectionIds.has(row.sourceSectionId));
    compareRange(errors, `subsection ${subsection.sourceSectionId}`, subsection, rows);
    compareSubsections(errors, questions, subsection, subsection.sourceSectionId);
  }
}

function validateEnglishSeed(structure, questions, blocks, issues) {
  const errors = [];
  const books = structure.books || [];
  const chapters = books.flatMap((book) => book.chapters || []);

  if (books.length !== 7) errors.push(`expected 7 books, found ${books.length}`);
  if (chapters.length !== 84) errors.push(`expected 84 chapters, found ${chapters.length}`);
  if (questions.length !== 1452) errors.push(`expected 1452 questions, found ${questions.length}`);
  if (blocks.length !== 1401) errors.push(`expected 1401 content blocks, found ${blocks.length}`);
  if (issues.length !== 61) errors.push(`expected 61 issues, found ${issues.length}`);

  const numbers = questions.map((row) => row.questionNumber);
  if (numbers.some((number, index) => number !== index + 1)) {
    errors.push('question numbers are not contiguous from 1');
  }

  const sourceQuestionIds = new Set(questions.map((row) => row.sourceQuestionId));
  if (sourceQuestionIds.size !== questions.length) {
    errors.push('duplicate sourceQuestionId values');
  }

  const chapterKeys = new Set();
  const bookNumbers = new Set();
  for (const book of books) {
    bookNumbers.add(book.bookNumber);
    const bookRows = questions.filter((row) => row.bookNumber === book.bookNumber);
    compareRange(errors, `book ${book.bookNumber}`, book, bookRows);

    for (const chapter of book.chapters || []) {
      chapterKeys.add(`${book.bookNumber}-${chapter.chapterNumber}`);
      if (!chapter.title || !chapter.title.trim()) {
        errors.push(`chapter ${book.bookNumber}/${chapter.chapterNumber} has no title`);
      }
      const chapterRows = questions.filter(
        (row) =>
          row.bookNumber === book.bookNumber &&
          row.chapterNumber === chapter.chapterNumber
      );
      compareRange(
        errors,
        `chapter ${book.bookNumber}/${chapter.chapterNumber}`,
        chapter,
        chapterRows
      );
      compareSubsections(errors, questions, chapter, chapter.sourceSectionId);
    }
  }

  for (const row of questions) {
    if (!row.question || !row.question.trim()) {
      errors.push(`question ${row.questionNumber} has no text`);
    }
    if (!row.answer || !row.answer.trim()) {
      errors.push(`question ${row.questionNumber} has no answer`);
    }
    if (!bookNumbers.has(row.bookNumber)) {
      errors.push(`question ${row.questionNumber} has no book`);
    }
    if (!chapterKeys.has(`${row.bookNumber}-${row.chapterNumber}`)) {
      errors.push(`question ${row.questionNumber} has no chapter`);
    }
  }

  const footnoteBlocks = new Map();
  for (const block of blocks) {
    if (block.blockType === 'footnote' && block.relatedSourceQuestionId) {
      const linked = footnoteBlocks.get(block.relatedSourceQuestionId) || [];
      linked.push(block.text);
      footnoteBlocks.set(block.relatedSourceQuestionId, linked);
    }
  }

  for (const row of questions) {
    const expected = footnoteBlocks.get(row.sourceQuestionId) || [];
    const actual = row.footnotes || [];
    const matches =
      expected.length === actual.length &&
      expected.every((text, index) => text === actual[index]);
    if (!matches) {
      errors.push(
        `question ${row.questionNumber} footnotes do not match linked footnote blocks`
      );
    }
  }

  for (const block of blocks) {
    if (block.bookNumber !== null && (block.bookNumber < 1 || block.bookNumber > 7)) {
      errors.push(`content block ${block.sourceBlockId} has an invalid bookNumber`);
    }
    if (block.relatedSourceQuestionId && !sourceQuestionIds.has(block.relatedSourceQuestionId)) {
      errors.push(`content block ${block.sourceBlockId} has an unknown related question`);
    }
    if (block.relatedQuestionNumber !== null && !numbers.includes(block.relatedQuestionNumber)) {
      errors.push(`content block ${block.sourceBlockId} has an unknown related question`);
    }
  }

  return errors;
}

function loadArtifacts() {
  return {
    structure: loadJson(STRUCTURE_FILE),
    questions: loadJson(QUESTION_FILE),
    blocks: loadJson(BLOCK_FILE),
    issues: loadJson(ISSUE_FILE)
  };
}

async function seedEnglishContent({ dryRun = false } = {}) {
  const { structure, questions, blocks, issues } = loadArtifacts();
  const errors = validateEnglishSeed(structure, questions, blocks, issues);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  const target = {
    books: structure.books.length,
    chapters: structure.books.reduce((total, book) => total + book.chapters.length, 0),
    questions: questions.length,
    contentBlocks: blocks.length,
    issues: issues.length
  };

  if (dryRun) return target;

  await EnglishExtractionIssue.deleteMany({});
  await EnglishContentBlock.deleteMany({});
  await Question.deleteMany({});
  await Chapter.deleteMany({});
  await Book.deleteMany({});

  const bookDocs = new Map();
  for (const bookData of structure.books) {
    const book = await Book.create({
      bookNumber: bookData.bookNumber,
      title: bookData.title,
      volume: bookData.volume,
      sourceVolumeId: bookData.sourceVolumeId,
      sourceHeadingExact: bookData.sourceHeadingExact,
      publicationDetailsExact: structure.volumes.find(
        (volume) => volume.sourceVolumeId === bookData.sourceVolumeId
      )?.publicationDetailsExact,
      pdfPageCount: structure.volumes.find(
        (volume) => volume.sourceVolumeId === bookData.sourceVolumeId
      )?.pdfPageCount,
      sourcePageRange: bookData.sourcePageRange,
      description: bookData.description,
      questionRange: bookData.questionRange,
      totalQuestions: bookData.totalQuestions
    });
    bookDocs.set(bookData.bookNumber, book);
  }

  const chapterDocs = new Map();
  for (const bookData of structure.books) {
    const book = bookDocs.get(bookData.bookNumber);
    for (const chapterData of bookData.chapters) {
      const chapter = await Chapter.create({
        book: book._id,
        bookNumber: bookData.bookNumber,
        chapterNumber: chapterData.chapterNumber,
        sourceSectionId: chapterData.sourceSectionId,
        sourceHeadingExact: chapterData.sourceHeadingExact,
        title: chapterData.title,
        questionRange: chapterData.questionRange,
        totalQuestions: chapterData.totalQuestions,
        sortOrder: chapterData.sortOrder,
        printedPageStart: chapterData.printedPageStart,
        printedPageEnd: chapterData.printedPageEnd,
        pdfPageStart: chapterData.pdfPageStart,
        pdfPageEnd: chapterData.pdfPageEnd,
        subsections: chapterData.subsections || []
      });
      chapterDocs.set(
        `${bookData.bookNumber}-${chapterData.chapterNumber}`,
        chapter
      );
    }
  }

  const questionDocs = questions.map((row) => {
    const book = bookDocs.get(row.bookNumber);
    const chapter = chapterDocs.get(`${row.bookNumber}-${row.chapterNumber}`);
    if (!book || !chapter) {
      throw new Error(`question ${row.questionNumber} has no book or chapter`);
    }
    return {
      questionNumber: row.questionNumber,
      sourceQuestionId: row.sourceQuestionId,
      sourceSectionId: row.sourceSectionId,
      sourceSectionPath: row.sourceSectionPath,
      questionNumberExact: row.questionNumberExact,
      question: row.question,
      answer: row.answer,
      book: book._id,
      chapter: chapter._id,
      bookNumber: row.bookNumber,
      chapterTitle: chapter.title,
      footnotes: row.footnotes || [],
      verificationStatus: row.verificationStatus,
      reviewNotes: row.reviewNotes,
      printedPageStart: row.printedPageStart,
      printedPageEnd: row.printedPageEnd,
      pdfPageStart: row.pdfPageStart,
      pdfPageEnd: row.pdfPageEnd,
      sourceSpans: (row.sourceSpans || []).map((span) => ({
        pdfPage: span.pdf_page,
        printedPage: span.printed_page
      })),
      scriptureReferences: [],
      patristicQuotes: [],
      tags: []
    };
  });

  await Question.insertMany(questionDocs);
  await EnglishContentBlock.insertMany(blocks);
  await EnglishExtractionIssue.insertMany(issues);

  return target;
}

async function main() {
  await connectDB();
  console.log('Connected to MongoDB. Seeding English content...\n');
  const result = await seedEnglishContent();
  console.log(
    `Created ${result.books} books, ${result.chapters} chapters, ` +
    `${result.questions} questions, ${result.contentBlocks} content blocks, ` +
    `${result.issues} issues.`
  );
  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('English seed failed:', error.message);
    process.exit(1);
  });
}

module.exports = { seedEnglishContent, validateEnglishSeed };
