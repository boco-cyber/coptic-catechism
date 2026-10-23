const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEnglishSeed,
  seedEnglishContent
} = require('../../src/seeds/seedEnglish');

const structure = require('../../data/english_structure.json');
const questions = require('../../data/catechism_qa.json');
const blocks = require('../../data/english_content_blocks.json');
const issues = require('../../data/english_extraction_issues.json');

test('validateEnglishSeed accepts the generated datasets', () => {
  assert.deepEqual(
    validateEnglishSeed(structure, questions, blocks, issues),
    []
  );
});

test('validateEnglishSeed rejects a non-contiguous question number', () => {
  const broken = questions.map((row) => ({ ...row }));
  broken[1].questionNumber = 99;
  const errors = validateEnglishSeed(structure, broken, blocks, issues);
  assert.match(errors.join('\n'), /contiguous/);
});

test('validateEnglishSeed rejects unknown block question links', () => {
  const broken = blocks.map((row) => ({ ...row }));
  broken[0] = {
    ...broken[0],
    relatedSourceQuestionId: 'qa_missing',
    relatedQuestionNumber: 9999
  };
  const errors = validateEnglishSeed(structure, questions, broken, issues);
  assert.match(errors.join('\n'), /unknown related question/i);
});

test('validateEnglishSeed rejects a wrong book range', () => {
  const broken = structuredClone(structure);
  broken.books[0].questionRange.end += 1;
  const errors = validateEnglishSeed(broken, questions, blocks, issues);
  assert.match(errors.join('\n'), /book 1 questionRange/);
});

test('validateEnglishSeed rejects a wrong chapter range', () => {
  const broken = structuredClone(structure);
  broken.books[0].chapters[0].questionRange.end += 1;
  const errors = validateEnglishSeed(broken, questions, blocks, issues);
  assert.match(errors.join('\n'), /chapter 1\/1 questionRange/);
});

test('validateEnglishSeed rejects a wrong nested subsection range', () => {
  const broken = structuredClone(structure);
  broken.books[2].chapters[16].subsections[0].children[0].questionRange.end += 1;
  const errors = validateEnglishSeed(broken, questions, blocks, issues);
  assert.match(errors.join('\n'), /subsection section_001_045 questionRange/);
});

test('validateEnglishSeed rejects a missing footnote link', () => {
  const broken = blocks.map((row) => ({ ...row }));
  const index = broken.findIndex(
    (row) => row.blockType === 'footnote' && row.relatedSourceQuestionId
  );
  broken[index] = { ...broken[index], relatedSourceQuestionId: null };
  const errors = validateEnglishSeed(structure, questions, broken, issues);
  assert.match(errors.join('\n'), /footnotes do not match linked footnote blocks/);
});

test('dry run reports target counts without touching MongoDB', async () => {
  const result = await seedEnglishContent({ dryRun: true });
  assert.deepEqual(result, {
    books: 7,
    chapters: 84,
    questions: 1452,
    contentBlocks: 1401,
    issues: 61
  });
});
